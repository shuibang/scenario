/**
 * ai-feedback — 대본 1개 회차에 대한 AI 검토
 *
 * POST /functions/v1/ai-feedback
 * Authorization: Bearer <access_token>
 *
 * 요청  { mode, synopsis, characters, episode: { number, content }, previousFeedbacks: [...] }
 * 응답  { feedback, remaining, isPremium }
 * 실패  402 LIMIT_REACHED / 403 FEATURE_DISABLED / 401 Unauthorized / 413 REQUEST_TOO_LARGE
 *
 * ── 무상태 원칙 ──────────────────────────────────────────────────────────────
 * 대본과 피드백을 어디에도 저장하지 않는다. DB 에도, 로그에도 남기지 않는다.
 * 회차를 넘는 기억(이전 지적이 해결됐는지)은 클라이언트가 이전 [AI] 피드백 요약을
 * 함께 보내는 것으로 만든다. 서버는 요청 하나를 처리하고 잊는다.
 * console 에는 메타데이터(모드·길이·에러 코드)만 남긴다.
 *
 * ── 요금 사고 방지 ───────────────────────────────────────────────────────────
 * feature 이름과 한도는 요청에서 읽지 않는다. 'ai_feedback' 을 하드코딩하고
 * 한도는 DB(feature_limits)가 정한다. 차감은 AI 호출 "전"에 하고, AI 호출이
 * 실패하면 refund_usage 로 되돌린다. 반대 순서(호출 후 차감)로 두면 응답을 받고
 * 연결을 끊는 것만으로 무한 호출이 된다.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildSystemPrompt } from './prompt.ts';
import { buildUserMessage, exceedsSizeLimit, MAX_BODY_BYTES, validateRequest } from './request.ts';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')              ?? '';
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')         ?? '';

const FEATURE = 'ai_feedback';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
/** 검토 한 건의 상한. 4000토큰이면 한글 기준 넉넉히 A4 두어 장 분량이다. */
const MAX_TOKENS = 4000;
/** Edge Function 실행 한도 안에서 끝나야 한다. 환불 호출 여유를 남긴다. */
const AI_TIMEOUT_MS = 90_000;

// ── CORS ─────────────────────────────────────────────────────────────────────
// 다른 함수들은 '*' 를 쓰지만 이 함수는 호출 한 번이 곧 요금이라 출처를 좁힌다.
// (JWT 검증이 실질적 방어선이고 CORS 는 그 위의 한 겹이다)
const ALLOWED_ORIGINS = new Set([
  'https://daejak.kr',
  'https://www.daejak.kr',
  'http://localhost:5173',
  'http://localhost:4173',
]);
// Vercel 프리뷰 배포. 브랜치별로 도메인이 매번 달라 패턴으로 받는다.
const PREVIEW_ORIGIN = /^https:\/\/scenario-[a-z0-9-]+\.vercel\.app$/;

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin) || PREVIEW_ORIGIN.test(origin);
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    // 허용 목록에 없으면 대표 도메인을 돌려준다 = 브라우저가 응답을 막는다.
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'https://daejak.kr',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

// ── Anthropic 응답에서 본문만 뽑기 ────────────────────────────────────────────
function extractText(payload: unknown): string {
  const blocks = (payload as { content?: unknown })?.content;
  if (!Array.isArray(blocks)) return '';
  return blocks
    .filter(b => b && typeof b === 'object' && (b as { type?: string }).type === 'text')
    .map(b => String((b as { text?: unknown }).text ?? ''))
    .join('')
    .trim();
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? '';

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  if (!ANTHROPIC_API_KEY) {
    console.error('[ai-feedback] ANTHROPIC_API_KEY 미설정');
    return json({ error: 'NOT_CONFIGURED', message: 'AI 피드백이 아직 준비되지 않았습니다.' }, 503, origin);
  }

  // ── 1. 인증 ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401, origin);
  const token = authHeader.slice(7);

  // ── 2. 크기 상한 ───────────────────────────────────────────────────────────
  // Content-Length 를 먼저 보되 그것만 믿지 않는다(누락·불일치 가능).
  const declared = Number(req.headers.get('Content-Length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json(
      { error: 'REQUEST_TOO_LARGE', message: '대본이 너무 깁니다. 회차를 나눠서 요청해주세요.' },
      413,
      origin,
    );
  }

  const rawBody = await req.text();
  if (exceedsSizeLimit(rawBody)) {
    return json(
      { error: 'REQUEST_TOO_LARGE', message: '대본이 너무 깁니다. 회차를 나눠서 요청해주세요.' },
      413,
      origin,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return json({ error: 'INVALID_BODY', message: '요청 형식이 올바르지 않습니다.' }, 400, origin);
  }

  const validated = validateRequest(parsed);
  if (!validated.ok) {
    return json({ error: validated.code, message: validated.message }, 400, origin);
  }
  const request = validated.value;

  // ── 3. 사용자 확인 ─────────────────────────────────────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401, origin);
  const userId = user.id;

  // ── 4. 한도 차감 (AI 호출 전) ───────────────────────────────────────────────
  const { data: usage, error: usageErr } = await admin.rpc('admin_check_and_increment_usage', {
    p_feature: FEATURE,
    p_user_id: userId,
  });

  if (usageErr) {
    console.error('[ai-feedback] 사용량 RPC 실패:', usageErr.message);
    return json({ error: 'USAGE_CHECK_FAILED', message: '잠시 후 다시 시도해주세요.' }, 500, origin);
  }

  const usageRow = (usage ?? {}) as Record<string, unknown>;
  const isPremium = usageRow.is_premium === true;

  if (usageRow.allowed !== true) {
    const reason = String(usageRow.reason ?? 'LIMIT_REACHED');
    if (reason === 'FEATURE_DISABLED') {
      return json(
        { error: 'FEATURE_DISABLED', message: 'AI 피드백을 잠시 사용할 수 없습니다.' },
        403,
        origin,
      );
    }
    if (reason === 'AUTH_REQUIRED') return json({ error: 'Unauthorized' }, 401, origin);
    return json(
      {
        error: 'LIMIT_REACHED',
        remaining: 0,
        isPremium,
        message: isPremium
          ? '이번 달 AI 피드백 횟수를 모두 사용했습니다.'
          : '무료 AI 피드백을 모두 사용했습니다.',
      },
      402,
      origin,
    );
  }

  const remaining = usageRow.remaining === null || usageRow.remaining === undefined
    ? null
    : Number(usageRow.remaining);

  // ── 5. AI 호출 ─────────────────────────────────────────────────────────────
  // 실패하면 반드시 차감을 되돌린다. 되돌리지 못하면 사용자는 결과 없이 횟수만 잃는다.
  let feedback = '';
  try {
    const aiRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(request.mode),
        messages: [{ role: 'user', content: buildUserMessage(request) }],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });

    if (!aiRes.ok) {
      // 본문에 요청 내용이 되비칠 수 있으므로 상태 코드만 남긴다.
      console.error('[ai-feedback] AI 호출 실패:', {
        status: aiRes.status,
        mode: request.mode,
        chars: request.episodeContent.length,
      });
      await refundUsage(admin, userId);
      return json(
        { error: 'AI_FAILED', message: 'AI 피드백 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' },
        502,
        origin,
      );
    }

    feedback = extractText(await aiRes.json());
  } catch (err) {
    console.error('[ai-feedback] AI 호출 예외:', {
      name: (err as Error)?.name ?? 'unknown',
      mode: request.mode,
      chars: request.episodeContent.length,
    });
    await refundUsage(admin, userId);
    return json(
      { error: 'AI_FAILED', message: 'AI 피드백 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' },
      502,
      origin,
    );
  }

  if (!feedback) {
    // 200 이지만 본문이 비어 있는 경우(거부 등). 사용자에게는 결과가 없으므로 실패로 처리한다.
    console.error('[ai-feedback] 빈 응답:', { mode: request.mode, chars: request.episodeContent.length });
    await refundUsage(admin, userId);
    return json(
      { error: 'AI_EMPTY', message: 'AI 피드백을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.' },
      502,
      origin,
    );
  }

  return json({ feedback, remaining, isPremium }, 200, origin);
});

/** 차감 되돌리기. 실패해도 사용자 응답은 이미 실패이므로 로그만 남긴다. */
async function refundUsage(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  const { error } = await admin.rpc('refund_usage', {
    p_feature: FEATURE,
    p_user_id: userId,
  });
  if (error) console.error('[ai-feedback] 사용량 환불 실패:', error.message);
}
