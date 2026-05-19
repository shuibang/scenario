begin;

-- ─── 사용자별 누적 공유/피드백 카운터 ────────────────────────────────────────
-- 뱃지용. review_links · feedback_sessions 는 만료(7일)와 Drive 동기화 후
-- purge_expired_feedback_data() 로 정리되므로 단순 COUNT 는 누계가 줄어든다.
-- 영구 카운터를 별도 테이블에 두고 트리거로 증가만 시킨다.
--
-- 정의:
--   share_links_created — link_type='feedback_version' AND link_role='request'
--                         인 review_links INSERT 1건 = 검토링크 생성 1회.
--                         (새 버전+링크, 같은 버전에 추가 링크 둘 다 포함)
--   feedback_received   — feedback_sessions INSERT 1건 = 피드백 받기 1회.
--                         (해당 version 의 author_user_id 에 가산)
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists public.user_share_counters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  share_links_created bigint not null default 0,
  feedback_received   bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_share_counters enable row level security;

-- 본인 row 만 SELECT. INSERT/UPDATE 는 트리거(SECURITY DEFINER)가 전담하므로
-- 일반 권한 정책은 추가하지 않는다.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'user_share_counters'
      and policyname = 'user_share_counters_self_select'
  ) then
    create policy user_share_counters_self_select
      on public.user_share_counters
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end
$$;

-- ─── INCREMENT 트리거 ───────────────────────────────────────────────────────
create or replace function public.bump_share_links_created()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.user_share_counters (user_id, share_links_created, feedback_received, updated_at)
  values (new.created_by, 1, 0, now())
  on conflict (user_id)
  do update set share_links_created = public.user_share_counters.share_links_created + 1,
                updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_review_links_bump_share_count on public.review_links;
create trigger trg_review_links_bump_share_count
after insert on public.review_links
for each row
when (
  new.link_type = 'feedback_version'
  and new.link_role = 'request'
  and new.created_by is not null
)
execute function public.bump_share_links_created();

create or replace function public.bump_feedback_received()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_author uuid;
begin
  select author_user_id
    into v_author
    from public.feedback_versions
   where id = new.version_id;

  if v_author is null then
    return new;
  end if;

  insert into public.user_share_counters (user_id, share_links_created, feedback_received, updated_at)
  values (v_author, 0, 1, now())
  on conflict (user_id)
  do update set feedback_received = public.user_share_counters.feedback_received + 1,
                updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_feedback_sessions_bump_received on public.feedback_sessions;
create trigger trg_feedback_sessions_bump_received
after insert on public.feedback_sessions
for each row
execute function public.bump_feedback_received();

-- ─── 백필 ────────────────────────────────────────────────────────────────────
-- 마이그레이션 시점까지 살아있는 row 만 셀 수 있다. 이미 만료/정리된 분은 누락 —
-- 마이그레이션 이전 뱃지 정확도는 best-effort.
insert into public.user_share_counters (user_id, share_links_created, feedback_received, updated_at)
select
  u.id,
  coalesce(rl.cnt, 0),
  coalesce(fs.cnt, 0),
  now()
from auth.users u
left join lateral (
  select count(*)::bigint as cnt
    from public.review_links
   where created_by = u.id
     and link_type  = 'feedback_version'
     and link_role  = 'request'
) rl on true
left join lateral (
  select count(*)::bigint as cnt
    from public.feedback_sessions s
    join public.feedback_versions v on v.id = s.version_id
   where v.author_user_id = u.id
) fs on true
where coalesce(rl.cnt, 0) > 0 or coalesce(fs.cnt, 0) > 0
on conflict (user_id)
do update set
  share_links_created = greatest(public.user_share_counters.share_links_created, excluded.share_links_created),
  feedback_received   = greatest(public.user_share_counters.feedback_received,   excluded.feedback_received),
  updated_at = now();

commit;
