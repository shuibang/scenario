/**
 * 인물관계도 좌표 유틸 — RelationshipsPage에서 쓰는 순수 함수 모음.
 *
 * 좌표 영속화 규칙:
 *   캐릭터 레코드의 옵셔널 필드 relPos({ x, y })가 저장된 위치다.
 *   relPos가 없는(=기존 베타 데이터) 캐릭터는 기존과 동일하게 원형 자동배치로 폴백한다.
 *   마이그레이션은 하지 않는다 — 사용자가 카드를 옮긴 시점에만 relPos가 생긴다.
 */

import { hasPhoto } from './characterPhoto';

export const NODE_W = 110;
export const NODE_H = 58;          // 사진 없는 카드 — 절대 바뀌지 않는다(저장된 relPos 호환)
export const CANVAS_H = 480;

// 사진 카드 규격. 카드 폭(NODE_W)은 사진 유무와 무관하게 110으로 고정.
export const PHOTO_W = 80;
export const PHOTO_H = 100;        // 4:5 고정 틀 — 원본 비율과 무관하게 cover로 크롭
export const PHOTO_GAP = 2;        // 사진과 이름 사이 (카드 flex gap과 동일)
export const NAME_H = 14;          // 이름 줄 높이 (fontSize 11 × lineHeight 1.2 ≈ 13.2)
// 8(패딩 4×2) + 3(보더 1.5×2) + 100(사진) + 2(gap) + 14(이름) = 127
export const NODE_H_PHOTO = 127;

// 카드 높이는 두 종류뿐이다 — 사진 있음 / 없음.
export function nodeHeight(char) {
  return hasPhoto(char) ? NODE_H_PHOTO : NODE_H;
}

/**
 * 관계선 앵커(이름 블록 중심)의 카드 중심 대비 y 오프셋.
 * 사진 없는 카드는 이름이 세로 중앙이라 0 — 즉 변경 전과 선 계산이 완전히 동일하다.
 * 사진 카드는 이름이 사진 아래에 있으므로 (사진 높이 + gap)/2 만큼 내려간다.
 */
export function nameAnchorOffsetY(char) {
  return hasPhoto(char) ? (PHOTO_H + PHOTO_GAP) / 2 : 0;
}

// relPos는 옵셔널 — 값이 없거나 숫자가 아니면 "저장 안 됨"으로 취급한다.
export function isValidPos(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

// 캔버스 밖으로 나가지 않도록 제한. 화면 표시용이며 저장값을 바꾸지 않는다
// (넓은 화면에서 배치한 관계도를 좁은 화면에서 열어도 카드가 사라지지 않게).
// 폭을 아직 못 잰 시점(W가 카드보다 작음)에는 접히지 않도록 그대로 둔다.
// h 기본값은 NODE_H — 사진 없는 카드의 clamp 결과는 이 인자 도입 전과 동일하다.
export function clampPos(pos, W, h = NODE_H) {
  const y = Math.max(h / 2, Math.min(CANVAS_H - h / 2, pos.y));
  if (!(W > NODE_W)) return { x: pos.x, y };
  return { x: Math.max(NODE_W / 2, Math.min(W - NODE_W / 2, pos.x)), y };
}

// 원형 자동배치 — 저장된 좌표가 없는 캐릭터에만 쓰인다.
// 사진 카드가 섞여 있으면 큰 높이 기준으로 반경을 보수적으로 잡아 캔버스를 벗어나지 않게 한다.
// 사진이 하나도 없으면 기존 반경(NODE_H 기준)을 그대로 써서 배치가 달라지지 않는다.
export function autoPositions(chars, W) {
  const n = chars.length;
  if (n === 0) return {};
  const cx = W / 2;
  const cy = CANVAS_H / 2;
  const maxH = chars.some(hasPhoto) ? NODE_H_PHOTO : NODE_H;
  const r = Math.min(cx - NODE_W / 2 - 8, cy - maxH / 2 - 8, 180);
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
      next[c.id] = clampPos({ x: c.relPos.x, y: c.relPos.y }, W, nodeHeight(c));
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
