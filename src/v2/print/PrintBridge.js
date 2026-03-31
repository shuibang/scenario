/**
 * v2 PrintBridge
 * ─────────────────────────────────────────────────────────────
 * Converts v2 normalized state → v1-compatible appState format,
 * then delegates to the existing v1 print pipeline.
 *
 * This is a temporary bridge for Phase 5 (PDF-first).
 * Phase 6 will replace this with a native v2 print pipeline.
 */
import { sel } from '../store/selectors.js';

/**
 * Convert v2 state to the appState shape expected by v1 printPdf/printDocx/hwpxBuilder.
 * @param {object} v2State - v2 store state
 * @returns {object} v1-compatible appState
 */
export function v2StateToV1AppState(v2State) {
  const { entities, settings, ui } = v2State;

  // Flatten normalized collections back to arrays
  const toArray = (col) => col.ids.map(id => col.byId[id]);

  const projects     = toArray(entities.projects);
  const episodes     = toArray(entities.episodes);
  const characters   = toArray(entities.characters);
  const scenes       = toArray(entities.scenes);
  const scriptBlocks = toArray(entities.scriptBlocks);
  const coverDocs    = toArray(entities.coverDocs);
  const synopsisDocs = toArray(entities.synopsisDocs);
  const resources    = toArray(entities.resources);

  return {
    // Core entities (array format, v1 compatible)
    projects,
    episodes,
    characters,
    scenes,
    scriptBlocks,
    coverDocs,
    synopsisDocs,
    resources,

    // UI state
    activeProjectId: ui.activeProjectId,
    activeEpisodeId: ui.activeEpisodeId,

    // Style preset
    stylePreset: settings.stylePreset,
    initialized: v2State.meta.initialized,
  };
}

/**
 * Build a print selection object for v1 exportPdf/exportDocx.
 * By default, selects all episodes for the active project.
 */
export function buildPrintSelection(v2State, overrides = {}) {
  const { ui } = v2State;
  const projectId = ui.activeProjectId;
  if (!projectId) return null;

  const episodes = sel.episodesByProject(v2State, projectId);
  const epSelection = {};
  episodes.forEach(ep => { epSelection[ep.id] = true; });

  return {
    cover:    true,
    synopsis: true,
    episodes: epSelection,
    chars:    true,
    ...overrides,
  };
}
