const PREFIX = 'drama_';
const PUBLIC_PC_KEY = 'drama_publicPcMode';

export function isPublicPcMode() {
  try { return localStorage.getItem(PUBLIC_PC_KEY) === 'true'; } catch { return false; }
}

export function clearDramaStorage() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch {}
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
};

export const getAll = (key) => {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + key) || '[]');
  } catch {
    return [];
  }
};

export const setAll = (key, data) => {
  if (isPublicPcMode()) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(data));
  } catch (e) {
    console.error('[db] 저장 실패:', key, e);
    throw e;
  }
};

export const getItem = (key) => {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + key) || 'null');
  } catch {
    return null;
  }
};

export const setItem = (key, value) => {
  if (isPublicPcMode()) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error('[db] 저장 실패:', key, e);
  }
};

export const genId = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

export const now = () => Date.now();

export const clearAll = () => {
  Object.values(DB_KEYS).forEach(key => localStorage.removeItem(PREFIX + key));
};
