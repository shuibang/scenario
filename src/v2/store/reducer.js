/**
 * v2 Reducer
 * Pure function: (state, action) → state
 * Works on normalized state (see schema.js)
 */
import * as A from './actions.js';
import {
  makeInitialState,
  addToCollection, updateInCollection, removeFromCollection,
} from './schema.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function now() { return new Date().toISOString(); }

function ent(state) { return state.entities; }

// Recompute episode.number for all episodes in a project (sequential from 1)
function renumberEpisodes(entities, projectId) {
  const eps = entities.episodes.ids
    .map(id => entities.episodes.byId[id])
    .filter(e => e.projectId === projectId)
    .sort((a, b) => a.number - b.number);

  let byId = { ...entities.episodes.byId };
  eps.forEach((e, i) => {
    byId[e.id] = { ...e, number: i + 1 };
  });
  return { ...entities, episodes: { ...entities.episodes, byId } };
}

// ─── Reducer ─────────────────────────────────────────────────────────────────
export function reducer(state = makeInitialState(), action) {
  switch (action.type) {

    // ── Meta ──────────────────────────────────────────────────────────────────
    case A.INIT:
      return {
        ...state,
        entities: action.payload.entities ?? state.entities,
        settings: action.payload.settings ?? state.settings,
        meta: { ...state.meta, initialized: true },
      };

    // ── Projects ─────────────────────────────────────────────────────────────
    case A.ADD_PROJECT:
      return {
        ...state,
        entities: {
          ...ent(state),
          projects: addToCollection(ent(state).projects, action.payload),
        },
      };

    case A.UPDATE_PROJECT:
      return {
        ...state,
        entities: {
          ...ent(state),
          projects: updateInCollection(
            ent(state).projects, action.payload.id,
            { ...action.payload, updatedAt: now() }
          ),
        },
      };

    case A.DELETE_PROJECT: {
      const pid = action.id;
      const entities = ent(state);
      // Remove all entities belonging to this project
      function filterCol(col) {
        const ids = col.ids.filter(id => col.byId[id].projectId !== pid);
        const byId = Object.fromEntries(ids.map(id => [id, col.byId[id]]));
        return { ids, byId };
      }
      return {
        ...state,
        entities: {
          projects:       removeFromCollection(entities.projects, pid),
          episodes:       filterCol(entities.episodes),
          characters:     filterCol(entities.characters),
          scenes:         filterCol(entities.scenes),
          scriptBlocks:   filterCol(entities.scriptBlocks),
          treatmentItems: filterCol(entities.treatmentItems),
          coverDocs:      filterCol(entities.coverDocs),
          synopsisDocs:   filterCol(entities.synopsisDocs),
          resources:      filterCol(entities.resources),
          workTimeLogs:   filterCol(entities.workTimeLogs),
        },
        ui: state.ui.activeProjectId === pid
          ? { ...state.ui, activeProjectId: null, activeEpisodeId: null, activeDoc: 'cover' }
          : state.ui,
      };
    }

    // ── Episodes ─────────────────────────────────────────────────────────────
    case A.ADD_EPISODE:
      return {
        ...state,
        entities: {
          ...ent(state),
          episodes: addToCollection(ent(state).episodes, action.payload),
        },
      };

    case A.UPDATE_EPISODE:
      return {
        ...state,
        entities: {
          ...ent(state),
          episodes: updateInCollection(
            ent(state).episodes, action.payload.id,
            { ...action.payload, updatedAt: now() }
          ),
        },
      };

    case A.DELETE_EPISODE: {
      const eid = action.id;
      const ep = ent(state).episodes.byId[eid];
      if (!ep) return state;

      function filterByEp(col) {
        const ids = col.ids.filter(id => col.byId[id].episodeId !== eid);
        const byId = Object.fromEntries(ids.map(id => [id, col.byId[id]]));
        return { ids, byId };
      }

      const entities = {
        ...ent(state),
        episodes:       removeFromCollection(ent(state).episodes, eid),
        scenes:         filterByEp(ent(state).scenes),
        scriptBlocks:   filterByEp(ent(state).scriptBlocks),
        treatmentItems: filterByEp(ent(state).treatmentItems),
      };

      return {
        ...state,
        entities: renumberEpisodes(entities, ep.projectId),
        ui: state.ui.activeEpisodeId === eid
          ? { ...state.ui, activeEpisodeId: null, activeDoc: 'cover' }
          : state.ui,
      };
    }

    // ── Characters ────────────────────────────────────────────────────────────
    case A.ADD_CHARACTER:
      return {
        ...state,
        entities: {
          ...ent(state),
          characters: addToCollection(ent(state).characters, action.payload),
        },
      };

    case A.UPDATE_CHARACTER:
      return {
        ...state,
        entities: {
          ...ent(state),
          characters: updateInCollection(
            ent(state).characters, action.payload.id, action.payload
          ),
        },
      };

    case A.DELETE_CHARACTER:
      return {
        ...state,
        entities: {
          ...ent(state),
          characters: removeFromCollection(ent(state).characters, action.id),
        },
        ui: state.ui.selectedCharacterId === action.id
          ? { ...state.ui, selectedCharacterId: null }
          : state.ui,
      };

    // ── Scenes ────────────────────────────────────────────────────────────────
    case A.SYNC_SCENES: {
      // Replace all scenes for an episode
      const { episodeId, scenes } = action.payload;
      const others = ent(state).scenes.ids
        .map(id => ent(state).scenes.byId[id])
        .filter(s => s.episodeId !== episodeId);
      const all = [...others, ...scenes];
      return {
        ...state,
        entities: {
          ...ent(state),
          scenes: {
            ids: all.map(s => s.id),
            byId: Object.fromEntries(all.map(s => [s.id, s])),
          },
        },
      };
    }

    case A.UPDATE_SCENE:
      return {
        ...state,
        entities: {
          ...ent(state),
          scenes: updateInCollection(
            ent(state).scenes, action.payload.id,
            { ...action.payload, updatedAt: now() }
          ),
        },
      };

    case A.DELETE_SCENE:
      return {
        ...state,
        entities: {
          ...ent(state),
          scenes: removeFromCollection(ent(state).scenes, action.id),
        },
      };

    // ── Script Blocks ─────────────────────────────────────────────────────────
    case A.SET_BLOCKS: {
      // Replace all blocks for an episode (atomic)
      const { episodeId, blocks } = action.payload;
      const others = ent(state).scriptBlocks.ids
        .map(id => ent(state).scriptBlocks.byId[id])
        .filter(b => b.episodeId !== episodeId);
      const all = [...others, ...blocks];
      return {
        ...state,
        entities: {
          ...ent(state),
          scriptBlocks: {
            ids: all.map(b => b.id),
            byId: Object.fromEntries(all.map(b => [b.id, b])),
          },
        },
        meta: { ...state.meta, lastSavedAt: now() },
      };
    }

    // ── Treatment ────────────────────────────────────────────────────────────
    case A.ADD_TREATMENT_ITEM:
      return {
        ...state,
        entities: {
          ...ent(state),
          treatmentItems: addToCollection(ent(state).treatmentItems, action.payload),
        },
      };

    case A.UPDATE_TREATMENT_ITEM:
      return {
        ...state,
        entities: {
          ...ent(state),
          treatmentItems: updateInCollection(
            ent(state).treatmentItems, action.payload.id,
            { ...action.payload, updatedAt: now() }
          ),
        },
      };

    case A.DELETE_TREATMENT_ITEM:
      return {
        ...state,
        entities: {
          ...ent(state),
          treatmentItems: removeFromCollection(ent(state).treatmentItems, action.id),
        },
      };

    case A.REORDER_TREATMENT_ITEMS: {
      // action.payload = { episodeId, orderedIds }
      const { episodeId, orderedIds } = action.payload;
      let byId = { ...ent(state).treatmentItems.byId };
      orderedIds.forEach((id, i) => {
        if (byId[id]?.episodeId === episodeId) byId[id] = { ...byId[id], order: i };
      });
      const allIds = ent(state).treatmentItems.ids;
      return {
        ...state,
        entities: {
          ...ent(state),
          treatmentItems: { ids: allIds, byId },
        },
      };
    }

    case A.IMPORT_TREATMENT: {
      // Atomic: add scenes + blocks, mark treatment items as imported
      const { episodeId, newScenes, newBlocks, itemUpdates } = action.payload;

      const existingScenes = ent(state).scenes.ids
        .map(id => ent(state).scenes.byId[id])
        .filter(s => s.episodeId !== episodeId);
      const allScenes = [...existingScenes, ...newScenes];

      const existingBlocks = ent(state).scriptBlocks.ids
        .map(id => ent(state).scriptBlocks.byId[id])
        .filter(b => b.episodeId !== episodeId);
      const allBlocks = [...existingBlocks, ...newBlocks];

      let treatmentItems = { ...ent(state).treatmentItems };
      if (itemUpdates?.length) {
        const updatedById = { ...treatmentItems.byId };
        itemUpdates.forEach(u => {
          if (updatedById[u.id]) updatedById[u.id] = { ...updatedById[u.id], ...u };
        });
        treatmentItems = { ...treatmentItems, byId: updatedById };
      }

      return {
        ...state,
        entities: {
          ...ent(state),
          scenes: {
            ids: allScenes.map(s => s.id),
            byId: Object.fromEntries(allScenes.map(s => [s.id, s])),
          },
          scriptBlocks: {
            ids: allBlocks.map(b => b.id),
            byId: Object.fromEntries(allBlocks.map(b => [b.id, b])),
          },
          treatmentItems,
        },
      };
    }

    // ── Documents ─────────────────────────────────────────────────────────────
    case A.SET_COVER: {
      const doc = action.payload;
      // One cover per project; use projectId as implicit key
      const existing = ent(state).coverDocs.ids
        .map(id => ent(state).coverDocs.byId[id])
        .find(d => d.projectId === doc.projectId);
      const entry = existing ? { ...existing, ...doc } : doc;
      return {
        ...state,
        entities: {
          ...ent(state),
          coverDocs: addToCollection(ent(state).coverDocs, entry),
        },
      };
    }

    case A.SET_SYNOPSIS: {
      const doc = action.payload;
      const existing = ent(state).synopsisDocs.ids
        .map(id => ent(state).synopsisDocs.byId[id])
        .find(d => d.projectId === doc.projectId);
      const entry = existing ? { ...existing, ...doc } : doc;
      return {
        ...state,
        entities: {
          ...ent(state),
          synopsisDocs: addToCollection(ent(state).synopsisDocs, entry),
        },
      };
    }

    // ── Resources ─────────────────────────────────────────────────────────────
    case A.ADD_RESOURCE:
      return {
        ...state,
        entities: { ...ent(state), resources: addToCollection(ent(state).resources, action.payload) },
      };
    case A.UPDATE_RESOURCE:
      return {
        ...state,
        entities: { ...ent(state), resources: updateInCollection(ent(state).resources, action.payload.id, action.payload) },
      };
    case A.DELETE_RESOURCE:
      return {
        ...state,
        entities: { ...ent(state), resources: removeFromCollection(ent(state).resources, action.id) },
      };

    // ── Work Time ──────────────────────────────────────────────────────────────
    case A.ADD_WORK_LOG:
      return {
        ...state,
        entities: { ...ent(state), workTimeLogs: addToCollection(ent(state).workTimeLogs, action.payload) },
      };

    // ── Settings ──────────────────────────────────────────────────────────────
    case A.SET_STYLE_PRESET:
      return {
        ...state,
        settings: {
          ...state.settings,
          stylePreset: { ...state.settings.stylePreset, ...action.payload },
        },
      };

    // ── UI ────────────────────────────────────────────────────────────────────
    case A.SET_ACTIVE_PROJECT:
      return {
        ...state,
        ui: {
          ...state.ui,
          activeProjectId: action.id,
          activeEpisodeId: null,
          activeDoc: 'cover',
          selectedCharacterId: null,
        },
      };

    case A.SET_ACTIVE_EPISODE:
      return {
        ...state,
        ui: { ...state.ui, activeEpisodeId: action.id, activeDoc: 'script' },
      };

    case A.SET_ACTIVE_DOC:
      return { ...state, ui: { ...state.ui, activeDoc: action.payload } };

    case A.SET_SELECTED_CHARACTER:
      return { ...state, ui: { ...state.ui, selectedCharacterId: action.id } };

    case A.SET_SELECTED_SCENE:
      return { ...state, ui: { ...state.ui, selectedSceneId: action.id } };

    case A.SET_SAVE_STATUS:
      return {
        ...state,
        ui: { ...state.ui, saveStatus: action.payload, saveError: action.error ?? null },
      };

    case A.SET_SCROLL_TO_SCENE:
      return { ...state, ui: { ...state.ui, scrollToSceneId: action.id } };

    default:
      return state;
  }
}
