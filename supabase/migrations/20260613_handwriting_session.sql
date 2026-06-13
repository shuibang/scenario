-- feedback_sessions에 필기 PNG 저장 컬럼 추가
ALTER TABLE public.feedback_sessions
  ADD COLUMN IF NOT EXISTS handwriting_png text null;

-- 필기 전용 세션 제출 RPC
-- submit_feedback_session은 comments 필수이므로 필기 단독 회신용 별도 함수로 분리.
CREATE OR REPLACE FUNCTION public.submit_handwriting_session(
  p_link_id              uuid,
  p_sender_display_name  text,
  p_handwriting_png      text default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_link         public.review_links%rowtype;
  v_session_id   uuid;
  v_display_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  v_display_name := btrim(coalesce(p_sender_display_name, ''));
  IF char_length(v_display_name) = 0 OR char_length(v_display_name) > 80 THEN
    RAISE EXCEPTION 'INVALID_DISPLAY_NAME';
  END IF;

  SELECT *
    INTO v_link
    FROM public.review_links
   WHERE id = p_link_id
     AND link_type = 'feedback_version'
     AND link_role = 'request'
     AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FEEDBACK_REQUEST_LINK_NOT_FOUND';
  END IF;

  INSERT INTO public.feedback_sessions (
    version_id,
    sender_user_id,
    sender_display_name,
    handwriting_png
  )
  VALUES (
    v_link.version_id,
    auth.uid(),
    v_display_name,
    p_handwriting_png
  )
  RETURNING id INTO v_session_id;

  UPDATE public.feedback_versions
     SET updated_at = now()
   WHERE id = v_link.version_id;

  RETURN jsonb_build_object(
    'version_id', v_link.version_id,
    'session_id', v_session_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_handwriting_session(uuid, text, text) TO authenticated;
