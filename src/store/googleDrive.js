/**
 * Google Drive appDataFolder 저장/불러오기
 * - Access Token은 모듈 레벨에서 관리 (React에 의존하지 않음)
 * - AppContext의 persist effect에서 isTokenValid() 체크 후 saveToDrive() 호출
 */

const DRIVE_API  = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FILE_NAME  = 'drama_workspace.json';

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
