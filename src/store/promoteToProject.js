/**
 * promoteToProject — 아이디어를 새 작품으로 변환할 때
 * 아이디어의 구조 블록을 작품의 각 필드로 자동 채우는 헬퍼.
 *
 * 블록 → 작품 필드 매핑:
 *   logline    → synopsisDoc.logline
 *   genre      → synopsisDoc.genre
 *   theme      → synopsisDoc.theme
 *   intent     → synopsisDoc.intent
 *   story      → synopsisDoc.story
 *   treatment  → 첫 회차 summaryItems (한 줄 = 한 항목)
 *   character  → ADD_CHARACTER (role 포함, 다중)
 *   note/memo  → resources (type:'memo')
 *   link       → resources (type:'memo', URL 포함)
 *   image      → resources (type:'image')
 */

import { genId, now } from './db';

/**
 * 아이디어의 블록을 새로 만든 작품에 시드 적용.
 *
 * @param {object}   p
 * @param {Idea}     p.idea
 * @param {string}   p.projectId
 * @param {string=}  p.firstEpisodeId  - 첫 회차 id (treatment 시드용)
 * @param {Function} p.dispatch
 */
export function applyIdeaSeed({ idea, projectId, firstEpisodeId, dispatch }) {
  if (!idea || !projectId || !dispatch) return;

  const blocks = idea.blocks || [];
  const ts = now();

  // 1) synopsisDoc — 시놉시스 페이지의 각 항목별로 분리 채움
  const genre   = joinBlocks(blocks, 'genre');
  const logline = joinBlocks(blocks, 'logline');
  const theme   = joinBlocks(blocks, 'theme');
  const intent  = joinBlocks(blocks, 'intent');
  const story   = joinBlocks(blocks, 'story');

  if (genre || logline || theme || intent || story) {
    const doc = {
      id: genId(),
      projectId,
      genre,
      theme,
      logline,
      intent,
      story,
      content: story, // 호환: 옛 형식
      createdAt: ts,
      updatedAt: ts,
    };
    try { dispatch({ type: 'SET_SYNOPSIS', payload: doc }); } catch {}
  }

  // 2) treatment 블록 → 첫 회차 summaryItems (한 줄 = 한 항목)
  if (firstEpisodeId) {
    const treatmentLines = blocks
      .filter((b) => b.type === 'treatment' && (b.content || '').trim())
      .flatMap((b) => b.content.split(/\r?\n/))
      .map((s) => s.trim())
      .filter(Boolean);

    if (treatmentLines.length > 0) {
      const summaryItems = treatmentLines.map((text, i) => ({
        id: genId(),
        text,
        order: i,
      }));
      try {
        dispatch({
          type: 'UPDATE_EPISODE',
          payload: { id: firstEpisodeId, summaryItems, updatedAt: ts },
        });
      } catch {}
    }
  }

  // 3) character 블록 → characters 테이블 (role 포함)
  blocks
    .filter((b) => b.type === 'character' && ((b.name || '').trim() || (b.content || '').trim()))
    .forEach((b, i) => {
      const c = {
        id: genId(),
        projectId,
        name: (b.name || '').trim() || `인물 ${i + 1}`,
        // 역할은 사용자가 명시한 값 그대로 — 공란이면 공란으로 저장.
        role: b.role ?? '',
        description: (b.content || '').trim(),
        createdAt: ts + i,
        updatedAt: ts + i,
      };
      try { dispatch({ type: 'ADD_CHARACTER', payload: c }); } catch {}
    });

  // 4) note / memo 블록 → resources (type:'memo')
  blocks
    .filter((b) => (b.type === 'note' || b.type === 'memo') && (b.content || '').trim())
    .forEach((b, i) => {
      const r = {
        id: genId(),
        projectId,
        type: 'memo',
        title: b.type === 'note' ? '참고' : '메모',
        memo: b.content.trim(),
        imageData: null,
        createdAt: ts + i,
      };
      try { dispatch({ type: 'ADD_RESOURCE', payload: r }); } catch {}
    });

  // 5) link 블록 → resources (type:'memo', URL + 설명 포함)
  blocks
    .filter((b) => b.type === 'link' && (b.url || '').trim())
    .forEach((b, i) => {
      const url = b.url.trim();
      const title = (b.title || '').trim();
      const r = {
        id: genId(),
        projectId,
        type: 'memo',
        title: title || '링크',
        memo: title ? `${title}\n${url}` : url,
        imageData: null,
        createdAt: ts + i,
      };
      try { dispatch({ type: 'ADD_RESOURCE', payload: r }); } catch {}
    });

  // 6) image 블록 → resources (type:'image', imageData 에 data URL)
  blocks
    .filter((b) => b.type === 'image' && (b.url || '').trim())
    .forEach((b, i) => {
      const r = {
        id: genId(),
        projectId,
        type: 'image',
        title: (b.name || '').replace(/\.[^.]+$/, '') || '이미지',
        memo: '',
        imageData: b.url, // data URL
        createdAt: ts + i,
      };
      try { dispatch({ type: 'ADD_RESOURCE', payload: r }); } catch {}
    });
}

function joinBlocks(blocks, type) {
  return blocks
    .filter((b) => b.type === type && (b.content || '').trim())
    .map((b) => b.content.trim())
    .join('\n\n');
}

/**
 * NewProjectModal 에 넘길 초기값 추출.
 *  - title : 아이디어 title (없으면 logline 첫 줄)
 */
export function buildProjectSeedFromIdea(idea) {
  if (!idea) return { title: '' };
  let title = (idea.title || '').trim();
  if (!title) {
    const logline = (idea.blocks || []).find((b) => b.type === 'logline' && (b.content || '').trim());
    if (logline) title = logline.content.trim().split('\n')[0].slice(0, 40);
  }
  return { title };
}
