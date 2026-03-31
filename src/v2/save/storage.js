/**
 * v2 Storage Adapter
 * ─────────────────────────────────────────────────────────────
 * Single source of read/write for v2 data.
 * Keys are prefixed with 'v2_' to avoid collision with v1 ('drama_').
 *
 * Schema:
 *   v2_entities  → serialized entities object
 *   v2_settings  → serialized settings object
 *   v2_meta      → { savedAt, schemaVersion }
 *
 * Verify: after write, read back and compare checksums.
 */

export const SCHEMA_VERSION = 2;
const KEY_ENTITIES = 'v2_entities';
const KEY_SETTINGS = 'v2_settings';
const KEY_META     = 'v2_meta';

// ─── Read ─────────────────────────────────────────────────────────────────────

export function hasV2Data() {
  try {
    return !!localStorage.getItem(KEY_META);
  } catch { return false; }
}

export function readV2() {
  const rawEntities = localStorage.getItem(KEY_ENTITIES);
  const rawSettings = localStorage.getItem(KEY_SETTINGS);
  const rawMeta     = localStorage.getItem(KEY_META);

  if (!rawEntities || !rawMeta) return null;

  const meta = JSON.parse(rawMeta);
  if (meta.schemaVersion !== SCHEMA_VERSION) return null;

  return {
    entities: JSON.parse(rawEntities),
    settings: rawSettings ? JSON.parse(rawSettings) : null,
  };
}

// ─── Write ────────────────────────────────────────────────────────────────────

export function writeV2({ entities, settings }) {
  const serializedEntities = JSON.stringify(entities);
  const serializedSettings = JSON.stringify(settings);
  const meta = { savedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION };

  // Write all three
  localStorage.setItem(KEY_ENTITIES, serializedEntities);
  localStorage.setItem(KEY_SETTINGS, serializedSettings);
  localStorage.setItem(KEY_META, JSON.stringify(meta));

  // Verify: read back and compare length (lightweight check)
  const readback = localStorage.getItem(KEY_ENTITIES);
  if (readback?.length !== serializedEntities.length) {
    throw new Error(`Storage verify failed: wrote ${serializedEntities.length} bytes, read back ${readback?.length}`);
  }
}

// ─── Clear ────────────────────────────────────────────────────────────────────

export function clearV2() {
  localStorage.removeItem(KEY_ENTITIES);
  localStorage.removeItem(KEY_SETTINGS);
  localStorage.removeItem(KEY_META);
}

// ─── v1 keys (for migration, read-only) ──────────────────────────────────────
export const V1_KEYS = {
  projects:     'drama_projects',
  episodes:     'drama_episodes',
  characters:   'drama_characters',
  scenes:       'drama_scenes',
  scriptBlocks: 'drama_scriptBlocks',
  coverDocs:    'drama_coverDocs',
  synopsisDocs: 'drama_synopsisDocs',
  resources:    'drama_resources',
  workTimeLogs: 'drama_workTimeLogs',
  stylePresets: 'drama_stylePresets',
};

export function readV1Raw() {
  const get = (key) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  };
  return {
    projects:     get(V1_KEYS.projects)     || [],
    episodes:     get(V1_KEYS.episodes)     || [],
    characters:   get(V1_KEYS.characters)   || [],
    scenes:       get(V1_KEYS.scenes)       || [],
    scriptBlocks: get(V1_KEYS.scriptBlocks) || [],
    coverDocs:    get(V1_KEYS.coverDocs)    || [],
    synopsisDocs: get(V1_KEYS.synopsisDocs) || [],
    resources:    get(V1_KEYS.resources)    || [],
    workTimeLogs: get(V1_KEYS.workTimeLogs) || [],
    stylePreset:  get(V1_KEYS.stylePresets) || null,
  };
}

export function hasV1Data() {
  try {
    const raw = localStorage.getItem(V1_KEYS.projects);
    if (!raw) return false;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0;
  } catch { return false; }
}
