/**
 * v2 Normalized State Schema
 * ─────────────────────────────────────────────────────────────
 * All entity collections: { ids: string[], byId: {[id]: Entity} }
 * UI state: not persisted
 * Settings: persisted separately (single object, not a collection)
 */
import { DEFAULT_STYLE_PRESET } from '../domain/types.js';

export const SCHEMA_VERSION = 2;

// ─── Normalized collection helpers ──────────────────────────────────────────
export function emptyCollection() {
  return { ids: [], byId: {} };
}

export function addToCollection(col, entity) {
  if (col.byId[entity.id]) {
    // Update existing
    return { ids: col.ids, byId: { ...col.byId, [entity.id]: entity } };
  }
  return { ids: [...col.ids, entity.id], byId: { ...col.byId, [entity.id]: entity } };
}

export function updateInCollection(col, id, updates) {
  if (!col.byId[id]) return col;
  return { ...col, byId: { ...col.byId, [id]: { ...col.byId[id], ...updates } } };
}

export function removeFromCollection(col, id) {
  const { [id]: _removed, ...rest } = col.byId;
  return { ids: col.ids.filter(i => i !== id), byId: rest };
}

export function replaceInCollection(col, id, entity) {
  if (!col.byId[id]) return addToCollection(col, entity);
  return { ...col, byId: { ...col.byId, [id]: entity } };
}

// ─── Initial state ────────────────────────────────────────────────────────
export function makeInitialState() {
  return {
    schemaVersion: SCHEMA_VERSION,

    // ── Entity collections (persisted) ──────────────────────────────────
    entities: {
      projects:       emptyCollection(),
      episodes:       emptyCollection(),
      characters:     emptyCollection(),
      scenes:         emptyCollection(),
      scriptBlocks:   emptyCollection(),
      treatmentItems: emptyCollection(),
      coverDocs:      emptyCollection(),
      synopsisDocs:   emptyCollection(),
      resources:      emptyCollection(),
      workTimeLogs:   emptyCollection(),
      sceneListRows:  emptyCollection(),  // Phase 4: SceneListRow, keyed by id, linked by sceneId
    },

    // ── Settings (persisted, single object) ─────────────────────────────
    settings: {
      stylePreset: DEFAULT_STYLE_PRESET,
    },

    // ── UI state (not persisted) ─────────────────────────────────────────
    ui: {
      activeProjectId:   null,
      activeEpisodeId:   null,
      activeDoc:         'cover',   // 'cover'|'synopsis'|'script'|'characters'|...
      selectedCharacterId: null,
      selectedSceneId:   null,
      saveStatus:        'idle',    // 'idle'|'dirty'|'saving'|'saved'|'error'
      saveError:         null,
      scrollToSceneId:   null,
    },

    // ── Meta ─────────────────────────────────────────────────────────────
    meta: {
      initialized: false,
      lastSavedAt: null,
    },
  };
}
