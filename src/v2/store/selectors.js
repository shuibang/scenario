/**
 * v2 Selectors — Phase 4 extended
 * ─────────────────────────────────────────────────────────────
 * ALL derived / computed data lives here.
 * Never store derived data in entities.
 * Canonical data flow:
 *   ScriptBlock → Scene → OutlineItem, SceneListRow (joined), Character aggregation
 *
 * Phase 4 additions:
 *   - outlineByEpisode (Scene-derived, no separate storage)
 *   - sceneLabel (formatting utility)
 *   - sceneListRowsByEpisode (Scene + SceneListRow joined)
 *   - speakerCharacterIdsForScene (derived from dialogue blocks)
 *   - canonicalCharacterIdsForScene (scene.characterIds union dialogue speakers)
 *   - characterAggregation (sceneCount, dialogueCount, sceneList)
 *   - sceneListRowBySceneId
 */

// ─── Entity accessors ────────────────────────────────────────────────────────

export function projects(state) {
  return state.entities.projects.ids
    .map(id => state.entities.projects.byId[id])
    .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
}

export function episodesByProject(state, projectId) {
  if (!projectId) return [];
  return state.entities.episodes.ids
    .map(id => state.entities.episodes.byId[id])
    .filter(e => e.projectId === projectId)
    .sort((a, b) => a.number - b.number);
}

export function episodeById(state, id) {
  return state.entities.episodes.byId[id] ?? null;
}

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

export function characterById(state, id) {
  return state.entities.characters.byId[id] ?? null;
}

export function characterDisplayName(char) {
  if (!char) return '';
  return char.givenName || char.name || '';
}

export function scenesByEpisode(state, episodeId) {
  if (!episodeId) return [];
  return state.entities.scenes.ids
    .map(id => state.entities.scenes.byId[id])
    .filter(s => s.episodeId === episodeId)
    .sort((a, b) => a.sceneSeq - b.sceneSeq);
}

export function sceneById(state, id) {
  return state.entities.scenes.byId[id] ?? null;
}

export function scriptBlocksByEpisode(state, episodeId) {
  if (!episodeId) return [];
  return state.entities.scriptBlocks.ids
    .map(id => state.entities.scriptBlocks.byId[id])
    .filter(b => b.episodeId === episodeId);
}

export function coverDocByProject(state, projectId) {
  return state.entities.coverDocs.ids
    .map(id => state.entities.coverDocs.byId[id])
    .find(d => d.projectId === projectId) ?? null;
}

export function synopsisDocByProject(state, projectId) {
  return state.entities.synopsisDocs.ids
    .map(id => state.entities.synopsisDocs.byId[id])
    .find(d => d.projectId === projectId) ?? null;
}

export function treatmentItemsByEpisode(state, episodeId) {
  if (!episodeId) return [];
  return state.entities.treatmentItems.ids
    .map(id => state.entities.treatmentItems.byId[id])
    .filter(t => t.episodeId === episodeId)
    .sort((a, b) => a.order - b.order);
}

export function resourcesByProject(state, projectId) {
  if (!projectId) return [];
  return state.entities.resources.ids
    .map(id => state.entities.resources.byId[id])
    .filter(r => r.projectId === projectId);
}

// ─── Phase 4: Scene label formatting ─────────────────────────────────────────

/**
 * Format a scene's full display label.
 * Pattern: `S#n. 특수상황) 장소 - 세부장소 (시간대)`
 * Omit: 특수상황) if empty, ` - 세부장소` if empty, `(시간대)` if empty.
 */
export function sceneLabel(scene) {
  if (!scene) return '';
  const parts = [];
  if (scene.specialSituation) parts.push(`${scene.specialSituation})`);
  if (scene.location)         parts.push(scene.location);
  if (scene.subLocation)      parts.push(`- ${scene.subLocation}`);
  if (scene.timeOfDay)        parts.push(`(${scene.timeOfDay})`);
  const body = parts.join(' ');
  return body ? `${scene.label || ''} ${body}`.trim() : (scene.label || scene.content || '');
}

/**
 * Short scene label (without S#n. prefix) — for display in lists.
 * Falls back to content (legacy), then empty string.
 */
export function sceneLabelShort(scene) {
  if (!scene) return '';
  const parts = [];
  if (scene.specialSituation) parts.push(`${scene.specialSituation})`);
  if (scene.location)         parts.push(scene.location);
  if (scene.subLocation)      parts.push(`- ${scene.subLocation}`);
  if (scene.timeOfDay)        parts.push(`(${scene.timeOfDay})`);
  return parts.join(' ') || scene.content || '';
}

// ─── Phase 4: Outline selector ───────────────────────────────────────────────

/**
 * OutlineItem — derived entirely from Scene, no separate storage.
 * @typedef {Object} OutlineItem
 * @property {ID} sceneId
 * @property {number} sceneSeq
 * @property {string} label           — "S#n."
 * @property {string} displayLabel    — full formatted label
 * @property {string} shortLabel      — without "S#n." prefix
 * @property {string} specialSituation
 * @property {string} location
 * @property {string} subLocation
 * @property {string} timeOfDay
 * @property {string} status
 * @property {string[]} tags
 * @property {ID[]} characterIds
 * @property {ID} episodeId
 */

/**
 * Returns ordered outline items for an episode.
 * Source of truth: Scene entities (sorted by sceneSeq).
 * Zero external storage needed.
 */
export function outlineByEpisode(state, episodeId) {
  return scenesByEpisode(state, episodeId).map(scene => ({
    sceneId:          scene.id,
    sceneSeq:         scene.sceneSeq,
    label:            scene.label || `S#${scene.sceneSeq}.`,
    displayLabel:     sceneLabel(scene),
    shortLabel:       sceneLabelShort(scene),
    specialSituation: scene.specialSituation || '',
    location:         scene.location || '',
    subLocation:      scene.subLocation || '',
    timeOfDay:        scene.timeOfDay || '',
    status:           scene.status || 'draft',
    tags:             scene.tags || [],
    characterIds:     scene.characterIds || [],
    episodeId:        scene.episodeId,
  }));
}

// ─── Phase 4: Speaker character IDs derived from dialogue blocks ──────────────

/**
 * Compute which characters speak in a given scene,
 * derived purely from dialogue blocks in the block list.
 *
 * Algorithm: scan blocks for the episode; group dialogue blocks
 * under the last preceding scene_number block (by sceneId).
 * Returns deduplicated characterId array.
 */
export function speakerCharacterIdsForScene(state, sceneId) {
  const scene = sceneById(state, sceneId);
  if (!scene) return [];

  const blocks = scriptBlocksByEpisode(state, scene.episodeId);
  const ids = new Set();
  let inTargetScene = false;

  for (const b of blocks) {
    if (b.type === 'scene_number') {
      inTargetScene = b.sceneId === sceneId;
      continue;
    }
    if (inTargetScene && b.type === 'dialogue' && b.characterId) {
      ids.add(b.characterId);
    }
  }
  return [...ids];
}

/**
 * Canonical characterIds for a scene =
 * scene.characterIds (manually set via 등장체크) ∪ derived dialogue speakers.
 * Guaranteed: no duplicates, no deleted characters.
 */
export function canonicalCharacterIdsForScene(state, sceneId) {
  const scene = sceneById(state, sceneId);
  if (!scene) return [];
  const manual   = scene.characterIds || [];
  const speakers = speakerCharacterIdsForScene(state, sceneId);
  const combined = new Set([...manual, ...speakers]);
  // Filter out characters that no longer exist
  const allChars = state.entities.characters.byId;
  return [...combined].filter(id => !!allChars[id]);
}

// ─── Phase 4: Scene list rows ─────────────────────────────────────────────────

/**
 * Get a single SceneListRow for a scene (if it exists).
 */
export function sceneListRowBySceneId(state, sceneId) {
  if (!state.entities.sceneListRows) return null;
  return state.entities.sceneListRows.ids
    .map(id => state.entities.sceneListRows.byId[id])
    .find(r => r.sceneId === sceneId) ?? null;
}

/**
 * FullSceneListRow — Scene metadata joined with editable row content.
 * @typedef {Object} FullSceneListRow
 * @property {ID} sceneId
 * @property {number} sceneSeq
 * @property {string} label            — "S#n."
 * @property {string} displayLabel     — full formatted label
 * @property {string} specialSituation
 * @property {string} location
 * @property {string} subLocation
 * @property {string} timeOfDay
 * @property {string} status
 * @property {ID[]} characterIds       — canonical (manual + dialogue speakers)
 * @property {string} content          — user-editable (from SceneListRow)
 * @property {string} note             — user-editable (from SceneListRow)
 * @property {ID|null} rowId           — SceneListRow.id (null if no row created yet)
 */

/**
 * Returns all scene list rows for an episode, joined with Scene metadata.
 * Source: Scene (ordered by sceneSeq) joined with SceneListRow by sceneId.
 * Derived columns (location, characters) come from Scene only.
 */
export function sceneListRowsByEpisode(state, episodeId) {
  return scenesByEpisode(state, episodeId).map(scene => {
    const row = sceneListRowBySceneId(state, scene.id);
    return {
      sceneId:          scene.id,
      sceneSeq:         scene.sceneSeq,
      label:            scene.label || `S#${scene.sceneSeq}.`,
      displayLabel:     sceneLabel(scene),
      specialSituation: scene.specialSituation || '',
      location:         scene.location || '',
      subLocation:      scene.subLocation || '',
      timeOfDay:        scene.timeOfDay || '',
      status:           scene.status || 'draft',
      characterIds:     canonicalCharacterIdsForScene(state, scene.id),
      // Editable columns from SceneListRow:
      content:          row?.content ?? '',
      note:             row?.note    ?? '',
      rowId:            row?.id      ?? null,
    };
  });
}

// ─── Phase 4: Character aggregation ──────────────────────────────────────────

/**
 * CharacterAggregation — computed across all episodes in a project.
 * @typedef {Object} CharacterAggregation
 * @property {number} sceneCount      — number of distinct scenes with this character
 * @property {number} dialogueCount   — number of dialogue blocks by this character
 * @property {SceneRef[]} scenes      — list of scenes (with episode context), sorted
 */

/**
 * Compute aggregation for a single character across a whole project.
 * - sceneCount: scenes where canonicalCharacterIds includes this characterId
 * - dialogueCount: dialogue blocks where characterId matches
 * - scenes: list of scene references (sceneId, episodeId, episodeNumber, label)
 */
export function characterAggregation(state, characterId, projectId) {
  if (!characterId || !projectId) return { sceneCount: 0, dialogueCount: 0, scenes: [] };

  const episodes = episodesByProject(state, projectId);
  const sceneRefs = [];
  let dialogueCount = 0;

  for (const ep of episodes) {
    const epScenes = scenesByEpisode(state, ep.id);
    const blocks   = scriptBlocksByEpisode(state, ep.id);

    for (const scene of epScenes) {
      const charIds = canonicalCharacterIdsForScene(state, scene.id);
      if (charIds.includes(characterId)) {
        sceneRefs.push({
          sceneId:       scene.id,
          episodeId:     ep.id,
          episodeNumber: ep.number,
          sceneSeq:      scene.sceneSeq,
          label:         scene.label || `S#${scene.sceneSeq}.`,
          displayLabel:  sceneLabel(scene),
        });
      }
    }

    // Count dialogue blocks
    for (const b of blocks) {
      if (b.type === 'dialogue' && b.characterId === characterId) {
        dialogueCount++;
      }
    }
  }

  // Sort by episode number then scene sequence
  sceneRefs.sort((a, b) =>
    a.episodeNumber !== b.episodeNumber
      ? a.episodeNumber - b.episodeNumber
      : a.sceneSeq - b.sceneSeq
  );

  return {
    sceneCount:    sceneRefs.length,
    dialogueCount,
    scenes:        sceneRefs,
  };
}

/**
 * Compute aggregation for all characters in a project.
 * Returns Map<characterId, CharacterAggregation>.
 */
export function allCharacterAggregations(state, projectId) {
  const chars = charactersByProject(state, projectId);
  const map   = new Map();
  for (const c of chars) {
    map.set(c.id, characterAggregation(state, c.id, projectId));
  }
  return map;
}

// ─── Simple derived ───────────────────────────────────────────────────────────

export function sceneCount(state, episodeId) {
  return scenesByEpisode(state, episodeId).length;
}

export function dialogueCount(state, episodeId) {
  return scriptBlocksByEpisode(state, episodeId).filter(b => b.type === 'dialogue').length;
}

export function activeProject(state) {
  return state.entities.projects.byId[state.ui.activeProjectId] ?? null;
}

export function activeEpisode(state) {
  return state.entities.episodes.byId[state.ui.activeEpisodeId] ?? null;
}

export function charactersInScene(state, sceneId) {
  const ids = canonicalCharacterIdsForScene(state, sceneId);
  return ids.map(id => state.entities.characters.byId[id]).filter(Boolean);
}

export function scenesWithCharacters(state, episodeId) {
  return scenesByEpisode(state, episodeId).map(scene => ({
    ...scene,
    characters: charactersInScene(state, scene.id),
  }));
}

/**
 * Walk block list to find which scene a given block belongs to.
 * Returns the Scene entity or null.
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

/**
 * Derive speaker characterIds per scene from a block list (used at flush time).
 * Returns Map<sceneId, Set<characterId>>.
 * NOTE: This is a pure function of a block array, not of state — used in EditorCore flush.
 */
export function deriveSpeakersFromBlocks(blocks) {
  const map = new Map(); // sceneId → Set<charId>
  let currentSceneId = null;

  for (const b of blocks) {
    if (b.type === 'scene_number') {
      currentSceneId = b.sceneId;
      if (currentSceneId && !map.has(currentSceneId)) {
        map.set(currentSceneId, new Set());
      }
    } else if (b.type === 'dialogue' && b.characterId && currentSceneId) {
      map.get(currentSceneId)?.add(b.characterId);
    }
  }
  return map;
}

// ─── Export bundle ────────────────────────────────────────────────────────────
export const sel = {
  // Entity accessors
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

  // Formatting
  sceneLabel,
  sceneLabelShort,

  // Phase 4: Outline (derived, no storage)
  outlineByEpisode,

  // Phase 4: Scene list rows (Scene + SceneListRow joined)
  sceneListRowBySceneId,
  sceneListRowsByEpisode,

  // Phase 4: Scene character tags (derived from dialogue + manual)
  speakerCharacterIdsForScene,
  canonicalCharacterIdsForScene,
  deriveSpeakersFromBlocks,

  // Phase 4: Character aggregation
  characterAggregation,
  allCharacterAggregations,

  // Simple derived
  sceneCount,
  dialogueCount,
  activeProject,
  activeEpisode,
  charactersInScene,
  scenesWithCharacters,
  sceneForBlock,
};
