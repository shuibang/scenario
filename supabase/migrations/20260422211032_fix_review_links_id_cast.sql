-- Fix: review_links.id는 text 타입이지만 RPC 파라미터 p_link_id는 uuid여서
-- "operator does not exist: text = uuid" 에러로 피드백 링크 로드가 실패.
-- get_feedback_link_bundle, submit_feedback_session 두 RPC에서 id 비교에 ::text 캐스트 적용.

begin;

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
   where id = p_link_id::text
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

commit;
