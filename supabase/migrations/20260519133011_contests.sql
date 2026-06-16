begin;

-- ─── contests ────────────────────────────────────────────────────────────────
-- 드라마 대본/극본 공모전 정보.
-- 등록 경로 3가지: manual(어드민 수동), scrape/rss(Edge Function 자동), user_report(사용자 제보).
-- 사용자에게는 status='active' 만 노출, 'pending_review' 는 어드민 검토 큐.
-- source_url UNIQUE → 자동수집 idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.contests (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  organizer       text,
  source_url      text not null,
  poster_url      text,
  prize           text,
  category        text,
  submit_start    date,
  submit_end      date not null,
  status          text not null default 'pending_review'
                  check (status in ('active','closed','pending_review','rejected')),
  source_type     text not null default 'manual'
                  check (source_type in ('manual','rss','scrape','user_report')),
  reported_by     uuid references auth.users(id) on delete set null,
  reporter_memo   text,
  created_at      timestamptz not null default now(),
  approved_at     timestamptz,
  approved_by     uuid references auth.users(id) on delete set null,
  constraint contests_source_url_unique unique (source_url)
);

create index if not exists contests_active_deadline_idx
  on public.contests (submit_end) where status = 'active';

create index if not exists contests_status_idx
  on public.contests (status);

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.contests enable row level security;

-- 1) 누구나 active 만 SELECT (게시판)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='contests' and policyname='contests_public_select_active'
  ) then
    create policy contests_public_select_active on public.contests
      for select to anon, authenticated
      using (status = 'active');
  end if;
end $$;

-- 2) 어드민은 전체 SELECT (검토 큐)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='contests' and policyname='contests_admin_select_all'
  ) then
    create policy contests_admin_select_all on public.contests
      for select to authenticated
      using (public.is_admin_user());
  end if;
end $$;

-- 3) 로그인 사용자 제보 — status/source_type/reported_by 강제 고정
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='contests' and policyname='contests_user_report_insert'
  ) then
    create policy contests_user_report_insert on public.contests
      for insert to authenticated
      with check (
        status = 'pending_review'
        and source_type = 'user_report'
        and reported_by = auth.uid()
      );
  end if;
end $$;

-- 4) 어드민 INSERT (수동등록·Edge Function 모두 service_role 키로 RLS 우회하므로
--    여기서는 인증 사용자 어드민만 추가)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='contests' and policyname='contests_admin_insert'
  ) then
    create policy contests_admin_insert on public.contests
      for insert to authenticated
      with check (public.is_admin_user());
  end if;
end $$;

-- 5) 어드민 UPDATE
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='contests' and policyname='contests_admin_update'
  ) then
    create policy contests_admin_update on public.contests
      for update to authenticated
      using (public.is_admin_user())
      with check (public.is_admin_user());
  end if;
end $$;

-- 6) 어드민 DELETE
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='contests' and policyname='contests_admin_delete'
  ) then
    create policy contests_admin_delete on public.contests
      for delete to authenticated
      using (public.is_admin_user());
  end if;
end $$;

-- ─── 마감 자동 처리 함수 (pg_cron daily) ──────────────────────────────────
create or replace function public.close_expired_contests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.contests
     set status = 'closed'
   where status = 'active'
     and submit_end < current_date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.close_expired_contests() from public;
grant execute on function public.close_expired_contests() to authenticated;

commit;

-- ─── 적용 후 (Supabase 대시보드 SQL Editor) ────────────────────────────────
-- 마감 자동 처리는 별도 pg_cron 등록 (확장 활성화 후):
--   select cron.schedule(
--     'contests-close-expired',
--     '5 0 * * *',  -- 매일 KST 09:05 (UTC 00:05)
--     $$ select public.close_expired_contests(); $$
--   );
