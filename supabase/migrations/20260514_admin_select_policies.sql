begin;

-- ─── 어드민 헬퍼 함수 ────────────────────────────────────────────────────────
-- 화이트리스트는 이 함수 한 곳에서만 관리한다.
-- 정책들은 이 함수를 호출하므로, 어드민 이메일이 추가/삭제될 때
-- 정책을 일괄 갱신할 필요 없이 함수만 교체하면 된다.
--
-- 보안: anon JWT 에는 email claim 이 없어 coalesce 가 빈 문자열을 돌려주고
-- 결과적으로 항상 false 가 된다. 일반 anon SELECT 시도는 0행만 본다.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') in (
    'jiusu77@gmail.com'
  );
$$;

revoke all on function public.is_admin_user() from public;
grant execute on function public.is_admin_user() to anon, authenticated;

-- ─── error_reports ──────────────────────────────────────────────────────────
-- 기존 insert 정책은 그대로 두고 admin SELECT 만 추가
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'error_reports' and policyname = 'error_reports_admin_select'
  ) then
    create policy error_reports_admin_select on public.error_reports
      for select to authenticated
      using (public.is_admin_user());
  end if;
end $$;

-- ─── survey_responses ──────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'survey_responses' and policyname = 'survey_responses_admin_select'
  ) then
    create policy survey_responses_admin_select on public.survey_responses
      for select to authenticated
      using (public.is_admin_user());
  end if;
end $$;

-- ─── shared_scripts ────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shared_scripts' and policyname = 'shared_scripts_admin_select'
  ) then
    create policy shared_scripts_admin_select on public.shared_scripts
      for select to authenticated
      using (public.is_admin_user());
  end if;
end $$;

-- ─── review_links ──────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'review_links' and policyname = 'review_links_admin_select'
  ) then
    create policy review_links_admin_select on public.review_links
      for select to authenticated
      using (public.is_admin_user());
  end if;
end $$;

-- ─── feedback_versions ─────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'feedback_versions' and policyname = 'feedback_versions_admin_select'
  ) then
    create policy feedback_versions_admin_select on public.feedback_versions
      for select to authenticated
      using (public.is_admin_user());
  end if;
end $$;

-- ─── feedback_sessions ─────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'feedback_sessions' and policyname = 'feedback_sessions_admin_select'
  ) then
    create policy feedback_sessions_admin_select on public.feedback_sessions
      for select to authenticated
      using (public.is_admin_user());
  end if;
end $$;

-- ─── feedback_comments ─────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'feedback_comments' and policyname = 'feedback_comments_admin_select'
  ) then
    create policy feedback_comments_admin_select on public.feedback_comments
      for select to authenticated
      using (public.is_admin_user());
  end if;
end $$;

commit;

-- ─── 검증 (수동) ────────────────────────────────────────────────────────────
-- 마이그레이션 적용 후 익명/일반/관리자 세 케이스로 확인:
--   1) anon (로그인 없음):
--        select * from public.error_reports;     -> 0 rows
--   2) 일반 사용자(authenticated, 비 admin 이메일):
--        select * from public.error_reports;     -> 0 rows
--   3) 관리자 이메일로 로그인:
--        select * from public.error_reports;     -> 실제 데이터
--
-- 화이트리스트 변경 시:
--   create or replace function public.is_admin_user() ...
--     select coalesce(auth.jwt() ->> 'email', '') in (
--       'jiusu77@gmail.com',
--       '추가@example.com'
--     );
