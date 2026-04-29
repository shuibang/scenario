/**
 * 기기당 고유 ID — 같은 기기 내 동기화 충돌 모달 오탐 방지용 식별자.
 * localStorage에 영속화하며, 접근 차단 환경에서는 모듈 메모리로 폴백.
 */
export const DEVICE_ID_KEY = 'drama_device_id';

let _memoryFallback = null;

export function getDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    if (_memoryFallback) return _memoryFallback;
    _memoryFallback = crypto.randomUUID();
    return _memoryFallback;
  }
}
