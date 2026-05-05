// (episodeId, id) 같은 블록은 마지막 등장(배열 뒤쪽) 1개만 보존하고 새 배열 반환.
// 일반적으로 더 늦게 추가된 사본이 최신이라는 가정. 안전 정책.
export function dedupScriptBlocks(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  const seen = new Set();
  const reversed = [];
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (!b?.id) { reversed.push(b); continue; }
    const key = `${b.episodeId || ''}:${b.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reversed.push(b);
  }
  return reversed.reverse();
}

// scriptBlocks의 (episodeId, id) 중복을 감지한다.
// Read-only: 배열을 변경하거나 새 배열을 만들지 않는다.
// 결과는 모니터링/진단용 리포트 객체.
export function detectScriptBlockDuplicates(blocks) {
  if (!Array.isArray(blocks)) {
    return { hasDuplicates: false, duplicateKeys: [], totalDuplicates: 0, totalBlocks: 0 };
  }

  const counts = new Map();
  for (const b of blocks) {
    if (!b || !b.id) continue;
    const key = `${b.episodeId || ''}:${b.id}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const duplicateKeys = [];
  let totalDuplicates = 0;
  for (const [key, count] of counts) {
    if (count > 1) {
      duplicateKeys.push({ key, count });
      totalDuplicates += count - 1; // 초과분만 (원본 1개는 제외)
    }
  }

  return {
    hasDuplicates: duplicateKeys.length > 0,
    duplicateKeys,
    totalDuplicates,
    totalBlocks: blocks.length,
  };
}
