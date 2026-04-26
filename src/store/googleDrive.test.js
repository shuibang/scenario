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
  clearAccessToken,
  setTokenRefresher,
  loadFromDrive,
  saveToDrive,
  saveSnapshot,
  deleteFileById,
  loadDirectorScript,
} from './googleDrive';

// jsdom·node에 localStorage가 없을 수 있어 메모리 폴리필 — 인덱스 ID 캐시 LS 영속화 동작을 검증하기 위함.
if (typeof globalThis.localStorage === 'undefined') {
  const _store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => { _store.set(k, String(v)); },
    removeItem: (k) => { _store.delete(k); },
    clear: () => { _store.clear(); },
  };
}

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

// ───────────────────────────────────────────────────────────────
// saveSnapshot 최적화 (A: 새 파일 search 스킵, B: 인덱스 ID 캐싱, C: Step1+Step2 병렬)
// 기대 호출 수: 첫 저장(캐시 miss) = 4 (snap upload + 인덱스 search + 인덱스 read + 인덱스 PATCH).
//              이후 저장(캐시 hit)  = 3 (snap upload + 인덱스 read + 인덱스 PATCH).
//   * 기존 6회 대비 33-50% 절감.

describe('saveSnapshot 최적화', () => {
  beforeEach(() => {
    // 인덱스 ID 캐시 정리 — clearAccessToken이 invalidateIndexIdCache 호출하므로 안전하게 리셋.
    clearAccessToken();
    setAccessToken('initial-token', 3600);
  });

  it('첫 저장(캐시 miss): snap upload + index search + index read + index PATCH = 4 fetch, search 1회만', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonRes(200, { id: 'snap-1' }))                     // createNewFile (snap data)
      .mockResolvedValueOnce(jsonRes(200, { files: [{ id: 'index-1' }] }))      // findFileByName(index)
      .mockResolvedValueOnce(jsonRes(200, { snapshots: [] }))                   // GET index by id
      .mockResolvedValueOnce(jsonRes(200, { id: 'index-1' }));                  // PATCH index

    const entry = await saveSnapshot({ projects: [{ id: 'p' }] }, '백업', 'backup');
    expect(entry).toMatchObject({ label: '백업', type: 'backup' });
    expect(global.fetch).toHaveBeenCalledTimes(4);

    // 호출 순서 검증: 1번째는 POST(snap upload). 2번째는 search(index). 두 호출은 Promise.all로 병렬.
    const url0 = global.fetch.mock.calls[0][0];
    const url1 = global.fetch.mock.calls[1][0];
    // 병렬 실행이라 순서는 보장 안 됨 — 둘 중 하나는 upload, 하나는 search.
    const urls01 = [url0, url1].sort();
    expect(urls01[0]).toMatch(/files\?spaces=appDataFolder/);   // search
    expect(urls01[1]).toMatch(/upload\/drive\/v3\/files\?uploadType=multipart&fields=id$/); // POST snap

    // 3번째: GET index media
    expect(global.fetch.mock.calls[2][0]).toMatch(/files\/index-1\?alt=media$/);
    // 4번째: PATCH index
    expect(global.fetch.mock.calls[3][0]).toMatch(/upload\/drive\/v3\/files\/index-1\?uploadType=multipart$/);
    expect(global.fetch.mock.calls[3][1].method).toBe('PATCH');
  });

  it('두 번째 저장(캐시 hit): index search 스킵 → 3 fetch만', async () => {
    // 첫 저장으로 캐시 워밍.
    global.fetch
      .mockResolvedValueOnce(jsonRes(200, { id: 'snap-1' }))
      .mockResolvedValueOnce(jsonRes(200, { files: [{ id: 'index-1' }] }))
      .mockResolvedValueOnce(jsonRes(200, { snapshots: [] }))
      .mockResolvedValueOnce(jsonRes(200, { id: 'index-1' }));
    await saveSnapshot({ projects: [] }, '백업', 'backup');
    global.fetch.mockClear();

    // 두 번째 저장: index search 호출 안 됨.
    global.fetch
      .mockResolvedValueOnce(jsonRes(200, { id: 'snap-2' }))                 // createNewFile (snap data)
      .mockResolvedValueOnce(jsonRes(200, { snapshots: [] }))                // GET index by cached id (병렬)
      .mockResolvedValueOnce(jsonRes(200, { id: 'index-1' }));               // PATCH index

    await saveSnapshot({ projects: [] }, '백업', 'backup');
    expect(global.fetch).toHaveBeenCalledTimes(3);
    // 어떤 호출도 search endpoint 안 침
    for (const call of global.fetch.mock.calls) {
      expect(call[0]).not.toMatch(/files\?spaces=appDataFolder/);
    }
  });

  it('캐시 stale: GET index 404 → invalidate + 재검색 fallback', async () => {
    // 캐시 워밍.
    global.fetch
      .mockResolvedValueOnce(jsonRes(200, { id: 'snap-1' }))
      .mockResolvedValueOnce(jsonRes(200, { files: [{ id: 'old-index-id' }] }))
      .mockResolvedValueOnce(jsonRes(200, { snapshots: [] }))
      .mockResolvedValueOnce(jsonRes(200, { id: 'old-index-id' }));
    await saveSnapshot({ projects: [] }, '백업', 'backup');
    global.fetch.mockClear();

    // 두 번째: GET old-index-id가 404 → invalidate → readFileByName fallback.
    global.fetch
      .mockResolvedValueOnce(jsonRes(200, { id: 'snap-2' }))                       // createNewFile
      .mockResolvedValueOnce(jsonRes(404, {}))                                    // GET cached id → 404
      .mockResolvedValueOnce(jsonRes(200, { files: [{ id: 'new-index-id' }] }))  // fallback search (readFileByName)
      .mockResolvedValueOnce(jsonRes(200, { snapshots: [] }))                    // fallback GET media
      // writeIndexFile: getOrFindIndexFileId() — 캐시 비었지만 LS 캐시도 비었으므로 search.
      .mockResolvedValueOnce(jsonRes(200, { files: [{ id: 'new-index-id' }] }))
      .mockResolvedValueOnce(jsonRes(200, { id: 'new-index-id' }));              // PATCH new index

    await saveSnapshot({ projects: [] }, '백업', 'backup');
    // 호출 횟수는 5~6 (fallback이 더 비쌈) — 핵심은 stale 안전 처리.
    expect(global.fetch.mock.calls.length).toBeGreaterThanOrEqual(5);
  });
});
