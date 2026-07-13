/**
 * refresh-drive-token — Google Drive access_token 서버측 재발급
 *
 * POST /functions/v1/refresh-drive-token
 * Authorization: Bearer <access_token>
 *
 * Supabase refreshSession()이 Google provider_token을 실제로 재발급하지
 * 못하는 경우(known limitation)의 폴백. 서버에 저장해둔 refresh_token으로
 * Google OAuth 토큰 엔드포인트를 직접 호출한다.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')              ?? '';
const SERVICE_ROLE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GOOGLE_CLIENT_ID      = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')     ?? '';
const GOOGLE_CLIENT_SECRET  = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '';

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

  // ── 2. refresh_token 조회 ───────────────────────────────────────────────────
  const { data: row, error: selErr } = await admin
    .from('drive_refresh_tokens')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (selErr) {
    console.error('[refresh-drive-token] refresh_token 조회 실패:', selErr.message);
    return json({ error: 'lookup_failed' }, 500);
  }
  if (!row?.refresh_token) return json({ error: 'no_refresh_token' }, 404);

  // ── 3. Google OAuth 토큰 엔드포인트 호출 ─────────────────────────────────────
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: row.refresh_token,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
    }),
  });

  const tokenBody = await tokenRes.json();

  // ── 4. invalid_grant → 저장된 refresh_token 폐기 ────────────────────────────
  if (!tokenRes.ok) {
    if (tokenBody?.error === 'invalid_grant') {
      const { error: delErr } = await admin
        .from('drive_refresh_tokens')
        .delete()
        .eq('user_id', userId);
      if (delErr) console.error('[refresh-drive-token] revoked token 삭제 실패:', delErr.message);
      return json({ error: 'refresh_token_revoked' }, 410);
    }
    console.error('[refresh-drive-token] Google 토큰 갱신 실패:', tokenBody?.error ?? tokenRes.status);
    return json({ error: 'google_refresh_failed' }, 502);
  }

  // ── 5. 성공 — access_token만 반환 (refresh_token은 절대 응답에 포함하지 않음) ──
  return json({
    access_token: tokenBody.access_token,
    expires_in:   tokenBody.expires_in,
  });
});
