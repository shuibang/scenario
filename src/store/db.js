const PREFIX = 'drama_';
const PUBLIC_PC_KEY = 'drama_publicPcMode';

// ─── 소형 설정값 (localStorage) ───────────────────────────────────────────────
export function isPublicPcMode() {
  try { return localStorage.getItem(PUBLIC_PC_KEY) === 'true'; } catch { return false; }
}

export const DB_KEYS = {
  projects: 'projects',
  episodes: 'episodes',
  characters: 'characters',
  scenes: 'scenes',
  scriptBlocks: 'scriptBlocks',
  coverDocs: 'coverDocs',
  synopsisDocs: 'synopsisDocs',
  versions: 'versions',
  stylePresets: 'stylePresets',
  resources: 'resources',
  workTimeLogs: 'workTimeLogs',
  checklistItems: 'checklistItems',
  trash: 'trash',
};

export const getItem = (key) => {
  try { return JSON.parse(localStorage.getItem(PREFIX + key) || 'null'); }
  catch { return null; }
};

export const setItem = (key, value) => {
  if (isPublicPcMode()) return;
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch {}
};

// ─── 대형 배열 데이터 (IndexedDB — 사실상 무제한) ────────────────────────────
const IDB_NAME    = 'drama_workspace';
const IDB_VERSION = 1;
const IDB_STORE   = 'keyval';
const FONT_IDB_NAME    = 'drama_fonts_db';
const FONT_IDB_VERSION = 1;
const FONT_IDB_STORE   = 'fonts';

let _idb = null;

function openIDB() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = (e) => { _idb = e.target.result; resolve(_idb); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

export const getAll = async (key) => {
  try {
    const db = await openIDB();
    return await new Promise((resolve) => {
      const tx  = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror   = () => resolve([]);
    });
  } catch { return []; }
};

export const setAll = async (key, data) => {
  if (isPublicPcMode()) return;
  const db = await openIDB();
  await new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(data, key);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
    tx.onerror    = (e) => reject(e.target.error);
  });
};

// ─── localStorage → IndexedDB 1회 마이그레이션 ────────────────────────────────
// 기존 사용자 데이터를 IDB로 옮기고 LS 쪽 대형 키는 정리
const LARGE_KEYS = ['projects','episodes','characters','scenes','scriptBlocks',
                    'coverDocs','synopsisDocs','resources','workTimeLogs','checklistItems'];

export const migrateFromLocalStorage = async () => {
  if (localStorage.getItem('drama_idb_v1')) return; // 이미 완료
  for (const key of LARGE_KEYS) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length > 0) {
        await setAll(key, data);
      }
      // 마이그레이션 후 LS에서 제거 (용량 확보)
      localStorage.removeItem(PREFIX + key);
    } catch {}
  }
  localStorage.setItem('drama_idb_v1', '1');
};

// ─── 전체 삭제 (공용 PC 로그아웃 등) ─────────────────────────────────────────
export async function clearDramaStorage() {
  let preservedPublicPc = null;
  try {
    preservedPublicPc = localStorage.getItem(PUBLIC_PC_KEY);
  } catch {}

  try { localStorage.clear(); } catch {}

  try {
    if (preservedPublicPc !== null) {
      localStorage.setItem(PUBLIC_PC_KEY, preservedPublicPc);
    }
  } catch {}

  try { sessionStorage.clear(); } catch {}

  try {
    const db = await openIDB();
    await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror    = resolve;
      tx.onabort    = resolve;
    });
    try { db.close(); } catch {}
  } catch {}
  _idb = null;

  try {
    const fontDb = await new Promise((resolve, reject) => {
      const req = indexedDB.open(FONT_IDB_NAME, FONT_IDB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(FONT_IDB_STORE)) {
          db.createObjectStore(FONT_IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });

    await new Promise((resolve) => {
      try {
        const tx = fontDb.transaction(FONT_IDB_STORE, 'readwrite');
        tx.objectStore(FONT_IDB_STORE).clear();
        tx.oncomplete = resolve;
        tx.onerror    = resolve;
        tx.onabort    = resolve;
      } catch {
        resolve();
      }
    });

    try { fontDb.close(); } catch {}
  } catch {}
}

export const genId = () => crypto.randomUUID();

export const now = () => Date.now();

// 하위 호환 (App.jsx 등에서 직접 호출하는 곳 없음, 보전용)
export const clearAll = () => {
  Object.values(DB_KEYS).forEach(key => localStorage.removeItem(PREFIX + key));
};
