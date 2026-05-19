begin;

-- ─── contest_source_state ────────────────────────────────────────────────────
-- 자동수집 소스별 마지막 hash 저장.
-- Edge Function 이 매번 fetch → 본문 hash 계산 → 이전 hash 와 비교
--   → 다르면 contests 에 "🔔 페이지 변경 감지" 알림 INSERT
--   → 어드민이 검토 큐에서 보고 원문 확인 후 진짜 새 공모전이면 수동 등록
--
-- INSERT/UPDATE 는 Edge Function 이 service_role 키로 수행 → RLS 우회.
-- 어드민은 history 확인용 SELECT 만 허용.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.contest_source_state (
  name              text primary key,
  url               text not null,
  last_hash         text,
  last_checked_at   timestamptz,
  last_change_at    timestamptz,
  updated_at        timestamptz not null default now()
);

alter table public.contest_source_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='contest_source_state'
      and policyname='contest_source_state_admin_select'
  ) then
    create policy contest_source_state_admin_select on public.contest_source_state
      for select to authenticated
      using (public.is_admin_user());
  end if;
end $$;

commit;
