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

// ── persist 자동저장 일시 억제 ────────────────────────────────────────────────
// 충돌 해결 적용처럼 명시적으로 통제 업로드(syncWorkspaceToDrive)를 하는 동안,
// debounce persist effect가 같은 데이터를 중복 업로드하지 않도록 일시 억제.
// apply 시작 시 suppress, 명시적 sync 완료 후 release. IDB 자동저장은 영향 없음.
let _persistSuppressed = false;
export function suppressPersistSave()   { _persistSuppressed = true; }
export function releasePersistSave()    { _persistSuppressed = false; }
export function isPersistSaveSuppressed() { return _persistSuppressed; }
