/**
 * Dropbox API 에러를 사용자 친화 메시지로 매핑.
 *
 * 입력: dropbox.js의 throwDropboxError가 던진 Error
 *   - err.dropboxStatus  (HTTP status)
 *   - err.dropboxTag     (Dropbox error .tag)
 *   - err.dropboxMessage (error_summary 등)
 *   - err.message        (하위호환 문자열)
 *
 * 출력: { userMsg, kind }
 *   kind = 'auth' | 'quota' | 'perm' | 'rate' | 'size' | 'server' | 'network' | 'unknown'
 */
export function describeDropboxError(err) {
  if (!err) {
    return { userMsg: '저장 중 알 수 없는 오류가 발생했어요.', kind: 'unknown' };
  }

  const msg    = err.message || '';
  const status = err.dropboxStatus;
  const tag    = err.dropboxTag;

  // 인증 만료 — 센티넬 또는 401
  if (msg === 'DROPBOX_AUTH_REQUIRED' || status === 401) {
    return { userMsg: '드롭박스 로그인이 만료되었어요. 다시 연결해 주세요.', kind: 'auth' };
  }

  // PKCE verifier 분실 (sessionStorage 소실)
  if (msg === 'DROPBOX_PKCE_MISSING') {
    return { userMsg: '연결 정보가 초기화되었어요. 드롭박스 연결을 다시 시도해 주세요.', kind: 'auth' };
  }

  if (msg === 'DROPBOX_APP_KEY_MISSING') {
    return { userMsg: '드롭박스 연결 설정이 누락되었어요. 관리자에게 문의해 주세요.', kind: 'auth' };
  }

  if (msg === 'DROPBOX_INVALID_FILE_FORMAT') {
    return { userMsg: '드롭박스에 저장된 파일 형식이 올바르지 않아요.', kind: 'unknown' };
  }

  // 레이트 리밋 (429)
  if (status === 429 || tag === 'too_many_requests') {
    return { userMsg: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.', kind: 'rate' };
  }

  // 용량 부족
  if (tag === 'insufficient_space') {
    return { userMsg: '드롭박스 용량이 부족해요. 드롭박스 정리 후 다시 시도해 주세요.', kind: 'quota' };
  }

  // 권한 없음
  if (status === 403 || tag === 'no_write_permission' || tag === 'disallowed_name') {
    return { userMsg: '드롭박스 접근 권한이 없어요. 다시 연결해 주세요.', kind: 'perm' };
  }

  // 경로 오류 (파일 없음 포함) — 호출자가 null 처리해야 하므로 일반적으론 여기까지 안 옴
  if (status === 409) {
    return { userMsg: '드롭박스 파일을 찾을 수 없어요.', kind: 'unknown' };
  }

  // 파일 크기 초과
  if (status === 413) {
    return { userMsg: '데이터가 너무 커서 한 번에 저장할 수 없어요.', kind: 'size' };
  }

  // 5xx 서버 오류
  if (status >= 500 && status < 600) {
    return { userMsg: '드롭박스 서버 일시 오류. 잠시 후 다시 시도해 주세요.', kind: 'server' };
  }

  // status 없음 → fetch 레벨 실패 (네트워크)
  if (!status) {
    return { userMsg: '네트워크 연결을 확인해 주세요.', kind: 'network' };
  }

  return { userMsg: '저장 중 알 수 없는 오류가 발생했어요.', kind: 'unknown' };
}
