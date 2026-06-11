/**
 * Google Drive appDataFolder 저장/불러오기
 * - Access Token은 모듈 레벨에서 관리 (React에 의존하지 않음)
 * - AppContext의 persist effect에서 isTokenValid() 체크 후 saveToDrive() 호출
 */

import { computeSnapshotMeta } from '../utils/snapshotMeta';
import { saveSnapshotToIDB, loadSnapshotsList, loadSnapshotRecord, deleteSnapshotFromIDB } from './db';

const DRIVE_API  = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FILE_NAME  = 'drama_workspace.json';

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
  // 다른 Google 계정으로 재로그인하면 이전 계정의 fileId가 무효 → 미리 캐시 비움.
  clearFileIdCache();
  _backupFolderId = null;
  _projectFolderIdCache.clear();
  localStorage.removeItem(BACKUP_FOLDER_ID_KEY);
  localStorage.removeItem(PROJECT_FOLDERS_KEY);
  emitAuthChange();
}

export function isTokenValid() {
  return !!_accessToken && Date.now() < _tokenExpiry;
}

// 현재 access token 값. refreshDriveToken이 "실제로 새 토큰을 받았는지" 비교용.
export function getAccessToken() {
  return _accessToken;
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

// 503/429 transient/rate 에러를 지수 backoff로 재시도. 대본별 신 형식 저장처럼
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
    const file = data.files?.[0] || null;
    // 찾은 fileId를 즉시 캐싱 — 충돌 감지 등 읽기가 캐시를 데워두면 직후 쓰기가 검색을 건너뜀.
    if (file?.id) _fileIdCache.set(name, file.id);
    return file;
  });
}

// ── 범용 파일 ID 캐싱 ──────────────────────────────────────────────────────
// 작품 파일·프로젝트 인덱스·legacy(drama_workspace.json)는 이름이 고정이고 한 번
// 생성되면 fileId가 변하지 않음 → 매 쓰기 전 findFileByName 검색(1 RTT)을 회피.
// 모듈 스코프 Map (세션 내 메모리). 드라이브 연결 해제 시 clearFileIdCache로 초기화 —
// 다른 Google 계정으로 재로그인하면 이전 계정 fileId가 무효이므로.
const _fileIdCache = new Map();

function cacheFileId(name, id) { if (id) _fileIdCache.set(name, id); }
function invalidateFileId(name) { _fileIdCache.delete(name); }
function clearFileIdCache() { _fileIdCache.clear(); }

async function getOrFindFileId(name) {
  const cached = _fileIdCache.get(name);
  if (cached) return cached;
  const file = await findFileByName(name);
  if (file?.id) { _fileIdCache.set(name, file.id); return file.id; }
  return null;
}

async function upsertFile(name, jsonContent) {
  const cachedId = await getOrFindFileId(name);
  return withAuthRetry(async () => {
    if (cachedId) {
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name })], { type: 'application/json' }));
      form.append('file',     new Blob([jsonContent],            { type: 'application/json' }));
      const res = await fetch(`${UPLOAD_API}/files/${cachedId}?uploadType=multipart`, {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${_accessToken}` },
        body:    form,
      });
      // 외부에서 삭제됨 → 캐시 비우고 새로 생성 (self-heal)
      if (res.status === 404) {
        invalidateFileId(name);
        const created = await createNewFile(name, jsonContent);
        cacheFileId(name, created?.id);
        return;
      }
      if (!res.ok) await throwDriveError(res, 'Drive 파일 저장 실패');
      return;
    }
    // 캐시·검색 모두 없음 → 새 파일 생성 + ID 캐싱
    const created = await createNewFile(name, jsonContent);
    cacheFileId(name, created?.id);
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
  if (!file) { invalidateFileId(name); return; }
  return withAuthRetry(async () => {
    const res = await fetch(`${DRIVE_API}/files/${file.id}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (!res.ok && res.status !== 404) await throwDriveError(res, 'Drive 파일 삭제 실패');
    invalidateFileId(name); // 삭제 후 캐시 무효화 — 같은 이름 재생성 시 stale id 방지
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
  const cachedId = await getOrFindFileId(FILE_NAME);

  return withAuthRetry(async () => {
    if (cachedId) {
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: FILE_NAME })], { type: 'application/json' }));
      form.append('file',     new Blob([content],                            { type: 'application/json' }));
      const res = await fetch(`${UPLOAD_API}/files/${cachedId}?uploadType=multipart`, {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${_accessToken}` },
        body:    form,
      });
      // 외부에서 삭제됨 → 캐시 비우고 새로 생성 (self-heal)
      if (res.status === 404) {
        invalidateFileId(FILE_NAME);
        const created = await createNewFile(FILE_NAME, content);
        cacheFileId(FILE_NAME, created?.id);
        return created;
      }
      if (!res.ok) await throwDriveError(res, 'Drive 저장 실패');
      return await res.json();
    }
    // 캐시·검색 모두 없음 → 새 파일 생성 + ID 캐싱
    const created = await createNewFile(FILE_NAME, content);
    cacheFileId(FILE_NAME, created?.id);
    return created;
  });
}
export async function saveToDrive(payload) {
  const next = _pendingSave.catch(() => {}).then(() => _doSaveToDrive(payload));
  _pendingSave = next.catch(() => {});
  return next;
}

/** drama_workspace.json을 appDataFolder에서 읽어 JSON 반환. 없으면 null. */
export async function loadFromDrive() {
  if (!isTokenValid()) return null;
  return readFileByName(FILE_NAME);
}

// ── 아이디어 노트 (단일 파일 동기화) ───────────────────────────────────────
const IDEAS_FILE_NAME = 'daejak_ideas.json';
let _pendingIdeasSave = Promise.resolve();

async function _doSaveIdeasToDrive(payload) {
  if (!isTokenValid()) return { ok: false, reason: 'no-token' };
  try {
    await upsertFile(IDEAS_FILE_NAME, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.driveReason || err.message, error: err };
  }
}

/** 아이디어 컬렉션 전체를 Drive 에 백업. 동시 호출은 직렬화 */
export async function saveIdeasToDrive(ideas) {
  const payload = { ideas: ideas || [], savedAt: Date.now() };
  const next = _pendingIdeasSave.catch(() => {}).then(() => _doSaveIdeasToDrive(payload));
  _pendingIdeasSave = next.catch(() => {});
  return next;
}

/** Drive 에서 아이디어 컬렉션 로드. 없으면 null. */
export async function loadIdeasFromDrive() {
  if (!isTokenValid()) return null;
  try {
    const data = await readFileByName(IDEAS_FILE_NAME);
    if (!data) return null;
    return Array.isArray(data.ideas) ? data.ideas : null;
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[loadIdeasFromDrive] failed:', err);
    }
    return null;
  }
}

// 대본별 PUT 직렬화 — 같은 대본 파일에 동시 PUT 발생 시 Drive API의 도착 순서가
// 보장되지 않아 옛 PUT이 새 PUT을 덮어쓰는 race 방지. saveToDrive(구 형식)와 동일 패턴.
// 다른 대본끼리는 병렬 그대로 (큐 키가 projectId별로 분리됨).
const _pendingProjectSaves = {};
let _pendingIndexSave = Promise.resolve();

// ── Drive 수동 백업 (My Drive "대본작업실" 폴더) ─────────────────────────────
// appDataFolder 스냅샷과 완전히 분리 — 사용자가 Drive에서 직접 볼 수 있는 파일

const BACKUP_FOLDER_NAME = '대본작업실';
const BACKUP_FOLDER_ID_KEY = 'drama_drive_root_folder_id';
const PROJECT_FOLDERS_KEY  = 'drama_drive_project_folders';
let _backupFolderId = null;
const _projectFolderIdCache = new Map(); // safeProjectName → folderId (메모리)

/** 대본명에서 Drive 폴더명으로 사용할 수 없는 문자를 _ 로 치환 */
export function sanitizeFolderName(name) {
  return String(name || '기타').replace(/[/\\:*?"<>|]/g, '_').trim() || '기타';
}

async function findBackupFolder() {
  if (_backupFolderId) return _backupFolderId;
  // localStorage에 캐시된 폴더 ID를 먼저 확인 (페이지 새로고침 후에도 재탐색 없이 바로 사용)
  const cached = localStorage.getItem(BACKUP_FOLDER_ID_KEY);
  if (cached) { _backupFolderId = cached; return _backupFolderId; }
  return withAuthRetry(async () => {
    const q = encodeURIComponent(`name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)&corpora=user&spaces=drive`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (!res.ok) await throwDriveError(res, 'Drive 폴더 검색 실패');
    const data = await res.json();
    if (data.files?.[0]?.id) {
      _backupFolderId = data.files[0].id;
      localStorage.setItem(BACKUP_FOLDER_ID_KEY, _backupFolderId);
    }
    return _backupFolderId ?? null;
  });
}

async function findOrCreateBackupFolder() {
  const existing = await findBackupFolder();
  if (existing) return existing;
  return withAuthRetry(async () => {
    const createRes = await fetch(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${_accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: BACKUP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!createRes.ok) await throwDriveError(createRes, 'Drive 폴더 생성 실패');
    const folder = await createRes.json();
    _backupFolderId = folder.id;
    localStorage.setItem(BACKUP_FOLDER_ID_KEY, _backupFolderId);
    return _backupFolderId;
  });
}

function _loadProjectFolders() {
  try { return JSON.parse(localStorage.getItem(PROJECT_FOLDERS_KEY) || '{}'); } catch { return {}; }
}
function _saveProjectFolder(safeProjectName, id) {
  const map = _loadProjectFolders();
  map[safeProjectName] = id;
  localStorage.setItem(PROJECT_FOLDERS_KEY, JSON.stringify(map));
}

/** "대본작업실/{safeProjectName}/" 서브폴더를 찾거나 생성 */
async function findOrCreateProjectFolder(safeProjectName) {
  // 1. 메모리 캐시
  const memCached = _projectFolderIdCache.get(safeProjectName);
  if (memCached) return memCached;
  // 2. localStorage 캐시 (페이지 새로고침 후에도 재탐색 없이 바로 사용)
  const lsCached = _loadProjectFolders()[safeProjectName];
  if (lsCached) { _projectFolderIdCache.set(safeProjectName, lsCached); return lsCached; }

  const rootId = await findOrCreateBackupFolder();
  return withAuthRetry(async () => {
    const q = encodeURIComponent(`name='${safeProjectName}' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (!res.ok) await throwDriveError(res, 'Drive 프로젝트 폴더 검색 실패');
    const data = await res.json();
    if (data.files?.[0]?.id) {
      const id = data.files[0].id;
      _projectFolderIdCache.set(safeProjectName, id);
      _saveProjectFolder(safeProjectName, id);
      return id;
    }
    const createRes = await fetch(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${_accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: safeProjectName, mimeType: 'application/vnd.google-apps.folder', parents: [rootId] }),
    });
    if (!createRes.ok) await throwDriveError(createRes, 'Drive 프로젝트 폴더 생성 실패');
    const folder = await createRes.json();
    _projectFolderIdCache.set(safeProjectName, folder.id);
    _saveProjectFolder(safeProjectName, folder.id);
    return folder.id;
  });
}

/**
 * My Drive "대본작업실/{프로젝트명}/" 폴더에 .djs 파일로 저장
 * @param {object} projectData - serializeProject() 형식 (단일 대본)
 * @param {string} filename    - '{프로젝트명}_YYYY-MM-DD_HH-MM.djs'
 */
const _DJS_README = '이 파일은 대본작업실(daejak.kr) 전용 파일입니다. 일반 텍스트 편집기로 열지 마세요. daejak.kr에 접속한 후 백업/복원 메뉴 또는 열기 → Google Drive 탭에서 불러올 수 있습니다.';

export async function saveDriveBackup(projectData, filename) {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');
  const safeProjectName = sanitizeFolderName(projectData?.project?.title);
  const folderId = await findOrCreateProjectFolder(safeProjectName);
  const content  = JSON.stringify({ _readme: _DJS_README, ...projectData });
  const contentBlob = new Blob([content], { type: 'application/json' });

  async function doPost() {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: filename, parents: [folderId] })], { type: 'application/json' }));
    form.append('file', contentBlob);
    const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method: 'POST', headers: { Authorization: `Bearer ${_accessToken}` }, body: form,
    });
    if (!res.ok) await throwDriveError(res, 'Drive 백업 저장 실패');
    return res.json();
  }

  return withAuthRetry(async () => {
    // 같은 이름의 파일이 이미 있으면 덮어쓰기(PATCH), 없으면 새로 생성(POST)
    const q = encodeURIComponent(`name='${filename}' and '${folderId}' in parents and trashed=false`);
    const searchRes = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (!searchRes.ok) await throwDriveError(searchRes, 'Drive 파일 검색 실패');
    const { files } = await searchRes.json();
    const existingId = files?.[0]?.id ?? null;

    if (existingId) {
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: filename })], { type: 'application/json' }));
      form.append('file', contentBlob);
      const res = await fetch(`${UPLOAD_API}/files/${existingId}?uploadType=multipart&fields=id`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${_accessToken}` }, body: form,
      });
      if (res.status === 404) return doPost(); // 외부에서 삭제됨 → 새로 생성
      if (!res.ok) await throwDriveError(res, 'Drive 백업 저장 실패');
      return res.json();
    }

    return doPost();
  });
}

/**
 * 현재 프로젝트의 Drive 백업 목록.
 * @param {string} safeProjectName - sanitizeFolderName() 결과
 * Drive 미연결이거나 폴더가 없으면 [] 반환.
 */
export async function listDriveBackups(safeProjectName) {
  if (!isTokenValid() || !safeProjectName) return [];
  try {
    const rootId = await findBackupFolder();
    if (!rootId) return [];
    // 프로젝트 서브폴더 검색 (없으면 빈 배열)
    const q = encodeURIComponent(`name='${safeProjectName}' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const folderRes = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (!folderRes.ok) return [];
    const folderData = await folderRes.json();
    const projectFolderId = folderData.files?.[0]?.id;
    if (!projectFolderId) return [];
    _projectFolderIdCache.set(safeProjectName, projectFolderId);
    return await withAuthRetry(async () => {
      const fq = encodeURIComponent(`'${projectFolderId}' in parents and name contains '.djs' and trashed=false`);
      const res = await fetch(
        `${DRIVE_API}/files?q=${fq}&fields=files(id,name,createdTime)&orderBy=createdTime desc`,
        { headers: { Authorization: `Bearer ${_accessToken}` } },
      );
      if (!res.ok) await throwDriveError(res, 'Drive 백업 목록 조회 실패');
      const data = await res.json();
      return (data.files || []).map(f => ({
        id:      f.id,
        name:    f.name,
        savedAt: f.createdTime,
        source:  'drive',
        type:    'drive_backup',
        label:   f.name,
        device:  null,
      }));
    });
  } catch {
    return [];
  }
}

/** 전체 백업 폴더의 .djs 파일 목록 (OpenProjectModal Drive 탭용) */
export async function listAllBackupFiles() {
  if (!isTokenValid()) return [];
  try {
    const rootId = await findBackupFolder();
    if (!rootId) return [];
    return await withAuthRetry(async () => {
      // 프로젝트 서브폴더 목록 조회
      const foldersRes = await fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(`'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id,name)&pageSize=50`,
        { headers: { Authorization: `Bearer ${_accessToken}` } },
      );
      if (!foldersRes.ok) return [];
      const { files: folders = [] } = await foldersRes.json();

      // 각 폴더에서 .djs 파일 병렬 조회
      const results = await Promise.all(folders.map(async (folder) => {
        const fq = encodeURIComponent(`'${folder.id}' in parents and name contains '.djs' and trashed=false`);
        const res = await fetch(
          `${DRIVE_API}/files?q=${fq}&fields=files(id,name,createdTime)&orderBy=createdTime desc&pageSize=20`,
          { headers: { Authorization: `Bearer ${_accessToken}` } },
        );
        if (!res.ok) return [];
        const { files = [] } = await res.json();
        return files.map(f => ({ id: f.id, name: f.name, savedAt: f.createdTime, projectFolder: folder.name }));
      }));

      return results.flat().sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    });
  } catch {
    return [];
  }
}

/** Drive 백업 파일 다운로드 후 JSON 파싱 */
export async function loadDriveBackupData(fileId) {
  return withAuthRetry(async () => {
    const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (!res.ok) await throwDriveError(res, 'Drive 백업 다운로드 실패');
    // eslint-disable-next-line no-unused-vars
    const { _readme, ...data } = await res.json();
    return data;
  });
}

/** Drive 백업 파일 삭제 */
export async function deleteDriveBackup(fileId) {
  return withAuthRetry(async () => {
    const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (!res.ok && res.status !== 204) await throwDriveError(res, 'Drive 백업 삭제 실패');
  });
}

// ── 스냅샷 (IndexedDB 기반) ──────────────────────────────────────────────────

/** 스냅샷 메타 목록 반환 (최신순, data 필드 제외) */
export async function loadSnapshots() {
  return await loadSnapshotsList();
}

/**
 * 현재 workspace 상태를 스냅샷으로 IndexedDB에 저장
 * @param {object} payload - 저장할 state
 * @param {string} label   - '자동저장' | '수동저장' | '백업' | '복원 전 자동저장'
 * @param {'auto'|'manual'|'backup'|'restore'|'device_switch'} type
 */
export async function saveSnapshot(payload, label = '수동저장', type = 'manual') {
  const id      = `${Date.now()}`;
  const savedAt = new Date().toISOString();
  const device  = getDeviceLabel();
  const jsonStr = JSON.stringify({ ...payload, savedAt });
  const meta    = computeSnapshotMeta(payload, jsonStr);
  await saveSnapshotToIDB({ id, savedAt, label, type, device, ...meta, data: payload });
  return { id, savedAt, label, type, device, ...meta };
}

/** 특정 스냅샷의 전체 data 반환 */
export async function loadSnapshotData(id) {
  const data = await loadSnapshotRecord(id);
  if (!data) throw new Error('스냅샷 데이터를 찾을 수 없습니다.');
  return data;
}

/** 스냅샷 삭제 */
export async function deleteSnapshot(id) {
  await deleteSnapshotFromIDB(id);
}

// ── 감독 전용: 대본 저장 / 불러오기 ────────────────────────────────────────

/**
 * 감독 드라이브에 대본 데이터를 새 파일로 저장
 * @param {string} title  - 대본 제목 (파일명에 포함)
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

// ── 연출 작업 폴더 ────────────────────────────────────────────────────────────

const DIRECTOR_WORK_FOLDER_NAME = '대본 작업실 — 연출 작업'; // em dash
const DIRECTOR_WORK_FOLDER_KEY  = 'drama_director_work_folder_id';
let _directorWorkFolderId = null;

/**
 * "대본 작업실 — 연출 작업" 폴더를 조회하거나 없으면 내 드라이브 루트에 생성.
 * @returns {string} Drive folder id
 */
export async function getOrCreateDirectorFolder() {
  if (_directorWorkFolderId) return _directorWorkFolderId;
  const cached = localStorage.getItem(DIRECTOR_WORK_FOLDER_KEY);
  if (cached) { _directorWorkFolderId = cached; return _directorWorkFolderId; }
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');
  return withAuthRetry(async () => {
    const q = encodeURIComponent(
      `name='${DIRECTOR_WORK_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    );
    const searchRes = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)&corpora=user&spaces=drive`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (!searchRes.ok) await throwDriveError(searchRes, 'Drive 연출 폴더 검색 실패');
    const searchData = await searchRes.json();
    if (searchData.files?.[0]?.id) {
      _directorWorkFolderId = searchData.files[0].id;
      localStorage.setItem(DIRECTOR_WORK_FOLDER_KEY, _directorWorkFolderId);
      return _directorWorkFolderId;
    }
    const createRes = await fetch(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${_accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DIRECTOR_WORK_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!createRes.ok) await throwDriveError(createRes, 'Drive 연출 폴더 생성 실패');
    const folder = await createRes.json();
    _directorWorkFolderId = folder.id;
    localStorage.setItem(DIRECTOR_WORK_FOLDER_KEY, _directorWorkFolderId);
    return _directorWorkFolderId;
  });
}

/**
 * 지정 폴더에 연출 작업 파일 신규 생성 (multipart POST)
 * @param {string} folderId - 부모 폴더 Drive id
 * @param {string} fileName - 파일명 (예: 연출작업_제목_abc12345.json)
 * @param {object} data     - 저장할 JSON 객체
 * @returns {string} 생성된 Drive file id
 */
export async function createDirectorWorkFile(folderId, fileName, data) {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');
  const content = JSON.stringify(data);
  return withAuthRetry(async () => {
    const form = new FormData();
    form.append('metadata', new Blob(
      [JSON.stringify({ name: fileName, parents: [folderId] })],
      { type: 'application/json' }
    ));
    form.append('file', new Blob([content], { type: 'application/json' }));
    const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${_accessToken}` },
      body: form,
    });
    if (!res.ok) await throwDriveError(res, 'Drive 연출 작업파일 생성 실패');
    const json = await res.json();
    return json.id;
  });
}

// ── 연출 작업 파일: 메모·스토리보드·씬리스트 통합 저장 ──────────────────────────

/**
 * 기존 Drive 파일을 작업 데이터로 덮어씀 (PATCH media)
 * @param {string} fileId - Drive file id
 * @param {object} data   - { scriptId, privateNotes, storyboard, sceneList, handwriting, savedAt }
 * @returns {string} fileId
 */
export async function updateDirectorWorkFile(fileId, data) {
  if (!fileId) return null;
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');
  const content = JSON.stringify(data);
  return withAuthRetry(async () => {
    const res = await fetch(`${UPLOAD_API}/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${_accessToken}`,
        'Content-Type': 'application/json',
      },
      body: content,
    });
    if (!res.ok) await throwDriveError(res, 'Drive 작업파일 업데이트 실패');
    return fileId;
  });
}

/**
 * Drive에서 연출 작업 파일 불러오기
 * @param {string} fileId - Drive file id
 * @returns {object} 저장된 JSON 객체 그대로
 */
export async function loadDirectorWorkFile(fileId) {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');
  return withAuthRetry(async () => {
    const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (!res.ok) await throwDriveError(res, 'Drive 작업파일 불러오기 실패');
    return await res.json();
  });
}
