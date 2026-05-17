/**
 * ideasStore — 아이디어 노트 저장소
 *
 * 대본과 독립된 별도 컬렉션(`drama_ideas`). IndexedDB에 단일 키로 저장하며,
 * 향후 Drive 동기화는 `daejak_ideas.json` 단일 파일로 백업한다.
 *
 * 데이터 모델:
 *   Idea = {
 *     id, title, tags: [],
 *     blocks: [Block, ...],
 *     starred, createdAt, updatedAt
 *   }
 *   Block = { id, type: 'memo'|'logline'|'synopsis'|'theme'|'character'|'note'|'image'|'link', ...kindSpecific }
 *
 * 구독 패턴:
 *   - subscribe(listener) → 컬렉션 변경 시 콜백 호출, unsubscribe 함수 반환
 *   - 가벼운 in-memory cache + IDB 동기화
 */

import { getAll, setAll, genId, now, isPublicPcMode } from './db';
import { saveIdeasToDrive, loadIdeasFromDrive, isTokenValid } from './googleDrive';

const IDB_KEY = 'ideas';

// Drive 백업 debounce — 변경 후 2초 멈춤이면 1회 업로드
const DRIVE_DEBOUNCE_MS = 2000;
let _driveTimer = null;
function scheduleDriveSave() {
  if (!isTokenValid()) return;
  if (_driveTimer) clearTimeout(_driveTimer);
  _driveTimer = setTimeout(() => {
    _driveTimer = null;
    saveIdeasToDrive(_cache || []).catch(() => {});
  }, DRIVE_DEBOUNCE_MS);
}

// 시놉시스 본문은 통합 'synopsis' 가 아닌 시놉시스 페이지의 항목별(genre/theme/logline/intent/story)
// 블록으로 세분화해서 대본 만들 때 각 필드에 정확히 들어가도록 한다.
// 'treatment' 는 첫 회차 summaryItems 로 변환됨.
const BLOCK_TYPES = [
  'memo',
  'logline',
  'genre',
  'theme',
  'intent',
  'story',
  'treatment',
  'character',
  'note',
  'image',
  'link',
];

let _cache = null;
let _loaded = false;
const _listeners = new Set();

function notify() {
  for (const l of _listeners) {
    try { l(_cache); } catch {}
  }
}

async function ensureLoaded() {
  if (_loaded) return _cache;
  const data = await getAll(IDB_KEY);
  _cache = Array.isArray(data) ? data : [];
  _loaded = true;
  return _cache;
}

async function persist() {
  if (isPublicPcMode()) return;
  try {
    await setAll(IDB_KEY, _cache);
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[ideasStore] persist failed:', err);
    }
  }
  scheduleDriveSave();
}

/**
 * Drive 에 백업본이 있으면 가져와서 로컬 캐시에 머지/교체.
 * 정책: id 기준 머지 — 같은 id 는 updatedAt 더 큰 쪽 사용, 없는 id 는 추가.
 * 사용자가 다른 기기에서 작성한 아이디어를 잃지 않게.
 */
export async function pullIdeasFromDrive() {
  await ensureLoaded();
  if (!isTokenValid()) return { ok: false, reason: 'no-token' };
  const remote = await loadIdeasFromDrive();
  if (!Array.isArray(remote)) return { ok: false, reason: 'no-remote' };

  const byId = new Map(_cache.map((it) => [it.id, it]));
  let added = 0, updated = 0;
  for (const r of remote) {
    if (!r || !r.id) continue;
    const local = byId.get(r.id);
    if (!local) { byId.set(r.id, r); added++; continue; }
    if ((r.updatedAt || 0) > (local.updatedAt || 0)) {
      byId.set(r.id, r);
      updated++;
    }
  }
  _cache = Array.from(byId.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  notify();
  try { await setAll(IDB_KEY, _cache); } catch {}
  return { ok: true, added, updated };
}

export async function listIdeas() {
  await ensureLoaded();
  return _cache.slice();
}

export function listIdeasSync() {
  return _cache ? _cache.slice() : [];
}

/** 컬렉션 변경 구독. unsubscribe 함수를 반환. */
export function subscribeIdeas(listener) {
  ensureLoaded().then(() => listener(_cache));
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export function newBlock(type, extras = {}) {
  if (!BLOCK_TYPES.includes(type)) throw new Error(`Unknown block type: ${type}`);
  return { id: genId(), type, ...extras };
}

export function createEmptyIdea() {
  const ts = now();
  return {
    id: genId(),
    title: '',
    tags: [],
    blocks: [newBlock('memo', { content: '' })],
    starred: false,
    createdAt: ts,
    updatedAt: ts,
  };
}

// ─── mutate 헬퍼 ────────────────────────────────────────────────────────────
// 캐시가 이미 로드된 경우 동기로 처리. 첫 호출에서 미로드일 때만 async fallback.
// (한글 IME composition 중 await 갭으로 인한 입력 race 회피를 위해 핵심)
function _doAdd(idea) {
  const next = idea ? { ...createEmptyIdea(), ...idea } : createEmptyIdea();
  _cache = [next, ..._cache];
  notify();
  persist();
  return next;
}

function _doUpdate(id, patch) {
  let updated = null;
  _cache = _cache.map((it) => {
    if (it.id !== id) return it;
    updated = { ...it, ...patch, updatedAt: now() };
    return updated;
  });
  if (updated) {
    notify();
    persist();
  }
  return updated;
}

function _doDelete(id) {
  const before = _cache.length;
  _cache = _cache.filter((it) => it.id !== id);
  if (_cache.length !== before) {
    notify();
    persist();
  }
}

export function addIdea(idea = null) {
  if (_loaded) return _doAdd(idea);
  return ensureLoaded().then(() => _doAdd(idea));
}

export function updateIdea(id, patch) {
  if (_loaded) return _doUpdate(id, patch);
  return ensureLoaded().then(() => _doUpdate(id, patch));
}

export function deleteIdea(id) {
  if (_loaded) return _doDelete(id);
  return ensureLoaded().then(() => _doDelete(id));
}

export function toggleStarred(id) {
  if (!_loaded) return ensureLoaded().then(() => toggleStarred(id));
  const it = _cache.find((x) => x.id === id);
  if (!it) return null;
  return _doUpdate(id, { starred: !it.starred });
}

/** 전체 컬렉션 교체 (Drive 복원 등에서 사용) */
export async function replaceAll(next) {
  await ensureLoaded();
  _cache = Array.isArray(next) ? next : [];
  notify();
  await persist();
}

/** 사용 가능한 블록 타입 목록 — UI 슬래시 메뉴/검증에서 참조 */
export const BLOCK_TYPE_LIST = BLOCK_TYPES.slice();
