/**
 * v2 Data Migrations
 * ─────────────────────────────────────────────────────────────
 * v1 flat arrays → v2 normalized collections
 * Also provides seed data for fresh installs.
 */
import { readV1Raw, hasV1Data } from './storage.js';
import { emptyCollection, addToCollection } from '../store/schema.js';
import { DEFAULT_STYLE_PRESET } from '../domain/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function genId() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
}
function now() { return new Date().toISOString(); }

function arrayToCollection(arr) {
  return arr.reduce(
    (col, entity) => addToCollection(col, entity),
    emptyCollection()
  );
}

// ─── v1 → v2 Migration ───────────────────────────────────────────────────────
export function migrateV1toV2() {
  if (!hasV1Data()) return null;

  const v1 = readV1Raw();

  // Normalize characters: ensure givenName field
  const characters = v1.characters.map(c => ({
    ...c,
    givenName: c.givenName || c.name || '',
    surname:   c.surname   || '',
    occupation: c.occupation || c.job || '',
    intro:     c.intro || c.description || '',
    extraFields:    c.extraFields    || c.customFields || [],
    relationships:  c.relationships  || [],
  }));

  // Normalize episodes: remove legacy subtitle field
  const episodes = v1.episodes.map(({ subtitle: _sub, ...ep }) => ({
    ...ep,
    treatmentItemIds: ep.treatmentItemIds || [],
  }));

  // Flatten treatment items from episode.summaryItems → treatmentItems collection
  const treatmentItems = [];
  episodes.forEach(ep => {
    (ep.summaryItems || []).forEach((item, idx) => {
      treatmentItems.push({
        id:        item.id || genId(),
        episodeId: ep.id,
        projectId: ep.projectId,
        order:     idx,
        text:      item.text || '',
        importedSceneId: item.importedSceneId || null,
        importedText:    item.importedText    || null,
        createdAt: item.createdAt || now(),
        updatedAt: item.updatedAt || now(),
      });
    });
  });

  return {
    entities: {
      projects:       arrayToCollection(v1.projects),
      episodes:       arrayToCollection(episodes),
      characters:     arrayToCollection(characters),
      scenes:         arrayToCollection(v1.scenes),
      scriptBlocks:   arrayToCollection(v1.scriptBlocks),
      treatmentItems: arrayToCollection(treatmentItems),
      coverDocs:      arrayToCollection(v1.coverDocs),
      synopsisDocs:   arrayToCollection(v1.synopsisDocs),
      resources:      arrayToCollection(v1.resources),
      workTimeLogs:   arrayToCollection(v1.workTimeLogs),
      sceneListRows:  emptyCollection(),  // Phase 4: new, no v1 equivalent
    },
    settings: {
      stylePreset: v1.stylePreset ?? DEFAULT_STYLE_PRESET,
    },
  };
}

// ─── Seed data for fresh installs ─────────────────────────────────────────────
export function createV2SeedData() {
  const projectId   = genId();
  const ep1Id       = genId();
  const ep2Id       = genId();
  const char1Id     = genId();
  const char2Id     = genId();
  const scene1Id    = genId();
  const block1Id    = genId();
  const block2Id    = genId();
  const coverId     = genId();
  const synopsisId  = genId();
  const ts          = now();

  return {
    entities: {
      projects: arrayToCollection([{
        id: projectId, title: '새 작품',
        createdAt: ts, updatedAt: ts,
      }]),
      episodes: arrayToCollection([
        { id: ep1Id, projectId, number: 1, title: '', createdAt: ts, updatedAt: ts, treatmentItemIds: [] },
        { id: ep2Id, projectId, number: 2, title: '', createdAt: ts, updatedAt: ts, treatmentItemIds: [] },
      ]),
      characters: arrayToCollection([
        { id: char1Id, projectId, surname: '', givenName: '주인공', name: '주인공',
          role: 'lead', gender: '', age: '', occupation: '', intro: '',
          extraFields: [], relationships: [], createdAt: ts },
        { id: char2Id, projectId, surname: '', givenName: '상대역', name: '상대역',
          role: 'support', gender: '', age: '', occupation: '', intro: '',
          extraFields: [], relationships: [], createdAt: ts },
      ]),
      scenes: arrayToCollection([{
        id: scene1Id, episodeId: ep1Id, projectId,
        sceneSeq: 1, label: 'S#1.',
        specialSituation: '', location: '', subLocation: '', timeOfDay: '',
        content: '', status: 'draft', tags: [], characterIds: [],
        sceneListContent: '', sourceTreatmentItemId: null,
        createdAt: ts, updatedAt: ts,
      }]),
      scriptBlocks: arrayToCollection([
        { id: block1Id, episodeId: ep1Id, projectId,
          type: 'scene_number', content: '', label: 'S#1.', sceneId: scene1Id,
          createdAt: ts, updatedAt: ts },
        { id: block2Id, episodeId: ep1Id, projectId,
          type: 'action', content: '', label: '',
          createdAt: ts, updatedAt: ts },
      ]),
      treatmentItems: emptyCollection(),
      coverDocs: arrayToCollection([{
        id: coverId, projectId, title: '새 작품',
        fields: [
          { id: genId(), label: '부제목', value: '' },
          { id: genId(), label: '작가',   value: '' },
          { id: genId(), label: '장르',   value: '' },
          { id: genId(), label: '방송사', value: '' },
        ],
      }]),
      synopsisDocs: arrayToCollection([{
        id: synopsisId, projectId,
        genre: '', theme: '', intent: '', story: '', characterSettings: '',
        sections: [],
      }]),
      resources:     emptyCollection(),
      workTimeLogs:  emptyCollection(),
      sceneListRows: emptyCollection(),
    },
    settings: {
      stylePreset: DEFAULT_STYLE_PRESET,
    },
  };
}
