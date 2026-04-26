/**
 * 401 자동 재발행(withAuthRetry) 시나리오 검증.
 * - 401 → refresh 성공 → 같은 op 한 번 재시도 → 사용자 모르게 성공
 * - 401 → refresh 실패(null) → 원래 401 그대로 throw
 * - 401 → 두 번째도 401 → 무한 루프 없이 두 번째 401 propagate
 * - 비-401 에러는 retry 건드리지 않음
 * - 동시 401 여러 건 → refresh 한 번만 호출(dedupe)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setAccessToken,
  setTokenRefresher,
  loadFromDrive,
  saveToDrive,
  deleteFileById,
  loadDirectorScript,
} from './googleDrive';

// ───────────────────────────────────────────────────────────────
// fetch 응답 헬퍼
function jsonRes(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}
function driveError(status, reason = null) {
  return jsonRes(status, { error: { errors: reason ? [{ reason }] : [], message: 'fail' } });
}

let originalFetch;

beforeEach(() => {
  originalFetch = global.fetch;
  global.fetch = vi.fn();
  // 토큰 유효 — withAuthRetry는 fetch가 401을 반환할 때만 동작.
  setAccessToken('initial-token', 3600);
  // 매 테스트마다 깨끗한 refresher 등록(이전 테스트 잔재 제거)
  setTokenRefresher(null);
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ───────────────────────────────────────────────────────────────
describe('withAuthRetry — 401 자동 재발행', () => {
  it('401 → refresh 성공 → 같은 op 재시도 후 정상 응답', async () => {
    // loadDirectorScript는 fetch 한 번만 함 — 가장 단순한 시나리오.
    global.fetch
      .mockResolvedValueOnce(driveError(401, 'authError'))
      .mockResolvedValueOnce(jsonRes(200, { title: 't', data: {}, savedAt: 'x' }));

    const refresher = vi.fn(async () => 'new-token');
    setTokenRefresher(refresher);

    const result = await loadDirectorScript('file-1');
    expect(result).toEqual({ title: 't', data: {}, savedAt: 'x' });
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('401 → refresh가 null 반환 → 원래 401 그대로 throw', async () => {
    global.fetch.mockResolvedValueOnce(driveError(401));
    const refresher = vi.fn(async () => null);
    setTokenRefresher(refresher);

    await expect(loadDirectorScript('file-1')).rejects.toMatchObject({ driveStatus: 401 });
    expect(refresher).toHaveBeenCalledTimes(1);
    // op는 첫 시도 한 번만 — refresh 실패시 retry 안 함
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('refresh 자체가 throw → 원래 401 propagate (refresh 에러로 덮지 않음)', async () => {
    global.fetch.mockResolvedValueOnce(driveError(401));
    const refresher = vi.fn(async () => { throw new Error('network down'); });
    setTokenRefresher(refresher);

    await expect(loadDirectorScript('file-1')).rejects.toMatchObject({ driveStatus: 401 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('401 → refresh 성공 → 두 번째도 401 → 두 번째 401 propagate (재시도 1회만)', async () => {
    global.fetch
      .mockResolvedValueOnce(driveError(401))
      .mockResolvedValueOnce(driveError(401));

    const refresher = vi.fn(async () => 'new-token');
    setTokenRefresher(refresher);

    await expect(loadDirectorScript('file-1')).rejects.toMatchObject({ driveStatus: 401 });
    // refresh는 첫 401에서만 호출, 재시도 후 두 번째 401은 그냥 throw
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('비-401 에러는 retry 시도하지 않고 그대로 throw', async () => {
    global.fetch.mockResolvedValueOnce(driveError(403, 'storageQuotaExceeded'));
    const refresher = vi.fn(async () => 'new-token');
    setTokenRefresher(refresher);

    await expect(loadDirectorScript('file-1')).rejects.toMatchObject({
      driveStatus: 403,
      driveReason: 'storageQuotaExceeded',
    });
    expect(refresher).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('refresher 미등록 → 401 그대로 throw (fallback 없음)', async () => {
    global.fetch.mockResolvedValueOnce(driveError(401));
    // refresher 미등록 상태

    await expect(loadDirectorScript('file-1')).rejects.toMatchObject({ driveStatus: 401 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('동시 401 두 건 → refresh 한 번만 호출(in-flight dedupe)', async () => {
    // 두 호출 모두 첫 fetch 401 → withAuthRetry 두 건이 같은 _refreshInFlight 공유.
    // refresher는 한 번만 호출되어야 하고, 두 op 모두 재시도 후 성공해야 한다.
    global.fetch
      .mockResolvedValueOnce(driveError(401))
      .mockResolvedValueOnce(driveError(401))
      .mockResolvedValueOnce(jsonRes(200, { title: 'a' }))
      .mockResolvedValueOnce(jsonRes(200, { title: 'b' }));

    const refresher = vi.fn(async () => 'new-token');
    setTokenRefresher(refresher);

    const [r1, r2] = await Promise.all([
      loadDirectorScript('file-1'),
      loadDirectorScript('file-2'),
    ]);

    expect(r1).toEqual({ title: 'a' });
    expect(r2).toEqual({ title: 'b' });
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('saveToDrive: findFile 401 → refresh → upload 정상 (헬퍼와 op 둘 다 wrapper 보호)', async () => {
    global.fetch
      // 1) findFile 첫 시도 — 401
      .mockResolvedValueOnce(driveError(401))
      // 2) findFile 재시도 (refresh 후) — 200
      .mockResolvedValueOnce(jsonRes(200, { files: [{ id: 'f1', modifiedTime: 'x' }] }))
      // 3) upload — 200
      .mockResolvedValueOnce(jsonRes(200, { id: 'f1' }));

    const refresher = vi.fn(async () => 'new-token');
    setTokenRefresher(refresher);

    const result = await saveToDrive({ projects: [], savedAt: '2026-04-26T00:00:00Z' });
    expect(result).toEqual({ id: 'f1' });
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('loadFromDrive: 읽기 fetch 401 → refresh → 재시도 (findFile 결과 재사용)', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonRes(200, { files: [{ id: 'f1' }] }))  // findFile
      .mockResolvedValueOnce(driveError(401))                            // 읽기 첫 시도
      .mockResolvedValueOnce(jsonRes(200, { projects: [{ id: 'p1' }] })); // 재시도

    const refresher = vi.fn(async () => 'new-token');
    setTokenRefresher(refresher);

    const result = await loadFromDrive();
    expect(result).toEqual({ projects: [{ id: 'p1' }] });
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  it('deleteFileById: 401 → refresh → 재시도', async () => {
    global.fetch
      .mockResolvedValueOnce(driveError(401))
      .mockResolvedValueOnce(jsonRes(204, null));

    const refresher = vi.fn(async () => 'new-token');
    setTokenRefresher(refresher);

    await expect(deleteFileById('f1')).resolves.toBeUndefined();
    expect(refresher).toHaveBeenCalledTimes(1);
  });
});
