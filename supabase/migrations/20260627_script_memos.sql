begin;

create table if not exists public.script_memos (
  id           uuid        primary key default gen_random_uuid(),
  document_id  text        not null,                                              -- episode ID (로컬 cuid, FK 없음)
  project_id   text        not null,                                              -- project ID (필터용)
  scene_id     text        null,                                                  -- nullable: 씬 ID
  quoted_text  text        null check (quoted_text is null or char_length(quoted_text) <= 2000),
  content      text        not null check (char_length(btrim(content)) between 1 and 5000),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create index if not exists script_memos_user_doc_created_idx
  on public.script_memos(user_id, document_id, created_at desc);

alter table public.script_memos enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'script_memos' and policyname = 'script_memos_owner_select'
  ) then
    create policy script_memos_owner_select on public.script_memos
      for select to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'script_memos' and policyname = 'script_memos_owner_insert'
  ) then
    create policy script_memos_owner_insert on public.script_memos
      for insert to authenticated
      with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'script_memos' and policyname = 'script_memos_owner_delete'
  ) then
    create policy script_memos_owner_delete on public.script_memos
      for delete to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

commit;
