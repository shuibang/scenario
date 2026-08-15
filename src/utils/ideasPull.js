/**
 * 아이디어 노트 pull 결과 판정.
 *
 * 조회 실패를 "원격에 없음"으로 착각하면 로컬 캐시가 dirty로 표시되고, 이어지는 push가
 * 원격을 덮어써 다른 기기에서 쓴 아이디어가 사라진다. 그래서 세 상태를 명확히 가른다.
 */

export const PULL_OK        = 'ok';         // 원격 아이디어를 받아왔다 (머지 진행)
export const PULL_NO_REMOTE = 'no-remote';  // 조회는 됐고 원격에 파일이 없다 (신규 사용자 등)
export const PULL_FAILED    = 'failed';     // 조회 실패 (네트워크·인증·비정상 응답)

export function classifyIdeasPull(result) {
  if (!result || result.ok !== true) return PULL_FAILED;
  return Array.isArray(result.ideas) ? PULL_OK : PULL_NO_REMOTE;
}

/**
 * 로컬을 push 대상(dirty)으로 표시할지.
 * 원격에 파일이 없을 때만 true — 실패했을 때는 절대 켜지 않는다.
 */
export function shouldMarkDirtyOnPull(outcome) {
  return outcome === PULL_NO_REMOTE;
}
