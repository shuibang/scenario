begin;

-- ─── 사용량 함수 EXECUTE 권한 회수 (20260816130000·140000 결함 수정) ─────────
-- 앞선 두 마이그레이션은 함수를 만든 뒤 `revoke all ... from public` 만 실행했다.
-- 그것으로는 부족했다.
--
-- 왜 새는가:
--   PUBLIC 은 의사(pseudo) 롤이고 anon·authenticated 는 이름이 붙은 별개 롤이다.
--   PUBLIC 회수는 이름붙은 롤에 직접 부여된 ACL 엔트리를 건드리지 않는다.
--   그 직접 부여는 Supabase 가 public 스키마에 걸어둔 ALTER DEFAULT PRIVILEGES 에서
--   온다(함수가 "새로 생성되는" 시점에 적용된다). 확인:
--     select defaclrole::regrole, defaclnamespace::regnamespace, defaclacl
--       from pg_default_acl where defaclobjtype = 'f';
--
--   즉 권한이 되살아난 게 아니라 애초에 회수된 적이 없다.
--   CREATE OR REPLACE 는 기존 ACL 을 보존하고 기본 권한을 재적용하지 않으므로,
--   140000 이 함수를 다시 만든 것은 원인이 아니다.
--
-- 실제 위험이었던 것:
--   public._consume_usage(uuid, text) 는 SECURITY DEFINER 이면서 대상 사용자를
--   인자로 받는다. authenticated 에 EXECUTE 가 남아 있으면 PostgREST 가 그대로
--   노출하므로(밑줄 접두어는 노출 여부와 무관) 로그인한 아무나
--   `rpc('_consume_usage', { p_user: '<남의 uuid>', ... })` 로 타인의 사용량을
--   소진시키고 응답의 is_premium 으로 구독 여부까지 확인할 수 있었다.
--   130000 이 admin_check_and_increment_usage 에서 막으려던 바로 그 구멍이
--   내부 헬퍼 쪽에 그대로 남아 있었다.
--
-- 멱등:
--   REVOKE·GRANT 는 대상 권한이 이미 없거나 이미 있어도 오류가 아니다.
--   콘솔에서 수동으로 회수한 admin_check_and_increment_usage·refund_usage 에
--   다시 실행해도 결과가 같다. 함수 본문은 건드리지 않는다.
--
-- 규칙:
--   "필요한 롤에만 EXECUTE" 에 예외를 두지 않는다. 실질 위험이 없는 항목도 정리한다.
--   예외를 하나 허용하면 다음 사람이 어디까지가 의도된 넓힘인지 판단해야 하고,
--   그 판단이 이번 같은 사고의 출발점이 된다.
--
-- 범위 밖:
--   내부 헬퍼를 PostgREST 비노출 스키마로 옮기는 것(재발 방지 3번)은 이번 범위가 아니다.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. 내부 헬퍼 — 누구에게도 EXECUTE 를 주지 않는다 ────────────────────────
-- SECURITY DEFINER 래퍼가 정의자(소유자) 권한으로 호출하므로, 호출자 롤에는
-- EXECUTE 가 전혀 필요 없다. service_role 까지 회수하는 이유가 이것이다.
-- (_usage_period 는 SECURITY INVOKER 지만 SECURITY DEFINER 함수 안에서만 불리므로
--  실행 시점의 사용자는 역시 소유자다)
revoke all on function public._consume_usage(uuid, text)
  from public, anon, authenticated, service_role;

revoke all on function public._usage_period(boolean, text)
  from public, anon, authenticated, service_role;


-- ─── 2. 사용자 본인용 — authenticated 에만 ──────────────────────────────────
-- anon 이 불러도 auth.uid() 가 null 이라 AUTH_REQUIRED 로 끝나므로 데이터 위험은
-- 없다. 그래도 회수하는 이유는 두 가지다.
--   비로그인 스크립트가 이 RPC 를 두들겨 DB 커넥션을 소모시킬 수 있다.
--   그리고 "필요한 롤에만 EXECUTE" 를 규칙으로 삼으려면 예외가 없어야 한다.
-- service_role 도 같은 이유로 회수한다. 이 함수는 auth.uid() 로 사용자를 정하는데
-- service_role 에는 그 값이 없어 AUTH_REQUIRED 로만 끝난다 — Edge Function 은
-- admin_check_and_increment_usage 를 쓴다.
revoke all on function public.check_and_increment_usage(text)
  from public, anon, service_role;
grant execute on function public.check_and_increment_usage(text)
  to authenticated;


-- ─── 3. Edge Function 전용 — service_role 에만 ──────────────────────────────
revoke all on function public.admin_check_and_increment_usage(text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_check_and_increment_usage(text, uuid)
  to service_role;

revoke all on function public.refund_usage(text, uuid)
  from public, anon, authenticated;
grant execute on function public.refund_usage(text, uuid)
  to service_role;


-- ─── 4. 검증 — 기대와 다르면 트랜잭션을 되돌린다 ────────────────────────────
-- 파일 하단 주석에 "이런 쿼리로 확인하라"고 적어두는 것만으로는 130000 에서
-- 이미 실패했다. 검증 항목은 맞았는데 아무도 실행을 강제하지 않았다.
-- 그래서 확인을 마이그레이션 안으로 들여와 실패 시 raise exception 으로 롤백한다.
--
-- commit 앞에 있어야 의미가 있다. commit 뒤로 옮기면 되돌릴 것이 없다.
-- 함수를 이름+인자 "타입"으로 찾는다. pg_get_function_identity_arguments 는
-- 인자 이름까지 붙여 돌려주므로(p_user uuid, ...) 문자열 비교에 쓰면 어긋난다.
do $$
declare
  r        record;
  v_proc   regprocedure;
  v_acl    aclitem[];
  v_owner  oid;
  v_actual text;
  v_bad    text[] := '{}';
begin
  for r in
    select * from (values
      ('public._consume_usage(uuid, text)',                  ''),
      ('public._usage_period(boolean, text)',                ''),
      ('public.check_and_increment_usage(text)',             'authenticated'),
      ('public.admin_check_and_increment_usage(text, uuid)', 'service_role'),
      ('public.refund_usage(text, uuid)',                    'service_role')
    ) as t(sig, expected)
  loop
    v_proc := to_regprocedure(r.sig);

    if v_proc is null then
      raise exception '함수를 찾을 수 없다: %. 앞선 마이그레이션이 실행되지 않았다.', r.sig;
    end if;

    select p.proacl, p.proowner
      into v_acl, v_owner
      from pg_proc p
     where p.oid = v_proc;

    -- proacl 이 null 이면 "권한을 한 번도 명시하지 않았다" = 기본 권한이 그대로
    -- 살아 있다는 뜻이다. 이 상태를 통과시키면 검증이 무의미해진다.
    if v_acl is null then
      raise exception 'EXECUTE 권한이 명시되지 않았다(기본 권한 유효): %', r.sig;
    end if;

    -- 소유자 엔트리는 회수 대상이 아니므로 비교에서 뺀다.
    select coalesce(string_agg(distinct g.name, ',' order by g.name), '')
      into v_actual
      from aclexplode(v_acl) a
      cross join lateral (
        select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as name
      ) g
     where a.privilege_type = 'EXECUTE'
       and a.grantee <> v_owner;

    if v_actual is distinct from r.expected then
      v_bad := v_bad || format(
        '%s — 기대: [%s] / 실제: [%s]',
        r.sig,
        coalesce(nullif(r.expected, ''), '없음'),
        coalesce(nullif(v_actual,   ''), '없음')
      );
    end if;
  end loop;

  if array_length(v_bad, 1) is not null then
    -- 실제 목록에 'postgres' 가 보인다면 권한 구멍이 아니라 함수 소유자가 다른 것이다.
    --   select p.oid::regprocedure, p.proowner::regrole from pg_proc p
    --    where p.oid = to_regprocedure('public._consume_usage(uuid, text)');
    raise exception E'EXECUTE 권한이 기대와 다르다:\n%', array_to_string(v_bad, E'\n');
  end if;

  raise notice '사용량 함수 5개 EXECUTE 권한 검증 통과';
end
$$;

commit;


-- ─── 검증 (콘솔에서 수동 실행) ──────────────────────────────────────────────
--
-- 위 DO 블록이 이미 강제하지만, 나중에 다시 볼 때를 위해 남긴다.
--
-- A. 현재 권한 한눈에 보기
--   select p.proname,
--          pg_get_function_identity_arguments(p.oid) as args,
--          p.proowner::regrole                       as owner,
--          p.prosecdef                               as security_definer,
--          p.proacl
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('_usage_period','_consume_usage','refund_usage',
--                        'admin_check_and_increment_usage','check_and_increment_usage')
--    order by 1;
--   → _consume_usage / _usage_period    : 소유자 엔트리만
--     check_and_increment_usage         : + authenticated=X
--     admin_check_and_increment_usage   : + service_role=X
--     refund_usage                      : + service_role=X
--   소유자 외에 다른 롤이 하나라도 더 보이면 회수가 덜 된 것이다.
--
-- B. 실제로 막혔는지 (앱 콘솔, 로그인 상태)
--   await supabase.rpc('_consume_usage', { p_user: '<본인 uuid>', p_feature: 'ai_feedback' })
--   → permission denied for function _consume_usage
--   await supabase.rpc('_usage_period', { p_premium: false, p_reset_period: 'lifetime' })
--   → permission denied for function _usage_period
--   await supabase.rpc('admin_check_and_increment_usage', { p_feature:'ai_feedback', p_user_id:'<남의 uuid>' })
--   → permission denied for function admin_check_and_increment_usage
--   await supabase.rpc('refund_usage', { p_feature:'ai_feedback', p_user_id:'<본인 uuid>' })
--   → permission denied for function refund_usage
--
--   비로그인(anon)에서도 막혔는지 — 로그아웃 상태 또는 anon 키만 쓰는 클라이언트로:
--   await supabase.rpc('check_and_increment_usage', { p_feature: 'ai_feedback' })
--   → permission denied for function check_and_increment_usage
--     (회수 전에는 AUTH_REQUIRED 를 돌려주며 호출 자체는 성립했다)
--
-- C. 정상 경로가 여전히 동작하는지 (회수가 과했는지 확인)
--   await supabase.rpc('check_and_increment_usage', { p_feature: 'ai_feedback' })
--   → 정상 응답 (내부적으로 _consume_usage · _usage_period 를 탄다.
--     SECURITY DEFINER 라 소유자 권한으로 호출되므로 위 회수의 영향을 받지 않는다)
--
--   service_role 키로:
--   select public.admin_check_and_increment_usage('ai_feedback', '<본인 uuid>'::uuid);
--   select public.refund_usage('ai_feedback', '<본인 uuid>'::uuid);
--   → 둘 다 정상 응답
--
-- D. 앞으로 함수를 추가할 때
--   CREATE 직후 항상 같은 줄을 붙인다:
--     revoke all on function public.<이름>(<인자>) from public, anon, authenticated;
--   그리고 필요한 롤에만 grant 한다. `from public` 만으로는 회수되지 않는다.
