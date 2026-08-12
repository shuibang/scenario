/**
 * 열기 모달의 Google Drive 탭 표시 판정.
 *
 * 세션 조회는 응답하지 않는 경우가 있어 타임아웃을 둔다. 그때 결과를 "구글 사용자 아님"으로
 * 접어버리면 구글 로그인 사용자에게 Drive 탭이 이유 없이 사라진다 — 무음 기능 소실이다.
 * 그래서 "아님"과 "판정 실패"를 반드시 구분한다.
 */

export const GOOGLE_YES     = 'google';      // 구글 사용자 — Drive 탭 표시
export const GOOGLE_NO      = 'not-google';  // 구글 사용자 아님 — 탭도 재시도 UI도 없음
export const GOOGLE_UNKNOWN = 'unknown';     // 판정 실패(타임아웃/오류) — 재시도 UI 표시

/**
 * 세션 조회 결과를 3상태로 분류한다.
 * outcome: { session } | { timedOut: true } | { failed: true }
 */
export function classifyGoogleSession(outcome = {}) {
  if (outcome.timedOut || outcome.failed) return GOOGLE_UNKNOWN;
  const session = outcome.session;
  if (!session) return GOOGLE_NO;
  const isGoogle = session.user?.app_metadata?.provider === 'google' || !!session.provider_token;
  return isGoogle ? GOOGLE_YES : GOOGLE_NO;
}

// Drive 탭은 확실히 구글 사용자일 때만 보여준다.
export function shouldShowDriveTab(state) {
  return state === GOOGLE_YES;
}

// 재시도 UI는 판정에 실패했을 때만. 구글 사용자가 아닌 사람에게는 아무것도 보이지 않는다.
export function shouldShowDriveRetry(state) {
  return state === GOOGLE_UNKNOWN;
}
