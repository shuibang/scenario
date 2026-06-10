/**
 * FileSystemDirectoryHandle를 IndexedDB에 영속 저장.
 * 구조화 클론 알고리즘으로 직렬화되므로 별도 직렬화 없이 put/get 가능.
 */

const IDB_NAME    = 'drama_fs_handles';
const IDB_VERSION = 1;
const STORE       = 'handles';
const FOLDER_KEY  = 'local_folder';

async function openHandleIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

export async function getLocalFolderHandle() {
  try {
    const db = await openHandleIDB();
    return await new Promise((resolve) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(FOLDER_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => resolve(null);
    });
  } catch { return null; }
}

export async function setLocalFolderHandle(handle) {
  try {
    const db = await openHandleIDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(handle, FOLDER_KEY);
      tx.oncomplete = resolve;
      tx.onerror    = (e) => reject(e.target.error);
    });
  } catch {}
}

export async function clearLocalFolderHandle() {
  try {
    const db = await openHandleIDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(FOLDER_KEY);
      tx.oncomplete = resolve;
      tx.onerror    = resolve;
    });
  } catch {}
}

/** 폴더 handle의 read 권한 확인/요청. 없으면 false. */
export async function verifyReadPermission(handle) {
  try {
    const opts = { mode: 'read' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if ((await handle.requestPermission(opts)) === 'granted') return true;
    return false;
  } catch { return false; }
}

/** 폴더 내 .djs 파일 목록 (최신 수정일 순) */
export async function listDjsFiles(dirHandle) {
  const files = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file' && name.toLowerCase().endsWith('.djs')) {
      try {
        const file = await handle.getFile();
        files.push({ name, handle, lastModified: file.lastModified });
      } catch {}
    }
  }
  return files.sort((a, b) => b.lastModified - a.lastModified);
}

/** File System Access API 지원 여부 */
export function isFsaSupported() {
  return typeof window.showDirectoryPicker === 'function';
}
