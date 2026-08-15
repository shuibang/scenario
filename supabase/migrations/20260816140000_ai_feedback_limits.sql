begin;

-- ─── AI 피드백 한도 보완 (평생 1회 무료 + 유료 월 10회) ──────────────────────
-- 20260816130000_membership_limits_server_side.sql 위에 얹는다. 이전 파일들은
-- 수정하지 않는다(이미 콘솔에서 실행됐을 수 있으므로).
--
-- 바뀌는 것 2가지:
--   1) 리셋 주기를 기능별로 정한다. AI 피드백은 매달 재충전되면 안 된다 —
--      호출 1건이 곧 API 요금이라, 무료 사용자에게 월 단위 재충전을 주면
--      계정 하나당 매달 비용이 다시 발생한다. 무료는 "평생 1회" 체험으로 둔다.
--   2) 유료도 무제한이 아니다. 지금까지 유료는 카운트 없이 통과했는데,
--      AI 기능에서는 그게 곧 무한 요금이다. 유료에도 상한을 두되 월 단위로 재충전한다.
--
-- 설계상 정한 것:
--   - lifetime 은 무료에만 적용한다. 유료는 reset_period 와 무관하게 항상 월 단위다.
--     ("평생 10회"인 유료 상품은 구독의 의미가 없다)
--   - 무료/유료 카운터는 서로 다른 period 키를 쓴다(무료 'lifetime' 또는 'YYYY-MM',
--     유료 'premium-YYYY-MM'). 무료로 쓰던 사람이 결제하면 유료 몫이 온전히 생기고,
--     구독이 끝나면 무료 카운터(이미 소진된 'lifetime' 행)로 돌아간다.
--   - premium_monthly_limit 이 null 이면 종전처럼 무제한·무카운트다.
--     AI 가 아닌 기능은 이 값을 null 로 두면 동작이 그대로 유지된다.
--
-- 되돌리는 법: feature_limits 한 행만 고치면 된다. 스키마를 되돌릴 필요는 없다.
--   update public.feature_limits
--      set free_monthly_limit=3, premium_monthly_limit=null, reset_period='monthly'
--    where feature='ai_feedback';
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. 컬럼 추가 ───────────────────────────────────────────────────────────
alter table public.feature_limits
  add column if not exists reset_period text not null default 'monthly';

-- null = 무제한(종전 동작). 0 이하 = 사용 불가.
alter table public.feature_limits
  add column if not exists premium_monthly_limit int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'feature_limits_reset_period_check'
  ) then
    alter table public.feature_limits
      add constraint feature_limits_reset_period_check
      check (reset_period in ('monthly', 'lifetime'));
  end if;
end
$$;


-- ─── 2. 카운터 기간 키 ──────────────────────────────────────────────────────
-- 차감(_consume_usage)과 환불(refund_usage)이 반드시 같은 행을 가리켜야 하므로
-- 기간 키 계산을 한 곳에 모은다. 여기서 갈라지면 환불이 엉뚱한 행을 건드리거나
-- 아무것도 못 되돌린다.
--
-- 테이블을 읽지 않는 순수 계산이라 SECURITY DEFINER 가 필요 없다.
-- 유료 판정과 reset_period 는 호출자가 이미 조회한 값을 넘긴다 — 같은 함수 안에서
-- 두 번 조회하면 그 사이에 구독 상태가 바뀌었을 때 차감과 기간 키가 어긋난다.
create or replace function public._usage_period(
  p_premium      boolean,
  p_reset_period text
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    -- 유료는 reset_period 와 무관하게 항상 월 단위. 무료 카운터와 키가 겹치지 않게 접두어를 둔다.
    when p_premium              then 'premium-' || to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM')
    when p_reset_period = 'lifetime' then 'lifetime'
    else                             to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM')
  end;
$$;

revoke all on function public._usage_period(boolean, text) from public;


-- ─── 3. 판정 + 증가 ─────────────────────────────────────────────────────────
-- 시그니처(uuid, text)는 그대로다 — 래퍼 두 개(check_and_increment_usage,
-- admin_check_and_increment_usage)와 그 GRANT 는 손대지 않는다.
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
  v_month         text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
  v_period        text;
  v_premium       boolean;
  v_free_limit    int;
  v_premium_limit int;
  v_reset         text;
  v_limit         int;
  v_enabled       boolean;
  v_count         int;
begin
  if p_user is null then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'is_premium', false,
      'used', 0, 'period', v_month, 'reason', 'AUTH_REQUIRED'
    );
  end if;

  -- 화이트리스트 겸 한도 조회. 등록되지 않은 feature 는 여기서 걸린다.
  select fl.free_monthly_limit, fl.enabled, fl.reset_period, fl.premium_monthly_limit
    into v_free_limit, v_enabled, v_reset, v_premium_limit
    from public.feature_limits fl
   where fl.feature = p_feature;

  if not found or v_enabled is not true then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'is_premium', false,
      'used', 0, 'period', v_month, 'reason', 'FEATURE_DISABLED'
    );
  end if;

  -- 판정은 만료일 하나로. source 는 보지 않는다.
  select exists (
    select 1 from public.subscriptions s
     where s.user_id = p_user
       and s.expires_at > now()
  ) into v_premium;

  v_period := public._usage_period(v_premium, v_reset);

  if v_premium then
    if v_premium_limit is null then
      -- 종전 동작: 무제한·무카운트.
      return jsonb_build_object(
        'allowed', true, 'remaining', null, 'is_premium', true,
        'used', 0, 'period', v_period
      );
    end if;
    v_limit := v_premium_limit;
  else
    v_limit := v_free_limit;
  end if;

  if v_limit is null or v_limit <= 0 then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'is_premium', v_premium,
      'used', 0, 'period', v_period,
      'reason', case when v_premium then 'NO_QUOTA' else 'NO_FREE_QUOTA' end
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
      'allowed', false, 'remaining', 0, 'is_premium', v_premium,
      'used', coalesce(v_count, v_limit), 'period', v_period, 'reason', 'LIMIT_REACHED'
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'remaining', greatest(v_limit - v_count, 0),
    'is_premium', v_premium,
    'used', v_count,
    'period', v_period
  );
end;
$$;

revoke all on function public._consume_usage(uuid, text) from public;


-- ─── 4. 보상(차감 취소) ─────────────────────────────────────────────────────
-- 기간 키를 _consume_usage 와 같은 방식으로 다시 구해야 한다. 이전 버전은 항상
-- 'YYYY-MM' 을 봤기 때문에 lifetime·premium 카운터를 되돌리지 못한다.
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
  v_month   text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
  v_period  text;
  v_reset   text;
  v_premium boolean;
  v_count   int;
begin
  if p_user_id is null or p_feature is null then
    return jsonb_build_object('refunded', false, 'used', 0, 'period', v_month, 'reason', 'INVALID_ARGS');
  end if;

  select fl.reset_period into v_reset
    from public.feature_limits fl
   where fl.feature = p_feature;

  if not found then
    return jsonb_build_object('refunded', false, 'used', 0, 'period', v_month, 'reason', 'FEATURE_UNKNOWN');
  end if;

  select exists (
    select 1 from public.subscriptions s
     where s.user_id = p_user_id
       and s.expires_at > now()
  ) into v_premium;

  v_period := public._usage_period(v_premium, v_reset);

  update public.usage_counters uc
     set count = greatest(uc.count - 1, 0),  -- 0 미만으로 내려가지 않는다
         updated_at = now()
   where uc.user_id = p_user_id
     and uc.feature = p_feature
     and uc.period  = v_period
  returning uc.count into v_count;

  if v_count is null then
    -- 해당 기간 카운터가 없다 = 되돌릴 것이 없다 (무제한 유료였거나 이미 정리됨)
    return jsonb_build_object('refunded', false, 'used', 0, 'period', v_period, 'reason', 'NO_COUNTER');
  end if;

  return jsonb_build_object('refunded', true, 'used', v_count, 'period', v_period);
end;
$$;

revoke all on function public.refund_usage(text, uuid) from public;
grant execute on function public.refund_usage(text, uuid) to service_role;


-- ─── 5. AI 피드백 정책값 ────────────────────────────────────────────────────
-- 앞선 마이그레이션의 시드(무료 월 3회)를 의도적으로 덮어쓴다.
-- enabled 는 update 대상에서 뺀다 — 사고로 킬스위치를 내려둔 상태를
-- 이 파일 재실행이 되살리면 안 된다.
insert into public.feature_limits
  (feature, free_monthly_limit, premium_monthly_limit, reset_period, enabled, updated_at)
values
  ('ai_feedback', 1, 10, 'lifetime', true, now())
on conflict (feature) do update
   set free_monthly_limit    = excluded.free_monthly_limit,
       premium_monthly_limit = excluded.premium_monthly_limit,
       reset_period          = excluded.reset_period,
       updated_at            = now();

commit;


-- ─── 검증 (콘솔에서 수동 실행) ──────────────────────────────────────────────
--
-- A. 구조 확인
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema='public' and table_name='feature_limits'
--    order by ordinal_position;
--   → reset_period(text, NO, 'monthly'::text), premium_monthly_limit(integer, YES, null) 포함
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname='feature_limits_reset_period_check';
--   → CHECK ((reset_period = ANY (ARRAY['monthly'::text, 'lifetime'::text])))
--
--   select feature, free_monthly_limit, premium_monthly_limit, reset_period, enabled
--     from public.feature_limits;
--   → ai_feedback / 1 / 10 / lifetime / true
--
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public'
--      and p.proname in ('_usage_period','_consume_usage','refund_usage',
--                        'check_and_increment_usage','admin_check_and_increment_usage')
--    order by 1;
--   → _usage_period(boolean, text) / prosecdef=false
--     나머지는 이전 시그니처 그대로, prosecdef=true
--
-- B. 기간 키가 의도대로 갈리는가
--   select public._usage_period(false, 'lifetime') as free_life,
--          public._usage_period(false, 'monthly')  as free_month,
--          public._usage_period(true,  'lifetime') as paid_life,
--          public._usage_period(true,  'monthly')  as paid_month;
--   → 'lifetime' / '2026-08' / 'premium-2026-08' / 'premium-2026-08'
--     (유료는 lifetime 을 무시하고 월 단위)
--
-- C. 무료 = 평생 1회
--   기존 테스트 카운터가 남아 있으면 먼저 지운다:
--   delete from public.usage_counters
--    where user_id='<본인 uuid>'::uuid and feature='ai_feedback';
--
--   앱 콘솔(로그인 상태)에서 두 번 호출:
--   await supabase.rpc('check_and_increment_usage', { p_feature: 'ai_feedback' })
--   → 1회차 {allowed:true, remaining:0, used:1, period:'lifetime', is_premium:false}
--     2회차 {allowed:false, reason:'LIMIT_REACHED', period:'lifetime'}
--
--   달이 바뀌어도 재충전되지 않는지는 행이 하나뿐인 것으로 확인한다:
--   select feature, period, count from public.usage_counters
--    where user_id='<본인 uuid>'::uuid and feature='ai_feedback';
--   → period='lifetime' 한 행만
--
-- D. 유료 = 월 10회 (테스트 후 반드시 되돌릴 것)
--   insert into public.subscriptions (user_id, expires_at, source)
--   values ('<본인 uuid>'::uuid, now() + interval '1 day', 'manual_test')
--   on conflict (user_id) do update set expires_at=excluded.expires_at, updated_at=now();
--
--   앱 콘솔에서 반복 호출:
--   await supabase.rpc('check_and_increment_usage', { p_feature: 'ai_feedback' })
--   → {allowed:true, is_premium:true, remaining:9, period:'premium-2026-08'}
--     ... 10회차 remaining:0, 11회차 {allowed:false, reason:'LIMIT_REACHED'}
--   무료로 이미 소진한 'lifetime' 행과 별개인지:
--   select period, count from public.usage_counters
--    where user_id='<본인 uuid>'::uuid and feature='ai_feedback';
--   → 'lifetime' 1, 'premium-2026-08' 10 두 행
--
--   delete from public.subscriptions where user_id='<본인 uuid>'::uuid and source='manual_test';
--   → 구독 해지 후 다시 호출하면 무료 'lifetime' 카운터(이미 소진)로 돌아가 거부된다
--
-- E. 환불이 올바른 행을 되돌리는가 (service role 키 필요 — 콘솔 SQL 에디터는 owner 권한)
--   select public.refund_usage('ai_feedback', '<본인 uuid>'::uuid);
--   → 무료 상태면 {refunded:true, period:'lifetime', used:0}
--     유료 상태면 {refunded:true, period:'premium-2026-08'}
--   등록되지 않은 기능:
--   select public.refund_usage('junk_bucket', '<본인 uuid>'::uuid);
--   → {refunded:false, reason:'FEATURE_UNKNOWN'}
--
-- F. 권한 회귀 확인 (앱 콘솔, 로그인 상태)
--   await supabase.rpc('refund_usage', { p_feature:'ai_feedback', p_user_id:'<본인 uuid>' })
--   → permission denied
--   await supabase.from('feature_limits').update({ premium_monthly_limit: 9999 }).eq('feature','ai_feedback')
--   → 0건 (쓰기 정책 없음)
