/**
 * Drive 읽기 결과 — "원격에 파일이 없음"과 "조회 실패"를 구분한다.
 *
 * 목록 조회(listAllBackupFiles / listDriveBackups)와 같은 문제가 로드 경로에도 있었다.
 * 다만 로드는 더 조심해야 한다 — 처음 쓰는 사용자에게는 "파일 없음"이 정상 흐름이라,
 * 그것까지 실패로 처리하면 신규 사용자에게 매번 오류가 뜬다.
 *
 * 규칙: 404·미발견은 성공(데이터 없음), 네트워크·인증·비정상 응답만 실패.
 * 실패 사유 분류는 driveListResult의 것을 그대로 재사용한다.
 */

import { classifyListFailure, LIST_UNAUTHED } from './driveListResult';

/** 조회는 됐고 파일이 없다 (신규 사용자 등) — 정상 흐름 */
export function missingResult() {
  return { ok: true, data: null };
}

/** 조회 성공 */
export function foundResult(data) {
  return { ok: true, data };
}

/** 조회 실패 — 네트워크·인증·비정상 응답 */
export function failureResult(error) {
  return {
    ok: false,
    data: null,
    reason: classifyListFailure(error),
    error: error?.message || (error ? String(error) : null),
  };
}

/** 토큰이 없어 조회를 시도하지 못한 경우 */
export function unauthedResult() {
  return { ok: false, data: null, reason: LIST_UNAUTHED, error: null };
}

/** 성공했지만 데이터가 없는 경우 (실패와 구분해서 물어보는 용도) */
export function isMissing(result) {
  return !!result && result.ok === true && (result.data === null || result.data === undefined);
}
