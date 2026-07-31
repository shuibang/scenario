begin;

-- ─── 레거시 공유 링크(#review=, #log=) 조회용 RPC ───────────────────────────
-- 배경:
--   review_links 에는 anon/authenticated 대상 "public select with expiry"
--   정책(qual = expires_at > now())이 있는데, id 조건이 없어 만료 안 된
--   모든 행(payload 포함)을 anon key로 필터 없이 통째로 긁어올 수 있는 상태.
--   이 정책을 회수하려면(2단계), 그 정책에 의존해 테이블을 직접 읽던
--   loadReviewPayload / loadLogPayload(src/utils/reviewShare.js)가
--   먼저 이 SECURITY DEFINER RPC로 전환돼 있어야 한다.
--
-- 대상 데이터:
--   레거시 review(#review=UUID, feedback_version 아님)와 log(#log=UUID)
--   링크 둘 다 link_type 기본값 'legacy_review'로 저장되어 DB 레벨에서
--   서로 구분되지 않는다(log_export 값은 실제 INSERT 경로에서 쓰인 적 없음).
--   따라서 두 값 모두 허용하는 단일 함수로 기존 동작을 그대로 보존한다.
--
-- get_feedback_link_bundle()과 다르게, 여기서는 "존재하지 않음"과 "만료됨"을
-- 별도 예외로 구분한다 — 클라이언트(loadReviewPayload/loadLogPayload)가
-- 기존에 NOT_FOUND / EXPIRED 를 서로 다른 UI 상태로 쓰고 있어서, RPC 전환
-- 후에도 그 구분을 그대로 보존해야 하기 때문(하나로 합치면 기존 동작이 바뀜).
-- 만료된 행은 어느 경우든 payload 를 반환하지 않는다("만료 안 된 단건만 반환").
--
-- 이 마이그레이션은 함수 추가 + grant뿐이며, 기존
-- "public select with expiry" 정책은 아직 그대로 둔다(무중단 전환,
-- 회수는 2단계에서 별도 마이그레이션으로 진행).
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
   where id = p_link_id
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

grant execute on function public.get_legacy_link_payload(uuid) to anon, authenticated;

commit;

-- ─── 검증 (수동) ────────────────────────────────────────────────────────────
-- 기존 활성 링크 id로 확인:
--   select public.get_legacy_link_payload('<기존 review_links.id>'::uuid);
--   → payload, expires_at 이 담긴 jsonb 반환되어야 함
--
-- 만료된 링크:
--   select public.get_legacy_link_payload('<만료된 id>'::uuid);
--   → ERROR: LEGACY_LINK_EXPIRED
--
-- 존재하지 않는 id:
--   select public.get_legacy_link_payload(gen_random_uuid());
--   → ERROR: LEGACY_LINK_NOT_FOUND
