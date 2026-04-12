/**
 * fontStorage — IndexedDB storage for user-uploaded fonts.
 *
 * IndexedDB (not localStorage) is required because Korean font files
 * are typically 5–20 MB, which exceeds localStorage quota.
 *
 * Metadata (name, format, size, isDefault) is stored in localStorage
 * for fast access without opening IDB on every render.
 *
 * Usage:
 *   await storeFont(id, name, arrayBuffer)   — save font file
 *   await loadFontBuffer(id)                  — retrieve ArrayBuffer
 *   await removeFont(id)                      — delete from IDB
 *   loadFontMeta() / saveFontMeta(list)       — metadata (localStorage)
 */

const DB_NAME = 'drama_fonts_db';
const STORE   = 'fonts';
const META_KEY = 'drama_customFontsMeta';

// ─── IndexedDB helpers ────────────────────────────────────────────────────────
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => res(e.target.result);
    req.onerror   = (e) => rej(e.target.error);
  });
}

/** Store a font ArrayBuffer keyed by id. */
export async function storeFont(id, name, buffer) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put({ id, name, buffer });
  return new Promise((res, rej) => {
    tx.oncomplete = res;
    tx.onerror    = (e) => rej(e.target.error);
  });
}

/** Load a font's ArrayBuffer by id. Returns null if not found. */
export async function loadFontBuffer(id) {
  const db  = await openDB();
  const tx  = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).get(id);
  return new Promise((res, rej) => {
    req.onsuccess = (e) => res(e.target.result?.buffer ?? null);
    req.onerror   = (e) => rej(e.target.error);
  });
}

/** Remove a font from IDB by id. */
export async function removeFont(id) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  return new Promise((res, rej) => {
    tx.oncomplete = res;
    tx.onerror    = (e) => rej(e.target.error);
  });
}

// ─── Metadata (localStorage) ──────────────────────────────────────────────────
/**
 * FontMeta = { id, name, format, sizeBytes, isDefault, addedAt }
 */

export function loadFontMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveFontMeta(list) {
  localStorage.setItem(META_KEY, JSON.stringify(list));
}

// ─── Blob URL cache (session-scoped, for Font.register and preview) ───────────
const _blobUrlCache = new Map(); // id → blobUrl

export function getCachedBlobUrl(id) {
  return _blobUrlCache.get(id) ?? null;
}

export function setCachedBlobUrl(id, url) {
  _blobUrlCache.set(id, url);
}

export function revokeCachedBlobUrl(id) {
  const url = _blobUrlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    _blobUrlCache.delete(id);
  }
}

/**
 * loadFontAsUrl(id) → string (blob URL)
 * Loads font from IDB, creates a Blob URL, caches it for the session.
 * Returns null if font not found in IDB.
 */
export async function loadFontAsUrl(id) {
  const cached = getCachedBlobUrl(id);
  if (cached) return cached;

  const buffer = await loadFontBuffer(id);
  if (!buffer) return null;

  const blob = new Blob([buffer], { type: 'font/truetype' });
  const url  = URL.createObjectURL(blob);
  setCachedBlobUrl(id, url);
  return url;
}
