/**
 * Drive 백업 목록 조회 결과 분류.
 *
 * 조회 실패를 빈 배열로 삼키면 "저장된 파일이 없어요"로 표시되어, 사용자가 백업이
 * 소실됐다고 오해한다. "실제로 0건"과 "조회 실패"는 반드시 구분해야 한다.
 */

export const LIST_OFFLINE  = 'offline';   // 인터넷 연결 없음 — 사용자 환경
export const LIST_UNAUTHED = 'unauthed';  // 토큰 문제 — 재연결 필요
export const LIST_FAILED   = 'failed';    // 그 외 실패 — 보고 대상

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** 던져진 오류를 사유로 분류한다. offline 판정은 주입 가능(테스트용). */
export function classifyListFailure(err, { offline = isOffline() } = {}) {
  if (offline) return LIST_OFFLINE;
  if (err?.driveStatus === 401) return LIST_UNAUTHED;
  return LIST_FAILED;
}

export function driveListMessage(reason) {
  switch (reason) {
    case LIST_OFFLINE:
      return '인터넷 연결을 확인해 주세요. 백업 목록을 불러오지 못했습니다.';
    case LIST_UNAUTHED:
      return 'Drive 연결이 만료되어 목록을 불러오지 못했습니다.';
    default:
      return '목록을 불러오지 못했습니다. 저장된 백업이 사라진 것은 아닙니다.';
  }
}

/**
 * 오류 보고 여부.
 * 오프라인은 사용자 환경 문제라 보고하지 않는다 — 지하철·비행기 등에서 대량으로 쌓여
 * 정작 봐야 할 오류를 묻어버린다. 토큰 만료도 정상적인 수명 종료라 제외한다.
 */
export function shouldReportListFailure(reason) {
  return reason === LIST_FAILED;
}
