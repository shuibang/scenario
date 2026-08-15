begin;

-- ─── 멤버십 RPC 보안 수정 (한도 서버 이전 + service role 호출 경로) ─────────
-- 20260816120000_membership_foundation.sql 이 이미 콘솔에서 실행된 상태를 전제로,
-- 그 위에서 안전하게 넘어오도록 작성했다. 이전 파일은 수정하지 않는다.
--
-- 고치는 문제 3건:
--   1) p_monthly_limit 이 클라이언트 파라미터라 limit=999999 로 호출하면 뚫린다.
--      → 한도를 feature_limits 테이블로 옮기고 파라미터를 없앤다.
--   2) p_feature 가 화이트리스트 없이 임의 문자열을 받아 별도 버킷을 만들 수 있다.
--      → feature_limits 에 없거나 enabled=false 면 거부. 테이블이 화이트리스트를 겸한다.
--   3) auth.uid() 에만 의존해 Edge Function(service role)이 호출할 수 없고,
--      AI 호출 실패 시 차감을 되돌릴 경로가 없다.
--      → service role 전용 RPC 를 따로 두고 refund_usage 를 추가한다.
--
-- service role 판별 방식 — GRANT/REVOKE 로 가른다(단일 함수 + JWT 클레임 판별 아님):
--   auth.jwt()->>'role' 같은 판별은 PostgREST 버전에 따라 GUC 이름·형식이 달라져 왔고,
--   판별식이 빗나가면 그게 곧 권한 우회가 된다. DB 롤은 PostgREST 가 검증된 JWT 로부터
--   설정하므로 클라이언트가 위조할 수 없고, EXECUTE 권한은 pg_proc.proacl 로 검증도 된다.
--   따라서 로직은 내부 헬퍼 하나에 두고, 권한만 다른 얇은 래퍼 둘을 노출한다.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. 기능별 한도 (화이트리스트 겸용) ─────────────────────────────────────
create table if not exists public.feature_limits (
  feature            text        primary key,
  free_monthly_limit int         not null default 0,
  -- 기능별 킬스위치. 사고 시 콘솔에서 false 로 바꾸면 즉시 잠긴다.
  enabled            boolean     not null default true,
  updated_at         timestamptz not null default now()
);

alter table public.feature_limits enable row level security;

-- 남은 횟수 표시용으로 클라이언트가 읽을 수 있어야 한다. 쓰기 정책은 두지 않는다
-- (한도 변경은 콘솔·service role 전용). 비로그인 노출이 필요해지면 anon 을 추가.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'feature_limits'
      and policyname = 'feature_limits_read'
  ) then
    create policy feature_limits_read
      on public.feature_limits
      for select
      to authenticated
      using (true);
  end if;
end
$$;

-- 초기값. 이미 있으면 건드리지 않는다 — 콘솔에서 조정한 값을 재실행이 덮지 않도록.
insert into public.feature_limits (feature, free_monthly_limit, enabled)
values ('ai_feedback', 3, true)
on conflict (feature) do nothing;


-- ─── 2. 내부 헬퍼 ───────────────────────────────────────────────────────────
-- 판정·증가 로직은 여기 한 곳에만 둔다. 누구에게도 EXECUTE 를 주지 않으며,
-- SECURITY DEFINER 래퍼들이 정의자 권한으로 호출한다.
create or replace function public._consume_usage(
  p_user    uuid,
  p_feature text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_period  text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
  v_premium boolean;
  v_limit   int;
  v_enabled boolean;
  v_count   int;
begin
  if p_user is null then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'is_premium', false,
      'used', 0, 'period', v_period, 'reason', 'AUTH_REQUIRED'
    );
  end if;

  -- 화이트리스트 겸 한도 조회. 등록되지 않은 feature 는 여기서 걸린다.
  select fl.free_monthly_limit, fl.enabled
    into v_limit, v_enabled
    from public.feature_limits fl
   where fl.feature = p_feature;

  if not found or v_enabled is not true then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'is_premium', false,
      'used', 0, 'period', v_period, 'reason', 'FEATURE_DISABLED'
    );
  end if;

  -- 판정은 만료일 하나로. source 는 보지 않는다.
  select exists (
    select 1 from public.subscriptions s
     where s.user_id = p_user
       and s.expires_at > now()
  ) into v_premium;

  if v_premium then
    return jsonb_build_object(
      'allowed', true, 'remaining', null, 'is_premium', true,
      'used', 0, 'period', v_period
    );
  end if;

  if v_limit is null or v_limit <= 0 then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'is_premium', false,
      'used', 0, 'period', v_period, 'reason', 'NO_FREE_QUOTA'
    );
  end if;

  -- 동시성: 판정과 증가를 한 문장으로. 같은 (user, feature, period) 로 동시에
  -- 들어오면 두 번째 요청이 행 잠금을 기다린 뒤 갱신된 count 로 WHERE 를 재평가한다.
  insert into public.usage_counters as uc (user_id, feature, period, count, updated_at)
  values (p_user, p_feature, v_period, 1, now())
  on conflict (user_id, feature, period)
  do update set count = uc.count + 1, updated_at = now()
    where uc.count < v_limit
  returning uc.count into v_count;

  if v_count is null then
    select uc.count into v_count
      from public.usage_counters uc
     where uc.user_id = p_user and uc.feature = p_feature and uc.period = v_period;

    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'is_premium', false,
      'used', coalesce(v_count, v_limit), 'period', v_period, 'reason', 'LIMIT_REACHED'
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'remaining', greatest(v_limit - v_count, 0),
    'is_premium', false,
    'used', v_count,
    'period', v_period
  );
end;
$$;

revoke all on function public._consume_usage(uuid, text) from public;


-- ─── 3. 공개 RPC ────────────────────────────────────────────────────────────
-- 파라미터 목록이 바뀌므로 이전 시그니처를 먼저 제거한다.
-- (남겨두면 클라이언트가 옛 함수를 계속 호출해 한도를 넘길 수 있다)
drop function if exists public.check_and_increment_usage(text, int);

-- 사용자 본인용. 한도 파라미터가 없고, 사용자도 JWT 에서만 결정된다.
create or replace function public.check_and_increment_usage(p_feature text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return public._consume_usage(auth.uid(), p_feature);
end;
$$;

revoke all on function public.check_and_increment_usage(text) from public;
grant execute on function public.check_and_increment_usage(text) to authenticated;

-- Edge Function(service role)용. 대상 사용자를 인자로 받는다.
-- authenticated·anon 에는 EXECUTE 를 주지 않으므로 일반 클라이언트는 남의 user_id 를
-- 지정할 수 없다. 이 경계는 GRANT 로만 정해지며 JWT 파싱에 의존하지 않는다.
create or replace function public.admin_check_and_increment_usage(
  p_feature text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return public._consume_usage(p_user_id, p_feature);
end;
$$;

revoke all on function public.admin_check_and_increment_usage(text, uuid) from public;
grant execute on function public.admin_check_and_increment_usage(text, uuid) to service_role;


-- ─── 4. 보상(차감 취소) ─────────────────────────────────────────────────────
-- AI 호출이 실패하면 사용량만 차감된 채 결과가 없다. Edge Function 이 이 함수로 되돌린다.
-- service role 전용 — 일반 사용자가 부를 수 있으면 한도가 무의미해진다.
create or replace function public.refund_usage(
  p_feature text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_period text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
  v_count  int;
begin
  if p_user_id is null or p_feature is null then
    return jsonb_build_object('refunded', false, 'used', 0, 'period', v_period, 'reason', 'INVALID_ARGS');
  end if;

  update public.usage_counters uc
     set count = greatest(uc.count - 1, 0),  -- 0 미만으로 내려가지 않는다
         updated_at = now()
   where uc.user_id = p_user_id
     and uc.feature = p_feature
     and uc.period  = v_period
  returning uc.count into v_count;

  if v_count is null then
    -- 이번 달 카운터가 없다 = 되돌릴 것이 없다 (유료 사용자였거나 이미 정리됨)
    return jsonb_build_object('refunded', false, 'used', 0, 'period', v_period, 'reason', 'NO_COUNTER');
  end if;

  return jsonb_build_object('refunded', true, 'used', v_count, 'period', v_period);
end;
$$;

revoke all on function public.refund_usage(text, uuid) from public;
grant execute on function public.refund_usage(text, uuid) to service_role;

commit;


-- ─── 검증 (콘솔에서 수동 실행) ──────────────────────────────────────────────
--
-- A. 구조 확인
--   select feature, free_monthly_limit, enabled from public.feature_limits;
--   → ai_feedback / 3 / true
--
--   select tablename, policyname, cmd, roles from pg_policies
--    where schemaname='public' and tablename='feature_limits';
--   → feature_limits_read / SELECT / {authenticated} 하나뿐 (쓰기 정책 없음)
--
-- B. 공격 시나리오 재검증 ─────────────────────────────────────────────────
--
-- B-1. limit 파라미터가 사라졌는가
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public'
--      and p.proname in ('check_and_increment_usage','admin_check_and_increment_usage','refund_usage')
--    order by 1;
--   → check_and_increment_usage(text)            ← int 인자 없음
--     admin_check_and_increment_usage(text, uuid)
--     refund_usage(text, uuid)
--   옛 시그니처가 남아있지 않은지도 확인:
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='check_and_increment_usage'
--      and pg_get_function_identity_arguments(p.oid) = 'text, integer';
--   → 0
--
--   앱 콘솔(로그인 상태)에서 옛 호출이 실패하는지:
--   await supabase.rpc('check_and_increment_usage', { p_feature:'ai_feedback', p_monthly_limit: 999999 })
--   → error (함수 시그니처 없음). 한도를 클라이언트가 정할 방법이 없다.
--
-- B-2. 임의 feature 가 거부되는가
--   앱 콘솔: await supabase.rpc('check_and_increment_usage', { p_feature: 'junk_bucket' })
--   → {"allowed": false, "reason": "FEATURE_DISABLED"}
--   킬스위치도 같은 경로로 확인:
--   update public.feature_limits set enabled=false where feature='ai_feedback';
--   → 이후 호출이 FEATURE_DISABLED. 확인 후 되돌릴 것:
--   update public.feature_limits set enabled=true, updated_at=now() where feature='ai_feedback';
--
-- B-3. authenticated 가 남의 p_user_id 를 지정할 수 없는가
--   앱 콘솔: await supabase.rpc('admin_check_and_increment_usage',
--                               { p_feature:'ai_feedback', p_user_id:'<남의 uuid>' })
--   → permission denied for function admin_check_and_increment_usage
--   권한 자체 확인:
--   select proname, proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and proname='admin_check_and_increment_usage';
--   → proacl 에 service_role=X 만 있고 authenticated/anon 없음
--
-- B-4. authenticated 가 refund_usage 를 호출할 수 없는가
--   앱 콘솔: await supabase.rpc('refund_usage', { p_feature:'ai_feedback', p_user_id:'<본인 uuid>' })
--   → permission denied for function refund_usage
--
-- B-5. 카운터 직접 조작 (이전 마이그레이션에서 이미 차단, 회귀 확인)
--   await supabase.from('usage_counters').update({ count: 0 }).eq('feature','ai_feedback')
--   → 0건
--   await supabase.from('feature_limits').update({ free_monthly_limit: 999 }).eq('feature','ai_feedback')
--   → 0건 (쓰기 정책 없음)
--
-- C. 정상 동작
--   앱 콘솔에서 4회 호출:
--   await supabase.rpc('check_and_increment_usage', { p_feature: 'ai_feedback' })
--   → 1~3회 allowed=true (remaining 2→1→0), 4회 allowed=false reason=LIMIT_REACHED
--
--   보상 확인 (service role 키로):
--   select public.refund_usage('ai_feedback', '<본인 uuid>'::uuid);
--   → {"refunded": true, "used": 2} → 다시 1회 사용 가능
--
--   유료 판정 (테스트 후 되돌릴 것):
--   insert into public.subscriptions (user_id, expires_at, source)
--   values ('<본인 uuid>'::uuid, now() + interval '1 day', 'manual_test')
--   on conflict (user_id) do update set expires_at=excluded.expires_at, updated_at=now();
--   → allowed=true, is_premium=true, remaining=null, 카운터 증가 없음
--   delete from public.subscriptions where user_id='<본인 uuid>'::uuid and source='manual_test';
