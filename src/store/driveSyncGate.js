/**
 * Drive 초기 sync 1회 가드.
 *
 * 창 크기 변경으로 MenuBar/MobileMenuBar가 mount/unmount되어도
 * 같은 사용자에 대해 runDriveSync가 재실행되지 않도록 모듈 단위로 기억.
 * 키는 사용자 식별자(email). 로그아웃/계정 변경 시 reset 호출하면 다음 mount에서 다시 sync.
 */
let _syncedFor = null;

export function shouldRunInitialSync(userKey) {
  if (!userKey) return false;
  return _syncedFor !== userKey;
}

export function markInitialSyncDone(userKey) {
  if (userKey) _syncedFor = userKey;
}

export function resetInitialSyncGate() {
  _syncedFor = null;
}
