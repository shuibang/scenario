import {
  deleteFileById,
  isTokenValid,
  saveFeedbackVersionSnapshot,
  setAccessToken,
} from '../store/googleDrive';
import { supabase } from '../store/supabaseClient';
import { refreshShareStats } from './shareStats';

const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;
const FEEDBACK_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOG_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function genId() {
  return crypto.randomUUID();
}

function ensureSupabase() {
  if (!supabase) throw new Error('Supabase environment is not configured.');
}

async function getRequiredSession() {
  ensureSupabase();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (!session) throw new Error('Login is required.');
  return session;
}

async function ensureDriveAccessToken() {
  if (isTokenValid()) return;
  const session = await getRequiredSession();
  if (session?.provider_token) {
    setAccessToken(session.provider_token, session.expires_in ?? 3600);
    return;
  }
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw new Error(error.message);
  const nextSession = data?.session;
  if (nextSession?.provider_token) {
    setAccessToken(nextSession.provider_token, nextSession.expires_in ?? 3600);
    return;
  }
  throw new Error('Google Drive reconnect is required.');
}

function assertPayloadSize(payload) {
  if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) {
    throw new Error('Payload is too large. Please reduce the selected range.');
  }
}

function feedbackExpiresAt() {
  return new Date(Date.now() + FEEDBACK_LINK_TTL_MS).toISOString();
}

export function isShortReviewId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function saveReviewPayload(payload) {
  ensureSupabase();
  await getRequiredSession();
  assertPayloadSize(payload);
  const id = genId();
  const { error } = await supabase.from('review_links').insert({
    id,
    payload,
    expires_at: feedbackExpiresAt(),
  });
  if (error) throw new Error(error.message);
  return id;
}

export async function loadReviewPayload(id) {
  ensureSupabase();
  const { data, error } = await supabase
    .from('review_links')
    .select('payload, expires_at')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('NOT_FOUND');
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    throw new Error('EXPIRED');
  }
  return data.payload;
}

function sanitizeBadge(senderBadge) {
  if (!senderBadge || typeof senderBadge !== 'object') return { emoji: null, label: null };
  const emoji = senderBadge.emoji ? String(senderBadge.emoji).slice(0, 8) : null;
  const label = senderBadge.label ? String(senderBadge.label).slice(0, 40) : null;
  return { emoji, label };
}

export async function createFeedbackVersionShare({ scriptId, title, snapshotContent, watermarkText = null, senderBadge = null }) {
  ensureSupabase();
  if (!scriptId) throw new Error('대본이 선택되지 않았습니다. 대본을 연 뒤 다시 시도해주세요.');
  const session = await getRequiredSession();
  assertPayloadSize(snapshotContent);
  await ensureDriveAccessToken();

  const { data: lastVersion, error: versionOrderError } = await supabase
    .from('feedback_versions')
    .select('version_order')
    .eq('script_id', scriptId)
    .is('deleted_at', null)
    .order('version_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionOrderError) throw new Error(versionOrderError.message);

  const versionOrder = (lastVersion?.version_order || 0) + 1;
  const versionName = `ver.${versionOrder}`;
  let driveFileId = '';
  let versionId = '';

  try {
    driveFileId = await saveFeedbackVersionSnapshot(title, {
      scriptId,
      versionName,
      versionOrder,
      snapshotContent,
    });

    const { data: version, error: versionError } = await supabase
      .from('feedback_versions')
      .insert({
        author_user_id: session.user.id,
        script_id: scriptId,
        version_name: versionName,
        version_order: versionOrder,
        snapshot_content: snapshotContent,
        drive_file_id: driveFileId,
      })
      .select('id, version_name, version_order, created_at')
      .single();

    if (versionError) throw new Error(versionError.message);
    versionId = version.id;

    const linkId = genId();
    const trimmedWatermark = (watermarkText || '').trim().slice(0, 100);
    const badge = sanitizeBadge(senderBadge);
    const { error: linkError } = await supabase.from('review_links').insert({
      id: linkId,
      created_by: session.user.id,
      link_type: 'feedback_version',
      link_role: 'request',
      version_id: version.id,
      watermark_text: trimmedWatermark || null,
      sender_badge_emoji: badge.emoji,
      sender_badge_label: badge.label,
      expires_at: feedbackExpiresAt(),
    });

    if (linkError) throw new Error(linkError.message);

    // 뱃지 카운터(서버 트리거가 올린 값) 즉시 캐시 갱신 → 'share-stats:updated' →
    // useBadges 가 신규 뱃지 감지 후 토스트 발사.
    refreshShareStats(true).catch(() => {});

    return {
      linkId,
      versionId: version.id,
      versionName: version.version_name,
      url: `${window.location.origin}/app#review=${linkId}`,
    };
  } catch (error) {
    if (versionId) {
      await supabase.from('feedback_versions').delete().eq('id', versionId);
    }
    if (driveFileId) {
      try {
        await deleteFileById(driveFileId);
      } catch {}
    }
    throw error;
  }
}

export async function loadFeedbackLinkBundle(linkId) {
  ensureSupabase();
  const { data, error } = await supabase.rpc('get_feedback_link_bundle', {
    p_link_id: linkId,
  });
  if (error) {
    if (String(error.message || '').includes('FEEDBACK_LINK_NOT_FOUND')) {
      throw new Error('EXPIRED');
    }
    throw new Error(error.message);
  }
  return data;
}

export async function loadSharedReviewResource(linkId) {
  try {
    const bundle = await loadFeedbackLinkBundle(linkId);
    return {
      kind: 'feedback_version',
      link: bundle?.link || null,
      version: bundle?.version || null,
      session: bundle?.session || null,
      comments: bundle?.comments || [],
      snapshotContent: bundle?.version?.snapshot_content || null,
    };
  } catch (error) {
    if (error?.message !== 'EXPIRED') {
      try {
        const payload = await loadReviewPayload(linkId);
        return {
          kind: 'legacy_review',
          link: null,
          version: null,
          session: null,
          comments: [],
          snapshotContent: payload,
        };
      } catch (legacyError) {
        if (legacyError?.message === 'EXPIRED') throw legacyError;
        throw error;
      }
    }
    throw error;
  }
}

export async function submitFeedbackSession(linkId, senderDisplayName, comments) {
  ensureSupabase();
  const { data, error } = await supabase.rpc('submit_feedback_session', {
    p_link_id: linkId,
    p_sender_display_name: senderDisplayName,
    p_comments: comments,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function submitHandwritingSession(linkId, senderDisplayName, handwritingPng, memoText, canvasSize) {
  ensureSupabase();
  const { data, error } = await supabase.rpc('submit_handwriting_session', {
    p_link_id: linkId,
    p_sender_display_name: senderDisplayName,
    p_handwriting_png: handwritingPng || null,
    p_memo_text: memoText || null,
    p_canvas_width: canvasSize?.width || null,
    p_canvas_height: canvasSize?.height || null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function createFeedbackReplyLink({ versionId, sessionId }) {
  ensureSupabase();
  const session = await getRequiredSession();
  const linkId = genId();
  const { error } = await supabase.from('review_links').insert({
    id: linkId,
    created_by: session.user.id,
    link_type: 'feedback_version',
    link_role: 'reply',
    version_id: versionId,
    session_id: sessionId,
    expires_at: feedbackExpiresAt(),
  });
  if (error) throw new Error(error.message);
  return {
    linkId,
    url: `${window.location.origin}/app#delivery=${linkId}`,
  };
}

/**
 * 기존 feedback_version 에 새 review_link 만 추가.
 * 같은 버전에 여러 명에게 보낼 때 사용 — 피드백은 모두 그 버전 한 곳에 모임.
 * @param {object}  p
 * @param {string}  p.versionId
 * @param {string?} p.watermarkText
 * @returns {Promise<{ linkId, url }>}
 */
export async function createReviewLinkForExistingVersion({ versionId, watermarkText = null, senderBadge = null }) {
  ensureSupabase();
  if (!versionId) throw new Error('Missing version id.');
  const session = await getRequiredSession();
  const linkId = genId();
  const trimmedWatermark = (watermarkText || '').trim().slice(0, 100);
  const badge = sanitizeBadge(senderBadge);
  const { error } = await supabase.from('review_links').insert({
    id: linkId,
    created_by: session.user.id,
    link_type: 'feedback_version',
    link_role: 'request',
    version_id: versionId,
    watermark_text: trimmedWatermark || null,
    sender_badge_emoji: badge.emoji,
    sender_badge_label: badge.label,
    expires_at: feedbackExpiresAt(),
  });
  if (error) throw new Error(error.message);
  refreshShareStats(true).catch(() => {});
  return {
    linkId,
    url: `${window.location.origin}/app#review=${linkId}`,
  };
}

export async function listFeedbackVersions(scriptId) {
  ensureSupabase();
  const { data, error } = await supabase
    .from('feedback_versions')
    .select('id, script_id, version_name, version_order, drive_file_id, snapshot_content, created_at, updated_at')
    .eq('script_id', scriptId)
    .is('deleted_at', null)
    .order('version_order', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listFeedbackSessions(versionId) {
  ensureSupabase();
  const { data, error } = await supabase
    .from('feedback_sessions')
    .select('id, version_id, sender_display_name, submitted_at, is_read, read_at')
    .eq('version_id', versionId)
    .order('submitted_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listFeedbackSessionsForVersions(versionIds) {
  ensureSupabase();
  if (!Array.isArray(versionIds) || versionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('feedback_sessions')
    .select('id, version_id, sender_display_name, submitted_at, is_read, read_at, handwriting_png, memo_text, canvas_width, canvas_height')
    .in('version_id', versionIds)
    .order('submitted_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listFeedbackComments(sessionIds) {
  ensureSupabase();
  if (!Array.isArray(sessionIds) || sessionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('feedback_comments')
    .select('id, session_id, scene_id, line_ref, comment_text, position_offset, created_at')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function renameFeedbackVersion(versionId, versionName) {
  ensureSupabase();
  const { data, error } = await supabase
    .from('feedback_versions')
    .update({ version_name: versionName })
    .eq('id', versionId)
    .select('id, version_name')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function markFeedbackSessionRead(sessionId) {
  ensureSupabase();
  const { data, error } = await supabase
    .from('feedback_sessions')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('is_read', false)
    .select('id, is_read, read_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteFeedbackVersion(version) {
  ensureSupabase();
  if (!version?.id) throw new Error('Missing version id.');

  // 1) Drive 파일 삭제 — best-effort.
  //    Drive 토큰이 만료됐거나 파일이 이미 사라졌어도 DB 삭제는 진행해야 한다.
  //    (예전엔 token 만료 → throw 로 DB 삭제까지 도달 못 해서 "삭제가 안 됨" 으로 보였음)
  if (version.drive_file_id) {
    try {
      await ensureDriveAccessToken();
      await deleteFileById(version.drive_file_id);
    } catch (driveError) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[deleteFeedbackVersion] Drive 파일 삭제 실패(무시하고 DB 삭제 진행):', driveError);
      }
    }
  }

  // 2) DB 삭제 — 진짜 삭제. RLS 로 다른 author 의 row 가 필터되면 0 row 가 반환되므로
  //    .select() 로 실제 삭제된 row 를 확인해 명확한 에러를 던진다.
  const { data, error } = await supabase
    .from('feedback_versions')
    .delete()
    .eq('id', version.id)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('이 버전을 삭제할 권한이 없거나 이미 삭제된 항목입니다.');
  }
}

export async function saveLogPayload(payload) {
  ensureSupabase();
  assertPayloadSize(payload);
  const id = genId();
  const { error } = await supabase.from('review_links').insert({
    id,
    payload,
    expires_at: new Date(Date.now() + LOG_LINK_TTL_MS).toISOString(),
  });
  if (error) throw new Error(error.message);
  return id;
}

export async function loadLogPayload(id) {
  ensureSupabase();
  const { data, error } = await supabase
    .from('review_links')
    .select('payload, expires_at')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    throw new Error('EXPIRED');
  }
  return data.payload;
}
