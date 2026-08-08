/**
 * 인물관계도 좌표 유틸 — RelationshipsPage에서 쓰는 순수 함수 모음.
 *
 * 좌표 영속화 규칙:
 *   캐릭터 레코드의 옵셔널 필드 relPos({ x, y })가 저장된 위치다.
 *   relPos가 없는(=기존 베타 데이터) 캐릭터는 기존과 동일하게 원형 자동배치로 폴백한다.
 *   마이그레이션은 하지 않는다 — 사용자가 카드를 옮긴 시점에만 relPos가 생긴다.
 */

export const NODE_W = 110;
export const NODE_H = 58;
export const CANVAS_H = 480;

// relPos는 옵셔널 — 값이 없거나 숫자가 아니면 "저장 안 됨"으로 취급한다.
export function isValidPos(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

// 캔버스 밖으로 나가지 않도록 제한. 화면 표시용이며 저장값을 바꾸지 않는다
// (넓은 화면에서 배치한 관계도를 좁은 화면에서 열어도 카드가 사라지지 않게).
// 폭을 아직 못 잰 시점(W가 카드보다 작음)에는 접히지 않도록 그대로 둔다.
export function clampPos(pos, W) {
  const y = Math.max(NODE_H / 2, Math.min(CANVAS_H - NODE_H / 2, pos.y));
  if (!(W > NODE_W)) return { x: pos.x, y };
  return { x: Math.max(NODE_W / 2, Math.min(W - NODE_W / 2, pos.x)), y };
}

// 원형 자동배치 — 저장된 좌표가 없는 캐릭터에만 쓰인다.
export function autoPositions(chars, W) {
  const n = chars.length;
  if (n === 0) return {};
  const cx = W / 2;
  const cy = CANVAS_H / 2;
  const r = Math.min(cx - NODE_W / 2 - 8, cy - NODE_H / 2 - 8, 180);
  return Object.fromEntries(chars.map((c, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return [c.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }];
  }));
}

/**
 * 표시 좌표 병합 — 우선순위가 이 기능의 핵심이다.
 *   1) 저장된 relPos
 *   2) 화면에 이미 떠 있던 좌표(prev) — relPos 없는 캐릭터의 배치를 렌더마다 흔들지 않기 위해
 *   3) 원형 자동배치
 * 자동배치가 1)을 덮어쓰지 않는 것이 회귀 방지 포인트.
 * 반환 객체는 chars에 있는 id만 포함 — 삭제된 캐릭터의 좌표는 자연히 빠진다.
 */
export function mergePositions(chars, W, prev = {}) {
  const auto = autoPositions(chars, W);
  const next = {};
  chars.forEach(c => {
    if (isValidPos(c.relPos)) {
      next[c.id] = clampPos({ x: c.relPos.x, y: c.relPos.y }, W);
    } else if (isValidPos(prev[c.id])) {
      next[c.id] = prev[c.id];
    } else {
      next[c.id] = auto[c.id] || { x: W / 2, y: CANVAS_H / 2 };
    }
  });
  return next;
}

// 값이 같으면 이전 객체를 그대로 쓰기 위한 비교 (불필요한 리렌더 방지).
export function samePositions(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(id => b[id] && a[id].x === b[id].x && a[id].y === b[id].y);
}
