/**
 * 스토리지 프로바이더 라우터
 *
 * localStorage 'storage_provider' = 'google' | 'dropbox'
 * 기본값: 'google' (하위 호환)
 *
 * 현재 단계에서는 기존 Drive 호출 코드를 교체하지 않는다.
 * 이 모듈은 다음 단계의 UI 연결 및 점진적 마이그레이션을 위한 라우팅 레이어.
 */
import { isTokenValid, saveToDrive }         from './googleDrive';
// loadFromDrive는 아직 미구현 — null 반환 stub
const loadFromDrive = async () => null;
import { isDropboxTokenValid, saveToDropbox, loadFromDropbox } from './dropbox';

const PROVIDER_KEY = 'storage_provider';

/** 현재 선택된 프로바이더 반환. 미설정 시 'google' (하위 호환 기본값). */
export function getActiveProvider() {
  try { return localStorage.getItem(PROVIDER_KEY) || 'google'; } catch { return 'google'; }
}

/**
 * 프로바이더 변경 + storage:provider-changed 이벤트 발행.
 * @param {'google'|'dropbox'} name
 */
export function setActiveProvider(name) {
  try { localStorage.setItem(PROVIDER_KEY, name); } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('storage:provider-changed', { detail: { provider: name } }));
  }
}

/**
 * 활성 프로바이더로 workspace payload 저장.
 * 호출자는 isStorageConnected()로 연결 여부를 미리 체크하는 것이 좋다.
 */
export async function saveToStorage(payload) {
  const provider = getActiveProvider();
  return provider === 'dropbox' ? saveToDropbox(payload) : saveToDrive(payload);
}

/**
 * 활성 프로바이더에서 workspace payload 불러오기.
 * 파일 없음 또는 미연결이면 null 반환.
 */
export async function loadFromStorage() {
  const provider = getActiveProvider();
  return provider === 'dropbox' ? loadFromDropbox() : loadFromDrive();
}

/** 활성 프로바이더가 현재 연결(토큰 유효)되어 있으면 true. */
export function isStorageConnected() {
  const provider = getActiveProvider();
  return provider === 'dropbox' ? isDropboxTokenValid() : isTokenValid();
}
