begin;

-- ─── Fix: get_legacy_link_payload 의 id 비교 캐스트 누락 ─────────────────────
-- 증상:
--   #log= 공유 링크가 "유효하지 않은 링크입니다"로 열리지 않음.
--   (#review= 는 loadSharedReviewResource 가 get_feedback_link_bundle 을
--    먼저 시도해 성공하므로 이 함수까지 내려가지 않아 정상으로 보였음)
--
-- 원인:
--   review_links.id 는 text 타입인데 20260731120000_legacy_link_rpc.sql:41 의
--   비교가 `id = p_link_id` 로 uuid 파라미터를 캐스트 없이 비교 →
--   "operator does not exist: text = uuid" 로 조회 자체가 실패.
--
-- 전례:
--   20260422211032_fix_review_links_id_cast.sql 에서 get_feedback_link_bundle /
--   submit_feedback_session 이 같은 이유로 이미 한 번 깨졌고 ::text 캐스트로
--   수정됨. 이후 20260518035959, 20260519035959 도 그 패턴을 보존하고 있다.
--   이번 함수만 그 패턴을 따르지 않아 동일 버그가 재발한 것.
--
-- 조치:
--   id 비교에만 ::text 캐스트 적용. 함수 시그니처·link_type 필터·만료 판정 등
--   나머지 본문은 20260731120000 과 동일하게 유지한다.
--   create or replace 이므로 재실행 안전(멱등).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_legacy_link_payload(p_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.review_links%rowtype;
begin
  select *
    into v_link
    from public.review_links
   -- review_links.id 는 text — uuid 인자와 비교하려면 ::text 캐스트 필수.
   -- (20260422211032_fix_review_links_id_cast.sql 의 패턴 보존)
   where id = p_link_id::text
     and link_type in ('legacy_review', 'log_export');

  if not found then
    raise exception 'LEGACY_LINK_NOT_FOUND';
  end if;

  if v_link.expires_at is not null and v_link.expires_at <= now() then
    raise exception 'LEGACY_LINK_EXPIRED';
  end if;

  return jsonb_build_object(
    'payload', v_link.payload,
    'expires_at', v_link.expires_at
  );
end;
$$;

-- create or replace 는 기존 권한을 유지하지만, 이 함수의 접근 권한이
-- 한 파일만 봐도 드러나도록 명시적으로 재선언한다.
grant execute on function public.get_legacy_link_payload(uuid) to anon, authenticated;

commit;

-- ─── 검증 (수동) ────────────────────────────────────────────────────────────
-- 1) 기존 활성 #log= 링크 id 로 확인:
--      select public.get_legacy_link_payload('<review_links.id>'::uuid);
--      → payload, expires_at 이 담긴 jsonb 반환 (이전에는 text = uuid 에러)
--
-- 2) 만료된 링크:
--      select public.get_legacy_link_payload('<만료된 id>'::uuid);
--      → ERROR: LEGACY_LINK_EXPIRED
--
-- 3) 존재하지 않는 id:
--      select public.get_legacy_link_payload(gen_random_uuid());
--      → ERROR: LEGACY_LINK_NOT_FOUND
--
-- 4) 브라우저에서 기존 #log= / #review= 링크가 정상적으로 열리는지 확인.
