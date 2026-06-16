begin;

create extension if not exists pgcrypto;

-- Assumption:
-- review_links has existing legacy review/log policies outside this migration.
-- This migration only adds feedback-version columns, constraints, indexes,
-- and helper functions without redefining the full legacy policy set.

create or replace function public.set_feedback_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.feedback_versions (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  script_id text not null,
  version_name text not null check (char_length(btrim(version_name)) between 1 and 120),
  version_order integer not null check (version_order > 0),
  snapshot_content jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot_content) = 'object'),
  drive_file_id text not null check (char_length(btrim(drive_file_id)) > 0),
  last_linked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create unique index if not exists feedback_versions_author_script_order_uidx
  on public.feedback_versions(author_user_id, script_id, version_order)
  where deleted_at is null;

create index if not exists feedback_versions_author_script_created_idx
  on public.feedback_versions(author_user_id, script_id, created_at desc);

create index if not exists feedback_versions_last_linked_at_idx
  on public.feedback_versions(last_linked_at desc);

drop trigger if exists trg_feedback_versions_updated_at on public.feedback_versions;
create trigger trg_feedback_versions_updated_at
before update on public.feedback_versions
for each row
execute function public.set_feedback_updated_at();

create table if not exists public.feedback_sessions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.feedback_versions(id) on delete cascade,
  sender_user_id uuid null references auth.users(id) on delete set null,
  sender_display_name text not null check (char_length(btrim(sender_display_name)) between 1 and 80),
  submitted_at timestamptz not null default now(),
  is_read boolean not null default false,
  read_at timestamptz null,
  synced_to_drive_at timestamptz null,
  legacy_source text null check (legacy_source is null or char_length(btrim(legacy_source)) between 1 and 32),
  created_at timestamptz not null default now()
);

create index if not exists feedback_sessions_version_submitted_idx
  on public.feedback_sessions(version_id, submitted_at desc);

create index if not exists feedback_sessions_version_unread_idx
  on public.feedback_sessions(version_id, is_read, submitted_at desc);

create index if not exists feedback_sessions_sender_idx
  on public.feedback_sessions(sender_user_id, submitted_at desc)
  where sender_user_id is not null;

create index if not exists feedback_sessions_synced_submitted_idx
  on public.feedback_sessions(synced_to_drive_at, submitted_at);

create table if not exists public.feedback_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.feedback_sessions(id) on delete cascade,
  scene_id text null,
  line_ref jsonb not null default '{}'::jsonb check (jsonb_typeof(line_ref) = 'object'),
  comment_text text not null check (char_length(btrim(comment_text)) between 1 and 5000),
  position_offset smallint not null default 0 check (position_offset between -64 and 64),
  created_at timestamptz not null default now()
);

create index if not exists feedback_comments_session_created_idx
  on public.feedback_comments(session_id, created_at asc);

create index if not exists feedback_comments_scene_idx
  on public.feedback_comments(scene_id)
  where scene_id is not null;

create index if not exists feedback_comments_line_ref_gin_idx
  on public.feedback_comments
  using gin (line_ref jsonb_path_ops);

alter table public.review_links
  add column if not exists created_by uuid null references auth.users(id) on delete set null,
  add column if not exists link_type text not null default 'legacy_review',
  add column if not exists link_role text null,
  add column if not exists version_id uuid null references public.feedback_versions(id) on delete cascade,
  add column if not exists session_id uuid null references public.feedback_sessions(id) on delete cascade,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'review_links_link_type_check'
      and conrelid = 'public.review_links'::regclass
  ) then
    alter table public.review_links
      add constraint review_links_link_type_check
      check (link_type in ('legacy_review', 'feedback_version', 'log_export'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'review_links_link_role_check'
      and conrelid = 'public.review_links'::regclass
  ) then
    alter table public.review_links
      add constraint review_links_link_role_check
      check (link_role is null or link_role in ('request', 'reply'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'review_links_feedback_role_payload_check'
      and conrelid = 'public.review_links'::regclass
  ) then
    alter table public.review_links
      add constraint review_links_feedback_role_payload_check
      check (
        link_type <> 'feedback_version'
        or (
          version_id is not null
          and (
            (link_role = 'request' and session_id is null)
            or
            (link_role = 'reply' and session_id is not null)
          )
        )
      ) not valid;
  end if;
end
$$;

create index if not exists review_links_feedback_version_idx
  on public.review_links(version_id, link_role, expires_at desc)
  where link_type = 'feedback_version' and version_id is not null;

create index if not exists review_links_feedback_session_idx
  on public.review_links(session_id, expires_at desc)
  where link_type = 'feedback_version' and session_id is not null;

create index if not exists review_links_type_expires_idx
  on public.review_links(link_type, expires_at desc);

create or replace function public.touch_feedback_version_last_linked_at()
returns trigger
language plpgsql
as $$
begin
  if new.link_type = 'feedback_version' and new.version_id is not null then
    update public.feedback_versions
       set last_linked_at = greatest(coalesce(last_linked_at, now()), now()),
           updated_at = now()
     where id = new.version_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_review_links_touch_feedback_version on public.review_links;
create trigger trg_review_links_touch_feedback_version
after insert or update of version_id, link_type, expires_at on public.review_links
for each row
execute function public.touch_feedback_version_last_linked_at();

alter table public.feedback_versions enable row level security;
alter table public.feedback_sessions enable row level security;
alter table public.feedback_comments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_versions'
      and policyname = 'feedback_versions_author_select'
  ) then
    create policy feedback_versions_author_select
      on public.feedback_versions
      for select
      to authenticated
      using (author_user_id = auth.uid() and deleted_at is null);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_versions'
      and policyname = 'feedback_versions_author_insert'
  ) then
    create policy feedback_versions_author_insert
      on public.feedback_versions
      for insert
      to authenticated
      with check (author_user_id = auth.uid());
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_versions'
      and policyname = 'feedback_versions_author_update'
  ) then
    create policy feedback_versions_author_update
      on public.feedback_versions
      for update
      to authenticated
      using (author_user_id = auth.uid() and deleted_at is null)
      with check (author_user_id = auth.uid());
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_versions'
      and policyname = 'feedback_versions_author_delete'
  ) then
    create policy feedback_versions_author_delete
      on public.feedback_versions
      for delete
      to authenticated
      using (author_user_id = auth.uid());
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_sessions'
      and policyname = 'feedback_sessions_author_select'
  ) then
    create policy feedback_sessions_author_select
      on public.feedback_sessions
      for select
      to authenticated
      using (
        exists (
          select 1
            from public.feedback_versions fv
           where fv.id = feedback_sessions.version_id
             and fv.author_user_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_sessions'
      and policyname = 'feedback_sessions_sender_select'
  ) then
    create policy feedback_sessions_sender_select
      on public.feedback_sessions
      for select
      to authenticated
      using (sender_user_id = auth.uid());
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_sessions'
      and policyname = 'feedback_sessions_author_update'
  ) then
    create policy feedback_sessions_author_update
      on public.feedback_sessions
      for update
      to authenticated
      using (
        exists (
          select 1
            from public.feedback_versions fv
           where fv.id = feedback_sessions.version_id
             and fv.author_user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
            from public.feedback_versions fv
           where fv.id = feedback_sessions.version_id
             and fv.author_user_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_sessions'
      and policyname = 'feedback_sessions_author_delete'
  ) then
    create policy feedback_sessions_author_delete
      on public.feedback_sessions
      for delete
      to authenticated
      using (
        exists (
          select 1
            from public.feedback_versions fv
           where fv.id = feedback_sessions.version_id
             and fv.author_user_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_comments'
      and policyname = 'feedback_comments_author_select'
  ) then
    create policy feedback_comments_author_select
      on public.feedback_comments
      for select
      to authenticated
      using (
        exists (
          select 1
            from public.feedback_sessions fs
            join public.feedback_versions fv
              on fv.id = fs.version_id
           where fs.id = feedback_comments.session_id
             and fv.author_user_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_comments'
      and policyname = 'feedback_comments_sender_select'
  ) then
    create policy feedback_comments_sender_select
      on public.feedback_comments
      for select
      to authenticated
      using (
        exists (
          select 1
            from public.feedback_sessions fs
           where fs.id = feedback_comments.session_id
             and fs.sender_user_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_comments'
      and policyname = 'feedback_comments_author_update'
  ) then
    create policy feedback_comments_author_update
      on public.feedback_comments
      for update
      to authenticated
      using (
        exists (
          select 1
            from public.feedback_sessions fs
            join public.feedback_versions fv
              on fv.id = fs.version_id
           where fs.id = feedback_comments.session_id
             and fv.author_user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
            from public.feedback_sessions fs
            join public.feedback_versions fv
              on fv.id = fs.version_id
           where fs.id = feedback_comments.session_id
             and fv.author_user_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_comments'
      and policyname = 'feedback_comments_author_delete'
  ) then
    create policy feedback_comments_author_delete
      on public.feedback_comments
      for delete
      to authenticated
      using (
        exists (
          select 1
            from public.feedback_sessions fs
            join public.feedback_versions fv
              on fv.id = fs.version_id
           where fs.id = feedback_comments.session_id
             and fv.author_user_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_links'
      and policyname = 'review_links_feedback_owner_insert'
  ) then
    create policy review_links_feedback_owner_insert
      on public.review_links
      for insert
      to authenticated
      with check (
        link_type = 'feedback_version'
        and created_by = auth.uid()
        and (
          exists (
            select 1
              from public.feedback_versions fv
             where fv.id = review_links.version_id
               and fv.author_user_id = auth.uid()
          )
          or
          exists (
            select 1
              from public.feedback_sessions fs
             where fs.id = review_links.session_id
               and fs.version_id = review_links.version_id
               and fs.sender_user_id = auth.uid()
          )
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_links'
      and policyname = 'review_links_feedback_owner_update'
  ) then
    create policy review_links_feedback_owner_update
      on public.review_links
      for update
      to authenticated
      using (
        link_type = 'feedback_version'
        and created_by = auth.uid()
      )
      with check (
        link_type = 'feedback_version'
        and created_by = auth.uid()
        and (
          exists (
            select 1
              from public.feedback_versions fv
             where fv.id = review_links.version_id
               and fv.author_user_id = auth.uid()
          )
          or
          exists (
            select 1
              from public.feedback_sessions fs
             where fs.id = review_links.session_id
               and fs.version_id = review_links.version_id
               and fs.sender_user_id = auth.uid()
          )
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'review_links'
      and policyname = 'review_links_feedback_owner_delete'
  ) then
    create policy review_links_feedback_owner_delete
      on public.review_links
      for delete
      to authenticated
      using (
        link_type = 'feedback_version'
        and created_by = auth.uid()
      );
  end if;
end
$$;

create or replace function public.get_feedback_link_bundle(p_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_link public.review_links%rowtype;
  v_version public.feedback_versions%rowtype;
  v_session public.feedback_sessions%rowtype;
  v_comments jsonb := '[]'::jsonb;
begin
  select *
    into v_link
    from public.review_links
   where id = p_link_id
     and link_type = 'feedback_version'
     and expires_at > now();

  if not found then
    raise exception 'FEEDBACK_LINK_NOT_FOUND';
  end if;

  select *
    into v_version
    from public.feedback_versions
   where id = v_link.version_id
     and deleted_at is null;

  if not found then
    raise exception 'FEEDBACK_VERSION_NOT_FOUND';
  end if;

  if v_link.session_id is not null then
    select *
      into v_session
      from public.feedback_sessions
     where id = v_link.session_id;

    select coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'id', fc.id,
                 'scene_id', fc.scene_id,
                 'line_ref', fc.line_ref,
                 'comment_text', fc.comment_text,
                 'position_offset', fc.position_offset,
                 'created_at', fc.created_at
               )
               order by
                 coalesce((fc.line_ref ->> 'scene_order')::int, 2147483647),
                 coalesce((fc.line_ref ->> 'block_order')::int, 2147483647),
                 fc.created_at
             ),
             '[]'::jsonb
           )
      into v_comments
      from public.feedback_comments fc
     where fc.session_id = v_link.session_id;
  end if;

  return jsonb_build_object(
    'link', jsonb_build_object(
      'id', v_link.id,
      'link_type', v_link.link_type,
      'link_role', v_link.link_role,
      'version_id', v_link.version_id,
      'session_id', v_link.session_id,
      'expires_at', v_link.expires_at
    ),
    'version', jsonb_build_object(
      'id', v_version.id,
      'script_id', v_version.script_id,
      'version_name', v_version.version_name,
      'version_order', v_version.version_order,
      'snapshot_content', v_version.snapshot_content,
      'created_at', v_version.created_at
    ),
    'session', case
      when v_session.id is null then null
      else jsonb_build_object(
        'id', v_session.id,
        'version_id', v_session.version_id,
        'sender_display_name', v_session.sender_display_name,
        'submitted_at', v_session.submitted_at,
        'is_read', v_session.is_read,
        'read_at', v_session.read_at
      )
    end,
    'comments', v_comments
  );
end;
$$;

grant execute on function public.get_feedback_link_bundle(uuid) to anon, authenticated;

create or replace function public.submit_feedback_session(
  p_link_id uuid,
  p_sender_display_name text,
  p_comments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_link public.review_links%rowtype;
  v_session_id uuid;
  v_display_name text;
  v_inserted_comments integer := 0;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  v_display_name := btrim(coalesce(p_sender_display_name, ''));
  if char_length(v_display_name) = 0 or char_length(v_display_name) > 80 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;

  if p_comments is null or jsonb_typeof(p_comments) <> 'array' or jsonb_array_length(p_comments) = 0 then
    raise exception 'COMMENTS_REQUIRED';
  end if;

  select *
    into v_link
    from public.review_links
   where id = p_link_id
     and link_type = 'feedback_version'
     and link_role = 'request'
     and expires_at > now();

  if not found then
    raise exception 'FEEDBACK_REQUEST_LINK_NOT_FOUND';
  end if;

  insert into public.feedback_sessions (
    version_id,
    sender_user_id,
    sender_display_name
  )
  values (
    v_link.version_id,
    auth.uid(),
    v_display_name
  )
  returning id into v_session_id;

  with inserted_comments as (
    insert into public.feedback_comments (
      session_id,
      scene_id,
      line_ref,
      comment_text,
      position_offset
    )
    select
      v_session_id,
      nullif(btrim(elem ->> 'scene_id'), ''),
      case
        when jsonb_typeof(elem -> 'line_ref') = 'object' then elem -> 'line_ref'
        else '{}'::jsonb
      end,
      btrim(elem ->> 'comment_text'),
      case
        when jsonb_typeof(elem -> 'position_offset') = 'number'
          then greatest(-64, least(64, (elem ->> 'position_offset')::int))::smallint
        else 0::smallint
      end
    from jsonb_array_elements(p_comments) elem
    where char_length(btrim(coalesce(elem ->> 'comment_text', ''))) > 0
    returning 1
  )
  select count(*)
    into v_inserted_comments
    from inserted_comments;

  if v_inserted_comments = 0 then
    delete from public.feedback_sessions where id = v_session_id;
    raise exception 'COMMENTS_REQUIRED';
  end if;

  update public.feedback_versions
     set updated_at = now()
   where id = v_link.version_id;

  return jsonb_build_object(
    'version_id', v_link.version_id,
    'session_id', v_session_id
  );
end;
$$;

grant execute on function public.submit_feedback_session(uuid, text, jsonb) to authenticated;

create or replace function public.purge_expired_feedback_data()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_deleted_links integer := 0;
  v_deleted_sessions integer := 0;
  v_deleted_versions integer := 0;
begin
  with deleted_links as (
    delete from public.review_links rl
     where rl.link_type = 'feedback_version'
       and rl.expires_at < now()
     returning 1
  )
  select count(*) into v_deleted_links from deleted_links;

  with deleted_sessions as (
    delete from public.feedback_sessions fs
     where fs.synced_to_drive_at is not null
       and fs.submitted_at < now() - interval '7 days'
       and not exists (
         select 1
           from public.review_links rl
          where rl.session_id = fs.id
            and rl.link_type = 'feedback_version'
            and rl.link_role = 'reply'
            and rl.expires_at > now()
       )
     returning 1
  )
  select count(*) into v_deleted_sessions from deleted_sessions;

  with deleted_versions as (
    delete from public.feedback_versions fv
     where fv.last_linked_at < now() - interval '7 days'
       and not exists (
         select 1
           from public.review_links rl
          where rl.version_id = fv.id
            and rl.link_type = 'feedback_version'
            and rl.expires_at > now()
       )
       and not exists (
         select 1
           from public.feedback_sessions fs
          where fs.version_id = fv.id
       )
     returning 1
  )
  select count(*) into v_deleted_versions from deleted_versions;

  return jsonb_build_object(
    'deleted_links', v_deleted_links,
    'deleted_sessions', v_deleted_sessions,
    'deleted_versions', v_deleted_versions
  );
end;
$$;

comment on table public.feedback_versions is
'버전 스냅샷 메타와 7일짜리 operational snapshot_content를 저장한다. 장기 canonical은 drive_file_id가 가리키는 writer Drive bundle이다.';

comment on table public.feedback_sessions is
'한 번의 회신 제출 단위. writer Drive bundle 동기화 후 synced_to_drive_at을 채운다.';

comment on table public.feedback_comments is
'세션 단위 개별 코멘트. line_ref.scene_order / block_order로 우측 패널 문서 순서 정렬이 가능해야 한다.';

commit;
