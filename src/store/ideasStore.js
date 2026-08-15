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
import { shouldReportListFailure } from '../utils/driveListResult';
import { PULL_FAILED, classifyIdeasPull, shouldMarkDirtyOnPull } from '../utils/ideasPull';
import { reportError } from '../utils/errorTracker';

const IDB_KEY = 'ideas';

// Drive 백업 debounce — 변경 후 2초 멈춤이면 1회 업로드
const DRIVE_DEBOUNCE_MS = 2000;
let _driveTimer = null;

// Drive 동기화 정책 (사용자 피드백 반영: 네트워크/배터리 절약):
// - 편집 시 IDB 저장은 즉시. Drive push 는 다음 조건이 모두 맞을 때 1회만.
//   1) Drive 토큰 valid (끊긴 동안 자동 재연결 시도 안 함 — 사용자가 수동저장으로 재연결)
//   2) 첫 pull 완료 (덮어쓰기 race 방지)
//   3) 보낼 변경 있음 (_hasUnsyncedChanges)
// - 끊긴 동안 누적된 변경은 _hasUnsyncedChanges 로 보존 → 재연결 시 1회 일괄 push.
let _pullSettled = false;
let _hasUnsyncedChanges = false;

function scheduleDriveSave() {
  if (!_hasUnsyncedChanges) return;
  if (!isTokenValid()) return;       // Drive 끊김 → 다음 재연결까지 보류 (dirty 유지)
  if (!_pullSettled) return;          // 첫 pull 완료까지 보류 (finally 에서 자동 재시도)
  if (_driveTimer) clearTimeout(_driveTimer);
  _driveTimer = setTimeout(() => {
    _driveTimer = null;
    saveIdeasToDrive(_cache || [])
      .then((res) => {
        if (res?.ok) _hasUnsyncedChanges = false;  // 성공 시에만 dirty 해제
      })
      .catch(() => {});
  }, DRIVE_DEBOUNCE_MS);
}

function markDirtyAndSave() {
  _hasUnsyncedChanges = true;
  scheduleDriveSave();
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
  markDirtyAndSave();
}

/**
 * Drive 에 백업본이 있으면 가져와서 로컬 캐시에 머지/교체.
 * 정책: id 기준 머지 — 같은 id 는 updatedAt 더 큰 쪽 사용, 없는 id 는 추가.
 * 사용자가 다른 기기에서 작성한 아이디어를 잃지 않게.
 */
export async function pullIdeasFromDrive() {
  try {
    await ensureLoaded();
    if (!isTokenValid()) return { ok: false, reason: 'no-token' };
    let result;
    try {
      result = await loadIdeasFromDrive();
    } catch (err) {
      result = { ok: false, ideas: null, reason: 'failed', error: err?.message || String(err) };
    }

    // 조회 실패 — "원격에 없음"과 반드시 구분한다.
    // 실패를 '없음'으로 보고 dirty를 켜면, 다음 push가 로컬 캐시로 원격을 덮어써
    // 다른 기기에서 쓴 아이디어가 사라진다. 실패면 아무것도 하지 않고 다음 pull을 기다린다.
    // (백그라운드 동작이라 사용자에게 알리지 않고 조용히 재시도를 기다린다.)
    const outcome = classifyIdeasPull(result);
    if (outcome === PULL_FAILED) {
      if (shouldReportListFailure(result?.reason)) {
        reportError({
          source: 'ideasStore.pullIdeasFromDrive',
          message: `아이디어 노트 Drive 조회 실패: ${result?.error || result?.reason}`,
        })?.catch?.(() => {});
      }
      return { ok: false, reason: 'load-error', driveReason: result?.reason, error: result?.error };
    }

    const remote = result.ideas;
    if (!Array.isArray(remote)) {
      // Drive 파일 자체가 없음 → 로컬 캐시가 있다면 그게 곧 dirty.
      // 첫 사용 케이스든, 다른 기기가 아직 push 안 한 케이스든 push 해서 만들어줌.
      if (shouldMarkDirtyOnPull(outcome) && (_cache || []).length > 0) _hasUnsyncedChanges = true;
      return { ok: false, reason: 'no-remote' };
    }

    const remoteById = new Map(remote.filter((r) => r?.id).map((r) => [r.id, r]));
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

    // dirty 자동 감지 — 모듈 변수 _hasUnsyncedChanges 가 새로고침에 사라지므로
    // 매 pull 마다 로컬·리모트 비교로 재계산. 로컬에만 있거나(다른 기기가 못 본 것)
    // 로컬이 더 새것(편집 후 push 못한 것)이면 push 필요.
    for (const item of _cache) {
      if (!remoteById.has(item.id)) { _hasUnsyncedChanges = true; break; }
      const r = remoteById.get(item.id);
      if ((item.updatedAt || 0) > (r.updatedAt || 0)) { _hasUnsyncedChanges = true; break; }
    }

    _cache = Array.from(byId.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    notify();
    try { await setAll(IDB_KEY, _cache); } catch {}
    return { ok: true, added, updated };
  } finally {
    // pull 결과와 무관하게 settled 로 표시. dirty 가 감지되면 (자동 또는 편집으로)
    // scheduleDriveSave 가 처리 — 사용자의 수동저장 → 재연결 → pull 흐름에 자연스럽게 묻어감.
    _pullSettled = true;
    scheduleDriveSave();
  }
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
