/**
 * Google Drive appDataFolder 저장/불러오기
 * - Access Token은 모듈 레벨에서 관리 (React에 의존하지 않음)
 * - AppContext의 persist effect에서 isTokenValid() 체크 후 saveToDrive() 호출
 */

const DRIVE_API  = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FILE_NAME  = 'drama_workspace.json';

const SNAPSHOTS_INDEX = 'drama_snapshots.json';
const SNAP_PREFIX     = 'drama_snap_';

// 타입별 보관 한도
const SNAP_LIMITS = { auto: 3, manual: 5, backup: 5 };

// ── Token 관리 ──────────────────────────────────────────────────────────────
let _accessToken = null;
let _tokenExpiry = 0;

export function setAccessToken(token, expiresInSec) {
  _accessToken = token;
  _tokenExpiry = Date.now() + (expiresInSec - 60) * 1000; // 만료 1분 전에 무효화
}

export function clearAccessToken() {
  _accessToken = null;
  _tokenExpiry = 0;
}

export function isTokenValid() {
  return !!_accessToken && Date.now() < _tokenExpiry;
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
async function findFile() {
  const res = await fetch(
    `${DRIVE_API}/files?spaces=appDataFolder&q=name%3D%27${FILE_NAME}%27&fields=files(id,modifiedTime)`,
    { headers: { Authorization: `Bearer ${_accessToken}` } }
  );
  if (!res.ok) throw new Error(`Drive 파일 검색 실패: ${res.status}`);
  const data = await res.json();
  return data.files?.[0] || null;
}

async function findFileByName(name) {
  const encoded = encodeURIComponent(name).replace(/'/g, '%27');
  const res = await fetch(
    `${DRIVE_API}/files?spaces=appDataFolder&q=name%3D%27${encoded}%27&fields=files(id)`,
    { headers: { Authorization: `Bearer ${_accessToken}` } }
  );
  if (!res.ok) throw new Error(`Drive 파일 검색 실패: ${res.status}`);
  const data = await res.json();
  return data.files?.[0] || null;
}

async function upsertFile(name, jsonContent) {
  const existing = await findFileByName(name);
  const metadata = { name, ...(!existing && { parents: ['appDataFolder'] }) };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file',     new Blob([jsonContent],              { type: 'application/json' }));
  const url = existing
    ? `${UPLOAD_API}/files/${existing.id}?uploadType=multipart`
    : `${UPLOAD_API}/files?uploadType=multipart`;
  const res = await fetch(url, {
    method:  existing ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${_accessToken}` },
    body:    form,
  });
  if (!res.ok) throw new Error(`Drive 파일 저장 실패: ${res.status}`);
}

async function readFileByName(name) {
  const file = await findFileByName(name);
  if (!file) return null;
  const res = await fetch(`${DRIVE_API}/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${_accessToken}` },
  });
  if (!res.ok) return null;
  return await res.json();
}

async function deleteFileByName(name) {
  const file = await findFileByName(name);
  if (!file) return;
  await fetch(`${DRIVE_API}/files/${file.id}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${_accessToken}` },
  });
}

// ── Drive에 저장 ────────────────────────────────────────────────────────────
export async function saveToDrive(payload) {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');

  const content  = JSON.stringify({ ...payload, savedAt: new Date().toISOString() });
  const existing = await findFile();
  const metadata = { name: FILE_NAME, ...(!existing && { parents: ['appDataFolder'] }) };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file',     new Blob([content],                  { type: 'application/json' }));

  const url    = existing
    ? `${UPLOAD_API}/files/${existing.id}?uploadType=multipart`
    : `${UPLOAD_API}/files?uploadType=multipart`;

  const res = await fetch(url, {
    method:  existing ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${_accessToken}` },
    body:    form,
  });
  if (!res.ok) throw new Error(`Drive 저장 실패: ${res.status}`);
  return await res.json();
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

  // 1) 스냅샷 데이터 파일 저장
  await upsertFile(`${SNAP_PREFIX}${id}.json`, JSON.stringify({ ...payload, savedAt }));

  // 2) 인덱스 갱신
  const existing = await readFileByName(SNAPSHOTS_INDEX);
  const prev     = existing?.snapshots ?? [];
  const entry    = { id, savedAt, label, type, device, projectCount: payload.projects?.length ?? 0 };
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

  // 4) 전체 목록 최신순 정렬 후 저장
  const kept = Object.values(byType).flat()
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  await upsertFile(SNAPSHOTS_INDEX, JSON.stringify({ snapshots: kept }));
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

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: ['appDataFolder'] })], { type: 'application/json' }));
  form.append('file',     new Blob([content], { type: 'application/json' }));

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${_accessToken}` },
    body:    form,
  });
  if (!res.ok) throw new Error(`Drive 저장 실패: ${res.status}`);
  const json = await res.json();
  return json.id;
}

/**
 * fileId로 Drive 파일 삭제
 * 파일이 이미 없거나 권한 없음(404/403)이면 조용히 무시
 */
export async function deleteFileById(fileId) {
  if (!fileId || !isTokenValid()) return;
  const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${_accessToken}` },
  });
  // 204 = 성공, 404 = 이미 없음 → 둘 다 정상 처리
  if (!res.ok && res.status !== 404) {
    throw new Error(`Drive 파일 삭제 실패: ${res.status}`);
  }
}

/**
 * 감독 드라이브에서 대본 데이터 불러오기
 * @param {string} fileId - Drive file id
 * @returns {object} { title, data, savedAt }
 */
export async function loadDirectorScript(fileId) {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');

  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${_accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive 불러오기 실패: ${res.status}`);
  return await res.json();
}

// ── Drive에서 불러오기 ──────────────────────────────────────────────────────
export async function loadFromDrive() {
  if (!isTokenValid()) throw new Error('DRIVE_AUTH_REQUIRED');

  const file = await findFile();
  if (!file) return null; // Drive에 저장된 데이터 없음

  const res = await fetch(`${DRIVE_API}/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${_accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive 불러오기 실패: ${res.status}`);
  return await res.json();
}
