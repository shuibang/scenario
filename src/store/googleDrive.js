/**
 * Google Drive appDataFolder 저장/불러오기
 * - Access Token은 모듈 레벨에서 관리 (React에 의존하지 않음)
 * - AppContext의 persist effect에서 isTokenValid() 체크 후 saveToDrive() 호출
 */

import { computeSnapshotMeta } from '../utils/snapshotMeta';

const DRIVE_API  = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FILE_NAME  = 'drama_workspace.json';

const SNAPSHOTS_INDEX = 'drama_snapshots.json';
const SNAP_PREFIX     = 'drama_snap_';

// 타입별 보관 한도
//   auto:          10분 주기 자동 스냅샷 전용
//   manual:        사용자 "저장" 버튼
//   backup:        SnapshotPanel "지금 백업"
//   restore:       SnapshotPanel 복원 직전 자동 보존 — 한도 없으면 무제한 누적
//   device_switch: 기기 간 동기화 모달에서 덮어쓰기 직전 자동 보존 — auto와 분리해 밀려남 방지
const SNAP_LIMITS = { auto: 10, manual: 10, backup: 10, restore: 5, device_switch: 5 };

// ── Token 관리 ──────────────────────────────────────────────────────────────
let _accessToken = null;
let _tokenExpiry = 0;

// 토큰 상태 변경 시 헤더 인디케이터 등이 즉시 갱신되도록 window 이벤트 발행.
// 자연 만료(시간 경과)는 이벤트 안 뜨므로 구독자가 별도 폴링 필요.
function emitAuthChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('drive:auth-changed'));
  }
}

export function setAccessToken(token, expiresInSec) {
  _accessToken = token;
  _tokenExpiry = Date.now() + (expiresInSec - 60) * 1000; // 만료 1분 전에 무효화
  emitAuthChange();
}

export function clearAccessToken() {
  _accessToken = null;
  _tokenExpiry = 0;
  // 다른 Google 계정으로 재로그인하면 이전 계정의 인덱스 fileId가 무효 → 미리 캐시 비움.
  invalidateIndexIdCache();
  emitAuthChange();
}

export function isTokenValid() {
  return !!_accessToken && Date.now() < _tokenExpiry;
}

// ── 401 자동 재발행 ─────────────────────────────────────────────────────────
// 외부 모듈(supabaseClient)이 모듈 로드 시 setTokenRefresher로 주입한다.
// 순환 import 방지를 위해 콜백 패턴 사용.
let _tokenRefresher = null;
let _refreshInFlight = null;

export function setTokenRefresher(fn) {
  _tokenRefresher = fn;
}

// 같은 op를 한 번만 재시도. refresh 자체가 실패하면 원래 401을 그대로 던진다.
// 동시 진행 refresh는 _refreshInFlight로 dedupe — 여러 fetch가 동시 401일 때 refresh 한 번만.
async function withAuthRetry(operation) {
  try {
    return await operation();
  } catch (e) {
    if (e?.driveStatus !== 401 || !_tokenRefresher) throw e;
    if (!_refreshInFlight) {
      _refreshInFlight = Promise.resolve()
        .then(() => _tokenRefresher())
        .finally(() => { _refreshInFlight = null; });
    }
    let token;
    try {
      token = await _refreshInFlight;
    } catch {
      throw e;
    }
    if (!token) throw e;
    return await operation();
  }
}

// 503/429 transient/rate 에러를 지수 backoff로 재시도. 작품별 신 형식 저장처럼
// 동시 다발 호출에서 quota 초과 시 자연 회복용. withAuthRetry 위에 한 겹 더 감싼다.
async function withTransientRetry(operation, { maxRetries = 3 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (e) {
      const status = e?.driveStatus;
      const reason = e?.driveReason;
      const isTransient = status === 503 || status === 429
        || reason === 'transientError' || reason === 'rateLimitExceeded'
        || reason === 'userRateLimitExceeded';
      if (!isTransient || attempt >= maxRetries) throw e;
      const delay = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 200); // 500~700, 1100~1300, 2300~2500
      await new Promise(r => setTimeout(r, delay));
      attempt++;
    }
  }
}

// ── 기기 정보 ──────────────────────────────────────────────────────────────
export function getDeviceLabel() {
  const ua = navigator.userAgent;
  if (/iPad/i.test(ua))                          return '태블릿 (iPad)';
  if (/iPhone|iPod/i.test(ua))                   return '모바일 (iPhone)';
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return '모바일 (Android)';
  if (/Android/i.test(ua))                       return '태블릿 (Android)';
  if (/Edg\//i.test(ua))                         return '데스크톱 (Edge)';
  if (/Chrome/i.test(ua))                        return '데스크톱 (Chrome)';
  if (/Firefox/i.test(ua))                       return '데스크톱 (Firefox)';
  if (/Safari/i.test(ua))                        return '데스크톱 (Safari)';
  return '데스크톱';
}

// ── 내부 헬퍼 ──────────────────────────────────────────────────────────────
// Google Drive API 에러 응답 바디를 파싱해 구조화 Error로 던진다.
// err.driveStatus / driveReason / driveMessage 필드를 붙여 상위에서 세분화 가능.
// message 문자열에는 기존 status가 포함되어 e.message.includes('403') 같은 레거시 매칭이 계속 동작.
async function throwDriveError(res, fallbackLabel) {
  let reason = null;
  let gmsg = null;
  try {
    const body = await res.json();
    reason = body?.error?.errors?.[0]?.reason ?? null;
    gmsg = body?.error?.message ?? null;
  } catch {}
  const err = new Error(`${fallbackLabel}: ${res.status}${reason ? ` ${reason}` : ''}`);
  err.driveStatus = res.status;
  err.driveReason = reason;
  err.driveMessage = gmsg;
  throw err;
}

async function findFile() {
  return withAuthRetry(async () => {
    const res = await fetch(
      `${DRIVE_API}/files?spaces=appDataFolder&q=name%3D%27${FILE_NAME}%27&fields=files(id,modifiedTime)`,
      { headers: { Authorization: `Bearer ${_accessToken}` } }
    );
    if (!res.ok) await throwDriveError(res, 'Drive 파일 검색 실패');
    const data = await res.json();
    return data.files?.[0] || null;
  });
}

async function findFileByName(name) {
  const encoded = encodeURIComponent(name).replace(/'/g, '%27');
  return withAuthRetry(async () => {
    const res = await fetch(
      `${DRIVE_API}/files?spaces=appDataFolder&q=name%3D%27${encoded}%27&fields=files(id)`,
      { headers: { Authorization: `Bearer ${_accessToken}` } }
    );
    if (!res.ok) await throwDriveError(res, 'Drive 파일 검색 실패');
    const data = await res.json();
    return data.files?.[0] || null;
  });
}

async function upsertFile(name, jsonContent) {
  const existing = await findFileByName(name);
  const metadata = { name, ...(!existing && { parents: ['appDataFolder'] }) };
  const url = existing
    ? `${UPLOAD_API}/files/${existing.id}?uploadType=multipart`
    : `${UPLOAD_API}/files?uploadType=multipart`;
  return withAuthRetry(async () => {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file',     new Blob([jsonContent],              { type: 'application/json' }));
    const res = await fetch(url, {
      method:  existing ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${_accessToken}` },
      body:    form,
    });
    if (!res.ok) await throwDriveError(res, 'Drive 파일 저장 실패');
  });
}

async function readFileByName(name) {
  const file = await findFileByName(name);
  if (!file) return null;
  return withAuthRetry(async () => {
    const res = await fetch(`${DRIVE_API}/files/${file.id}?alt=media`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    // 404는 "파일 없음" — 정상 null 반환. 401은 throwDriveError로 던져 wrapper가 재시도.
    if (res.status === 404) return null;
    if (!res.ok) await throwDriveError(res, 'Drive 파일 읽기 실패');
    return await res.json();
  });
}

async function deleteFileByName(name) {
  const file = await findFileByName(name);
  if (!file) return;
  return withAuthRetry(async () => {
    const res = await fetch(`${DRIVE_API}/files/${file.id}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (!res.ok && res.status !== 404) await throwDriveError(res, 'Drive 파일 삭제 실패');
  });
}

// 검색 없이 직접 새 파일 생성. saveSnapshot의 데이터 파일처럼 매번 unique한 timestamp ID를 쓰는
// 케이스에 사용 — upsertFile의 findFileByName(항상 결과 0)을 스킵해 1 RTT 절약.
async function createNewFile(name, jsonContent) {
  const metadata = { name, parents: ['appDataFolder'] };
  return withAuthRetry(async () => {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file',     new Blob([jsonContent],              { type: 'application/json' }));
    const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${_accessToken}` },
      body:    form,
    });
    if (!res.ok) await throwDriveError(res, 'Drive 파일 저장 실패');
    return await res.json();
  });
}

// ── 인덱스 파일 ID 캐싱 ────────────────────────────────────────────────────
// 인덱스(drama_snapshots.json)의 fileId는 한 번 만들어지면 변하지 않음 → 매 호출 search 회피.
// localStorage에 저장해 다음 세션에서도 재사용. 파일이 외부에서 삭제·재생성된 경우 404 처리로 invalidate.
const INDEX_ID_CACHE_KEY = 'drama_snap_index_id';
let _indexFileIdCache = null;

function loadIndexIdFromLS() {
  try { return localStorage.getItem(INDEX_ID_CACHE_KEY); } catch { return null; }
}
function saveIndexIdToLS(id) {
  try { id ? localStorage.setItem(INDEX_ID_CACHE_KEY, id) : localStorage.removeItem(INDEX_ID_CACHE_KEY); } catch {}
}
function invalidateIndexIdCache() {
  _indexFileIdCache = null;
  saveIndexIdToLS(null);
}

async function getOrFindIndexFileId() {
  if (_indexFileIdCache) return _indexFileIdCache;
  const fromLs = loadIndexIdFromLS();
  if (fromLs) { _indexFileIdCache = fromLs; return fromLs; }
  const file = await findFileByName(SNAPSHOTS_INDEX);
  if (file?.id) {
    _indexFileIdCache = file.id;
    saveIndexIdToLS(file.id);
    return file.id;
  }
  return null;
}

// 인덱스 읽기 — 캐시된 ID로 바로 GET, 404면 invalidate 후 fallback 검색+읽기.
async function readIndexFile() {
  const cachedId = await getOrFindIndexFileId();
  if (!cachedId) return null;
  return withAuthRetry(async () => {
    const res = await fetch(`${DRIVE_API}/files/${cachedId}?alt=media`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (res.status === 404) {
      invalidateIndexIdCache();
      return await readFileByName(SNAPSHOTS_INDEX); // fallback: 새 ID 검색
    }
    if (!res.ok) await throwDriveError(res, 'Drive 인덱스 읽기 실패');
    return await res.json();
  });
}

// 인덱스 쓰기 — 캐시된 ID로 PATCH, 없으면 새 파일 POST + ID 캐싱.
async function writeIndexFile(jsonContent) {
  const cachedId = await getOrFindIndexFileId();
  if (cachedId) {
    return withAuthRetry(async () => {
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: SNAPSHOTS_INDEX })], { type: 'application/json' }));
      form.append('file',     new Blob([jsonContent], { type: 'application/json' }));
      const res = await fetch(`${UPLOAD_API}/files/${cachedId}?uploadType=multipart`, {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${_accessToken}` },
        body:    form,
      });
      if (res.status === 404) {
        // 외부에서 삭제됨 → 캐시 비우고 새로 생성
        invalidateIndexIdCache();
        const created = await createNewFile(SNAPSHOTS_INDEX, jsonContent);
        if (created?.id) { _indexFileIdCache = created.id; saveIndexIdToLS(created.id); }
        return;
      }
      if (!res.ok) await throwDriveError(res, 'Drive 인덱스 저장 실패');
    });
  }
  // 캐시 없음 + 검색도 없음 → 새 인덱스 파일 생성
  const created = await createNewFile(SNAPSHOTS_INDEX, jsonContent);
  if (created?.id) { _indexFileIdCache = created.id; saveIndexIdToLS(created.id); }
}

// ── Drive에 저장 ────────────────────────────────────────────────────────────
// 여러 요청이 겹쳤을 때 응답 순서 역전으로 이전 savedAt이 최신을 덮어쓰는 사고를 막기 위해
// 모든 호출을 Promise chain으로 직렬화한다.
let _pendingSave = Promise.resolve();
async function _doSaveToDrive(payload) {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');

  // payload.savedAt을 우선 사용 — 로컬 drama_saved_at과 Drive savedAt이 동일한 시각을 갖도록.
  // 호출자가 지정하지 않은 경우(legacy) 현재 시각으로 대체.
  const savedAt = payload?.savedAt || new Date().toISOString();
  const content = JSON.stringify({ ...payload, savedAt });
  const existing = await findFile();
  const metadata = { name: FILE_NAME, ...(!existing && { parents: ['appDataFolder'] }) };

  const url    = existing
    ? `${UPLOAD_API}/files/${existing.id}?uploadType=multipart`
    : `${UPLOAD_API}/files?uploadType=multipart`;

  return withAuthRetry(async () => {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file',     new Blob([content],                  { type: 'application/json' }));
    const res = await fetch(url, {
      method:  existing ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${_accessToken}` },
      body:    form,
    });
    if (!res.ok) await throwDriveError(res, 'Drive 저장 실패');
    return await res.json();
  });
}
export async function saveToDrive(payload) {
  const next = _pendingSave.catch(() => {}).then(() => _doSaveToDrive(payload));
  _pendingSave = next.catch(() => {});
  return next;
}

// ── 스냅샷 ──────────────────────────────────────────────────────────────────

/** 스냅샷 인덱스 목록 반환 (없으면 []) */
export async function loadSnapshots() {
  if (!isTokenValid()) return [];
  try {
    const index = await readFileByName(SNAPSHOTS_INDEX);
    return index?.snapshots ?? [];
  } catch {
    return [];
  }
}

/**
 * 현재 workspace 상태를 스냅샷으로 저장
 * @param {object} payload - 저장할 state (projects, episodes, scriptBlocks …)
 * @param {string} label   - '자동저장' | '수동저장' | '백업' | '복원 전 자동저장'
 * @param {'auto'|'manual'|'backup'} type
 */
export async function saveSnapshot(payload, label = '수동저장', type = 'manual') {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');

  const id      = `${Date.now()}`;
  const savedAt = new Date().toISOString();
  const device  = getDeviceLabel();

  // 메타 계산: 같은 jsonStr을 업로드와 sizeBytes 양쪽에 재사용 (한 번만 직렬화)
  const jsonStr = JSON.stringify({ ...payload, savedAt });
  const meta    = computeSnapshotMeta(payload, jsonStr);

  // 최적화: Step 1(스냅샷 데이터 업로드)와 Step 2(인덱스 읽기)는 독립이라 병렬화 가능.
  // - 스냅샷 데이터 파일은 timestamp ID로 unique → upsertFile의 search 스킵하고 createNewFile 직접 사용.
  // - 인덱스 file id는 캐싱(localStorage)해 매 호출 search 회피.
  const [, existing] = await Promise.all([
    createNewFile(`${SNAP_PREFIX}${id}.json`, jsonStr),
    readIndexFile(),
  ]);

  const prev     = existing?.snapshots ?? [];
  const entry    = { id, savedAt, label, type, device, ...meta };
  const updated  = [entry, ...prev];

  // 3) 타입별 한도 초과분 삭제
  const byType = { auto: [], manual: [], backup: [], restore: [] };
  updated.forEach(s => {
    const t = s.type ?? 'manual';
    if (!byType[t]) byType[t] = [];
    byType[t].push(s);
  });
  const toDelete = [];
  Object.entries(SNAP_LIMITS).forEach(([t, limit]) => {
    if (byType[t]?.length > limit) {
      toDelete.push(...byType[t].slice(limit));
      byType[t] = byType[t].slice(0, limit);
    }
  });
  toDelete.forEach(old => deleteFileByName(`${SNAP_PREFIX}${old.id}.json`).catch(() => {}));

  // 4) 전체 목록 최신순 정렬 후 저장 — 캐싱된 인덱스 ID로 직접 PATCH (search 회피).
  const kept = Object.values(byType).flat()
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  await writeIndexFile(JSON.stringify({ snapshots: kept }));
  return entry;
}

/** 특정 스냅샷의 전체 데이터 반환 */
export async function loadSnapshotData(id) {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');
  return await readFileByName(`${SNAP_PREFIX}${id}.json`);
}

/** 스냅샷 삭제 */
export async function deleteSnapshot(id) {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');
  const existing  = await readFileByName(SNAPSHOTS_INDEX);
  const snapshots = (existing?.snapshots ?? []).filter(s => s.id !== id);
  await Promise.all([
    upsertFile(SNAPSHOTS_INDEX, JSON.stringify({ snapshots })),
    deleteFileByName(`${SNAP_PREFIX}${id}.json`),
  ]);
}

// ── 감독 전용: 대본 저장 / 불러오기 ────────────────────────────────────────

/**
 * 감독 드라이브에 대본 데이터를 새 파일로 저장
 * @param {string} title  - 작품 제목 (파일명에 포함)
 * @param {object} data   - 대본 전체 데이터 스냅샷
 * @returns {string} Drive file id
 */
export async function saveDirectorScript(title, data) {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');

  const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 40);
  const fileName  = `director_script_${Date.now()}_${safeTitle}.json`;
  const content   = JSON.stringify({ title, data, savedAt: new Date().toISOString() });

  return withAuthRetry(async () => {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: ['appDataFolder'] })], { type: 'application/json' }));
    form.append('file',     new Blob([content], { type: 'application/json' }));
    const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${_accessToken}` },
      body:    form,
    });
    if (!res.ok) await throwDriveError(res, 'Drive 저장 실패');
    const json = await res.json();
    return json.id;
  });
}

export async function saveFeedbackVersionSnapshot(title, data) {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');

  const safeTitle = (title || 'feedback')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .slice(0, 40);
  const fileName = `feedback_version_${Date.now()}_${safeTitle}.json`;
  const content = JSON.stringify({
    title,
    data,
    savedAt: new Date().toISOString(),
  });

  return withAuthRetry(async () => {
    const form = new FormData();
    form.append(
      'metadata',
      new Blob([JSON.stringify({ name: fileName, parents: ['appDataFolder'] })], { type: 'application/json' })
    );
    form.append('file', new Blob([content], { type: 'application/json' }));
    const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${_accessToken}` },
      body: form,
    });
    if (!res.ok) await throwDriveError(res, 'Drive save failed');
    const json = await res.json();
    return json.id;
  });
}

/**
 * fileId로 Drive 파일 삭제
 * 파일이 이미 없거나 권한 없음(404/403)이면 조용히 무시
 */
export async function deleteFileById(fileId) {
  if (!fileId || !isTokenValid()) return;
  return withAuthRetry(async () => {
    const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    // 204 = 성공, 404 = 이미 없음 → 둘 다 정상 처리
    if (!res.ok && res.status !== 404) await throwDriveError(res, 'Drive 파일 삭제 실패');
  });
}

/**
 * 감독 드라이브에서 대본 데이터 불러오기
 * @param {string} fileId - Drive file id
 * @returns {object} { title, data, savedAt }
 */
export async function loadDirectorScript(fileId) {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');
  return withAuthRetry(async () => {
    const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (!res.ok) await throwDriveError(res, 'Drive 불러오기 실패');
    return await res.json();
  });
}

// ── Drive에서 불러오기 ──────────────────────────────────────────────────────
export async function loadFromDrive() {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');

  const file = await findFile();
  if (!file) return null; // Drive에 저장된 데이터 없음

  return withAuthRetry(async () => {
    const res = await fetch(`${DRIVE_API}/files/${file.id}?alt=media`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (!res.ok) await throwDriveError(res, 'Drive 불러오기 실패');
    return await res.json();
  });
}

// ── 작품 단위 저장 (Phase 1 — Drive 작품별 동기화) ─────────────────────────
// 기존 단일 drama_workspace.json은 backward-compat용으로 그대로 유지하고,
// 새 동기화 흐름은 인덱스 + 작품별 파일 N개로 분리한다.
//   drama_projects_index.json — 작품 메타 목록 (id/title/savedAt/...)
//   drama_project_<projectId>.json — 한 작품의 모든 데이터 (projectSerializer)
const PROJECTS_INDEX_FILE = 'drama_projects_index.json';
const PROJECT_FILE_PREFIX = 'drama_project_';
const PROJECTS_INDEX_FORMAT = 'djs-index';
const PROJECTS_INDEX_VERSION = 1;

function projectFileName(projectId) {
  return `${PROJECT_FILE_PREFIX}${projectId}.json`;
}

/**
 * 작품 인덱스 저장 — 작품 목록 메타 + deviceId + 전체 savedAt
 * @param {object} args
 * @param {Array<{id, title, updatedAt, savedAt}>} args.projects - 작품 메타 배열
 * @param {string} [args.savedAt] - 인덱스 저장 시각 (미지정 시 현재)
 * @param {string} args.deviceId
 */
export async function saveProjectsIndex({ projects, savedAt, deviceId }) {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');
  const content = JSON.stringify({
    format: PROJECTS_INDEX_FORMAT,
    version: PROJECTS_INDEX_VERSION,
    projects: projects || [],
    savedAt: savedAt || new Date().toISOString(),
    deviceId,
  });
  return withTransientRetry(() => upsertFile(PROJECTS_INDEX_FILE, content));
}

/**
 * 작품 인덱스 로드
 * @returns {object|null} { format, version, projects, savedAt, deviceId } | 신 형식 없으면 null
 */
export async function loadProjectsIndex() {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');
  return readFileByName(PROJECTS_INDEX_FILE);
}

/**
 * 한 작품을 Drive에 저장 — payload는 projectSerializer.serializeProject() 결과
 * @param {string} projectId
 * @param {object} payload - { format:'djs', version:1, project, episodes, ..., drive:{savedAt,deviceId} }
 */
export async function saveProjectToDrive(projectId, payload) {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');
  const content = JSON.stringify(payload);
  return withTransientRetry(() => upsertFile(projectFileName(projectId), content));
}

/**
 * 한 작품을 Drive에서 로드
 * @returns {object|null} 작품 payload | 없으면 null
 */
export async function loadProjectFromDrive(projectId) {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');
  return readFileByName(projectFileName(projectId));
}

/**
 * 한 작품의 Drive 파일 삭제 (작품 영구 삭제 시 호출)
 * 파일이 없으면 조용히 무시.
 */
export async function deleteProjectFromDrive(projectId) {
  if (!isTokenValid()) return;
  return deleteFileByName(projectFileName(projectId));
}

/**
 * Drive에서 모든 작품 로드 — 신 형식 우선, 없거나 누락 시 구 형식 fallback.
 *
 * 신 형식 사용 조건: 인덱스 존재 AND 인덱스의 모든 작품 파일이 정상 로드됨.
 * 하나라도 누락되면 구 형식(drama_workspace.json)으로 fallback (안전 정책).
 *
 * 반환 포맷은 LOAD_FROM_DRIVE reducer가 받는 형태와 동일 (구 형식과 호환).
 *
 * @returns {object|null} 통합 state 또는 null (Drive에 데이터 전혀 없음)
 */
export async function loadAllProjectsFromDrive() {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');

  // 1) 신 형식 시도
  try {
    const index = await loadProjectsIndex();
    if (index?.projects?.length) {
      const payloads = await Promise.all(
        index.projects.map(meta => loadProjectFromDrive(meta.id).catch(() => null))
      );
      const missing = payloads.filter(p => !p).length;
      if (missing === 0) {
        // 동적 import — 순환 의존 회피
        const { combineProjectsToState } = await import('../utils/projectSerializer');
        return combineProjectsToState(payloads, { index });
      }
      console.warn('[Drive] 신 형식 작품 일부 누락 → 구 형식 fallback', {
        total: index.projects.length, missing,
      });
    }
  } catch (e) {
    if (e?.message === 'DRIVE_AUTH_REQUIRED') throw e;
    console.warn('[Drive] 신 형식 로드 실패 → 구 형식 fallback:', e?.message || e);
  }

  // 2) 구 형식 fallback
  const legacy = await loadFromDrive();
  if (!legacy) return null;

  // Phase 1.4 — 백그라운드 마이그레이션. fire-and-forget.
  // 한 번이라도 성공하면 다음부터 신 형식 사용 → fallback 미발생 → 자연 종료.
  // 실패해도 다음 fallback 진입 시 재시도. 데이터 손실 위험 없음 (구 형식 그대로 보존).
  migrateLegacyToProjectFiles(legacy).catch(e => {
    console.warn('[Drive] 구→신 마이그레이션 실패 (다음 진입 시 재시도):', e?.message || e);
  });

  return legacy;
}

/**
 * 구 단일 파일(drama_workspace.json) → 신 형식(인덱스 + 작품별 파일) 변환.
 * Phase 1.4 — loadAllProjectsFromDrive의 구 형식 fallback 시 백그라운드 호출.
 *
 * 구 형식 파일은 삭제하지 않음 — backward-compat (Phase 4.3에서 폐기).
 */
async function migrateLegacyToProjectFiles(legacy) {
  if (!legacy?.projects?.length) return;
  if (!isTokenValid()) return;

  // 동적 import — 순환 의존 회피
  const { serializeProject } = await import('../utils/projectSerializer');
  const { getDeviceId } = await import('../utils/deviceId');

  const deviceId = legacy.deviceId || getDeviceId();
  const savedAt = legacy.savedAt || new Date().toISOString();

  const projectsMeta = [];
  await Promise.all(legacy.projects.map(async (project) => {
    // legacy 자체가 state와 같은 평탄한 형태이므로 그대로 직렬화에 전달
    const payload = serializeProject(legacy, project.id, {
      drive: { savedAt, deviceId },
    });
    if (!payload) return;
    await saveProjectToDrive(project.id, payload);
    projectsMeta.push({
      id: project.id,
      title: project.title,
      updatedAt: project.updatedAt,
      savedAt,
    });
  }));

  if (projectsMeta.length > 0) {
    await saveProjectsIndex({ projects: projectsMeta, savedAt, deviceId });
  }
}
