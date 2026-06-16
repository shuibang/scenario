begin;

-- ─── resolved_at + admin UPDATE 정책 ───────────────────────────────────────
-- 어드민이 오류 보고/자동 오류를 "확인·수정 완료"로 체크할 수 있게.
-- 같은 fingerprint 의 자동 오류가 새로 들어오면 그 row 는 resolved_at = null 이므로
-- 그룹이 다시 "미해결" 상태로 돌아온다 — 동일 오류 재발 시 자동 재노출.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.error_reports add column if not exists resolved_at timestamptz null;
alter table public.client_errors add column if not exists resolved_at timestamptz null;

create index if not exists error_reports_resolved_idx
  on public.error_reports(resolved_at);
create index if not exists client_errors_resolved_idx
  on public.client_errors(resolved_at);

-- error_reports — admin UPDATE 허용
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'error_reports' and policyname = 'error_reports_admin_update'
  ) then
    create policy error_reports_admin_update on public.error_reports
      for update to authenticated
      using (public.is_admin_user())
      with check (public.is_admin_user());
  end if;
end $$;

-- client_errors — admin UPDATE 허용
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_errors' and policyname = 'client_errors_admin_update'
  ) then
    create policy client_errors_admin_update on public.client_errors
      for update to authenticated
      using (public.is_admin_user())
      with check (public.is_admin_user());
  end if;
end $$;

commit;
