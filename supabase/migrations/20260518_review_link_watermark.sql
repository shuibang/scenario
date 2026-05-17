begin;

-- review_links 에 워터마크 텍스트 필드 추가.
--   - NULL/빈 문자열 → 워터마크 안 나타남(익명 링크)
--   - 값 있음 → 보내는 사람이 지정한 문구가 화면·PDF 워터마크로 노출
-- 본문 텍스트는 보내는 사람이 자유롭게 입력 (받는 사람 이름이거나 식별 문구).
-- 리뷰어가 임의로 수정할 수 없음 — 링크 생성 시점에 고정.
alter table public.review_links
  add column if not exists watermark_text text null;

-- shared_scripts 에도 동일한 컬럼 추가 — 검토링크에서 연출작업실로 가져올 때
-- 워터마크를 함께 복사해 메모 화면까지 워터마크가 이어지도록.
alter table public.shared_scripts
  add column if not exists watermark_text text null;

-- 길이 제한: 사이트 일관성을 위해 100자 캡 (DB 측 안전장치).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.review_links'::regclass
      and conname  = 'review_links_watermark_text_length'
  ) then
    alter table public.review_links
      add constraint review_links_watermark_text_length
      check (watermark_text is null or char_length(watermark_text) <= 100);
  end if;
end $$;

-- ── RPC 갱신: get_feedback_link_bundle 결과의 link 객체에 watermark_text 포함 ──
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
      'watermark_text', v_link.watermark_text,
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
