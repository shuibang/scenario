import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { getAll, setAll, getItem, setItem, DB_KEYS, genId, now } from './db';
import { createSeedData } from '../data/seed';
import { isTokenValid, saveToDrive } from './googleDrive';

// ─── Default style preset ────────────────────────────────────────────────────
export const DEFAULT_STYLE_PRESET = {
  dialogueGap: '7em',
  fontFamily: '함초롱바탕',
  fontSize: 11,                // pt
  lineHeight: 1.6,             // 160%
  characterWidth: 100,         // 장평 %
  pageSize: 'A4',
  pageMargins: { top: 35, right: 30, bottom: 30, left: 30 },
  structureGuidelines: '',     // 구조 지침 (사용자 입력)
  customSymbols: [],           // 기타 기호 목록 (사용자 추가)
  pageNumberFormat: '-{n}-',
  pageNumberOffsetBottomMm: 15,
  fontWeightRules: {
    sceneNumber: 'bold',
    characterName: 'bold',
    action: 'normal',
    dialogue: 'normal',
    parenthetical: 'normal',
    transition: 'normal',
  },
  textColor: {
    sceneNumber: 'inherit',
    characterName: 'inherit',
    action: 'inherit',
    dialogue: 'inherit',
    parenthetical: 'inherit',
    transition: 'inherit',
  },
  wrapPolicyByBlock: {
    dialogue: 'hanging',
    action: 'normal',
  },
};

// ─── State shape ────────────────────────────────────────────────────────────
const initialState = {
  initialized: false,
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
  stylePreset: DEFAULT_STYLE_PRESET,
  // UI
  activeProjectId: null,
  activeEpisodeId: null,
  activeDoc: null,           // 'cover' | 'synopsis' | 'script' | 'characters' | 'resources'
  selectedCharacterId: null,       // character selected in CharacterPanel → triggers usage panel
  selectedStructureSceneId: null,  // scene selected in StructurePage → shared with RightPanel guide
  isPro: false,
  saveStatus: 'saved',
  scrollToSceneId: null,
  pendingScriptReload: null, // episodeId — tells ScriptEditor to reload blocks from store
  // Undo/Redo (session-only, not persisted)
  undoStack: [],   // snapshots of { episodes, scenes, scriptBlocks }
  redoStack: [],
};

// ─── Reducer ─────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case 'INIT':
      return { ...state, ...action.payload, initialized: true };

    case 'ADD_PROJECT':
      return { ...state, projects: [...state.projects, action.payload] };
    case 'UPDATE_PROJECT':
      return { ...state, projects: state.projects.map(p =>
        p.id === action.payload.id ? { ...p, ...action.payload, updatedAt: now() } : p) };
    case 'DELETE_PROJECT':
      return {
        ...state,
        projects: state.projects.filter(p => p.id !== action.id),
        episodes: state.episodes.filter(e => e.projectId !== action.id),
        characters: state.characters.filter(c => c.projectId !== action.id),
        scenes: state.scenes.filter(s => s.projectId !== action.id),
        scriptBlocks: state.scriptBlocks.filter(b => b.projectId !== action.id),
        coverDocs: state.coverDocs.filter(d => d.projectId !== action.id),
        synopsisDocs: state.synopsisDocs.filter(d => d.projectId !== action.id),
        resources: state.resources.filter(r => r.projectId !== action.id),
        activeProjectId: state.activeProjectId === action.id ? null : state.activeProjectId,
        activeEpisodeId: state.episodes.find(e => e.projectId === action.id && e.id === state.activeEpisodeId) ? null : state.activeEpisodeId,
      };

    case 'ADD_EPISODE':
      return { ...state, episodes: [...state.episodes, action.payload] };
    case 'UPDATE_EPISODE':
      return { ...state, episodes: state.episodes.map(e =>
        e.id === action.payload.id ? { ...e, ...action.payload, updatedAt: now() } : e) };
    case 'DELETE_EPISODE': {
      const wasActive = state.activeEpisodeId === action.id;
      // Renumber remaining episodes of the same project sequentially (1, 2, 3…)
      const deletedProjectId = state.episodes.find(e => e.id === action.id)?.projectId;
      const sameProjectRenumbered = state.episodes
        .filter(e => e.id !== action.id && e.projectId === deletedProjectId)
        .sort((a, b) => a.number - b.number)
        .map((e, i) => ({ ...e, number: i + 1 }));
      const otherProjectEps = state.episodes.filter(e => e.id !== action.id && e.projectId !== deletedProjectId);
      const remaining = [...otherProjectEps, ...sameProjectRenumbered];
      return {
        ...state,
        episodes: remaining,
        scenes: state.scenes.filter(s => s.episodeId !== action.id),
        scriptBlocks: state.scriptBlocks.filter(b => b.episodeId !== action.id),
        activeEpisodeId: wasActive ? null : state.activeEpisodeId,
        activeDoc: wasActive ? 'cover' : state.activeDoc,
      };
    }

    case 'ADD_CHARACTER':
      return { ...state, characters: [...state.characters, action.payload] };
    case 'UPDATE_CHARACTER':
      return { ...state, characters: state.characters.map(c =>
        c.id === action.payload.id ? { ...c, ...action.payload } : c) };
    case 'DELETE_CHARACTER':
      return { ...state, characters: state.characters.filter(c => c.id !== action.id) };

    case 'ADD_SCENE':
      return { ...state, scenes: [...state.scenes, action.payload] };
    case 'UPDATE_SCENE':
      return { ...state, scenes: state.scenes.map(s =>
        s.id === action.payload.id ? { ...s, ...action.payload, updatedAt: now() } : s) };
    case 'DELETE_SCENE':
      return { ...state, scenes: state.scenes.filter(s => s.id !== action.id) };
    case 'SYNC_SCENES': {
      // ScriptEditor가 아는 씬만 교체 — 블록 없는 orphan 씬(SceneListPage 전용)은 보존
      const syncedIds = new Set(action.payload.map(s => s.id));
      return {
        ...state,
        scenes: [
          ...state.scenes.filter(s => s.episodeId !== action.episodeId || !syncedIds.has(s.id)),
          ...action.payload,
        ],
      };
    }

    case 'SET_BLOCKS':
      return {
        ...state,
        scriptBlocks: [
          ...state.scriptBlocks.filter(b => b.episodeId !== action.episodeId),
          ...action.payload,
        ],
      };

    // Atomic import: multiple ADD_SCENE + SET_BLOCKS collapsed into one undo step
    case 'IMPORT_TREATMENT_TO_SCRIPT': {
      const { episodeId, newScenes, labelled, updatedSummaryItems } = action.payload;
      return {
        ...state,
        scenes: [...state.scenes, ...newScenes],
        scriptBlocks: [
          ...state.scriptBlocks.filter(b => b.episodeId !== episodeId),
          ...labelled,
        ],
        pendingScriptReload: episodeId,
        // Also persist import-tracking metadata back into episode.summaryItems
        episodes: updatedSummaryItems
          ? state.episodes.map(e =>
              e.id === episodeId ? { ...e, summaryItems: updatedSummaryItems } : e
            )
          : state.episodes,
      };
    }

    case 'CLEAR_PENDING_RELOAD':
      return { ...state, pendingScriptReload: null };

    case 'SET_COVER':
      return {
        ...state,
        coverDocs: [
          ...state.coverDocs.filter(d => d.projectId !== action.payload.projectId),
          action.payload,
        ],
      };
    case 'SET_SYNOPSIS':
      return {
        ...state,
        synopsisDocs: [
          ...state.synopsisDocs.filter(d => d.projectId !== action.payload.projectId),
          action.payload,
        ],
      };

    // Resources (이미지+메모 자료수집)
    case 'ADD_RESOURCE':
      return { ...state, resources: [...state.resources, action.payload] };
    case 'UPDATE_RESOURCE':
      return { ...state, resources: state.resources.map(r =>
        r.id === action.payload.id ? { ...r, ...action.payload } : r) };
    case 'DELETE_RESOURCE':
      return { ...state, resources: state.resources.filter(r => r.id !== action.id) };

    case 'ADD_WORK_LOG':
      return { ...state, workTimeLogs: [...state.workTimeLogs, action.payload] };

    case 'ADD_CHECKLIST_ITEM':
      return { ...state, checklistItems: [...state.checklistItems, action.payload] };
    case 'UPDATE_CHECKLIST_ITEM':
      return { ...state, checklistItems: state.checklistItems.map(it =>
        it.id === action.payload.id ? { ...it, ...action.payload } : it) };
    case 'DELETE_CHECKLIST_ITEM':
      return { ...state, checklistItems: state.checklistItems.filter(it => it.id !== action.id) };

    case 'SET_STYLE_PRESET':
      return { ...state, stylePreset: { ...state.stylePreset, ...action.payload } };

    // UI
    case 'SET_ACTIVE_PROJECT':
      return { ...state, activeProjectId: action.id, activeEpisodeId: null, activeDoc: 'cover', selectedCharacterId: null };
    case 'SET_ACTIVE_EPISODE':
      return { ...state, activeEpisodeId: action.id, activeDoc: 'script' };
    case 'SET_ACTIVE_DOC':
      return { ...state, activeDoc: action.payload };
    case 'SET_SELECTED_CHARACTER':
      return { ...state, selectedCharacterId: action.id };
    case 'SET_SELECTED_STRUCTURE_SCENE':
      return { ...state, selectedStructureSceneId: action.id };
    case 'SET_SAVE_STATUS':
      return { ...state, saveStatus: action.payload };
    case 'SET_SAVE_ERROR_MSG':
      return { ...state, saveErrorMsg: action.payload };
    case 'SET_SCROLL_TO_SCENE':
      return { ...state, scrollToSceneId: action.id };

    case 'LOAD_FROM_DRIVE': {
      const p = action.payload;
      return {
        ...state,
        projects:       p.projects?.length       > 0 ? p.projects       : state.projects,
        episodes:       p.episodes?.length       > 0 ? p.episodes       : state.episodes,
        characters:     p.characters?.length     > 0 ? p.characters     : state.characters,
        scenes:         p.scenes?.length         > 0 ? p.scenes         : state.scenes,
        scriptBlocks:   p.scriptBlocks?.length   > 0 ? p.scriptBlocks   : state.scriptBlocks,
        coverDocs:      p.coverDocs?.length      > 0 ? p.coverDocs      : state.coverDocs,
        synopsisDocs:   p.synopsisDocs?.length   > 0 ? p.synopsisDocs   : state.synopsisDocs,
        resources:      p.resources?.length      > 0 ? p.resources      : state.resources,
        workTimeLogs:   p.workTimeLogs?.length   > 0 ? p.workTimeLogs   : state.workTimeLogs,
        checklistItems: p.checklistItems?.length > 0 ? p.checklistItems : state.checklistItems,
        stylePreset:    p.stylePreset            ?? state.stylePreset,
        activeProjectId: null,
        activeEpisodeId: null,
        activeDoc: null,
      };
    }

    default:
      return state;
  }
}

// ─── History (undo/redo) ─────────────────────────────────────────────────────
const MAX_UNDO = 50;

// Actions auto-recorded without needing _record flag
const AUTO_RECORD = new Set([
  'ADD_EPISODE',
  'DELETE_EPISODE',
  'DELETE_SCENE',
  'DELETE_CHARACTER',
  'IMPORT_TREATMENT_TO_SCRIPT',
]);

function makeSnapshot(state) {
  return {
    episodes:     state.episodes,
    scenes:       state.scenes,
    scriptBlocks: state.scriptBlocks,
    characters:   state.characters,
  };
}

function historyReducer(state, action) {
  // UNDO
  if (action.type === 'UNDO') {
    if (!state.undoStack.length) return state;
    const snap = state.undoStack[state.undoStack.length - 1];
    const redoEntry = makeSnapshot(state);
    return {
      ...state,
      ...snap,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, redoEntry].slice(-MAX_UNDO),
    };
  }
  // REDO
  if (action.type === 'REDO') {
    if (!state.redoStack.length) return state;
    const snap = state.redoStack[state.redoStack.length - 1];
    const undoEntry = makeSnapshot(state);
    return {
      ...state,
      ...snap,
      undoStack: [...state.undoStack, undoEntry].slice(-MAX_UNDO),
      redoStack: state.redoStack.slice(0, -1),
    };
  }

  const shouldRecord = action._record === true || AUTO_RECORD.has(action.type);
  // Strip internal flag before passing to base reducer
  const { _record, ...baseAction } = action;
  const nextState = reducer(state, baseAction);

  if (shouldRecord) {
    return {
      ...nextState,
      undoStack: [...state.undoStack, makeSnapshot(state)].slice(-MAX_UNDO),
      redoStack: [],   // new action clears redo
    };
  }
  return nextState;
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(historyReducer, initialState);
  const persistTimer = useRef(null);
  // 시스템 로드(INIT/LOAD_FROM_DRIVE) 중엔 drama_saved_at을 갱신하지 않기 위한 플래그
  const skipSavedAtRef = useRef(false);

  useEffect(() => {
    const stored = getAll(DB_KEYS.projects);
    if (stored.length > 0) {
      // Migration: strip legacy `subtitle` field from all episodes
      const migratedEpisodes = getAll(DB_KEYS.episodes).map(
        // eslint-disable-next-line no-unused-vars
        ({ subtitle, ...ep }) => ep
      );
      skipSavedAtRef.current = true; // INIT은 사용자 편집이 아님 → savedAt 갱신 건너뜀
      dispatch({
        type: 'INIT',
        payload: {
          projects:     getAll(DB_KEYS.projects),
          episodes:     migratedEpisodes,
          characters:   getAll(DB_KEYS.characters),
          scenes:       getAll(DB_KEYS.scenes),
          scriptBlocks: getAll(DB_KEYS.scriptBlocks),
          coverDocs:    getAll(DB_KEYS.coverDocs),
          synopsisDocs: getAll(DB_KEYS.synopsisDocs),
          resources:    getAll(DB_KEYS.resources),
          workTimeLogs:    getAll(DB_KEYS.workTimeLogs),
          checklistItems:  getAll(DB_KEYS.checklistItems),
        },
      });
      const savedPreset = getItem(DB_KEYS.stylePresets);
      if (savedPreset) dispatch({ type: 'SET_STYLE_PRESET', payload: savedPreset });
    } else {
      // Check for shared data in URL
      const hash = window.location.hash;
      if (hash.startsWith('#share=')) {
        try {
          const decoded = JSON.parse(atob(decodeURIComponent(hash.slice(7))));
          Object.entries(decoded).forEach(([key, data]) => {
            if (DB_KEYS[key]) setAll(DB_KEYS[key], data);
          });
          window.location.hash = '';
          dispatch({ type: 'INIT', payload: decoded });
          return;
        } catch { /* fallthrough to seed */ }
      }
      const seed = createSeedData();
      Object.entries(seed).forEach(([key, data]) => setAll(DB_KEYS[key], data));
      dispatch({ type: 'INIT', payload: seed });
    }
  }, []);

  useEffect(() => {
    if (!state.initialized) return;
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try {
        setAll(DB_KEYS.projects,      state.projects);
        setAll(DB_KEYS.episodes,      state.episodes);
        setAll(DB_KEYS.characters,    state.characters);
        setAll(DB_KEYS.scenes,        state.scenes);
        setAll(DB_KEYS.scriptBlocks,  state.scriptBlocks);
        setAll(DB_KEYS.coverDocs,     state.coverDocs);
        setAll(DB_KEYS.synopsisDocs,  state.synopsisDocs);
        setAll(DB_KEYS.resources,     state.resources);
        setAll(DB_KEYS.workTimeLogs,    state.workTimeLogs);
        setAll(DB_KEYS.checklistItems,  state.checklistItems);
        // 로그인된 경우에만 스타일 설정 저장 (미로그인 시 세션 내에서만 유지)
        if (localStorage.getItem('drama_auth_user')) {
          setItem(DB_KEYS.stylePresets, state.stylePreset);
        }
        // INIT/LOAD_FROM_DRIVE(시스템 로드) 직후엔 사용자 편집 시각을 덮어쓰지 않음
        if (!skipSavedAtRef.current) {
          localStorage.setItem('drama_saved_at', new Date().toISOString());
        }
        skipSavedAtRef.current = false;
      } catch (e) {
        console.error('[AppContext] 저장 실패:', e);
        // QuotaExceededError = localStorage 용량 초과
        const msg = e?.name === 'QuotaExceededError'
          ? 'localStorage 용량 초과 — 오래된 데이터를 삭제하거나 브라우저 저장공간을 늘려주세요'
          : `저장 실패: ${e?.message || '알 수 없는 오류'}`;
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' });
        dispatch({ type: 'SET_SAVE_ERROR_MSG', payload: msg });
        return;
      }
      // Drive 자동저장 (토큰 유효할 때만)
      if (isTokenValid()) {
        saveToDrive({
          projects:       state.projects,
          episodes:       state.episodes,
          characters:     state.characters,
          scenes:         state.scenes,
          scriptBlocks:   state.scriptBlocks,
          coverDocs:      state.coverDocs,
          synopsisDocs:   state.synopsisDocs,
          resources:      state.resources,
          workTimeLogs:   state.workTimeLogs,
          checklistItems: state.checklistItems,
          stylePreset:    state.stylePreset,
        }).catch(e => {
          if (e.message !== 'DRIVE_AUTH_REQUIRED') {
            console.warn('[Drive] 자동저장 실패:', e);
          }
        });
      }
    }, 300);
  }, [
    state.initialized,
    state.projects, state.episodes, state.characters,
    state.scenes, state.scriptBlocks,
    state.coverDocs, state.synopsisDocs, state.resources,
    state.workTimeLogs,
    state.checklistItems,
    state.stylePreset,
  ]);

  useEffect(() => {
    if (state.initialized && !state.activeProjectId && state.projects.length > 0) {
      dispatch({ type: 'SET_ACTIVE_PROJECT', id: state.projects[0].id });
    }
  }, [state.initialized, state.activeProjectId, state.projects]);

  // Drive에서 불러올 때 사용 — skipSavedAt 플래그 자동 설정
  const loadFromDriveData = (drivePayload) => {
    skipSavedAtRef.current = true;
    // LOAD_FROM_DRIVE 후 drama_saved_at을 Drive의 savedAt으로 덮어씀 (다음 비교 기준)
    if (drivePayload.savedAt) {
      try { localStorage.setItem('drama_saved_at', drivePayload.savedAt); } catch {}
    }
    dispatch({ type: 'LOAD_FROM_DRIVE', payload: drivePayload });
  };

  return (
    <AppContext.Provider value={{ state, dispatch, loadFromDriveData, genId, now }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
