begin;

-- ─── 검토링크/공유본에 보내는 사람(작가)의 대표 뱃지 정보 추가 ──────────────
-- emoji + label 한 쌍만 저장. 다른 사용자의 데이터를 fetch 할 필요 없어
-- RLS 충돌 없음. 보내는 시점에 클라이언트가 본인 대표 뱃지를 함께 insert.
--
-- 길이 제한:
--   emoji ≤ 8 char (서로게이트 페어/조합 이모지 고려)
--   label ≤ 40 char (사이트 일관성)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.review_links
  add column if not exists sender_badge_emoji text null,
  add column if not exists sender_badge_label text null;

alter table public.shared_scripts
  add column if not exists sender_badge_emoji text null,
  add column if not exists sender_badge_label text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.review_links'::regclass
      and conname  = 'review_links_sender_badge_lengths'
  ) then
    alter table public.review_links
      add constraint review_links_sender_badge_lengths
      check (
        (sender_badge_emoji is null or char_length(sender_badge_emoji) <= 8) and
        (sender_badge_label is null or char_length(sender_badge_label) <= 40)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.shared_scripts'::regclass
      and conname  = 'shared_scripts_sender_badge_lengths'
  ) then
    alter table public.shared_scripts
      add constraint shared_scripts_sender_badge_lengths
      check (
        (sender_badge_emoji is null or char_length(sender_badge_emoji) <= 8) and
        (sender_badge_label is null or char_length(sender_badge_label) <= 40)
      );
  end if;
end $$;

-- ── RPC 갱신: get_feedback_link_bundle 결과의 link 객체에 sender_badge_* 포함 ──
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
   where id = p_link_id::text
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
      'watermark_text', v_link.watermark_text,
      'sender_badge_emoji', v_link.sender_badge_emoji,
      'sender_badge_label', v_link.sender_badge_label,
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

commit;
