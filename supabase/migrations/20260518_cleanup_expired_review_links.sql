begin;

-- ─── 검토링크·피드백 버전 자동 정리 ──────────────────────────────────────────
-- 정책:
--   review_links            — expires_at 가 현재보다 30일 이상 지난 행 삭제
--                              (검토링크는 7일 유효 + 30일 여유 = 발행 37일 후)
--   feedback_versions       — 가리키는 review_links 가 더 없고 37일 지난 행 삭제
--                              (cascade 로 feedback_sessions, feedback_comments 도 정리)
--   review_links.payload     — legacy 검토링크의 본문 jsonb 도 같은 행 삭제로 정리됨
--
-- 보안 정의: 이 함수는 단순 cleanup 이고 보안 우회 필요 없음.
-- pg_cron 은 superuser 권한으로 실행되므로 RLS 무시됨 — 정상.
--
-- Drive 첨부 파일(feedback_versions.drive_file_id)은 작가의 OAuth 토큰이
-- 있어야 삭제 가능 → 서버 cron 에서 처리 불가. 별도 client-side 정리 작업 필요
-- (이번 마이그레이션 범위 밖).
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;

-- 정리 함수 — 매일 실행
create or replace function public.cleanup_expired_review_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review_deleted integer := 0;
  v_versions_deleted integer := 0;
begin
  -- 1. 만료 + 30일 지난 review_links 삭제
  delete from public.review_links
  where expires_at is not null
    and expires_at < now() - interval '30 days';
  get diagnostics v_review_deleted = row_count;

  -- 2. 더 이상 참조되지 않는 feedback_versions 삭제
  --    (37일 이상 된 것만 — 너무 빠르게 지우면 새로 만든 직후 cleanup race 위험)
  delete from public.feedback_versions fv
  where fv.created_at < now() - interval '37 days'
    and not exists (
      select 1 from public.review_links rl
      where rl.version_id = fv.id
    );
  get diagnostics v_versions_deleted = row_count;

  raise notice 'cleanup_expired_review_data: deleted % review_links, % feedback_versions',
    v_review_deleted, v_versions_deleted;
end;
$$;

-- 매일 새벽 3시(KST 12시) 자동 실행
-- 이미 같은 이름의 스케줄이 있으면 해제 후 재등록 (idempotent)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-expired-review-links') then
    perform cron.unschedule('cleanup-expired-review-links');
  end if;
end $$;

select cron.schedule(
  'cleanup-expired-review-links',
  '0 3 * * *',
  $$ select public.cleanup_expired_review_data(); $$
);

commit;

-- ─── 검증 / 수동 실행 ────────────────────────────────────────────────────────
-- 직접 호출해서 즉시 정리하고 싶을 때:
--   select public.cleanup_expired_review_data();
--
-- 스케줄 상태 확인:
--   select * from cron.job where jobname = 'cleanup-expired-review-links';
--
-- 최근 실행 이력:
--   select * from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'cleanup-expired-review-links')
--    order by start_time desc limit 5;
--
-- 스케줄 해제:
--   select cron.unschedule('cleanup-expired-review-links');
