/**
 * delete-account — 로그인한 유저의 계정 및 모든 데이터 완전 삭제
 *
 * POST /functions/v1/delete-account
 * Authorization: Bearer <access_token>
 *
 * 삭제 순서 (FK 의존 순):
 *   1. review_links         WHERE created_by = userId
 *      (feedback_version 타입은 feedback_versions CASCADE로 처리되지만
 *       legacy_review / log_export 타입은 created_by 가 SET NULL — 명시 삭제 필요)
 *   2. shared_scripts       WHERE director_id = userId
 *      → director_deliveries, director_notes 는 FK CASCADE 자동 정리
 *   3. email_subscribers    WHERE user_id = userId
 *      (FK ON DELETE SET NULL — row 자체가 남으므로 명시 삭제)
 *   4. auth.admin.deleteUser(userId)
 *      → feedback_versions       (author_user_id ON DELETE CASCADE)
 *        → feedback_sessions      (version_id CASCADE)
 *          → feedback_comments    (session_id CASCADE)
 *        → review_links           (version_id CASCADE — feedback_version 타입)
 *      → user_share_counters     (user_id ON DELETE CASCADE)
 *
 * 남아있어도 무방한 항목 (개인 식별 불가 / 운영 필요):
 *   - client_errors          user_id → SET NULL
 *   - contests               reported_by / approved_by → SET NULL
 *   - feedback_sessions      sender_user_id → SET NULL (다른 작가 대본 피드백)
 *   - review_links.created_by → SET NULL (이미 위 1단계에서 삭제)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')              ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405);

  // ── 1. JWT 검증 ─────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const token = authHeader.slice(7);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const userId = user.id;

  // ── 2. review_links (legacy_review / log_export 타입) 삭제 ──────────────────
  // feedback_version 타입은 feedback_versions CASCADE로 나중에 정리되지만
  // created_by 컬럼이 SET NULL이어서 row 자체가 남는다 → 전부 명시 삭제.
  const { error: rlErr } = await admin
    .from('review_links')
    .delete()
    .eq('created_by', userId);

  if (rlErr) console.error('[delete-account] review_links 삭제 실패:', rlErr.message);

  // ── 3. shared_scripts (연출 작업실 — 연출가로 받은 대본) 삭제 ────────────────
  // director_deliveries · director_notes 는 FK CASCADE로 자동 정리.
  const { error: ssErr } = await admin
    .from('shared_scripts')
    .delete()
    .eq('director_id', userId);

  if (ssErr) console.error('[delete-account] shared_scripts 삭제 실패:', ssErr.message);

  // ── 4. email_subscribers 삭제 ────────────────────────────────────────────────
  const { error: subErr } = await admin
    .from('email_subscribers')
    .delete()
    .eq('user_id', userId);

  if (subErr) console.error('[delete-account] email_subscribers 삭제 실패:', subErr.message);

  // ── 5. auth user 삭제 ─────────────────────────────────────────────────────────
  // 이 시점에 FK CASCADE 가 일괄 처리됨:
  //   feedback_versions → feedback_sessions → feedback_comments
  //   review_links (version_id/session_id FK)
  //   user_share_counters
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);

  if (delErr) {
    console.error('[delete-account] deleteUser 실패:', delErr.message);
    return json({ error: '계정 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.' }, 500);
  }

  return json({ success: true });
});
