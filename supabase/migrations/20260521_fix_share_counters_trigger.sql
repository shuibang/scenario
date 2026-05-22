begin;

-- ─── bump_share_links_created 트리거 함수 수정 ───────────────────────────────
-- ON CONFLICT DO UPDATE SET 절에서 schema-qualified 3단계 참조
-- (public.user_share_counters.column) 는 PostgreSQL 런타임 오류를 발생시킴:
--   "column public does not exist"
-- 스키마 접두어를 제거해 테이블명만 사용하도록 수정.
-- ─────────────────────────────────────────────────────────────────────────────

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
  do update set share_links_created = user_share_counters.share_links_created + 1,
                updated_at = now();
  return new;
end;
$$;

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
  do update set feedback_received = user_share_counters.feedback_received + 1,
                updated_at = now();
  return new;
end;
$$;

commit;
