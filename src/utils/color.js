/**
 * color.js — 공통 색상 유틸리티
 */

// ─── Timeline 그라데이션 ──────────────────────────────────────────────────────
// ratio 0~1 → 연한 라벤더(#c7d2fe) → 짙은 남색(#1e2e81) → 인디고(#4338ca)
// App.jsx 와 StructurePage.jsx 양쪽에서 사용.
export function getTimelineColor(ratio) {
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const lerpColor = (c1, c2, t) => ({
    r: lerp(c1[0], c2[0], t),
    g: lerp(c1[1], c2[1], t),
    b: lerp(c1[2], c2[2], t),
  });
  const light = [199, 210, 254]; // #c7d2fe indigo-200
  const dark  = [30,  46, 129];  // #1e2e81
  const mid   = [67,  56, 202];  // #4338ca indigo-700
  const c = ratio <= 0.85
    ? lerpColor(light, dark, ratio / 0.85)
    : lerpColor(dark, mid, (ratio - 0.85) / 0.15);
  return `rgb(${c.r},${c.g},${c.b})`;
}
