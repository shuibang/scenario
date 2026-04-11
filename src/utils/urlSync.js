// URL ↔ 앱 상태 동기화 유틸
// React Router 없이 window.history.replaceState로 URL만 동기화

const BASE = '/app';

// activeDoc + projectId + episodeId → URL pathname
export function buildPath({ activeDoc, activeProjectId, activeEpisodeId }) {
  if (!activeDoc || !activeProjectId) return BASE;
  switch (activeDoc) {
    case 'script':
      return activeEpisodeId
        ? `${BASE}/edit/${activeProjectId}/${activeEpisodeId}`
        : BASE;
    case 'structure':    return `${BASE}/structure/${activeProjectId}`;
    case 'characters':   return `${BASE}/characters/${activeProjectId}`;
    case 'cover':        return `${BASE}/cover/${activeProjectId}`;
    case 'synopsis':     return `${BASE}/synopsis/${activeProjectId}`;
    case 'scenelist':    return `${BASE}/scenelist/${activeProjectId}`;
    case 'treatment':    return `${BASE}/treatment/${activeProjectId}`;
    case 'resources':    return `${BASE}/resources/${activeProjectId}`;
    case 'biography':    return `${BASE}/biography/${activeProjectId}`;
    case 'relationships':return `${BASE}/relationships/${activeProjectId}`;
    case 'mypage':       return `${BASE}/mypage`;
    default:             return BASE;
  }
}

// URL pathname → { activeDoc, activeProjectId, activeEpisodeId }
export function parsePath(pathname) {
  const p = pathname.replace(/\/$/, ''); // trailing slash 제거
  const rel = p.startsWith(BASE) ? p.slice(BASE.length) : '';
  const parts = rel.split('/').filter(Boolean); // ['edit','pid','eid'] 등

  if (parts.length === 0) return null;

  const [seg, projectId, episodeId] = parts;
  switch (seg) {
    case 'edit':
      if (projectId && episodeId)
        return { activeDoc: 'script', activeProjectId: projectId, activeEpisodeId: episodeId };
      return null;
    case 'structure':    return projectId ? { activeDoc: 'structure',     activeProjectId: projectId, activeEpisodeId: null } : null;
    case 'characters':   return projectId ? { activeDoc: 'characters',    activeProjectId: projectId, activeEpisodeId: null } : null;
    case 'cover':        return projectId ? { activeDoc: 'cover',         activeProjectId: projectId, activeEpisodeId: null } : null;
    case 'synopsis':     return projectId ? { activeDoc: 'synopsis',      activeProjectId: projectId, activeEpisodeId: null } : null;
    case 'scenelist':    return projectId ? { activeDoc: 'scenelist',     activeProjectId: projectId, activeEpisodeId: null } : null;
    case 'treatment':    return projectId ? { activeDoc: 'treatment',     activeProjectId: projectId, activeEpisodeId: null } : null;
    case 'resources':    return projectId ? { activeDoc: 'resources',     activeProjectId: projectId, activeEpisodeId: null } : null;
    case 'biography':    return projectId ? { activeDoc: 'biography',     activeProjectId: projectId, activeEpisodeId: null } : null;
    case 'relationships':return projectId ? { activeDoc: 'relationships', activeProjectId: projectId, activeEpisodeId: null } : null;
    case 'mypage':       return { activeDoc: 'mypage', activeProjectId: null, activeEpisodeId: null };
    default:             return null;
  }
}

// 현재 URL을 조용히 업데이트 (히스토리 스택 안 쌓음)
export function syncUrl(state) {
  const path = buildPath(state);
  if (window.location.pathname !== path) {
    window.history.replaceState(null, '', path);
  }
}
