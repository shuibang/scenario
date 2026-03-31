/**
 * v2 Selectors
 * ─────────────────────────────────────────────────────────────
 * All derived / computed data lives here. Never store derived data in entities.
 * Each selector is a pure function of state.
 *
 * Usage: import { sel } from './selectors.js'; const eps = sel.episodes(state, projectId);
 */

// ─── Entity accessors ────────────────────────────────────────────────────────

/** All projects, sorted by createdAt */
export function projects(state) {
  return state.entities.projects.ids
    .map(id => state.entities.projects.byId[id])
    .sort((a, b) => a.createdAt > b.createdAt ? 1 : -1);
}

/** Episodes for a project, sorted by number */
export function episodesByProject(state, projectId) {
  if (!projectId) return [];
  return state.entities.episodes.ids
    .map(id => state.entities.episodes.byId[id])
    .filter(e => e.projectId === projectId)
    .sort((a, b) => a.number - b.number);
}

/** Single episode by ID */
export function episodeById(state, id) {
  return state.entities.episodes.byId[id] ?? null;
}

/** Characters for a project, sorted by role then name */
const ROLE_ORDER = { lead: 0, support: 1, extra: 2 };
export function charactersByProject(state, projectId) {
  if (!projectId) return [];
  return state.entities.characters.ids
    .map(id => state.entities.characters.byId[id])
    .filter(c => c.projectId === projectId)
    .sort((a, b) => {
      const rd = (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3);
      if (rd !== 0) return rd;
      return (a.givenName || a.name || '').localeCompare(b.givenName || b.name || '');
    });
}

/** Single character by ID */
export function characterById(state, id) {
  return state.entities.characters.byId[id] ?? null;
}

/** Display name for a character (givenName preferred) */
export function characterDisplayName(char) {
  if (!char) return '';
  return char.givenName || char.name || '';
}

/** Scenes for an episode, sorted by sceneSeq */
export function scenesByEpisode(state, episodeId) {
  if (!episodeId) return [];
  return state.entities.scenes.ids
    .map(id => state.entities.scenes.byId[id])
    .filter(s => s.episodeId === episodeId)
    .sort((a, b) => a.sceneSeq - b.sceneSeq);
}

/** Single scene by ID */
export function sceneById(state, id) {
  return state.entities.scenes.byId[id] ?? null;
}

/** Script blocks for an episode, in their stored order */
export function scriptBlocksByEpisode(state, episodeId) {
  if (!episodeId) return [];
  // Blocks are stored in insertion order (SET_BLOCKS replaces all for an episode)
  return state.entities.scriptBlocks.ids
    .map(id => state.entities.scriptBlocks.byId[id])
    .filter(b => b.episodeId === episodeId);
}

/** Cover doc for a project */
export function coverDocByProject(state, projectId) {
  return state.entities.coverDocs.ids
    .map(id => state.entities.coverDocs.byId[id])
    .find(d => d.projectId === projectId) ?? null;
}

/** Synopsis doc for a project */
export function synopsisDocByProject(state, projectId) {
  return state.entities.synopsisDocs.ids
    .map(id => state.entities.synopsisDocs.byId[id])
    .find(d => d.projectId === projectId) ?? null;
}

/** Treatment items for an episode, sorted by order */
export function treatmentItemsByEpisode(state, episodeId) {
  if (!episodeId) return [];
  return state.entities.treatmentItems.ids
    .map(id => state.entities.treatmentItems.byId[id])
    .filter(t => t.episodeId === episodeId)
    .sort((a, b) => a.order - b.order);
}

/** Resources for a project */
export function resourcesByProject(state, projectId) {
  if (!projectId) return [];
  return state.entities.resources.ids
    .map(id => state.entities.resources.byId[id])
    .filter(r => r.projectId === projectId);
}

// ─── Derived / computed ───────────────────────────────────────────────────────

/** Count of scenes in an episode */
export function sceneCount(state, episodeId) {
  return scenesByEpisode(state, episodeId).length;
}

/** Count of dialogue blocks in an episode */
export function dialogueCount(state, episodeId) {
  return scriptBlocksByEpisode(state, episodeId).filter(b => b.type === 'dialogue').length;
}

/** Active project object */
export function activeProject(state) {
  return state.entities.projects.byId[state.ui.activeProjectId] ?? null;
}

/** Active episode object */
export function activeEpisode(state) {
  return state.entities.episodes.byId[state.ui.activeEpisodeId] ?? null;
}

/** Characters appearing in a specific scene (via scene.characterIds) */
export function charactersInScene(state, sceneId) {
  const scene = sceneById(state, sceneId);
  if (!scene?.characterIds?.length) return [];
  return scene.characterIds
    .map(id => state.entities.characters.byId[id])
    .filter(Boolean);
}

/** Scenes for an episode annotated with their characters (for scene list view) */
export function scenesWithCharacters(state, episodeId) {
  return scenesByEpisode(state, episodeId).map(scene => ({
    ...scene,
    characters: charactersInScene(state, scene.id),
  }));
}

/**
 * Find the scene that contains the given block (by sceneId on scene_number block,
 * then walk backwards to find the last scene_number before the block)
 */
export function sceneForBlock(state, blockId) {
  const block = state.entities.scriptBlocks.byId[blockId];
  if (!block) return null;
  if (block.type === 'scene_number') return sceneById(state, block.sceneId);

  const blocks = scriptBlocksByEpisode(state, block.episodeId);
  const idx = blocks.findIndex(b => b.id === blockId);
  for (let i = idx - 1; i >= 0; i--) {
    if (blocks[i].type === 'scene_number') return sceneById(state, blocks[i].sceneId);
  }
  return null;
}

// Bundle as `sel` for convenient import
export const sel = {
  projects,
  episodesByProject,
  episodeById,
  charactersByProject,
  characterById,
  characterDisplayName,
  scenesByEpisode,
  sceneById,
  scriptBlocksByEpisode,
  coverDocByProject,
  synopsisDocByProject,
  treatmentItemsByEpisode,
  resourcesByProject,
  sceneCount,
  dialogueCount,
  activeProject,
  activeEpisode,
  charactersInScene,
  scenesWithCharacters,
  sceneForBlock,
};
