/**
 * sizeGuard — 저장 직전 데이터 급감 감지
 *
 * 배경: AppContext persist effect가 크기 검증 없이 IDB/Drive에 저장하던 이슈.
 * 사용자가 의도하지 않은 대량 소실을 조용히 Drive로 전파하지 않도록, 직전 저장
 * 대비 카테고리별 감소 비율을 계산해 임계값 초과 시 가드를 트리거한다.
 *
 * 현재 1차 대상: scriptBlocks, scenes
 */

export const DEFAULT_THRESHOLDS = Object.freeze({
  ratio: 0.7,     // 70% 이상 감소 시 트리거
  absFloor: 10,   // 직전이 10개 미만이면 비율 의미 없음 — 가드 스킵
});

/**
 * @param {null | { scriptBlocks: number, scenes: number }} prev
 * @param {{ scriptBlocks: number, scenes: number }} curr
 * @param {{ ratio: number, absFloor: number }} [thresholds]
 * @returns {null | { scriptBlocks: {prev,next,dropRatio}|null, scenes: {prev,next,dropRatio}|null }}
 *   트리거 없으면 null, 있으면 카테고리별 breakdown (감지 안 된 쪽은 null).
 */
export function computeSizeGuard(prev, curr, thresholds = DEFAULT_THRESHOLDS) {
  if (!prev) return null; // 첫 저장 — 비교 기준 없음

  const check = (key) => {
    const p = Number(prev[key] ?? 0);
    const n = Number(curr[key] ?? 0);
    if (p < thresholds.absFloor) return null;
    if (n >= p) return null;
    const dropRatio = (p - n) / p;
    if (dropRatio < thresholds.ratio) return null;
    return { prev: p, next: n, dropRatio };
  };

  const scriptBlocks = check('scriptBlocks');
  const scenes = check('scenes');
  if (!scriptBlocks && !scenes) return null;
  return { scriptBlocks, scenes };
}
