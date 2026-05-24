import { sanitizeFolderName } from './googleDrive';

/**
 * Dropbox OAuth 2.0 PKCE + 파일 저장/불러오기
 *
 * - Token은 localStorage에 저장 (Google Drive와 달리 Supabase 세션 불필요)
 * - PKCE code_verifier는 OAuth 리다이렉트 직전 sessionStorage에 임시 보관
 * - 401 발생 시 withDropboxAuthRetry → refreshDropboxToken() 자동 재발행 (googleDrive.js 패턴 동일)
 */

const APP_KEY      = import.meta.env.VITE_DROPBOX_APP_KEY;
const TOKEN_URL    = 'https://api.dropboxapi.com/oauth2/token';
const CONTENT_API  = 'https://content.dropboxapi.com/2/files';
const FILE_PATH    = '/drama_workspace.json';
const IDEAS_PATH   = '/daejak_ideas.json';
const BACKUP_ROOT  = '/대본작업실';
const DJS_README   = '이 파일은 대본작업실(daejak.kr) 전용 파일입니다. 일반 텍스트 편집기로 열지 마세요. daejak.kr에 접속한 후 파일 열기 메뉴에서 불러올 수 있습니다.';

const LS_ACCESS    = 'dropbox_access_token';
const LS_REFRESH   = 'dropbox_refresh_token';
const LS_EXPIRY    = 'dropbox_token_expiry';
// sessionStorage 대신 localStorage 사용: 일부 모바일 브라우저는 OAuth 리다이렉트 후
// sessionStorage를 초기화해 verifier가 사라지는 문제가 있다.
const LS_VERIFIER  = 'dropbox_pkce_verifier';
const VERIFIER_TTL = 10 * 60 * 1000; // 10분 — 미사용 verifier 자동 만료

function saveVerifier(verifier) {
  try {
    localStorage.setItem(LS_VERIFIER, JSON.stringify({ v: verifier, exp: Date.now() + VERIFIER_TTL }));
  } catch {}
}

function popVerifier() {
  try {
    const raw = localStorage.getItem(LS_VERIFIER);
    if (!raw) return null;
    localStorage.removeItem(LS_VERIFIER);
    const { v, exp } = JSON.parse(raw);
    return Date.now() < exp ? v : null;
  } catch { return null; }
}

// Supabase가 URL을 history.replaceState로 지우기 전에 모듈 로드 시점에 캡처.
// handleDropboxCallback()은 이 값을 사용하므로 페이지 타이밍에 무관하게 안전하다.
const _initParams  = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search) : new URLSearchParams('');
const _INIT_CODE   = _initParams.get('code');
const _INIT_STATE  = _initParams.get('state');
let _initialDropboxCodeConsumed = false;

/** 모듈 초기화 시 캡처한 Dropbox 인가 코드. state=dropbox 가 아니면 null. */
export function getInitialDropboxCode() {
  return (_INIT_STATE === 'dropbox' && _INIT_CODE) ? _INIT_CODE : null;
}
export function consumeInitialDropboxCode() {
  if (_initialDropboxCodeConsumed) return null;
  const code = getInitialDropboxCode();
  if (code) _initialDropboxCodeConsumed = true;
  return code;
}
function emitDropboxAuthResult(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('dropbox:callback-result', { detail }));
}

function getDropboxRedirectUri() {
  return `${window.location.origin}/app`;
}

function getDropboxBackupPath(projectData) {
  const safeProjectName = sanitizeFolderName(projectData?.project?.title || '대본');
  return `${BACKUP_ROOT}/${safeProjectName}.djs`;
}

// ── Token 상태 (모듈 레벨, React 무관) ────────────────────────────────────────
let _accessToken = null;
let _tokenExpiry = 0;

// storage:auth-changed — Dropbox/Google 공통 통합 이벤트
// drive:auth-changed   — 기존 useDriveAuthState 리스너 하위 호환
function emitAuthChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('storage:auth-changed'));
  window.dispatchEvent(new Event('drive:auth-changed'));
}

export function setDropboxToken(token, refreshToken, expiresInSec) {
  _accessToken = token;
  _tokenExpiry = Date.now() + (expiresInSec - 60) * 1000; // 만료 1분 전에 무효화
  try {
    localStorage.setItem(LS_ACCESS, token);
    if (refreshToken) localStorage.setItem(LS_REFRESH, refreshToken);
    localStorage.setItem(LS_EXPIRY, String(_tokenExpiry));
  } catch {}
  emitAuthChange();
}

export function clearDropboxToken() {
  _accessToken = null;
  _tokenExpiry = 0;
  try {
    localStorage.removeItem(LS_ACCESS);
    localStorage.removeItem(LS_REFRESH);
    localStorage.removeItem(LS_EXPIRY);
  } catch {}
  emitAuthChange();
}

export function isDropboxTokenValid() {
  if (_accessToken && Date.now() < _tokenExpiry) return true;
  // 페이지 새로고침 후 localStorage에서 복원 (lazy init)
  try {
    const saved  = localStorage.getItem(LS_ACCESS);
    const expiry = Number(localStorage.getItem(LS_EXPIRY) || '0');
    if (saved && Date.now() < expiry) {
      _accessToken = saved;
      _tokenExpiry = expiry;
      return true;
    }
  } catch {}
  return false;
}

// 현재 access token 값. refreshDropboxToken이 "실제로 새 토큰을 받았는지" 비교용.
function getDropboxAccessToken() {
  if (!_accessToken) {
    try {
      _accessToken = localStorage.getItem(LS_ACCESS);
      _tokenExpiry = Number(localStorage.getItem(LS_EXPIRY) || '0');
    } catch {}
  }
  return _accessToken;
}

// ── 에러 헬퍼 ────────────────────────────────────────────────────────────────
// err.dropboxStatus / dropboxTag / dropboxMessage 필드를 붙여 상위에서 세분화 가능.
async function throwDropboxError(res, fallbackLabel) {
  let tag   = null;
  let dbmsg = null;
  try {
    const body = await res.json();
    tag   = body?.error?.['.tag'] ?? null;
    dbmsg = body?.error_summary ?? body?.error?.reason?.['.tag'] ?? null;
  } catch {}
  const err = new Error(`${fallbackLabel}: ${res.status}${tag ? ` ${tag}` : ''}`);
  err.dropboxStatus  = res.status;
  err.dropboxTag     = tag;
  err.dropboxMessage = dbmsg;
  throw err;
}

// ── 401 자동 재발행 ───────────────────────────────────────────────────────────
// 동시 401 dedupe: 여러 fetch가 동시 401일 때 refresh 한 번만.
// refresh 자체가 실패하거나 토큰이 동일(실제 갱신 안 됨)하면 원래 401을 그대로 던진다.
let _refreshInFlight = null;

async function withDropboxAuthRetry(operation) {
  try {
    return await operation();
  } catch (e) {
    if (e?.dropboxStatus !== 401) throw e;
    if (!_refreshInFlight) {
      _refreshInFlight = Promise.resolve()
        .then(() => refreshDropboxToken())
        .finally(() => { _refreshInFlight = null; });
    }
    let token;
    try { token = await _refreshInFlight; } catch { throw e; }
    if (!token) throw e;
    return await operation();
  }
}

// ── PKCE 헬퍼 ────────────────────────────────────────────────────────────────
function base64urlEncode(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateCodeVerifier() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return base64urlEncode(arr);
}

async function generateCodeChallenge(verifier) {
  const enc  = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return base64urlEncode(new Uint8Array(hash));
}

// ── OAuth 진입점 ──────────────────────────────────────────────────────────────
/**
 * Dropbox OAuth PKCE 로그인 — code_verifier 생성 후 리다이렉트.
 * redirect_uri는 현재 origin으로 자동 결정.
 */
export async function connectDropbox() {
  if (!APP_KEY) {
    console.warn('[Dropbox] VITE_DROPBOX_APP_KEY 미설정');
    emitDropboxAuthResult({ ok: false, message: 'DROPBOX_APP_KEY_MISSING', status: 0 });
    return;
  }

  const verifier   = generateCodeVerifier();
  const challenge  = await generateCodeChallenge(verifier);
  saveVerifier(verifier);

  const params = new URLSearchParams({
    client_id:             APP_KEY,
    redirect_uri:          getDropboxRedirectUri(),
    response_type:         'code',
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    state:                 'dropbox',
    token_access_type:     'offline',
    scope:                 'files.content.write files.content.read',
  });
  window.location.href = `https://www.dropbox.com/oauth2/authorize?${params}`;
}

// ── 콜백 처리 ────────────────────────────────────────────────────────────────
/**
 * App.jsx에서 ?code=&state=dropbox 감지 후 호출.
 * code_verifier를 sessionStorage에서 꺼내 토큰 교환하고 localStorage에 저장.
 */
export async function handleDropboxCallback(code) {
  if (!APP_KEY) throw Object.assign(new Error('DROPBOX_APP_KEY_MISSING'), { dropboxStatus: 0 });
  const verifier = popVerifier();
  console.log('[Dropbox] 콜백 처리 시작 — verifier 있음:', !!verifier, '| code 길이:', code?.length);
  if (!verifier) throw Object.assign(new Error('DROPBOX_PKCE_MISSING'), { dropboxStatus: 0 });

  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri:  getDropboxRedirectUri(),
    client_id:     APP_KEY,
  });

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  if (!res.ok) await throwDropboxError(res, 'Dropbox 토큰 교환 실패');

  const data = await res.json();
  console.log('[Dropbox] 토큰 교환 성공 — expires_in:', data.expires_in);
  setDropboxToken(data.access_token, data.refresh_token, data.expires_in ?? 14400);
  // URL에서 쿼리 파라미터 제거 (code, state 노출 방지)
  window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  return data;
}

// ── Token Refresh ─────────────────────────────────────────────────────────────
/**
 * refresh_token으로 access_token 갱신.
 * 실제 갱신이 없거나 실패하면 null 반환 → withDropboxAuthRetry가 재시도 루프를 즉시 멈춤.
 */
export async function refreshDropboxToken() {
  const refreshToken = localStorage.getItem(LS_REFRESH);
  if (!refreshToken) return null;

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     APP_KEY,
  });

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  if (!res.ok) return null;

  const data = await res.json();
  if (!data.access_token) return null;
  // 동일 토큰 = 실제 갱신 안 됨 → null 반환해 무한 재시도 방지
  if (data.access_token === getDropboxAccessToken()) return null;

  setDropboxToken(
    data.access_token,
    data.refresh_token ?? refreshToken, // Dropbox는 refresh 응답에 새 refresh_token 포함 안 할 수도 있음
    data.expires_in ?? 14400,
  );
  return data.access_token;
}

// ── 내부 파일 API ────────────────────────────────────────────────────────────
async function doUpload(path, content) {
  const token = getDropboxAccessToken();
  const arg   = JSON.stringify({ path, mode: 'overwrite', autorename: false, mute: true });
  const res   = await fetch(`${CONTENT_API}/upload`, {
    method:  'POST',
    headers: {
      Authorization:    `Bearer ${token}`,
      'Content-Type':   'application/octet-stream',
      'Dropbox-API-Arg': arg,
    },
    body: content,
  });
  if (!res.ok) await throwDropboxError(res, 'Dropbox 저장 실패');
  return res.json();
}

async function doDownload(path) {
  const token = getDropboxAccessToken();
  const arg   = JSON.stringify({ path });
  const res   = await fetch(`${CONTENT_API}/download`, {
    method:  'POST',
    headers: {
      Authorization:    `Bearer ${token}`,
      'Dropbox-API-Arg': arg,
    },
  });
  // 409 = path_not_found → 파일 없음 (정상 null 반환, throwDropboxError 호출 안 함)
  if (res.status === 409) return null;
  if (!res.ok) await throwDropboxError(res, 'Dropbox 불러오기 실패');
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('DROPBOX_INVALID_FILE_FORMAT');
  }
}

// ── 저장 / 불러오기 ──────────────────────────────────────────────────────────
// 동시 PUT race 방지: 모든 호출을 Promise chain으로 직렬화 (googleDrive.js와 동일 패턴)
let _pendingSave = Promise.resolve();
let _pendingBackupSave = Promise.resolve();

async function _doSaveToDropbox(payload) {
  if (!isDropboxTokenValid()) throw new Error('DROPBOX_AUTH_REQUIRED');
  const savedAt = payload?.savedAt || new Date().toISOString();
  const content = JSON.stringify({ ...payload, savedAt });
  return withDropboxAuthRetry(() => doUpload(FILE_PATH, content));
}

export async function saveToDropbox(payload) {
  const next = _pendingSave.catch(() => {}).then(() => _doSaveToDropbox(payload));
  _pendingSave = next.catch(() => {});
  return next;
}

async function _doSaveDropboxBackup(projectData) {
  if (!isDropboxTokenValid()) throw new Error('DROPBOX_AUTH_REQUIRED');
  const path = getDropboxBackupPath(projectData);
  const content = JSON.stringify({ _readme: DJS_README, ...projectData });
  return withDropboxAuthRetry(() => doUpload(path, content));
}

export async function saveDropboxBackup(projectData) {
  const next = _pendingBackupSave.catch(() => {}).then(() => _doSaveDropboxBackup(projectData));
  _pendingBackupSave = next.catch(() => {});
  return next;
}

export async function loadFromDropbox() {
  if (!isDropboxTokenValid()) return null;
  return withDropboxAuthRetry(() => doDownload(FILE_PATH));
}

// ── 아이디어 노트 ────────────────────────────────────────────────────────────
let _pendingIdeasSave = Promise.resolve();

async function _doSaveIdeasToDropbox(payload) {
  if (!isDropboxTokenValid()) return { ok: false, reason: 'no-token' };
  try {
    await withDropboxAuthRetry(() => doUpload(IDEAS_PATH, JSON.stringify(payload)));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.dropboxTag || err.message, error: err };
  }
}

export async function saveIdeasToDropbox(ideas) {
  const payload = { ideas: ideas || [], savedAt: Date.now() };
  const next    = _pendingIdeasSave.catch(() => {}).then(() => _doSaveIdeasToDropbox(payload));
  _pendingIdeasSave = next.catch(() => {});
  return next;
}

export async function loadIdeasFromDropbox() {
  if (!isDropboxTokenValid()) return null;
  try {
    const data = await withDropboxAuthRetry(() => doDownload(IDEAS_PATH));
    if (!data) return null;
    return Array.isArray(data.ideas) ? data.ideas : null;
  } catch {
    return null;
  }
}
