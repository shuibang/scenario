begin;

-- ─── 유료 멤버십 기반 (구독 판정 + 사용량 카운터) ────────────────────────────
-- 이 마이그레이션은 "판정 기반"만 만든다. 유료 기능도, 결제 수단도 아직 없다.
-- 지금 시점에 유료인 사용자는 아무도 없다.
--
-- 기반을 먼저 두는 이유:
--   쿠폰(와디즈)과 정기결제(Toss)가 같은 판정 위에 얹혀야 나중에 뜯지 않는다.
--
-- 설계 원칙:
--   1) 권한 판정은 만료일 하나로 한다. 앱은 "expires_at 이 미래인가"만 본다.
--   2) 획득 경로(source)는 기록만 하고 판정에 쓰지 않는다.
--      쿠폰이든 결제든 판정 코드가 같아야 경로가 늘어도 앱이 안 바뀐다.
--   3) 기간 연장은 GREATEST(expires_at, now()) + interval 로 이어붙인다.
--      쿠폰 사용 중 결제를 시작해도 남은 기간이 사라지지 않는다.
--      (연장 함수 자체는 쿠폰·결제 단계에서 추가한다. 여기서는 구조만 보장)
--
-- 참고 전례:
--   카운터 + SECURITY DEFINER 쓰기 — 20260520134125_user_share_counters.sql
--   RPC 스타일·grant       — 20260731120000_legacy_link_rpc.sql
--   id 비교 ::text 캐스트 사고는 review_links.id 가 text 라서 생긴 것이며,
--   여기 두 테이블의 user_id 는 uuid 이고 auth.uid() 도 uuid 라 캐스트가 필요 없다.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. 구독 ────────────────────────────────────────────────────────────────
-- user_id 를 PK 로 둬 사용자당 한 행만 유지한다. 이력이 필요해지면 별도
-- 이력 테이블을 추가하고 이 테이블은 "현재 상태"로 계속 쓴다.
create table if not exists public.subscriptions (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  -- 'wadiz_coupon' | 'toss' | ... 기록 전용. 판정에 쓰지 말 것.
  source     text        not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 만료 판정 조회용
create index if not exists idx_subscriptions_expires_at
  on public.subscriptions (expires_at);

alter table public.subscriptions enable row level security;

-- 본인 행만 SELECT. INSERT/UPDATE 정책은 만들지 않는다 —
-- 쿠폰 등록·결제 웹훅은 service role 또는 SECURITY DEFINER 함수가 전담한다.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'subscriptions'
      and policyname = 'subscriptions_self_select'
  ) then
    create policy subscriptions_self_select
      on public.subscriptions
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end
$$;


-- ─── 2. 사용량 카운터 ───────────────────────────────────────────────────────
-- period 는 'YYYY-MM' 문자열. 월이 바뀌면 새 행이 생기므로 별도 리셋 작업이
-- 필요 없다(자연 재충전). 과거 달 행은 사용 이력으로 남는다.
create table if not exists public.usage_counters (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  feature    text        not null,
  period     text        not null,
  count      int         not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, feature, period)
);

alter table public.usage_counters enable row level security;

-- 본인 행만 SELECT. 증가는 아래 RPC 로만 — 클라이언트가 count 를 직접
-- 조작하지 못하게 쓰기 정책을 두지 않는다.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'usage_counters'
      and policyname = 'usage_counters_self_select'
  ) then
    create policy usage_counters_self_select
      on public.usage_counters
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end
$$;


-- ─── 3. 사용량 판정 + 증가 RPC ──────────────────────────────────────────────
-- 유료면 무조건 허용하고 카운트하지 않는다. 무료면 이번 달 count 가 한도 미만일
-- 때만 1 증가시키고 허용한다.
--
-- 동시성:
--   판정과 증가를 INSERT ... ON CONFLICT DO UPDATE 한 문장으로 처리한다.
--   같은 (user_id, feature, period) 로 동시에 들어오면 두 번째 요청은 첫 번째가
--   잡은 행 잠금을 기다렸다가 갱신된 count 를 보고 조건을 재평가한다.
--   DO UPDATE 의 WHERE 가 한도를 넘기는 증가를 막고, 그 경우 RETURNING 이
--   아무 행도 돌려주지 않으므로 거부로 처리된다. 즉 별도 잠금 없이 한도가 지켜진다.
--
-- period 기준 시각은 한국 시간이다. UTC 로 두면 매월 1일 오전 9시 이전에
-- 지난달 한도가 계속 쓰이는 것처럼 보인다.
create or replace function public.check_and_increment_usage(
  p_feature       text,
  p_monthly_limit int
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user    uuid := auth.uid();
  v_period  text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
  v_premium boolean;
  v_count   int;
begin
  if v_user is null then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'is_premium', false,
      'used', 0, 'period', v_period, 'reason', 'AUTH_REQUIRED'
    );
  end if;

  if p_feature is null or length(trim(p_feature)) = 0 then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'is_premium', false,
      'used', 0, 'period', v_period, 'reason', 'FEATURE_REQUIRED'
    );
  end if;

  -- 판정은 만료일 하나로. source 는 보지 않는다.
  select exists (
    select 1 from public.subscriptions s
     where s.user_id = v_user
       and s.expires_at > now()
  ) into v_premium;

  if v_premium then
    -- 유료는 무제한 — 카운트하지 않는다. remaining 은 null(=무제한).
    return jsonb_build_object(
      'allowed', true, 'remaining', null, 'is_premium', true,
      'used', 0, 'period', v_period
    );
  end if;

  if p_monthly_limit is null or p_monthly_limit <= 0 then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'is_premium', false,
      'used', 0, 'period', v_period, 'reason', 'NO_FREE_QUOTA'
    );
  end if;

  insert into public.usage_counters as uc (user_id, feature, period, count, updated_at)
  values (v_user, p_feature, v_period, 1, now())
  on conflict (user_id, feature, period)
  do update set count = uc.count + 1, updated_at = now()
    where uc.count < p_monthly_limit
  returning uc.count into v_count;

  if v_count is null then
    -- DO UPDATE 의 WHERE 에 걸림 = 이미 한도 소진
    select uc.count into v_count
      from public.usage_counters uc
     where uc.user_id = v_user and uc.feature = p_feature and uc.period = v_period;

    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'is_premium', false,
      'used', coalesce(v_count, p_monthly_limit), 'period', v_period, 'reason', 'LIMIT_REACHED'
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'remaining', greatest(p_monthly_limit - v_count, 0),
    'is_premium', false,
    'used', v_count,
    'period', v_period
  );
end;
$$;

revoke all on function public.check_and_increment_usage(text, int) from public;
grant execute on function public.check_and_increment_usage(text, int) to authenticated;

commit;


-- ─── 검증 (콘솔에서 수동 실행) ──────────────────────────────────────────────
--
-- 1) 테이블·인덱스 생성 확인
--   select table_name from information_schema.tables
--    where table_schema = 'public' and table_name in ('subscriptions', 'usage_counters');
--   → 2행
--
--   select indexname from pg_indexes
--    where schemaname = 'public' and tablename = 'subscriptions';
--   → subscriptions_pkey, idx_subscriptions_expires_at
--
-- 2) RLS 활성화·정책 확인
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' and tablename in ('subscriptions', 'usage_counters');
--   → rowsecurity = true (둘 다)
--
--   select tablename, policyname, cmd, roles from pg_policies
--    where schemaname = 'public' and tablename in ('subscriptions', 'usage_counters');
--   → subscriptions_self_select / usage_counters_self_select, 둘 다 cmd=SELECT,
--     roles={authenticated}. INSERT/UPDATE 정책이 없어야 정상이다.
--
-- 3) RPC 존재·권한 확인
--   select p.proname, p.prosecdef
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'check_and_increment_usage';
--   → prosecdef = true (SECURITY DEFINER)
--
-- 4) RPC 호출 — 콘솔 SQL 에디터는 auth.uid() 가 null 이라 AUTH_REQUIRED 가 정상이다.
--   select public.check_and_increment_usage('ai_feedback', 3);
--   → {"allowed": false, ..., "reason": "AUTH_REQUIRED"}
--
--   로그인 상태 확인은 앱 콘솔에서:
--   await supabase.rpc('check_and_increment_usage', { p_feature: 'ai_feedback', p_monthly_limit: 3 })
--   → 1~3회차 allowed=true, remaining 2→1→0, 4회차 allowed=false reason=LIMIT_REACHED
--
-- 5) 유료 판정 확인 (테스트 후 반드시 되돌릴 것)
--   insert into public.subscriptions (user_id, expires_at, source)
--   values ('<본인 user_id>'::uuid, now() + interval '1 day', 'manual_test')
--   on conflict (user_id) do update set expires_at = excluded.expires_at, updated_at = now();
--   → 이후 RPC 가 allowed=true, is_premium=true, remaining=null 을 돌려주고 카운트는 늘지 않는다
--   delete from public.subscriptions where user_id = '<본인 user_id>'::uuid and source = 'manual_test';
--
-- 6) 클라이언트가 카운터를 직접 못 바꾸는지 (앱 콘솔, 로그인 상태)
--   await supabase.from('usage_counters').update({ count: 0 }).eq('feature', 'ai_feedback')
--   → 갱신 0건 (UPDATE 정책 없음)
