// 작품 유형 프리셋 ─ NewProjectModal과 여러 컴포넌트에서 공유
export const PROJECT_TYPE_PRESETS = [
  { id: 'movie',     label: '영화',        totalMins: 100, climaxStart: 78, climaxEnd: 95,  isMulti: false },
  { id: 'kdrama',    label: '드라마',      totalMins: 60,  climaxStart: 48, climaxEnd: 58,  isMulti: true  },
  { id: 'webdrama',  label: '웹드라마',    totalMins: 30,  climaxStart: 23, climaxEnd: 28,  isMulti: true  },
  { id: 'shortform', label: '숏폼드라마',  totalMins: 10,  climaxStart: 7,  climaxEnd: 9,   isMulti: true  },
  { id: 'custom',    label: '기타',        totalMins: 60,  climaxStart: 48, climaxEnd: 58,  isMulti: true  },
];

export const PROJECT_TYPE_MAP = Object.fromEntries(PROJECT_TYPE_PRESETS.map(p => [p.id, p]));

// 기존 데이터 호환: 'single' → 단막(영화처럼 처리), 'series' → 드라마처럼 처리
export function isMultiEpisode(projectType) {
  return ['series', 'kdrama', 'webdrama', 'shortform', 'custom'].includes(projectType);
}

export function getTypeLabel(projectType) {
  if (projectType === 'series') return '드라마';
  if (projectType === 'single') return '단막';
  return PROJECT_TYPE_MAP[projectType]?.label ?? projectType ?? '기타';
}
