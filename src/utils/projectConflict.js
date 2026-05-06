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

  return conflicts;
}
