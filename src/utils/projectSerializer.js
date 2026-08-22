/**
 * Project serializer — Drive 대본별 저장과 .djs 파일 export/import 공통.
 *
 * 한 대본 = { project, episodes, characters, scenes, scriptBlocks, coverDocs,
 *           synopsisDocs, resources, workTimeLogs, checklistItems, trash } 직렬화.
 *
 * Drive 동기화 시에는 drive 메타(savedAt, deviceId)를 함께 포함.
 *
 * format='djs' / version=1 — 미래 마이그레이션은 version 증가로 호환 처리.
 */
import { z } from 'zod';
import { genId } from '../store/db';

const FORMAT = 'djs';
const VERSION = 1;
const APP_NAME = '대본 작업실';

// ── Zod 스키마 ────────────────────────────────────────────────────────────────
const dbRecord = z.record(z.string(), z.unknown());
const dbArray = () => z.array(dbRecord).optional().default([]);

export const projectExportSchema = z.object({
  format:     z.literal(FORMAT),
  version:    z.literal(VERSION),
  exportedAt: z.string(),
  app:        z.object({ name: z.string(), version: z.string() }).optional(),
  project:    dbRecord,
  episodes:       dbArray(),
  characters:     dbArray(),
  scenes:         dbArray(),
  scriptBlocks:   dbArray(),
  coverDocs:      dbArray(),
  synopsisDocs:   dbArray(),
  resources:      dbArray(),
  workTimeLogs:   dbArray(),
  checklistItems: dbArray(),
  // AI 피드백. version 을 올리지 않고 키만 늘렸다 — z.object 는 모르는 키를 걷어내므로
  // 구버전 앱이 이 파일을 열어도 에러 없이 열리고(피드백만 빠짐), 신버전이 구버전 파일을
  // 열면 default([]) 로 채워진다. 양방향 모두 마이그레이션이 필요 없다.
  aiFeedbacks:    dbArray(),
  trash:      z.record(z.string(), z.array(dbRecord).optional().default([])).optional().default({}),
  drive:      z.object({ savedAt: z.string(), deviceId: z.string() }).optional(),
});

const CASCADING_KEYS = [
  'episodes', 'characters', 'scenes', 'scriptBlocks',
  'coverDocs', 'synopsisDocs', 'resources',
  'workTimeLogs', 'checklistItems', 'aiFeedbacks',
];

// ── Serialize: state에서 한 대본의 모든 데이터 추출 ───────────────────────────
export function serializeProject(state, projectId, opts = {}) {
  const project = state.projects?.find(p => p.id === projectId);
  if (!project) return null;

  const filterByProject = (arr) => (arr || []).filter(it => it.projectId === projectId);

  const trashFiltered = {};
  const trash = state.trash || {};
  for (const [key, items] of Object.entries(trash)) {
    if (Array.isArray(items)) {
      trashFiltered[key] = items.filter(it => it.projectId === projectId);
    }
  }

  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    app: { name: APP_NAME, version: import.meta.env?.VITE_BUILD_VERSION || 'dev' },
    project,
    episodes:       filterByProject(state.episodes),
    characters:     filterByProject(state.characters),
    scenes:         filterByProject(state.scenes),
    scriptBlocks:   filterByProject(state.scriptBlocks),
    coverDocs:      filterByProject(state.coverDocs),
    synopsisDocs:   filterByProject(state.synopsisDocs),
    resources:      filterByProject(state.resources),
    workTimeLogs:   filterByProject(state.workTimeLogs),
    checklistItems: filterByProject(state.checklistItems),
    aiFeedbacks:    filterByProject(state.aiFeedbacks),
    trash:          trashFiltered,
    ...(opts.drive ? { drive: opts.drive } : {}),
  };
}

// ── Deserialize: 외부 데이터 검증 + 정규화 ────────────────────────────────────
// 잘못된 입력은 ZodError를 throw — 호출자가 try/catch로 사용자 친화 메시지 변환.
export function deserializeProject(rawData) {
  return projectExportSchema.parse(rawData);
}

// ── 충돌 감지: 같은 ID의 대본이 이미 state에 있는가 ──────────────────────────
export function findImportConflict(state, imported) {
  const importedId = imported?.project?.id;
  if (!importedId) return null;
  return state.projects?.find(p => p.id === importedId) || null;
}

// ── 새 ID 발급 + cascading 참조 갱신 ─────────────────────────────────────────
// 'newId' 정책 진입점. project, episodes, characters, scenes의 ID를 모두 새로
// 발급하고, scriptBlocks 등의 외래키 참조를 새 ID로 매핑한다.
function reIdProject(imported) {
  const newProjectId  = genId();
  const episodeIdMap  = new Map((imported.episodes  || []).map(e => [e.id, genId()]));
  const characterIdMap = new Map((imported.characters || []).map(c => [c.id, genId()]));
  const sceneIdMap    = new Map((imported.scenes    || []).map(s => [s.id, genId()]));

  const remapEntity = (it) => {
    if (!it) return it;
    const next = { ...it, id: genId(), projectId: newProjectId };
    return next;
  };
  const remapEpisode = (e) => ({ ...e, id: episodeIdMap.get(e.id) || genId(), projectId: newProjectId });
  const remapCharacter = (c) => ({ ...c, id: characterIdMap.get(c.id) || genId(), projectId: newProjectId });
  const remapScene = (s) => ({
    ...s,
    id: sceneIdMap.get(s.id) || genId(),
    projectId: newProjectId,
    episodeId: s.episodeId ? (episodeIdMap.get(s.episodeId) || s.episodeId) : s.episodeId,
    characterIds: Array.isArray(s.characterIds)
      ? s.characterIds.map(cid => characterIdMap.get(cid) || cid)
      : s.characterIds,
  });
  const remapScriptBlock = (b) => ({
    ...b,
    id: genId(),
    projectId: newProjectId,
    episodeId:    b.episodeId    ? (episodeIdMap.get(b.episodeId) || b.episodeId) : b.episodeId,
    sceneId:      b.sceneId      ? (sceneIdMap.get(b.sceneId)     || b.sceneId)   : b.sceneId,
    characterId:  b.characterId  ? (characterIdMap.get(b.characterId) || b.characterId) : b.characterId,
  });

  // AI 피드백은 회차를 참조한다. episodeNumber 는 요청 당시의 값을 그대로 둔다 —
  // 표시용 스냅샷이라 새 ID 로 옮겨도 "몇 회차를 검토했는지"는 바뀌지 않아야 한다.
  const remapAiFeedback = (f) => ({
    ...f,
    id: genId(),
    projectId: newProjectId,
    episodeId: f.episodeId ? (episodeIdMap.get(f.episodeId) || f.episodeId) : f.episodeId,
  });

  const projectTitle = (imported.project?.title || '제목없음') + ' (사본)';

  return {
    project: { ...imported.project, id: newProjectId, title: projectTitle },
    episodes:       (imported.episodes       || []).map(remapEpisode),
    characters:     (imported.characters     || []).map(remapCharacter),
    scenes:         (imported.scenes         || []).map(remapScene),
    scriptBlocks:   (imported.scriptBlocks   || []).map(remapScriptBlock),
    coverDocs:      (imported.coverDocs      || []).map(remapEntity),
    synopsisDocs:   (imported.synopsisDocs   || []).map(remapEntity),
    resources:      (imported.resources      || []).map(remapEntity),
    workTimeLogs:   (imported.workTimeLogs   || []).map(l => ({ ...l, projectId: newProjectId })),
    checklistItems: (imported.checklistItems || []).map(remapEntity),
    aiFeedbacks:    (imported.aiFeedbacks    || []).map(remapAiFeedback),
    trash:          imported.trash || {},
  };
}

// ── Merge: imported 대본을 현재 state에 합침 ─────────────────────────────────
// policy: 'replace' (같은 ID 대본과 cascading 모두 제거 후 imported로 교체)
//         'newId'   (모든 ID 새로 발급해서 사본으로 추가)
export function mergeImportedProject(state, imported, policy = 'newId') {
  const data = policy === 'newId' ? reIdProject(imported) : imported;
  const targetProjectId = data.project.id;

  if (policy === 'replace') {
    // 기존 같은 projectId의 모든 데이터 제거 후 imported로 추가
    const removeAndAdd = (key) => {
      const existing = (state[key] || []).filter(it => it.projectId !== targetProjectId);
      return [...existing, ...(data[key] || [])];
    };
    const projects = [
      ...(state.projects || []).filter(p => p.id !== targetProjectId),
      data.project,
    ];
    const next = { ...state, projects };
    for (const k of CASCADING_KEYS) next[k] = removeAndAdd(k);
    // trash는 대본별 항목만 교체
    const trashNext = { ...(state.trash || {}) };
    for (const [tk, tItems] of Object.entries(data.trash || {})) {
      const existing = (trashNext[tk] || []).filter(it => it.projectId !== targetProjectId);
      trashNext[tk] = [...existing, ...(tItems || [])];
    }
    next.trash = trashNext;
    return next;
  }

  // 'newId' — 단순 추가
  const next = { ...state, projects: [...(state.projects || []), data.project] };
  for (const k of CASCADING_KEYS) next[k] = [...(state[k] || []), ...(data[k] || [])];
  return next;
}

// ── 대본별 payloads → 통합 state 형태로 결합 ─────────────────────────────────
// loadAllProjectsFromDrive에서 사용. LOAD_FROM_DRIVE reducer가 받는 형태와 호환.
// 인덱스의 savedAt/deviceId는 메타로 보존.
export function combineProjectsToState(payloads, { index } = {}) {
  const result = {
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
    aiFeedbacks: [],
    trash: {},
  };
  for (const p of payloads) {
    if (!p?.project) continue;
    result.projects.push(p.project);
    for (const k of CASCADING_KEYS) {
      result[k].push(...(p[k] || []));
    }
    for (const [tk, items] of Object.entries(p.trash || {})) {
      if (!result.trash[tk]) result.trash[tk] = [];
      if (Array.isArray(items)) result.trash[tk].push(...items);
    }
  }
  if (index?.savedAt)  result.savedAt  = index.savedAt;
  if (index?.deviceId) result.deviceId = index.deviceId;
  // 인덱스 메타(대본별 updatedAt/savedAt) 보존 — 대본 단위 충돌 감지에 사용 (Phase 2.1).
  // _ prefix는 LOAD_FROM_DRIVE reducer가 무시한다는 신호.
  if (index) result._index = index;
  return result;
}
