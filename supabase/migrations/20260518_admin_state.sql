begin;

-- ─── admin_state — 어드민 본인의 마지막 대시보드 방문 시각 ───────────────────
-- 용도:
--   메뉴바의 🛠 아이콘 옆 빨간점(unread 표시)을 위한 기준 시각.
--   로컬스토리지로 하면 도메인(localhost↔daejak.kr)/기기마다 분리되어
--   여러 환경에서 들어오면 매번 새 자료처럼 보이므로 서버에 저장.
--
-- 정책:
--   - email 을 PK 로 사용. JWT 의 email claim 과 일치하는 본인 row 만 read/write.
--   - 추가로 is_admin_user() 화이트리스트 통과 필수 — 비admin 은 아예 접근 불가.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.admin_state (
  email text primary key,
  last_visit_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_state enable row level security;

-- 본인 admin row 만 select
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'admin_state' and policyname = 'admin_state_self_select'
  ) then
    create policy admin_state_self_select on public.admin_state
      for select to authenticated
      using (
        public.is_admin_user()
        and email = coalesce(auth.jwt() ->> 'email', '')
      );
  end if;
end $$;

-- 본인 admin row 만 insert (upsert 초기 생성용)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'admin_state' and policyname = 'admin_state_self_insert'
  ) then
    create policy admin_state_self_insert on public.admin_state
      for insert to authenticated
      with check (
        public.is_admin_user()
        and email = coalesce(auth.jwt() ->> 'email', '')
      );
  end if;
end $$;

-- 본인 admin row 만 update
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'admin_state' and policyname = 'admin_state_self_update'
  ) then
    create policy admin_state_self_update on public.admin_state
      for update to authenticated
      using (
        public.is_admin_user()
        and email = coalesce(auth.jwt() ->> 'email', '')
      )
      with check (
        public.is_admin_user()
        and email = coalesce(auth.jwt() ->> 'email', '')
      );
  end if;
end $$;

-- ─── RPC: get_admin_unread_counts ──────────────────────────────────────────
-- 메뉴 아이콘 옆 뱃지용 통합 카운트 — 한 번의 호출로 3개 지표를 모두 가져온다.
--   1) unresolved_error_reports : 미해결 사용자 오류 보고
--   2) unresolved_client_errors : 미해결 자동 수집 오류
--   3) new_survey_responses     : last_visit_at 이후 새 설문 응답
--
-- 보안: is_admin_user() 가드. 비admin 은 raise exception.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_admin_unread_counts()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_last_visit timestamptz;
  v_err_reports int := 0;
  v_client_errors int := 0;
  v_surveys int := 0;
begin
  if not public.is_admin_user() then
    raise exception 'NOT_ADMIN';
  end if;

  select last_visit_at into v_last_visit
    from public.admin_state where email = v_email;

  -- 처음 호출이면 last_visit_at 이 없음 — 모든 항목을 새 것으로 보기보다는
  -- 매우 오래 전 시각으로 처리해 가장 최근 데이터 기준으로만 본다.
  if v_last_visit is null then
    v_last_visit := now() - interval '30 days';
  end if;

  select count(*) into v_err_reports
    from public.error_reports
    where resolved_at is null;

  select count(*) into v_client_errors
    from public.client_errors
    where resolved_at is null;

  select count(*) into v_surveys
    from public.survey_responses
    where created_at > v_last_visit;

  return jsonb_build_object(
    'unresolved_error_reports', v_err_reports,
    'unresolved_client_errors', v_client_errors,
    'new_survey_responses', v_surveys,
    'last_visit_at', v_last_visit
  );
end;
$$;

revoke all on function public.get_admin_unread_counts() from public;
grant execute on function public.get_admin_unread_counts() to authenticated;

-- ─── RPC: mark_admin_visited ───────────────────────────────────────────────
-- 어드민이 대시보드에 진입하면 호출. last_visit_at 을 now() 로 upsert.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.mark_admin_visited()
returns timestamptz
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_now timestamptz := now();
begin
  if not public.is_admin_user() then
    raise exception 'NOT_ADMIN';
  end if;

  insert into public.admin_state (email, last_visit_at, updated_at)
    values (v_email, v_now, v_now)
  on conflict (email) do update
    set last_visit_at = excluded.last_visit_at,
        updated_at    = excluded.updated_at;

  return v_now;
end;
$$;

revoke all on function public.mark_admin_visited() from public;
grant execute on function public.mark_admin_visited() to authenticated;

commit;

-- ─── 검증 (수동) ────────────────────────────────────────────────────────────
-- 1) admin 로그인 상태에서:
--      select * from public.get_admin_unread_counts();
--      select public.mark_admin_visited();
--      select * from public.admin_state;
-- 2) 일반(비admin) 로그인:
--      select * from public.get_admin_unread_counts();   -- ERROR: NOT_ADMIN
