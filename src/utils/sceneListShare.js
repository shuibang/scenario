import { genId } from '../store/db';
import { getSceneFormat, parseWithFormat } from './sceneFormat';

const RECEIVED_SL_KEY = 'director_received_scenelists';

/**
 * Builds and copies a scene-list share URL for the given episode.
 * Returns the URL string, or throws on failure.
 */
export async function buildSceneListShareURL(state, epId) {
  const { scenes, scriptBlocks, episodes, projects, activeProjectId } = state;

  const projectEpisodes = episodes
    .filter(e => e.projectId === activeProjectId)
    .sort((a, b) => a.number - b.number);

  const currentEpObj = projectEpisodes.find(e => e.id === epId);
  const project = projects.find(p => p.id === activeProjectId);

  const epBlocks = scriptBlocks.filter(b => b.episodeId === epId);

  // Build ordered scene list (same order as SceneListPage)
  const allScenes = scenes.filter(s => s.episodeId === epId);
  const sceneMap = new Map(allScenes.map(s => [s.id, s]));
  const ordered = epBlocks
    .filter(b => b.type === 'scene_number' && b.sceneId)
    .map(b => sceneMap.get(b.sceneId))
    .filter(Boolean);
  const orderedIds = new Set(ordered.map(s => s.id));
  const orphans = allScenes
    .filter(s => !orderedIds.has(s.id))
    .sort((a, b) => (a.sceneSeq || 0) - (b.sceneSeq || 0));
  const epScenes = [...ordered, ...orphans];

  if (!epScenes.length) throw new Error('씬이 없습니다');

  // blockLabelMap
  const blockLabelMap = new Map();
  epBlocks.filter(b => b.type === 'scene_number' && b.sceneId)
    .forEach(b => blockLabelMap.set(b.sceneId, b.label));

  // sceneCharacters (auto-detected from dialogue blocks)
  const sceneCharacters = {};
  epScenes.forEach(scene => {
    const snBlock = epBlocks.find(b => b.type === 'scene_number' && b.sceneId === scene.id);
    if (!snBlock) { sceneCharacters[scene.id] = ''; return; }
    const snIdx  = epBlocks.indexOf(snBlock);
    const nextSn = epBlocks.find((b, i) => i > snIdx && b.type === 'scene_number');
    const endIdx = nextSn ? epBlocks.indexOf(nextSn) : epBlocks.length;
    const seg    = epBlocks.slice(snIdx + 1, endIdx);
    const names  = new Set(
      seg.filter(b => b.type === 'dialogue' && b.characterName).map(b => b.characterName)
    );
    sceneCharacters[scene.id] = [...names].join(', ');
  });

  const fmt = getSceneFormat();
  const shareData = {
    id: genId(),
    title: [
      project?.title,
      currentEpObj
        ? `${currentEpObj.number}회${currentEpObj.title ? ' ' + currentEpObj.title : ''}`
        : '',
    ].filter(Boolean).join(' '),
    savedAt: new Date().toISOString(),
    isReceived: true,
    scenes: epScenes.map((scene, idx) => {
      const meta = (!scene.location && scene.content)
        ? parseWithFormat(scene.content, fmt)
        : null;
      return {
        sn:      blockLabelMap.get(scene.id) || `S#${idx + 1}.`,
        loc:     scene.location    || meta?.location    || '',
        sub:     scene.subLocation || meta?.subLocation || '',
        tod:     scene.timeOfDay   || meta?.timeOfDay   || '',
        chars:   sceneCharacters[scene.id] || '',
        content: scene.sceneListContent || '',
      };
    }),
  };

  // Save locally for same-device test
  try {
    const existing = JSON.parse(localStorage.getItem(RECEIVED_SL_KEY) || '[]');
    if (!existing.some(s => s.id === shareData.id)) {
      localStorage.setItem(RECEIVED_SL_KEY, JSON.stringify([shareData, ...existing]));
    }
  } catch {}

  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(shareData))));
  return `${window.location.origin}/app#sl=${encoded}`;
}
