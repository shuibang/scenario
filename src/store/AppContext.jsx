import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { getAll, setAll, getItem, setItem, DB_KEYS, genId, now, migrateFromLocalStorage } from './db';
import { isTokenValid, saveToDrive, clearAccessToken, saveProjectsIndex, saveProjectToDrive } from './googleDrive';
import { serializeProject, mergeImportedProject } from '../utils/projectSerializer';
import { computeSizeGuard } from './sizeGuard';
import { sharePayloadSchema } from '../utils/urlSchemas';
import { parsePath, syncUrl } from '../utils/urlSync';
import { describeDriveError } from '../utils/driveError';
import { detectScriptBlockDuplicates, dedupScriptBlocks } from '../utils/dedupBlocks';
import { getDeviceId } from '../utils/deviceId';

// 복원 가능한 activeDoc 값 whitelist — localStorage에 주입된 예상 밖의 값 차단
const ALLOWED_ACTIVE_DOCS = new Set([
  'cover', 'synopsis', 'characters', 'resources', 'structure',
  'scenelist', 'director_notes', 'treatment', 'biography',
  'relationships', 'mypage', 'projects', 'trash', 'script',
]);

// ─── Work log merge helper ───────────────────────────────────────────────────
// 같은 projectId + dateKey 엔트리가 있으면 activeDurationSec 합산·최신 activity로 업데이트
// 하루의 작업이 여러 세션으로 분산 기록되지 않도록 합침
export function mergeWorkLog(logs, entry) {
  const idx = (logs || []).findIndex(
    l => l && l.projectId === entry.projectId && l.dateKey === entry.dateKey
  );
  if (idx === -1) return [...(logs || []), entry];
  const existing = logs[idx];
  const seen = new Set();
  const mergedChecklist = [
    ...(existing.completedChecklistSnapshot || []),
    ...(entry.completedChecklistSnapshot || []),
  ].filter(it => {
    if (!it?.id || seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
  const merged = {
    ...existing,
    activeDurationSec: (existing.activeDurationSec || 0) + (entry.activeDurationSec || 0),
    completedAt: entry.completedAt ?? existing.completedAt,
    documentId: entry.documentId ?? existing.documentId,
    completedChecklistSnapshot: mergedChecklist,
  };
  return [...logs.slice(0, idx), merged, ...logs.slice(idx + 1)];
}

// ─── Project fingerprint — Phase 1.2 변경 감지 ──────────────────────────────
// 작품 단위로 cascading 데이터의 (길이 + 마지막 updatedAt)을 단일 문자열로 만들어
// 마지막 저장 시점과 비교. 변경 안 된 작품은 신 형식 Drive 저장을 건너뛴다.
function projectFingerprint(state, projectId) {
  const p = state.projects.find(pr => pr.id === projectId);
  if (!p) return null;
  const sig = (arr) => {
    let len = 0, maxTs = 0;
    for (const it of arr) {
      if (it?.projectId === projectId) {
        len++;
        const ts = new Date(it.updatedAt || 0).getTime();
        if (ts > maxTs) maxTs = ts;
      }
    }
    return `${len}:${maxTs}`;
  };
  return [
    p.updatedAt,
    sig(state.episodes),
    sig(state.characters),
    sig(state.scenes),
    sig(state.scriptBlocks),
    sig(state.coverDocs),
    sig(state.synopsisDocs),
    sig(state.resources),
    sig(state.workTimeLogs),
    sig(state.checklistItems),
  ].join('|');
}

// ─── Default style preset ────────────────────────────────────────────────────
export const DEFAULT_STYLE_PRESET = {
  dialogueGap: '7em',
  fontFamily: '함초롬바탕',
  fontSize: 11,                // pt
  lineHeight: 1.6,             // 160%
  characterWidth: 100,         // 장평 %
  pageSize: 'A4',
  pageMargins: { top: 35, right: 30, bottom: 30, left: 30 },
  structureGuidelines: '',     // 구조 지침 (사용자 입력)
  customSymbols: [],           // 기타 기호 목록 (사용자 추가)
  customStructureTags: [],     // 사용자 추가 구조태그 (문자열 배열)
  customEmotionTags: [],       // 사용자 추가 감정태그 ([{ word, color }])
  pageNumberFormat: '-{n}-',
  pageNumberOffsetBottomMm: 15,
  blockStyles: {
    sceneNumber: { bold: true,  italic: false, underline: false, uppercase: false, indent: 0 },
    action:      { bold: false, italic: false, underline: false, indent: 1 },
    charName:    { bold: true,  italic: false, underline: false, indent: 0 },
    dialogue:    { bold: false, italic: false, underline: false, indent: 0 },
  },
  dialogueLayout: 'korean',    // 'korean' | 'hollywood'
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

// ─── Trash 빈 객체 (마이그레이션·폴백 공용) ─────────────────────────────────
const EMPTY_TRASH = {
  projects:     [],
  episodes:     [],
  characters:   [],
  scenes:       [],
  scriptBlocks: [],
  coverDocs:    [],
  synopsisDocs: [],
  resources:    [],
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
  trash: { ...EMPTY_TRASH },
  stylePreset: DEFAULT_STYLE_PRESET,
  // UI
  activeProjectId: null,
  activeEpisodeId: null,
  activeDoc: null,           // 'cover' | 'synopsis' | 'script' | 'characters' | 'resources'
  selectedCharacterId: null,       // character selected in CharacterPanel → triggers usage panel
  selectedStructureSceneId: null,  // scene selected in StructurePage → shared with RightPanel guide
  isPro: false,
  saveStatus: 'saved',
  savedAt: null,
  scrollToSceneId: null,
  pendingScriptReload: null, // episodeId — tells ScriptEditor to reload blocks from store
  // Data-size guard: persist가 70%+ 급감을 감지하면 사용자 확인 대기 상태로 전환
  guardPending: null, // null | { diff: { scriptBlocks: {prev,next,dropRatio}|null, scenes: ...|null }, snapshotAt: number }
  // Undo/Redo (session-only, not persisted)
  undoStack: [],   // snapshots of { episodes, scenes, scriptBlocks }
  redoStack: [],
};

// ─── Reducer ─────────────────────────────────────────────────────────────────
// NOTE: `reducer` is also exported (bottom of file) for unit tests.
function reducer(state, action) {
  switch (action.type) {
    case 'INIT': {
      const nextBlocks = action.payload?.scriptBlocks ?? state.scriptBlocks;
      const detection = detectScriptBlockDuplicates(nextBlocks);
      if (detection.hasDuplicates) {
        console.warn('[중복감지] INIT 시점 scriptBlocks 중복', {
          total: detection.totalDuplicates,
          totalBlocks: detection.totalBlocks,
          keys: detection.duplicateKeys,
        });
      }
      return { ...state, ...action.payload, initialized: true };
    }

    case 'ADD_PROJECT':
      return { ...state, projects: [...state.projects, action.payload] };
    case 'UPDATE_PROJECT':
      return { ...state, projects: state.projects.map(p =>
        p.id === action.payload.id ? { ...p, ...action.payload, updatedAt: now() } : p) };
    case 'MOVE_PROJECT_TO_TRASH': {
      const id = action.id;
      const target = state.projects.find(p => p.id === id);
      if (!target) return state;
      const split = (arr) => ({
        keep:  arr.filter(it => it.projectId !== id),
        moved: arr.filter(it => it.projectId === id),
      });
      const ep = split(state.episodes);
      const ch = split(state.characters);
      const sc = split(state.scenes);
      const sb = split(state.scriptBlocks);
      const cv = split(state.coverDocs);
      const sy = split(state.synopsisDocs);
      const rs = split(state.resources);
      // Orphan 안전장치 — 작품 ID와 매칭 안 되는 캐스케이드 데이터(예: 4/22-23 동기화 사고 등의
      // 예외 잔존)를 감지해 경고만 출력. 데이터는 state에 그대로 남겨 손실 방지 (보수 정책).
      const projectIdSet = new Set(state.projects.map(p => p.id));
      const orphanCount = {
        episodes:     state.episodes    .filter(e => !projectIdSet.has(e.projectId)).length,
        characters:   state.characters  .filter(c => !projectIdSet.has(c.projectId)).length,
        scenes:       state.scenes      .filter(s => !projectIdSet.has(s.projectId)).length,
        scriptBlocks: state.scriptBlocks.filter(b => !projectIdSet.has(b.projectId)).length,
        coverDocs:    state.coverDocs   .filter(d => !projectIdSet.has(d.projectId)).length,
        synopsisDocs: state.synopsisDocs.filter(d => !projectIdSet.has(d.projectId)).length,
        resources:    state.resources   .filter(r => !projectIdSet.has(r.projectId)).length,
      };
      if (Object.values(orphanCount).some(n => n > 0)) {
        console.warn('[trash] orphan data detected', {
          orphanCount,
          message: '작품과 연결되지 않은 데이터가 감지되었습니다. 보존됨.',
        });
      }
      const trash = state.trash || EMPTY_TRASH;
      return {
        ...state,
        projects:     state.projects.filter(p => p.id !== id),
        episodes:     ep.keep,
        characters:   ch.keep,
        scenes:       sc.keep,
        scriptBlocks: sb.keep,
        coverDocs:    cv.keep,
        synopsisDocs: sy.keep,
        resources:    rs.keep,
        trash: {
          projects:     [...(trash.projects     || []), { ...target, deletedAt: now() }],
          episodes:     [...(trash.episodes     || []), ...ep.moved],
          characters:   [...(trash.characters   || []), ...ch.moved],
          scenes:       [...(trash.scenes       || []), ...sc.moved],
          scriptBlocks: [...(trash.scriptBlocks || []), ...sb.moved],
          coverDocs:    [...(trash.coverDocs    || []), ...cv.moved],
          synopsisDocs: [...(trash.synopsisDocs || []), ...sy.moved],
          resources:    [...(trash.resources    || []), ...rs.moved],
        },
        activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        activeEpisodeId: state.episodes.find(e => e.projectId === id && e.id === state.activeEpisodeId) ? null : state.activeEpisodeId,
      };
    }

    case 'RESTORE_PROJECT': {
      const id = action.id;
      const trash = state.trash || EMPTY_TRASH;
      const target = (trash.projects || []).find(p => p.id === id);
      if (!target) return state;
      // deletedAt 제거
      const { deletedAt: _purged, ...restored } = target; // eslint-disable-line no-unused-vars
      const splitOut = (key) => {
        const arr = trash[key] || [];
        return {
          keep:     arr.filter(it => it.projectId !== id),
          restored: arr.filter(it => it.projectId === id),
        };
      };
      const ep = splitOut('episodes');
      const ch = splitOut('characters');
      const sc = splitOut('scenes');
      const sb = splitOut('scriptBlocks');
      const cv = splitOut('coverDocs');
      const sy = splitOut('synopsisDocs');
      const rs = splitOut('resources');
      return {
        ...state,
        projects:     [...state.projects,     restored],
        episodes:     [...state.episodes,     ...ep.restored],
        characters:   [...state.characters,   ...ch.restored],
        scenes:       [...state.scenes,       ...sc.restored],
        scriptBlocks: [...state.scriptBlocks, ...sb.restored],
        coverDocs:    [...state.coverDocs,    ...cv.restored],
        synopsisDocs: [...state.synopsisDocs, ...sy.restored],
        resources:    [...state.resources,    ...rs.restored],
        trash: {
          projects:     (trash.projects || []).filter(p => p.id !== id),
          episodes:     ep.keep,
          characters:   ch.keep,
          scenes:       sc.keep,
          scriptBlocks: sb.keep,
          coverDocs:    cv.keep,
          synopsisDocs: sy.keep,
          resources:    rs.keep,
        },
      };
    }

    // PURGE_PROJECT — trash 한정. state.*는 안 건드림. trash 안 orphan도 보존.
    case 'PURGE_PROJECT': {
      const id = action.id;
      const trash = state.trash || EMPTY_TRASH;
      return {
        ...state,
        trash: {
          projects:     (trash.projects     || []).filter(p => p.id !== id),
          episodes:     (trash.episodes     || []).filter(e => e.projectId !== id),
          characters:   (trash.characters   || []).filter(c => c.projectId !== id),
          scenes:       (trash.scenes       || []).filter(s => s.projectId !== id),
          scriptBlocks: (trash.scriptBlocks || []).filter(b => b.projectId !== id),
          coverDocs:    (trash.coverDocs    || []).filter(d => d.projectId !== id),
          synopsisDocs: (trash.synopsisDocs || []).filter(d => d.projectId !== id),
          resources:    (trash.resources    || []).filter(r => r.projectId !== id),
        },
      };
    }

    // PURGE_EXPIRED_TRASH — 만료된 project.id 집합과 매칭되는 trash.* 만 제거.
    // trash 안 orphan(어떤 trash.project와도 매칭 안 되는 데이터)은 그대로 보존.
    case 'PURGE_EXPIRED_TRASH': {
      const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
      const cutoff = Date.now() - RETENTION_MS;
      const trash = state.trash || EMPTY_TRASH;
      const expiredIds = (trash.projects || [])
        .filter(p => (p.deletedAt || 0) < cutoff)
        .map(p => p.id);
      if (expiredIds.length === 0) return state;
      console.log(`[trash] expired ${expiredIds.length} items purged`);
      const expired = new Set(expiredIds);
      return {
        ...state,
        trash: {
          projects:     (trash.projects     || []).filter(p => !expired.has(p.id)),
          episodes:     (trash.episodes     || []).filter(e => !expired.has(e.projectId)),
          characters:   (trash.characters   || []).filter(c => !expired.has(c.projectId)),
          scenes:       (trash.scenes       || []).filter(s => !expired.has(s.projectId)),
          scriptBlocks: (trash.scriptBlocks || []).filter(b => !expired.has(b.projectId)),
          coverDocs:    (trash.coverDocs    || []).filter(d => !expired.has(d.projectId)),
          synopsisDocs: (trash.synopsisDocs || []).filter(d => !expired.has(d.projectId)),
          resources:    (trash.resources    || []).filter(r => !expired.has(r.projectId)),
        },
      };
    }

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
      const { removeOrphans = false } = action;
      const syncedIds = new Set(action.payload.map(s => s.id));
      const otherEpScenes = state.scenes.filter(s => s.episodeId !== action.episodeId);
      const thisEpScenes  = state.scenes.filter(s => s.episodeId === action.episodeId);
      // removeOrphans=true (에디터): 블록에 없는 씬 제거 / false (씬리스트·씬보드): 기존 씬 유지
      const preserved = removeOrphans ? [] : thisEpScenes.filter(s => !syncedIds.has(s.id));
      // 병합: payload의 각 항목을 같은 id인 기존 씬과 합쳐 whitelist 밖 필드(emotionTags 등) 보존
      // 이중 방어선: 빌더(...existing 스프레드) + 리듀서(id 기준 병합)
      // 배경: 데이터 유실 조사에서 발견된 SYNC_SCENES 완전 교체 버그 방어
      const existingByIdInEpisode = new Map(thisEpScenes.map(s => [s.id, s]));
      const merged = action.payload.map(p => {
        const prev = existingByIdInEpisode.get(p.id);
        return prev ? { ...prev, ...p } : p;
      });
      return {
        ...state,
        scenes: [...otherEpScenes, ...preserved, ...merged],
      };
    }

    case 'SET_BLOCKS': {
      // payload 내 동일 id 중복 방어 — HWPX/DOCX import 등에서 같은 id가 두 번
      // 들어와도 한 번만 채택. detectScriptBlockDuplicates 경고의 재발 예방.
      const seen = new Set();
      const dedupedPayload = action.payload.filter(b => {
        if (!b?.id) return true;
        if (seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      });
      return {
        ...state,
        scriptBlocks: [
          ...state.scriptBlocks.filter(b => b.episodeId !== action.episodeId),
          ...dedupedPayload,
        ],
      };
    }

    case 'DEDUP_SCRIPT_BLOCKS':
      // 사용자 명시 액션 (마이페이지 → 데이터 정리). 잔존 (episodeId, id) 중복 제거.
      return { ...state, scriptBlocks: dedupScriptBlocks(state.scriptBlocks) };

    case 'UPDATE_BLOCK_EMOTION':
      return {
        ...state,
        scriptBlocks: state.scriptBlocks.map(b =>
          b.id === action.blockId ? { ...b, emotionTag: action.emotionTag ?? null } : b
        ),
      };


    // Atomic import: multiple ADD_SCENE + SET_BLOCKS collapsed into one undo step
    // replaceScenes=true → 트리트먼트 overwrite 모드: 기존 회차 scenes 제거 후 newScenes로 교체.
    // 미지정/false → append 모드 (기존 동작)
    case 'IMPORT_TREATMENT_TO_SCRIPT': {
      const { episodeId, newScenes, labelled, updatedSummaryItems, replaceScenes = false } = action.payload;
      const baseScenes = replaceScenes
        ? state.scenes.filter(s => s.episodeId !== episodeId)
        : state.scenes;
      return {
        ...state,
        scenes: [...baseScenes, ...newScenes],
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
    case 'SET_PENDING_RELOAD':
      return { ...state, pendingScriptReload: action.episodeId };

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
      return { ...state, workTimeLogs: mergeWorkLog(state.workTimeLogs, action.payload) };

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
      return {
        ...state,
        saveStatus: action.payload,
        savedAt: action.payload === 'saved' ? Date.now() : state.savedAt,
      };
    case 'SET_SAVE_ERROR_MSG':
      return { ...state, saveErrorMsg: action.payload };
    case 'SET_GUARD_PENDING':
      return { ...state, guardPending: action.payload };
    case 'CLEAR_GUARD_PENDING':
      return { ...state, guardPending: null };
    case 'SET_SCROLL_TO_SCENE':
      return { ...state, scrollToSceneId: action.id };

    // Phase 3 — .djs 파일 import에서 같은 ID 작품 충돌 시 '사본'(newId) 정책.
    // payload는 projectSerializer 형식. mergeImportedProject가 모든 ID를 새로 발급
    // 하고 cascading 참조를 새 ID로 매핑해 사본으로 추가한다. 같은 ID 충돌이 없는
    // 단순 import도 이 액션으로 처리 가능 (newId 정책은 ID 충돌과 무관하게 동작).
    case 'ADD_IMPORTED_PROJECT_COPY': {
      const next = mergeImportedProject(state, action.payload, 'newId');
      // 새로 추가된 작품을 활성화 — 사용자가 import 직후 바로 보게.
      const newProject = next.projects[next.projects.length - 1];
      return {
        ...next,
        activeProjectId: newProject?.id ?? state.activeProjectId,
        activeEpisodeId: null,
        activeDoc: null,
      };
    }

    // Phase 2.2b — 작품 단위 충돌 해결에서 사용. payload는 projectSerializer 형식
    // (project + cascading 배열 + trash). mergeImportedProject('replace')로 같은 ID
    // 작품의 모든 데이터를 통째로 교체하거나, 없는 작품을 새로 추가한다.
    case 'REPLACE_PROJECT_DATA': {
      const next = mergeImportedProject(state, action.payload, 'replace');
      // active 상태는 보존 — projectId가 그대로 존재하면 navigation 유지
      const targetId = action.payload?.project?.id;
      const projectStillExists = !!state.activeProjectId &&
        next.projects.some(pr => pr.id === state.activeProjectId);
      const epStillExists = !!state.activeEpisodeId &&
        next.episodes.some(e => e.id === state.activeEpisodeId);
      return {
        ...next,
        activeProjectId: projectStillExists ? state.activeProjectId : null,
        activeEpisodeId: epStillExists ? state.activeEpisodeId : null,
        activeDoc:       projectStillExists ? state.activeDoc : null,
        // 같은 작품 내 episode가 교체됐다면 에디터 강제 리로드
        pendingScriptReload: (state.activeProjectId === targetId && epStillExists)
          ? state.activeEpisodeId
          : state.pendingScriptReload,
      };
    }

    case 'LOAD_FROM_DRIVE': {
      const p = action.payload;
      const newProjects = p.projects?.length > 0 ? p.projects : state.projects;
      const newEpisodes = p.episodes?.length > 0 ? p.episodes : state.episodes;
      // project와 episode는 독립적으로 판단 — cover/synopsis 등 에피소드 없는 문서 편집 중에도
      //   project가 살아 있으면 navigation을 유지한다.
      const projectStillExists = !!state.activeProjectId &&
        newProjects.some(pr => pr.id === state.activeProjectId);
      const epStillExists = !!state.activeEpisodeId &&
        newEpisodes.some(e => e.id === state.activeEpisodeId);
      const nextBlocks = p.scriptBlocks?.length > 0 ? p.scriptBlocks : state.scriptBlocks;
      const detection = detectScriptBlockDuplicates(nextBlocks);
      if (detection.hasDuplicates) {
        console.warn('[중복감지] LOAD_FROM_DRIVE 시점 scriptBlocks 중복', {
          total: detection.totalDuplicates,
          totalBlocks: detection.totalBlocks,
          keys: detection.duplicateKeys,
        });
      }
      return {
        ...state,
        projects:       newProjects,
        episodes:       newEpisodes,
        characters:     p.characters?.length     > 0 ? p.characters     : state.characters,
        scenes:         p.scenes?.length         > 0 ? p.scenes         : state.scenes,
        scriptBlocks:   nextBlocks,
        coverDocs:      p.coverDocs?.length      > 0 ? p.coverDocs      : state.coverDocs,
        synopsisDocs:   p.synopsisDocs?.length   > 0 ? p.synopsisDocs   : state.synopsisDocs,
        resources:      p.resources?.length      > 0 ? p.resources      : state.resources,
        workTimeLogs:   p.workTimeLogs?.length   > 0 ? p.workTimeLogs   : state.workTimeLogs,
        checklistItems: p.checklistItems?.length > 0 ? p.checklistItems : state.checklistItems,
        trash:          (p.trash && typeof p.trash === 'object' && !Array.isArray(p.trash))
                          ? { ...EMPTY_TRASH, ...p.trash }
                          : (state.trash || EMPTY_TRASH),
        stylePreset:    p.stylePreset            ?? state.stylePreset,
        activeProjectId: projectStillExists ? state.activeProjectId : null,
        activeEpisodeId: epStillExists ? state.activeEpisodeId : null,
        activeDoc:       projectStillExists ? state.activeDoc : null,
        pendingScriptReload: epStillExists ? state.activeEpisodeId : state.pendingScriptReload,
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
  // INIT/LOAD_FROM_DRIVE 직후 Drive 자동저장을 건너뛰기 위한 플래그
  // (페이지 로드 시 데스크톱 데이터가 Drive를 덮어써서 모바일 데이터를 잃는 레이스컨디션 방지)
  const skipDriveSaveRef = useRef(false);
  const forcedSavedAtRef = useRef(null);
  // Size-guard refs — 저장 직전 데이터 급감 감지용
  // lastSavedSizesRef: 직전 성공 저장 시점의 { scriptBlocks, scenes } 개수 (null=첫 저장)
  // guardAcceptOnceRef: 사용자가 모달에서 "저장" 눌렀을 때 한 사이클만 가드 스킵
  // guardDismissedSizesRef: 사용자가 "취소" 누른 시점의 사이즈 — 이 값이 유지되는 동안 저장 보류
  const lastSavedSizesRef = useRef(null);
  const guardAcceptOnceRef = useRef(false);
  const guardDismissedSizesRef = useRef(null);
  // Phase 1.2 변경 감지: 작품별 fingerprint(cascading 데이터 길이 + max updatedAt).
  // 매 사이클마다 모든 작품을 신 형식으로 저장하면 503 rate limit hit 빈번 → 변경된 작품만 저장.
  // __index 키는 인덱스 파일의 마지막 저장 fingerprint.
  const lastProjFingerprintRef = useRef({});

  useEffect(() => {
    (async () => {
      // 기존 localStorage 데이터 → IndexedDB 1회 마이그레이션
      await migrateFromLocalStorage();

      const projects = await getAll(DB_KEYS.projects);
      if (projects.length > 0) {
        // Migration: strip legacy `subtitle` field from all episodes
        const rawEpisodes = await getAll(DB_KEYS.episodes);
        // eslint-disable-next-line no-unused-vars
        const migratedEpisodes = rawEpisodes.map(({ subtitle, ...ep }) => ep);
        skipSavedAtRef.current  = true; // INIT은 사용자 편집이 아님 → savedAt 갱신 건너뜀
        skipDriveSaveRef.current = true; // INIT 직후 Drive 덮어쓰기 방지
        const [characters, scenes, scriptBlocks, coverDocs, synopsisDocs, resources, workTimeLogs, checklistItems, trashRaw] =
          await Promise.all([
            getAll(DB_KEYS.characters),
            getAll(DB_KEYS.scenes),
            getAll(DB_KEYS.scriptBlocks),
            getAll(DB_KEYS.coverDocs),
            getAll(DB_KEYS.synopsisDocs),
            getAll(DB_KEYS.resources),
            getAll(DB_KEYS.workTimeLogs),
            getAll(DB_KEYS.checklistItems),
            getAll(DB_KEYS.trash),
          ]);
        // trash는 단일 객체 — getAll의 [] 폴백 또는 누락 시 EMPTY_TRASH 사용 (마이그레이션 안전망)
        const trash = (trashRaw && !Array.isArray(trashRaw) && typeof trashRaw === 'object')
          ? { ...EMPTY_TRASH, ...trashRaw }
          : { ...EMPTY_TRASH };
        const savedPreset = getItem(DB_KEYS.stylePresets);
        dispatch({
          type: 'INIT',
          payload: {
            projects,
            episodes: migratedEpisodes,
            characters,
            scenes,
            scriptBlocks,
            coverDocs,
            synopsisDocs,
            resources,
            workTimeLogs,
            checklistItems,
            trash,
            stylePreset: savedPreset || DEFAULT_STYLE_PRESET,
          },
        });

        // URL 우선, 없으면 localStorage fallback으로 마지막 위치 복원
        let restoreState = parsePath(window.location.pathname);
        if (!restoreState) {
          try {
            const raw = localStorage.getItem('drama_last_active');
            if (raw) {
              const parsed = JSON.parse(raw);
              // activeDoc은 whitelist 값만 허용 — localStorage 주입 방어
              const docOk = parsed?.activeDoc == null || ALLOWED_ACTIVE_DOCS.has(parsed.activeDoc);
              if (parsed && docOk && (parsed.activeDoc || parsed.activeProjectId)) restoreState = parsed;
            }
          } catch {}
        }
        if (restoreState) {
          const { activeDoc, activeProjectId, activeEpisodeId } = restoreState;
          const projectExists = activeProjectId ? projects.some(p => p.id === activeProjectId) : false;
          const epExists = activeEpisodeId
            ? migratedEpisodes.some(e => e.id === activeEpisodeId && e.projectId === activeProjectId)
            : true;
          if (activeDoc === 'mypage') {
            dispatch({ type: 'SET_ACTIVE_DOC', payload: 'mypage' });
          } else if (projectExists && epExists) {
            if (activeDoc === 'script' && activeEpisodeId) {
              dispatch({ type: 'SET_ACTIVE_PROJECT', id: activeProjectId });
              dispatch({ type: 'SET_ACTIVE_EPISODE', id: activeEpisodeId });
            } else if (activeDoc && activeProjectId) {
              dispatch({ type: 'SET_ACTIVE_PROJECT', id: activeProjectId });
              dispatch({ type: 'SET_ACTIVE_DOC', payload: activeDoc });
            }
          }
        }
      } else {
        // Check for shared data in URL
        const hash = window.location.hash;
        if (hash.startsWith('#share=')) {
          try {
            const raw = JSON.parse(atob(decodeURIComponent(hash.slice(7))));
            const decoded = sharePayloadSchema.parse(raw);
            // 비인증 상태에서 공유 URL이 로컬 DB를 덮어쓰는 것을 방지 — 명시적 동의 필요
            const projectTitle = decoded.projects?.[0]?.title || '공유된 프로젝트';
            const confirmed = window.confirm(
              `"${projectTitle}" 데이터를 가져오시겠습니까?\n\n현재 저장된 데이터가 없는 경우에만 가져올 수 있습니다.`
            );
            if (!confirmed) {
              window.location.hash = '';
              // fallthrough to seed
            } else {
              await Promise.all(
                Object.entries(decoded)
                  .filter(([key]) => DB_KEYS[key])
                  .map(([key, data]) => setAll(DB_KEYS[key], data))
              );
              window.location.hash = '';
              dispatch({ type: 'INIT', payload: decoded });
              return;
            }
          } catch { /* fallthrough to seed */ }
        }
        // 신규 사용자는 빈 상태로 시작 — 더미 작품/인물 자동 생성 X.
        // CenterPanel·LeftPanel·ProjectsManagePage가 빈 상태 안내 UI를 충분히
        // 제공하고, 사용자가 명시적으로 "새 작품"을 만들도록 유도한다.
        dispatch({ type: 'INIT', payload: {} });
      }
    })();
  }, []);

  // 부팅 후 1회: 휴지통 30일 만료 정리 (사용자 알림 X — 조용히)
  useEffect(() => {
    if (!state.initialized) return;
    dispatch({ type: 'PURGE_EXPIRED_TRASH' });
  }, [state.initialized]);

  useEffect(() => {
    if (!state.initialized) return;
    // 가드 모달이 떠 있으면 persist 보류 — 사용자 응답 후 재개
    if (state.guardPending) return;
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(async () => {
      // Size guard: 70%+ 감소 감지 시 저장 중단 + 모달 트리거
      // INIT/LOAD_FROM_DRIVE 로 lastSavedSizesRef가 비면 초기값으로 선주입 후 비교 스킵
      const currentSizes = {
        scriptBlocks: state.scriptBlocks.length,
        scenes: state.scenes.length,
      };
      const dismissed = guardDismissedSizesRef.current;
      if (lastSavedSizesRef.current === null) {
        lastSavedSizesRef.current = currentSizes;
      } else if (guardAcceptOnceRef.current) {
        // 사용자가 직전 모달에서 "저장"을 선택 — 이 사이클은 가드 스킵
        guardAcceptOnceRef.current = false;
        guardDismissedSizesRef.current = null;
        // 사용자 수용 = baseline 확정 (저장 결과와 독립)
        lastSavedSizesRef.current = currentSizes;
      } else if (
        dismissed &&
        dismissed.scriptBlocks === currentSizes.scriptBlocks &&
        dismissed.scenes === currentSizes.scenes
      ) {
        // 사용자가 취소한 사이즈 그대로 — 편집 없으므로 저장 보류
        return;
      } else {
        // 사이즈가 dismissed와 달라졌으면 취소 상태 해제하고 재평가
        if (dismissed) guardDismissedSizesRef.current = null;
        const diff = computeSizeGuard(lastSavedSizesRef.current, currentSizes);
        if (diff) {
          dispatch({
            type: 'SET_GUARD_PENDING',
            payload: { diff, snapshotAt: Date.now() },
          });
          return;
        }
      }

      // 로컬 drama_saved_at과 Drive savedAt이 반드시 같은 시각을 쓰도록 한 번만 생성
      const savedAt = forcedSavedAtRef.current || new Date().toISOString();
      // drama_saved_at 쓰기는 Drive 쓰기 결과에 따라 지연 처리 (옵션 A) — try 스코프 밖에서 참조
      let shouldUpdateSavedAt = false;
      try {
        await Promise.all([
          setAll(DB_KEYS.projects,      state.projects),
          setAll(DB_KEYS.episodes,      state.episodes),
          setAll(DB_KEYS.characters,    state.characters),
          setAll(DB_KEYS.scenes,        state.scenes),
          setAll(DB_KEYS.scriptBlocks,  state.scriptBlocks),
          setAll(DB_KEYS.coverDocs,     state.coverDocs),
          setAll(DB_KEYS.synopsisDocs,  state.synopsisDocs),
          setAll(DB_KEYS.resources,     state.resources),
          setAll(DB_KEYS.workTimeLogs,  state.workTimeLogs),
          setAll(DB_KEYS.checklistItems, state.checklistItems),
          setAll(DB_KEYS.trash,          state.trash || EMPTY_TRASH),
        ]);
        if (localStorage.getItem('drama_auth_user')) {
          setItem(DB_KEYS.stylePresets, state.stylePreset);
        }
        // drama_saved_at 쓰기는 try 블록 밖 Drive 결과에 따라 처리 — 여기서는 flag 캡처만
        shouldUpdateSavedAt = !skipSavedAtRef.current;
        skipSavedAtRef.current = false;
        forcedSavedAtRef.current = null;
        lastSavedSizesRef.current = currentSizes;
      } catch (e) {
        console.error('[AppContext] IndexedDB 저장 실패:', e?.name, e?.message);
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'error' });
        dispatch({ type: 'SET_SAVE_ERROR_MSG', payload: `저장 실패: ${e?.message || '알 수 없는 오류'}` });
        forcedSavedAtRef.current = null;
        return;
      }
      // Drive 자동저장 (토큰 유효할 때만)
      // INIT/LOAD_FROM_DRIVE 직후 한 사이클은 건너뜀 — Drive 데이터를 덮어쓰는 레이스컨디션 방지
      const skipDrive = skipDriveSaveRef.current;
      skipDriveSaveRef.current = false;
      // skipDrive (INIT/LOAD_FROM_DRIVE 직후 한 사이클): drama_saved_at 즉시 동기화.
      // 토큰 만료/비로그인은 Drive 호출 안 하므로 drama_saved_at도 갱신 보류 →
      // 토큰 복구 후 다음 사이클의 PATCH 발사 직전에 갱신. 그래야 재로그인 시 충돌 모달 안 뜸.
      if (shouldUpdateSavedAt && skipDrive) {
        try { localStorage.setItem('drama_saved_at', savedAt); } catch {}
      }
      if (isTokenValid() && !skipDrive) {
        // PATCH 발사 직전 갱신 — .then() 미도달 윈도우(unload/OAuth redirect)에서
        // 옛 시각으로 동결되어 Drive와 어긋나는 케이스 차단.
        // 의미: "마지막 업로드 시도 시각" — 실패 시 다음 사이클 성공으로 자연 회복.
        if (shouldUpdateSavedAt) {
          try { localStorage.setItem('drama_saved_at', savedAt); } catch {}
        }
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
          trash:          state.trash || EMPTY_TRASH,
          stylePreset:    state.stylePreset,
          deviceId:       getDeviceId(),
          savedAt,
        })
          .catch(e => {
            // DRIVE_AUTH_REQUIRED: isTokenValid() 로컬 감지 — 서버 호출 전 정상 흐름, 무해하게 스킵
            if (e.message === 'DRIVE_AUTH_REQUIRED') return;
            const { kind } = describeDriveError(e);
            if (kind === 'auth' || kind === 'perm') {
              // 실제 인증/권한 오류 → 토큰 무효화해서 다음 사이클 자동저장 시도 방지
              clearAccessToken();
              console.warn('[Drive] 자동저장 인증/권한 오류 — 재로그인 필요:', e.message);
            } else if (kind === 'quota') {
              // 토큰은 유효 — clearAccessToken 하면 불필요한 재로그인 유발
              // 사용자 알림은 수동저장/백업 시도 시 UI 레이어에서 처리됨
              console.warn('[Drive] 자동저장 실패: 드라이브 용량 부족 (수동 저장 시 안내됨)');
            } else if (kind === 'rate') {
              console.warn('[Drive] 자동저장 레이트 리밋 — 다음 사이클에서 재시도');
            } else {
              console.warn('[Drive] 자동저장 실패:', e);
            }
          });

        // Phase 1.2 — 신 형식(작품별 파일 + 인덱스) 병행 저장.
        // 변경된 작품만 저장 (옵션 B): fingerprint 비교로 매 사이클 N+2 폭발을 막아
        // Drive API rate limit(503 transientError) 회피.
        // 구 형식이 source of truth이므로 실패해도 silent + console.warn만.
        const deviceId = getDeviceId();
        const projectsMeta = state.projects.map(p => ({
          id: p.id,
          title: p.title,
          updatedAt: p.updatedAt,
          savedAt,
        }));
        const changedProjects = state.projects.filter(p => {
          const fp = projectFingerprint(state, p.id);
          return lastProjFingerprintRef.current[p.id] !== fp;
        });
        const indexFp = projectsMeta.map(m => `${m.id}:${m.updatedAt}`).join(',');
        const indexChanged = lastProjFingerprintRef.current.__index !== indexFp;

        const v2Tasks = [];
        if (indexChanged) {
          v2Tasks.push({ kind: 'index', run: () => saveProjectsIndex({ projects: projectsMeta, savedAt, deviceId }) });
        }
        for (const p of changedProjects) {
          v2Tasks.push({
            kind: 'project',
            id: p.id,
            run: () => saveProjectToDrive(p.id, serializeProject(state, p.id, { drive: { savedAt, deviceId } })),
          });
        }
        if (v2Tasks.length > 0) {
          Promise.all(v2Tasks.map(t => t.run())).then(() => {
            for (const p of changedProjects) {
              lastProjFingerprintRef.current[p.id] = projectFingerprint(state, p.id);
            }
            if (indexChanged) lastProjFingerprintRef.current.__index = indexFp;
            // 삭제된 작품의 fingerprint 정리 (메모리 누수 방지)
            const validIds = new Set(state.projects.map(p => p.id));
            for (const k of Object.keys(lastProjFingerprintRef.current)) {
              if (k !== '__index' && !validIds.has(k)) delete lastProjFingerprintRef.current[k];
            }
          }).catch(e => {
            if (e?.message === 'DRIVE_AUTH_REQUIRED') return;
            console.warn('[Drive] 작품별 신 형식 저장 실패 (구 형식 정상):', e?.message || e);
          });
        }
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
    // guardPending이 non-null → null로 바뀌는 전이를 효과가 감지해 저장을 재개하도록 포함
    state.guardPending,
  ]);

  // 상태 변경마다 URL 동기화 + localStorage fallback 저장
  // 주의: 초기화 직후 activeDoc/projectId가 null인 상태에서 기존 저장본을 지우면
  //       복원 로직이 fallback을 읽기 전에 사라져 새로고침 시 빈 workspace로 떨어짐.
  //       null 스냅에서는 아무 조치도 하지 않고 복원 dispatch 후의 값만 저장한다.
  useEffect(() => {
    if (!state.initialized) return;
    const snap = {
      activeDoc: state.activeDoc,
      activeProjectId: state.activeProjectId,
      activeEpisodeId: state.activeEpisodeId,
    };
    syncUrl(snap);
    if (!snap.activeDoc && !snap.activeProjectId) return;
    try {
      localStorage.setItem('drama_last_active', JSON.stringify(snap));
    } catch {}
  }, [state.initialized, state.activeDoc, state.activeProjectId, state.activeEpisodeId]);

  // Drive/스냅샷에서 불러올 때 사용
  // 주의: skipDriveSaveRef를 쓰지 않는다 — 복원 후 편집이 없으면 Drive에는 여전히 옛 버전이 남아
  //       다음 새로고침에서 그 옛 버전이 복원된 상태를 덮어쓰는 사고가 발생했다.
  //       복원 직후에도 자동저장이 돌아 Drive에 복원 상태를 반영하도록 한다.
  // useCallback 필수: 소비자(MenuBar 등)의 useCallback이 이 함수를 deps에 두면 매 렌더마다 새 참조가
  //   되어 effect 무한 재발사 → conflict 모달 끝없이 트리거되는 사고 발생.
  const loadFromDriveData = useCallback((drivePayload, options = {}) => {
    const { syncBackToDrive = false } = options;

    skipSavedAtRef.current = true;
    skipDriveSaveRef.current = !syncBackToDrive;

    if (syncBackToDrive) {
      const nextSavedAt = new Date().toISOString();
      forcedSavedAtRef.current = nextSavedAt;
      try { localStorage.setItem('drama_saved_at', nextSavedAt); } catch {}
    } else {
      forcedSavedAtRef.current = null;
      if (drivePayload.savedAt) {
        try { localStorage.setItem('drama_saved_at', drivePayload.savedAt); } catch {}
      }
    }

    dispatch({ type: 'LOAD_FROM_DRIVE', payload: drivePayload });
  }, []);

  // Size-guard user responses — SizeGuardModal에서 호출
  const acceptSizeGuard = () => {
    // 다음 persist 사이클에서 가드 스킵하고 그대로 저장
    guardAcceptOnceRef.current = true;
    dispatch({ type: 'CLEAR_GUARD_PENDING' });
  };
  // 수동 저장(handleSave) 등에서 변경된 작품만 PUT하기 위해 fingerprint ref 공유.
  // 자동저장(persist effect)이 사용하는 동일한 ref이므로 어느 쪽이 먼저 PUT해도
  // 다른 쪽이 다시 같은 작품을 PUT하지 않음.
  const getChangedProjectIds = useCallback((targetState) => {
    if (!targetState?.projects) return [];
    return targetState.projects
      .filter(p => projectFingerprint(targetState, p.id) !== lastProjFingerprintRef.current[p.id])
      .map(p => p.id);
  }, []);

  // PUT 성공 후 호출 — 다음 사이클에서 같은 작품을 또 PUT하지 않도록 ref 갱신.
  // 인덱스 fingerprint도 함께 갱신 (작품 추가/삭제/제목 변경 시 인덱스도 변하기 때문).
  const markProjectsSynced = useCallback((targetState, projectIds) => {
    if (!targetState?.projects || !Array.isArray(projectIds)) return;
    const ids = new Set(projectIds);
    for (const p of targetState.projects) {
      if (ids.has(p.id)) {
        lastProjFingerprintRef.current[p.id] = projectFingerprint(targetState, p.id);
      }
    }
    const indexFp = targetState.projects
      .map(m => `${m.id}:${m.updatedAt}`)
      .join(',');
    lastProjFingerprintRef.current.__index = indexFp;
  }, []);

  const cancelSizeGuard = () => {
    // 현재 크기를 취소 baseline으로 기억 — 사용자가 다시 편집하기 전까지 저장 보류
    guardDismissedSizesRef.current = {
      scriptBlocks: state.scriptBlocks.length,
      scenes: state.scenes.length,
    };
    dispatch({ type: 'CLEAR_GUARD_PENDING' });
  };

  return (
    <AppContext.Provider value={{ state, dispatch, loadFromDriveData, acceptSizeGuard, cancelSizeGuard, getChangedProjectIds, markProjectsSynced, genId, now }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

// Exported for unit tests (e.g. AppContext.test.js). Not intended as a public API.
export { reducer };
