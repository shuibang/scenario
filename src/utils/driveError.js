/**
 * Google Drive API 에러를 사용자 친화 메시지로 매핑.
 *
 * 입력: googleDrive.js의 throwDriveError가 던진 Error
 *   - err.driveStatus (HTTP status)
 *   - err.driveReason (Google API의 errors[0].reason)
 *   - err.driveMessage (Google API의 error.message)
 *   - err.message      (하위호환 문자열, 여전히 "...: 403 storageQuotaExceeded" 포함)
 *
 * 출력: { userMsg, kind }
 *   kind = 'auth' | 'quota' | 'perm' | 'rate' | 'size' | 'server' | 'network' | 'unknown'
 */
export function describeDriveError(err) {
  if (!err) {
    return { userMsg: '저장 중 알 수 없는 오류가 발생했어요.', kind: 'unknown' };
  }

  const msg    = err.message || '';
  const status = err.driveStatus;
  const reason = err.driveReason;

  // 인증 만료 — 센티넬 또는 401
  if (msg === 'DRIVE_AUTH_REQUIRED' || status === 401) {
    return { userMsg: '로그인이 만료되었어요. 다시 로그인해 주세요.', kind: 'auth' };
  }

  // 레이트 리밋 (403 rateLimit reason 또는 429) — 권한 판정보다 먼저
  if (status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
    return { userMsg: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.', kind: 'rate' };
  }

  // 용량 부족
  if (status === 403 && reason === 'storageQuotaExceeded') {
    return {
      userMsg: '구글 드라이브 용량이 부족해요. 드라이브 정리 후 다시 시도해 주세요.',
      kind: 'quota',
    };
  }

  // 구체 권한 오류
  if (status === 403 && (reason === 'insufficientPermissions' || reason === 'appNotAuthorizedToFile')) {
    return { userMsg: '권한이 필요해요. 다시 로그인해서 권한을 허용해 주세요.', kind: 'perm' };
  }

  // 기타 403 — 권한 문제로 분류
  if (status === 403) {
    return { userMsg: '드라이브 접근 권한 오류. 다시 로그인해 주세요.', kind: 'perm' };
  }

  // 파일 크기 초과
  if (status === 413 || status === 507) {
    return { userMsg: '데이터가 너무 커서 한 번에 저장할 수 없어요.', kind: 'size' };
  }

  // 5xx 서버 오류
  if (status >= 500 && status < 600) {
    return { userMsg: '구글 드라이브 서버 일시 오류. 잠시 후 다시 시도해 주세요.', kind: 'server' };
  }

  // status 없음 → fetch 레벨 실패 (네트워크)
  if (!status) {
    return { userMsg: '네트워크 연결을 확인해 주세요.', kind: 'network' };
  }

  return { userMsg: '저장 중 알 수 없는 오류가 발생했어요.', kind: 'unknown' };
}
