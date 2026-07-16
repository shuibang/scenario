/**
 * errorTracker — 클라이언트 자동 오류 캡처
 *
 * window.onerror / unhandledrejection / React ErrorBoundary 에서 호출되며
 * Supabase `client_errors` 테이블로 insert.
 *
 * 보호 장치:
 *   1. 세션당 최대 SESSION_LIMIT 건 (페이지 로드마다 새 session_id)
 *   2. 같은 fingerprint(메시지+URL) DEDUP_WINDOW_MS 내 중복은 drop
 *   3. message/stack 4KB로 잘림
 *   4. PII 마스킹 — 이메일, 토큰처럼 보이는 패턴
 *   5. 일부 무해한 노이즈(ResizeObserver 루프 등) 무시
 *
 * 호출:
 *   - initErrorTracker() — App 마운트 시 한 번
 *   - reportError({ source, message, stack }) — ErrorBoundary 등에서 수동
 */

import { supabase } from '../store/supabaseClient';

const SESSION_LIMIT = 20;        // 한 페이지 로드당 최대 insert 횟수
const DEDUP_WINDOW_MS = 60_000;  // 같은 fingerprint 60초 내 중복 무시
const MAX_LEN = 4000;

// 무시할 노이즈 (브라우저 내부, 광고 차단기, 무해한 경쟁상태 등)
const IGNORE_PATTERNS = [
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
  /Script error\.?$/i,                       // cross-origin 스크립트 — 정보 없음
  /Failed to fetch.*googletagmanager/i,       // 광고 차단기
  /Blocked a frame with origin/,             // Whale 브라우저 자동완성 iframe 노이즈
];

let sessionId = null;
let sentCount = 0;
const recentFingerprints = new Map(); // fingerprint -> last sent timestamp

function ensureSessionId() {
  if (sessionId) return sessionId;
  // 짧은 random — 충분히 unique. 페이지 로드마다 재생성.
  sessionId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  return sessionId;
}

function truncate(s, n) {
  if (!s) return s;
  const str = String(s);
  return str.length > n ? str.slice(0, n) : str;
}

// 단순 PII 마스킹 — 이메일, 토큰처럼 긴 영숫자 토큰, Bearer 헤더
function maskPII(s) {
  if (!s) return s;
  return String(s)
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '<email>')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer <token>')
    .replace(/eyJ[A-Za-z0-9._\-]{20,}/g, '<jwt>')              // JWT 토큰
    .replace(/[a-zA-Z0-9]{32,}/g, (m) => m.length > 64 ? '<long-token>' : m); // 매우 긴 토큰만
}

// fingerprint — 메시지 첫 100자 + URL pathname
function makeFingerprint(message, url) {
  const m = (message || '').slice(0, 100);
  try {
    const path = url ? new URL(url).pathname : '';
    return `${path}|${m}`;
  } catch {
    return `?|${m}`;
  }
}

function shouldIgnore(message) {
  if (!message) return true;
  return IGNORE_PATTERNS.some((re) => re.test(message));
}

async function send(payload) {
  if (!supabase) return;
  try {
    // supabase-js v2는 네트워크 오류만 throw하고 API 오류는 { error }로 반환함
    const { error } = await supabase.from('client_errors').insert(payload);
    if (error && typeof console !== 'undefined' && console.warn) {
      console.warn('[errorTracker] insert rejected:', error.message, error.code);
    }
  } catch (e) {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[errorTracker] insert failed (network):', e);
    }
  }
}

/**
 * 외부 노출 — ErrorBoundary 등 수동 보고용.
 * source: 'window' | 'promise' | 'react' | 'manual'
 */
export async function reportError({ source, message, stack, url } = {}) {
  if (sentCount >= SESSION_LIMIT) return;

  // 로컬 개발 서버 에러 무시
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return;

  // Google 봇/크롤러 에러 무시
  if (/Googlebot/i.test(navigator.userAgent || '')) return;

  const safeMessage = maskPII(truncate(message || '(no message)', MAX_LEN));
  if (shouldIgnore(safeMessage)) return;

  const safeStack = stack ? maskPII(truncate(stack, MAX_LEN)) : null;
  const safeUrl = truncate(url || window.location.href, 500);
  const safeUa = truncate(navigator.userAgent || '', 500);
  const fp = makeFingerprint(safeMessage, safeUrl);

  // dedup
  const last = recentFingerprints.get(fp);
  if (last && Date.now() - last < DEDUP_WINDOW_MS) return;
  recentFingerprints.set(fp, Date.now());

  sentCount++;

  // 로그인된 user_id가 있으면 첨부 (없으면 null)
  let userId = null;
  try {
    const { data } = await supabase.auth.getSession();
    userId = data?.session?.user?.id || null;
  } catch {}

  await send({
    user_id: userId,
    session_id: ensureSessionId(),
    source: source || 'manual',
    message: safeMessage,
    stack: safeStack,
    url: safeUrl,
    user_agent: safeUa,
    fingerprint: fp,
  });
}

let initialized = false;
export function initErrorTracker() {
  if (initialized) return;
  initialized = true;

  // 1) JS uncaught error
  window.addEventListener('error', (event) => {
    // 일부 ResourceError(<img>, <script> 로드 실패)는 message가 비어있음 — 거름
    if (!event.message && !event.error) return;
    reportError({
      source: 'window',
      message: event.message || (event.error && event.error.message) || 'Unknown error',
      stack: event.error && event.error.stack,
      url: window.location.href,
    });
  });

  // 2) Unhandled promise rejection
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    let message, stack;
    if (reason instanceof Error) {
      message = reason.message;
      stack = reason.stack;
    } else if (typeof reason === 'string') {
      message = reason;
    } else {
      try { message = JSON.stringify(reason); } catch { message = String(reason); }
    }
    reportError({
      source: 'promise',
      message: message || 'Unhandled promise rejection',
      stack,
      url: window.location.href,
    });
  });
}
