// 회차 대본 관련 헬퍼 모음.
// 트리트먼트 → 대본 가져오기 시 "사용자가 추가 작성한 대사·지문이 있는지" 판정 등.

// 사용자가 직접 작성한다고 간주하는 블록 타입.
// scene_number / action 은 트리트먼트 import로 자동 생성되므로 제외.
const USER_AUTHORED_TYPES = new Set(['dialogue', 'character', 'parenthetical']);

/**
 * 회차에 사용자가 직접 작성한 대본 내용이 있는지.
 * dialogue / character / parenthetical 중 trim된 content가 있는 게 1개라도 있으면 true.
 */
export function hasUserScriptContent(scriptBlocks, episodeId) {
  if (!episodeId || !Array.isArray(scriptBlocks)) return false;
  return scriptBlocks.some(b =>
    b.episodeId === episodeId &&
    USER_AUTHORED_TYPES.has(b.type) &&
    typeof b.content === 'string' &&
    b.content.trim().length > 0
  );
}
