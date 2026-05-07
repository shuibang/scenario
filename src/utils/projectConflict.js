import { serializeProject } from './projectSerializer';

const CONFLICT_KEYS = [
  'project',
  'episodes',
  'characters',
  'scenes',
  'scriptBlocks',
  'coverDocs',
  'synopsisDocs',
  'resources',
  'checklistItems',
];

const UPDATED_AT_SOURCES = [
  'episodes',
  'characters',
  'scenes',
  'scriptBlocks',
  'coverDocs',
  'synopsisDocs',
  'resources',
  'checklistItems',
];

const VOLATILE_KEYS = new Set([
  'updatedAt',
  'createdAt',
  'exportedAt',
  'savedAt',
  'deviceId',
]);

const ORDER_SENSITIVE_ARRAY_KEYS = new Set([
  'scriptBlocks',
]);

function toMillis(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeValue(value) {
  if (Array.isArray(value)) return value.map(item => normalizeValue(item));
  if (!value || typeof value !== 'object') return value;

  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    if (VOLATILE_KEYS.has(key)) continue;
    const nextValue = normalizeValue(value[key]);
    if (typeof nextValue === 'undefined') continue;
    normalized[key] = nextValue;
  }
  return normalized;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(
      key => `${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

function getComparableProjectPayload(state, projectId) {
  const payload = serializeProject(state, projectId);
  if (!payload) return null;

  const comparable = {};
  for (const key of CONFLICT_KEYS) {
    const rawValue = payload[key] || (key === 'project' ? null : []);
    const normalized = normalizeValue(rawValue);
    if (Array.isArray(normalized) && !ORDER_SENSITIVE_ARRAY_KEYS.has(key)) {
      comparable[key] = [...normalized].sort((a, b) => {
        const left = stableStringify(a);
        const right = stableStringify(b);
        return left.localeCompare(right);
      });
    } else {
      comparable[key] = normalized;
    }
  }
  return comparable;
}

export function getProjectConflictFingerprint(state, projectId) {
  const comparable = getComparableProjectPayload(state, projectId);
  if (!comparable) return null;
  return stableStringify(comparable);
}

export function getProjectConflictUpdatedAt(state, projectId) {
  const project = state?.projects?.find(p => p?.id === projectId);
  if (!project) return null;

  let max = toMillis(project.updatedAt || project.createdAt);
  for (const sourceKey of UPDATED_AT_SOURCES) {
    for (const item of state?.[sourceKey] || []) {
      if (item?.projectId !== projectId) continue;
      max = Math.max(max, toMillis(item.updatedAt || item.createdAt));
    }
  }

  return max ? new Date(max).toISOString() : null;
}

// 디버그용 — localStorage('drama_debug_sync_conflicts','1')로 켜면 충돌 발견 시
// 양쪽 comparable payload의 어느 키가 다른지 콘솔에 출력. 같은 기기에서 모달이
// 자꾸 뜨는 케이스의 root cause를 잡기 위함 (IndexedDB↔JSON 왕복 시 형 변환 등).
function isDebugEnabled() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('drama_debug_sync_conflicts') === '1';
  } catch {
    return false;
  }
}

function logConflictDiff(projectId, title, localState, driveState) {
  if (!isDebugEnabled()) return;
  const local = getComparableProjectPayload(localState, projectId);
  const drive = getComparableProjectPayload(driveState, projectId);
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(drive || {})]);
  const diffs = {};
  for (const key of keys) {
    const a = stableStringify(local?.[key]);
    const b = stableStringify(drive?.[key]);
    if (a !== b) diffs[key] = { local: local?.[key], drive: drive?.[key] };
  }
  // window에 노출 → 사용자가 콘솔에서 copy(JSON.stringify(window.__lastConflictDiff, null, 2))로
  // 한 번에 클립보드 복사 가능. 큰 객체를 펼치고 캡처하는 부담 줄임.
  if (typeof window !== 'undefined') {
    window.__lastConflictDiff = { projectId, title, diffs, diffKeys: Object.keys(diffs) };
  }
  // eslint-disable-next-line no-console
  console.groupCollapsed(`[sync conflict diff] ${title || projectId}`);
  // eslint-disable-next-line no-console
  console.log('projectId:', projectId);
  // eslint-disable-next-line no-console
  console.log('차이나는 키들:', Object.keys(diffs));
  // eslint-disable-next-line no-console
  console.log('전체 diff: copy(JSON.stringify(window.__lastConflictDiff, null, 2)) 로 클립보드 복사');
  for (const [key, value] of Object.entries(diffs)) {
    // eslint-disable-next-line no-console
    console.log(`[${key}] local:`, value.local, '\nDrive:', value.drive);
  }
  // eslint-disable-next-line no-console
  console.groupEnd();
}

export function buildProjectConflicts(localState, driveState) {
  const localProjects = localState?.projects || [];
  const driveProjects = driveState?.projects || [];
  const localById = new Map(localProjects.map(project => [project.id, project]));
  const driveById = new Map(driveProjects.map(project => [project.id, project]));
  const conflicts = [];

  for (const localProject of localProjects) {
    const driveProject = driveById.get(localProject.id);
    if (!driveProject) {
      conflicts.push({
        projectId: localProject.id,
        title: localProject.title,
        kind: 'localOnly',
        local: { updatedAt: getProjectConflictUpdatedAt(localState, localProject.id) },
      });
      continue;
    }

    const localFingerprint = getProjectConflictFingerprint(localState, localProject.id);
    const driveFingerprint = getProjectConflictFingerprint(driveState, localProject.id);
    if (localFingerprint !== driveFingerprint) {
      logConflictDiff(localProject.id, localProject.title, localState, driveState);
      conflicts.push({
        projectId: localProject.id,
        title: localProject.title || driveProject.title,
        kind: 'conflict',
        local: { updatedAt: getProjectConflictUpdatedAt(localState, localProject.id) },
        drive: {
          updatedAt: getProjectConflictUpdatedAt(driveState, localProject.id),
          savedAt: driveState?.savedAt || null,
        },
      });
    }
  }

  for (const driveProject of driveProjects) {
    if (localById.has(driveProject.id)) continue;
    conflicts.push({
      projectId: driveProject.id,
      title: driveProject.title,
      kind: 'driveOnly',
      drive: {
        updatedAt: getProjectConflictUpdatedAt(driveState, driveProject.id),
        savedAt: driveState?.savedAt || null,
      },
    });
  }

  // Debug: 모달 트리거(=conflicts.length>0) 시 요약 로그.
  // kind별로 카운트해 어떤 종류 충돌인지(같은 기기 같은 작품의 conflict 인지 / 한쪽에만 있는
  // localOnly·driveOnly 인지) 구분 가능. localOnly/driveOnly만 있으면 logConflictDiff는
  // 호출되지 않으므로 별도 요약이 필요.
  if (isDebugEnabled() && conflicts.length > 0) {
    const counts = conflicts.reduce((acc, c) => {
      acc[c.kind] = (acc[c.kind] || 0) + 1;
      return acc;
    }, {});
    // eslint-disable-next-line no-console
    console.warn('[sync conflict 요약]', {
      total: conflicts.length,
      counts,
      localProjectIds: localProjects.map(p => p.id),
      driveProjectIds: driveProjects.map(p => p.id),
      conflicts: conflicts.map(c => ({ id: c.projectId, title: c.title, kind: c.kind })),
    });
  }

  return conflicts;
}
