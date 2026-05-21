/**
 * Supabase 클라이언트 + Google OAuth 헬퍼
 *
 * - signInWithGoogle(): Google 로그인 (Drive scope 포함) → 리디렉트
 * - supabaseSignOut(): 로그아웃
 * - extractUserData(session): 세션에서 사용자 정보 추출
 * - refreshDriveToken(): 토큰 갱신 후 provider_token 반환
 */
import { createClient } from '@supabase/supabase-js';
import { setAccessToken, setTokenRefresher, getAccessToken } from './googleDrive';

export const supabase = (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
  : null;

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/** Google 로그인 (Drive 권한 포함) — 현재 페이지로 리디렉트 */
export async function signInWithGoogle() {
  if (!supabase) { console.warn('[Auth] Supabase 미설정'); return; }
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: DRIVE_SCOPE,
      queryParams: { access_type: 'offline', prompt: 'consent' },
      redirectTo: window.location.origin + '/app',
    },
  });
}

/** 로그아웃 */
export async function supabaseSignOut() {
  await supabase?.auth.signOut();
}

/** 세션에서 { name, email, picture } 추출 */
export function extractUserData(session) {
  if (!session?.user) return null;
  const meta = session.user.user_metadata || {};
  return {
    name:    meta.full_name || meta.name || session.user.email,
    email:   session.user.email,
    picture: meta.avatar_url || meta.picture || null,
  };
}

/**
 * 세션 갱신 후 Drive access token 업데이트
 * Drive 401 오류 발생 시 호출
 * @returns {string|null} 새 provider_token
 */
export async function refreshDriveToken() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.refreshSession();
  const token = data?.session?.provider_token;
  if (error || !token) return null;
  // Supabase refreshSession은 Google provider_token을 실제로 갱신하지 못하고
  // 만료된 옛 토큰을 그대로 돌려주는 경우가 있다. 그때 호출자가 이를 "새 토큰"으로
  // 오인해 401 → refresh → 재시도 를 무한 반복하면 요청 폭주(수백 건)가 난다.
  // 현재 토큰과 동일하면 = 실제 갱신 안 됨 → null 반환해 재시도/재귀를 즉시 멈추고
  // 상위에서 수동 재연결(reauth)로 유도한다. (drive-sync 정책: 자동 루프 금지)
  if (token === getAccessToken()) return null;
  // expires_in 실제값 사용 — 하드코딩 3600 대체 (시나리오 5)
  setAccessToken(token, data.session.expires_in ?? 3600);
  return token;
}

// googleDrive.js의 withAuthRetry가 401 발생 시 호출할 콜백 등록.
// 모듈 로드 시점에 단 한 번 — 순환 import 없이 의존 주입.
setTokenRefresher(refreshDriveToken);
