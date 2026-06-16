ALTER TABLE feedback_sessions
ADD COLUMN IF NOT EXISTS canvas_width INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS canvas_height INTEGER DEFAULT NULL;

DROP FUNCTION IF EXISTS submit_handwriting_session(text, text, text, text);

CREATE OR REPLACE FUNCTION submit_handwriting_session(
  p_link_id TEXT,
  p_sender_display_name TEXT,
  p_handwriting_png TEXT DEFAULT NULL,
  p_memo_text TEXT DEFAULT NULL,
  p_canvas_width INTEGER DEFAULT NULL,
  p_canvas_height INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_link review_links%ROWTYPE;
  v_session_id UUID;
BEGIN
  SELECT * INTO v_link
  FROM review_links
  WHERE id::text = p_link_id
    AND link_role = 'request'
    AND (expires_at IS NULL OR expires_at > NOW());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FEEDBACK_REQUEST_LINK_NOT_FOUND';
  END IF;

  INSERT INTO feedback_sessions (
    version_id, sender_display_name, submitted_at
  ) VALUES (
    v_link.version_id, p_sender_display_name, NOW()
  )
  RETURNING id INTO v_session_id;

  UPDATE feedback_sessions
  SET handwriting_png = p_handwriting_png,
      memo_text       = p_memo_text,
      canvas_width    = p_canvas_width,
      canvas_height   = p_canvas_height
  WHERE id = v_session_id;

  RETURN json_build_object(
    'session_id', v_session_id,
    'version_id', v_link.version_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_handwriting_session(text, text, text, text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION submit_handwriting_session(text, text, text, text, integer, integer) TO authenticated;
