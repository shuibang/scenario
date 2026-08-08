begin;

-- ─── review_links anon 대량조회 구멍 차단 (정책 회수) ────────────────────────
--
-- ⚠️ 이 마이그레이션은 이미 프로덕션 콘솔에서 실행 완료됐다.
--    이 파일은 저장소 이력을 실제 DB 상태와 맞추기 위한 기록용이다.
--    (이 저장소는 Supabase CLI 연결이 없어 DB 반영은 콘솔 수동 실행)
--
-- 회수 대상:
--   "public select with expiry"
--     cmd   = SELECT
--     roles = {anon, authenticated}
--     qual  = (expires_at > now())
--
--   이 정책에는 id 조건이 없어서 "만료 안 된 행 전부"를 노출했다.
--   즉 클라이언트 번들에 공개된 anon key 로
--     from('review_links').select('*')
--   를 호출하면 UUID 를 모르는 상태에서도 현재 활성인 모든 링크의
--   payload(대본 스냅샷 / 작업기록)를 통째로 가져올 수 있었다.
--   이 정책 회수가 그 대량조회 구멍을 막는 실제 조치다.
--
-- 선행 조건 (이미 완료):
--   링크 열람 경로가 전부 SECURITY DEFINER RPC 로 전환되어,
--   anon 의 테이블 직접 SELECT 가 더 이상 필요하지 않다.
--     - get_legacy_link_payload   (#review= 레거시, #log=)
--         20260731120000_legacy_link_rpc.sql
--         + 20260807120000_fix_legacy_link_payload_id_cast.sql (::text 캐스트)
--     - get_feedback_link_bundle  (#review= feedback_version)
--         20260422160143 / 20260422211032 이후
--   두 RPC 모두 링크 id 를 파라미터로 받아 만료 안 된 단건만 반환한다.
--
-- 유지 대상 (건드리지 않음):
--   - review_links_admin_select        어드민 화면(AdminPage)이 의존. authenticated + is_admin_user()
--   - review_links_feedback_owner_insert / _update / _delete
--                                      작성자 본인의 링크 생성·수정·삭제 경로가 의존
--   ※ 이 정책들이 함께 지워지면 어드민 목록이 비거나 링크 생성이 실패한다.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "public select with expiry" on public.review_links;

commit;

-- ─── 검증 (수동) ────────────────────────────────────────────────────────────
-- 1) anon key(로그아웃 상태)로 대량조회 차단 확인 — 이번 작업의 핵심 목표:
--      from('review_links').select('*')   → 빈 배열
--
-- 2) 기존 활성 링크가 여전히 열리는지 (RPC 경로):
--      #review= 링크 정상 열림
--      #log=    링크 정상 열림
--
-- 3) 만료된 링크는 여전히 만료 안내 표시
--
-- 4) 로그인 상태에서 작가 대시보드의 피드백 버전·세션 목록 정상 표시
--    (feedback_versions / feedback_sessions 의 소유자 정책 경로 — review_links 무관)
--
-- 5) 관리자 계정으로 어드민 검토링크 목록 정상 표시 (admin_select 유지 확인)
--
-- ─── 롤백 ───────────────────────────────────────────────────────────────────
-- 문제 발생 시 아래로 원복 가능(단, 대량조회 구멍도 함께 되살아남):
--
--   create policy "public select with expiry" on public.review_links
--     for select to anon, authenticated
--     using (expires_at > now());
