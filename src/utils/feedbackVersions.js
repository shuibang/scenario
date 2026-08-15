import { mergeSharePhotos } from './sharePhoto';

const DEFAULT_SELECTIONS = { cover: true, synopsis: true, episodes: {}, chars: true };
const SESSION_COLORS = ['#fef08a', '#bfdbfe', '#bbf7d0', '#fecdd3', '#fde68a', '#ddd6fe'];

export const FEEDBACK_FOCUS_KEY = 'drama_feedback_focus';

/**
 * 검토링크 payload에서 인물 사진을 걷어낸다.
 *
 * 캐릭터 레코드를 통째로 넣던 탓에 photo(장변 320px data URL)가 모든 링크에 실려
 * Supabase에 저장되고 있었다. 뷰어는 사진을 렌더하지도 않아 화면에는 보이지 않는데,
 * 작가가 모르는 사이 사진이 업로드되는 상태였다. 기본은 무조건 제외한다.
 */
export function stripCharacterPhotos(characters) {
  return (characters || []).map((character) => {
    if (!character || !('photo' in character)) return character;
    const { photo, ...rest } = character; // eslint-disable-line no-unused-vars
    return rest;
  });
}

/**
 * 공유용으로 재축소한 사진을 다시 얹을지 판단한다.
 * 사진은 '인물소개'가 켜져 있고 사진 옵션도 켜져 있을 때만, 그것도 전달된 재축소본만 실린다.
 * 저장된 320px 원본이 그대로 실리는 경로는 없다.
 */
export function shouldIncludeSharePhotos(selections, sharePhotos) {
  return !!(selections?.chars && selections?.charPhotos && sharePhotos && Object.keys(sharePhotos).length > 0);
}

export function buildFeedbackSnapshot(state, selections, options = {}) {
  const {
    projects,
    episodes,
    characters,
    scenes,
    scriptBlocks,
    coverDocs,
    synopsisDocs,
    activeProjectId,
    stylePreset,
  } = state;

  return {
    projects: projects.filter((project) => project.id === activeProjectId),
    episodes: episodes.filter((episode) => episode.projectId === activeProjectId),
    // 사진은 기본적으로 싣지 않는다 (위 stripCharacterPhotos 주석 참고).
    // 옵션을 켠 경우에만, 링크 생성 시점에 160px로 재축소한 사본을 다시 얹는다.
    characters: (() => {
      const stripped = stripCharacterPhotos(
        characters.filter((character) => character.projectId === activeProjectId),
      );
      return shouldIncludeSharePhotos(selections, options.sharePhotos)
        ? mergeSharePhotos(stripped, options.sharePhotos)
        : stripped;
    })(),
    scenes: scenes.filter((scene) => scene.projectId === activeProjectId),
    scriptBlocks: scriptBlocks.filter((block) => block.projectId === activeProjectId),
    coverDocs: coverDocs.filter((doc) => doc.projectId === activeProjectId),
    synopsisDocs: synopsisDocs.filter((doc) => doc.projectId === activeProjectId),
    activeProjectId,
    stylePreset: stylePreset || {},
    selections,
  };
}

export function buildFeedbackViewerState(snapshotContent) {
  const snapshot = snapshotContent || {};
  return {
    title: snapshot.projects?.[0]?.title || '피드백 노트',
    appState: {
      projects: snapshot.projects || [],
      episodes: snapshot.episodes || [],
      characters: snapshot.characters || [],
      scenes: snapshot.scenes || [],
      scriptBlocks: snapshot.scriptBlocks || [],
      coverDocs: snapshot.coverDocs || [],
      synopsisDocs: snapshot.synopsisDocs || [],
      activeProjectId: snapshot.activeProjectId || snapshot.projects?.[0]?.id || null,
      stylePreset: snapshot.stylePreset || {},
      initialized: true,
    },
    selections: snapshot.selections || DEFAULT_SELECTIONS,
  };
}

export function buildBlockMetaMap(appState) {
  const map = new Map();
  const activeProjectId = appState?.activeProjectId;
  const episodes = Array.isArray(appState?.episodes)
    ? appState.episodes
        .filter((episode) => episode?.projectId === activeProjectId)
        .sort((a, b) => (a?.number || 0) - (b?.number || 0))
    : [];
  const scriptBlocks = Array.isArray(appState?.scriptBlocks) ? appState.scriptBlocks.filter(Boolean) : [];

  let blockOrder = 0;
  let sceneOrder = 0;
  let currentSceneId = '';

  episodes.forEach((episode) => {
    scriptBlocks
      .filter((block) => block?.episodeId === episode.id)
      .forEach((block) => {
        if (!block?.id) return;
        const type = String(block.type || '');
        if (type === 'scene_number' || type === 'scene' || type === 'scene_heading' || type === 'slug') {
          sceneOrder += 1;
          currentSceneId = block.id;
        }
        map.set(block.id, {
          blockId: block.id,
          blockOrder,
          sceneOrder,
          sceneId: currentSceneId || block.id,
          episodeId: episode.id,
          episodeNumber: episode.number || null,
          blockType: type,
        });
        blockOrder += 1;
      });
  });

  scriptBlocks.forEach((block) => {
    if (!block?.id || map.has(block.id)) return;
    const type = String(block.type || '');
    if (type === 'scene_number' || type === 'scene' || type === 'scene_heading' || type === 'slug') {
      sceneOrder += 1;
      currentSceneId = block.id;
    }
    map.set(block.id, {
      blockId: block.id,
      blockOrder,
      sceneOrder,
      sceneId: currentSceneId || block.id,
      episodeId: block.episodeId || null,
      episodeNumber: null,
      blockType: type,
    });
    blockOrder += 1;
  });

  return map;
}

export function buildFeedbackCommentPayload(notes, appState) {
  const blockMetaMap = buildBlockMetaMap(appState);

  return (Array.isArray(notes) ? notes : [])
    .filter((note) => note?.block_id && String(note?.content || '').trim())
    .map((note, index) => {
      const blockMeta = blockMetaMap.get(note.block_id) || {};
      return {
        scene_id: blockMeta.sceneId || null,
        line_ref: {
          block_id: note.block_id,
          block_order: blockMeta.blockOrder ?? index,
          scene_order: blockMeta.sceneOrder ?? null,
          episode_id: blockMeta.episodeId ?? null,
          episode_number: blockMeta.episodeNumber ?? null,
          block_type: blockMeta.blockType ?? null,
          color: note.color || null,
        },
        comment_text: String(note.content || '').trim(),
        position_offset: 0,
      };
    });
}

function parseOrderValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSessionColor(sessionId, sessionIndexMap, lineRef) {
  if (lineRef?.color) return lineRef.color;
  const paletteIndex = sessionIndexMap.get(sessionId) ?? 0;
  return SESSION_COLORS[paletteIndex % SESSION_COLORS.length];
}

export function buildFeedbackNotesByBlock(comments, sessions) {
  const sessionMap = new Map((sessions || []).map((session) => [session.id, session]));
  const sessionIndexMap = new Map((sessions || []).map((session, index) => [session.id, index]));
  const byBlock = {};

  (comments || []).forEach((comment, index) => {
    const blockId = comment?.line_ref?.block_id || '';
    if (!blockId) return;
    const session = sessionMap.get(comment.session_id);
    if (!byBlock[blockId]) byBlock[blockId] = [];
    byBlock[blockId].push({
      id: comment.id,
      block_id: blockId,
      content: comment.comment_text,
      color: getSessionColor(comment.session_id, sessionIndexMap, comment.line_ref),
      received_session_id: comment.session_id,
      sender_display_name: session?.sender_display_name || '',
      submitted_at: session?.submitted_at || comment.created_at,
      feedback_session_key: `${comment.session_id || 'session'}:${comment.id || index}`,
      position_offset: Number(comment.position_offset || 0),
      is_read: !!session?.is_read,
    });
  });

  return byBlock;
}

export function sortFeedbackCommentsByDocumentOrder(comments, appState, sessions) {
  const blockMetaMap = buildBlockMetaMap(appState);
  const sessionMap = new Map((sessions || []).map((session) => [session.id, session]));

  return [...(comments || [])]
    .map((comment, index) => {
      const blockId = comment?.line_ref?.block_id || '';
      const blockOrder =
        parseOrderValue(comment?.line_ref?.block_order) !== null
          ? parseOrderValue(comment?.line_ref?.block_order)
          : (blockMetaMap.get(blockId)?.blockOrder ?? Number.MAX_SAFE_INTEGER);
      const sceneOrder =
        parseOrderValue(comment?.line_ref?.scene_order) !== null
          ? parseOrderValue(comment?.line_ref?.scene_order)
          : (blockMetaMap.get(blockId)?.sceneOrder ?? Number.MAX_SAFE_INTEGER);
      const submittedAt =
        new Date(sessionMap.get(comment.session_id)?.submitted_at || comment.created_at || 0).getTime() || 0;
      return { comment, index, blockOrder, sceneOrder, submittedAt };
    })
    .sort((left, right) => {
      if (left.sceneOrder !== right.sceneOrder) return left.sceneOrder - right.sceneOrder;
      if (left.blockOrder !== right.blockOrder) return left.blockOrder - right.blockOrder;
      if (left.submittedAt !== right.submittedAt) return left.submittedAt - right.submittedAt;
      return left.index - right.index;
    })
    .map(({ comment }) => comment);
}

export function saveFeedbackFocus(focus) {
  try {
    if (!focus) {
      localStorage.removeItem(FEEDBACK_FOCUS_KEY);
      return;
    }
    localStorage.setItem(FEEDBACK_FOCUS_KEY, JSON.stringify(focus));
  } catch {}
}

export function readFeedbackFocus() {
  try {
    const raw = localStorage.getItem(FEEDBACK_FOCUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearFeedbackFocus() {
  saveFeedbackFocus(null);
}
