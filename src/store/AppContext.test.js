import { describe, it, expect, vi, beforeEach } from 'vitest';

// Silence IndexedDB side-effects that the module may attempt on import in a
// node environment. Unit tests here target the pure reducer only.
vi.mock('./db', () => ({
  getAll: vi.fn(async () => []),
  setAll: vi.fn(async () => {}),
  getItem: vi.fn(async () => null),
  setItem: vi.fn(async () => {}),
  DB_KEYS: {},
  genId: () => 'gen-id',
  now: () => 0,
  migrateFromLocalStorage: vi.fn(async () => {}),
}));
vi.mock('./googleDrive', () => ({
  isTokenValid: () => false,
  saveToDrive: vi.fn(async () => {}),
  clearAccessToken: vi.fn(),
}));

import { reducer } from './AppContext';

function baseState(overrides = {}) {
  return {
    initialized: true,
    projects: [],
    episodes: [],
    characters: [],
    scenes: [],
    scriptBlocks: [],
    coverDocs: [],
    synopsisDocs: [],
    resources: [],
    workTimeLogs: [],
    checklistItems: [],
    stylePreset: {},
    activeProjectId: null,
    activeEpisodeId: null,
    activeDoc: null,
    selectedCharacterId: null,
    selectedStructureSceneId: null,
    isPro: false,
    saveStatus: 'saved',
    savedAt: null,
    scrollToSceneId: null,
    pendingScriptReload: null,
    undoStack: [],
    redoStack: [],
    ...overrides,
  };
}

describe('reducer / SYNC_SCENES', () => {
  const EP_ID = 'ep-1';
  const PROJ_ID = 'p-1';
  const SCENE_ID = 's-1';

  const existingScene = {
    id: SCENE_ID,
    episodeId: EP_ID,
    projectId: PROJ_ID,
    sceneSeq: 1,
    label: 'S#1.',
    content: '거실 (낮)',
    location: '거실',
    subLocation: '',
    timeOfDay: '낮',
    specialSituation: '',
    tags: ['발단'],
    characters: [],
    characterIds: [],
    emotionTags: [{ word: '슬픔', color: '#4FC3F7', intensity: 3 }],
    sceneListContent: '',
    createdAt: 1,
    updatedAt: 1,
  };

  // Whitelist payload — mirrors the shape built by ScriptEditor's debounced save
  // (ScriptEditor.jsx:2400-2418). Note: emotionTags and any other non-whitelist
  // field are NOT included.
  const whitelistPayload = [{
    id: SCENE_ID,
    episodeId: EP_ID,
    projectId: PROJ_ID,
    sceneSeq: 1,
    label: 'S#1.',
    status: 'draft',
    tags: existingScene.tags,
    characters: [],
    characterIds: [],
    content: '거실 (낮)',
    location: '거실',
    subLocation: '',
    timeOfDay: '낮',
    specialSituation: '',
    sourceTreatmentItemId: null,
    sceneListContent: '',
    createdAt: 1,
    updatedAt: 2,
  }];

  it('preserves non-whitelist fields (emotionTags) on existing scenes after editor save', () => {
    const state = baseState({ scenes: [existingScene] });
    const next = reducer(state, {
      type: 'SYNC_SCENES',
      episodeId: EP_ID,
      payload: whitelistPayload,
      removeOrphans: true,
    });
    const updated = next.scenes.find(s => s.id === SCENE_ID);
    expect(updated).toBeDefined();
    expect(updated.emotionTags).toEqual([
      { word: '슬픔', color: '#4FC3F7', intensity: 3 },
    ]);
  });

  it('applies whitelist payload fields on top of preserved ones', () => {
    const state = baseState({ scenes: [existingScene] });
    const next = reducer(state, {
      type: 'SYNC_SCENES',
      episodeId: EP_ID,
      payload: [{ ...whitelistPayload[0], content: '거실 (밤)', timeOfDay: '밤' }],
      removeOrphans: true,
    });
    const updated = next.scenes.find(s => s.id === SCENE_ID);
    expect(updated.content).toBe('거실 (밤)');
    expect(updated.timeOfDay).toBe('밤');
    // preserved field must survive
    expect(updated.emotionTags).toEqual([
      { word: '슬픔', color: '#4FC3F7', intensity: 3 },
    ]);
  });

  it('removes orphan scenes (not in payload) when removeOrphans=true', () => {
    const orphan = { ...existingScene, id: 's-orphan' };
    const state = baseState({ scenes: [existingScene, orphan] });
    const next = reducer(state, {
      type: 'SYNC_SCENES',
      episodeId: EP_ID,
      payload: whitelistPayload,
      removeOrphans: true,
    });
    expect(next.scenes.some(s => s.id === 's-orphan')).toBe(false);
    expect(next.scenes.some(s => s.id === SCENE_ID)).toBe(true);
  });

  it('keeps orphan scenes when removeOrphans=false (scenelist/sceneboard path)', () => {
    const orphan = { ...existingScene, id: 's-orphan' };
    const state = baseState({ scenes: [existingScene, orphan] });
    const next = reducer(state, {
      type: 'SYNC_SCENES',
      episodeId: EP_ID,
      payload: whitelistPayload,
      removeOrphans: false,
    });
    expect(next.scenes.some(s => s.id === 's-orphan')).toBe(true);
  });

  it('does not touch scenes in other episodes', () => {
    const otherEpScene = { ...existingScene, id: 's-other', episodeId: 'ep-2' };
    const state = baseState({ scenes: [existingScene, otherEpScene] });
    const next = reducer(state, {
      type: 'SYNC_SCENES',
      episodeId: EP_ID,
      payload: whitelistPayload,
      removeOrphans: true,
    });
    const other = next.scenes.find(s => s.id === 's-other');
    expect(other).toEqual(otherEpScene);
  });

  // 기존 결함 박제: payload의 episodeId가 action.episodeId와 다르면 리듀서는
  // action.episodeId로 필터링한 후 병합하므로, 서로 다른 에피소드 id의 scene이
  // payload에 섞여 들어오면 "otherEpScenes에서 보존된 원본" + "병합되지 않은 payload 항목"이
  // 공존해 중복이 생길 수 있다. 이 테스트는 현재 동작을 고정하는 목적.
  // TODO: 별도 이슈. 본 작업 범위 외.
  it('(기존 결함 박제) payload에 다른 episodeId가 섞이면 현재 동작 유지 — 중복 생성', () => {
    const otherEp = { ...existingScene, id: 's-other', episodeId: 'ep-2' };
    const state = baseState({ scenes: [existingScene, otherEp] });
    const next = reducer(state, {
      type: 'SYNC_SCENES',
      episodeId: EP_ID,
      // payload에 다른 에피소드의 scene id가 섞임 (정상 빌더라면 생기지 않음)
      payload: [
        whitelistPayload[0],
        { ...otherEp, content: 'mutated' },
      ],
      removeOrphans: true,
    });
    // otherEp 원본이 otherEpScenes로 보존되고,
    // 동시에 payload의 mutated 버전도 병합 없이 살아남아 중복됨
    const otherOccurrences = next.scenes.filter(s => s.id === 's-other');
    expect(otherOccurrences).toHaveLength(2);
  });
});
