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
