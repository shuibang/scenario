/**
 * 어드민 접근 헬퍼
 *
 * - 화이트리스트(이메일)와 라우트 토큰을 환경변수에서 읽어온다.
 * - 클라이언트 환경 변수는 번들에 박혀 누구나 볼 수 있다 — 진짜 데이터 가드는
 *   Supabase RLS(`public.is_admin_user()`)에 있다. 이 파일의 함수들은
 *   UI 노출/라우팅 결정용일 뿐이다.
 *
 * env:
 *   VITE_ADMIN_EMAILS       — 쉼표 구분 이메일 목록 (예: "a@x.com,b@y.com")
 *   VITE_ADMIN_PATH_TOKEN   — hash 토큰 (예: "k7q2p9m")
 *                             미설정 시 어드민 라우트 자체가 비활성화된다.
 */

const FALLBACK_ADMIN_EMAIL = 'jiusu77@gmail.com';

const ENV_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const ADMIN_EMAILS = ENV_EMAILS.length > 0 ? ENV_EMAILS : [FALLBACK_ADMIN_EMAIL];

export const ADMIN_PATH_TOKEN = (import.meta.env.VITE_ADMIN_PATH_TOKEN || '').trim();

const ADMIN_HASH_PREFIX = '#__a-';

export function isAdminEmail(email) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(String(email).trim().toLowerCase());
}

export function isAdminUser(authUser) {
  if (!authUser) return false;
  // authUser 형태: Supabase user (email 직접) 또는 session.user.email 추출본 모두 대응
  const email = authUser.email || authUser.user?.email || authUser?.identities?.[0]?.email;
  return isAdminEmail(email);
}

export function isAdminHash(hash) {
  if (!ADMIN_PATH_TOKEN) return false;
  if (!hash) return false;
  return hash === ADMIN_HASH_PREFIX + ADMIN_PATH_TOKEN;
}

export function getAdminHash() {
  if (!ADMIN_PATH_TOKEN) return null;
  return ADMIN_HASH_PREFIX + ADMIN_PATH_TOKEN;
}
