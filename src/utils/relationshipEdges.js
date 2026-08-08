/**
 * 인물관계도 관계선 기하 — 화면(RelationshipsPage)과 인쇄(relationshipPrintHtml) 공용.
 *
 * 인쇄본이 화면과 한 픽셀도 다르지 않아야 하므로, 선·화살촉·라벨 좌표 계산은
 * 반드시 이 파일 하나에서만 한다. 양쪽에 같은 식을 복사해두면 언젠가 갈라진다.
 */

import { NODE_W } from './relationshipLayout';

export const ARROW_LEN = 10;    // 화살촉 길이만큼 선을 앞당겨 끝낸다
export const LABEL_OFFSET = 12; // 라벨을 선과 겹치지 않게 수직으로 띄우는 거리
export const LABEL_H = 14;
export const PAIR_SIDE_OFFSET = 8; // 쌍방향 관계일 때 좌우로 벌리는 폭

/**
 * 카드 테두리와 선의 교점.
 * node = { x, y(이름 블록 중심 = 앵커), top, bottom(카드 테두리) }.
 * 선은 이름 블록을 향해 계산하고 끝점은 카드 테두리에서 끊는다 —
 * 이름 블록에서 바로 끊으면 화살촉이 불투명한 카드 배경에 가려 보이지 않는다.
 * 사진 없는 카드는 top/bottom이 대칭이라 카드 중심 기준 계산으로 환원된다.
 */
export function rectEdge(node, nx, ny) {
  const HW = NODE_W / 2;
  const absDx = Math.abs(nx);
  const absDy = Math.abs(ny);
  const vExtent = ny > 0 ? node.bottom - node.y : node.y - node.top;
  const t = Math.min(
    absDx > 0.001 ? HW / absDx : Infinity,
    absDy > 0.001 ? vExtent / absDy : Infinity,
  );
  return { x: node.x + nx * t, y: node.y + ny * t };
}

/**
 * 한 관계선의 좌표 일체.
 * 너무 짧아 그릴 수 없으면 null (화면·인쇄 모두 렌더하지 않는다).
 * 반환: { p1, p2, label: { x, y, w } } — label은 중심 좌표와 배경 박스 폭.
 */
export function edgeGeometry(from, to, label = '', sideOffset = 0) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 2) return null;
  const nx = dx / dist;
  const ny = dy / dist;

  // 선과 수직인 단위 벡터 (90° 회전) — 쌍방향 관계를 좌우로 분리
  const perpX = -ny * sideOffset;
  const perpY =  nx * sideOffset;

  const p1raw = rectEdge(from, nx, ny);
  const p2raw = rectEdge(to, -nx, -ny);

  const p1 = { x: p1raw.x + perpX, y: p1raw.y + perpY };
  const p2 = { x: p2raw.x - nx * ARROW_LEN + perpX, y: p2raw.y - ny * ARROW_LEN + perpY };

  const lineDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
  if (lineDist < 4) return null;

  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const off = sideOffset !== 0 ? Math.sign(sideOffset) * LABEL_OFFSET : LABEL_OFFSET;
  const lw = label ? Math.max(label.length * 6 + 10, 24) : 0;

  return {
    p1,
    p2,
    label: { x: mx + -ny * off, y: my + nx * off, w: lw },
  };
}

// 쌍방향(A→B, B→A)이면 서로 반대쪽으로 벌린다. 단방향은 0.
export function pairSideOffset(edges, edge) {
  const has = edges.some(e => e.fromId === edge.toId && e.toId === edge.fromId);
  return has ? PAIR_SIDE_OFFSET : 0;
}

/**
 * 노드별 기하 — 앵커는 이름 블록 중심, 상/하단은 카드 테두리.
 * nodes: [{ id, x, y, h, anchorOffsetY }] → { [id]: { x, y, top, bottom } }
 */
export function buildNodeGeom(nodes) {
  const geom = {};
  nodes.forEach(n => {
    geom[n.id] = {
      x: n.x,
      y: n.y + (n.anchorOffsetY || 0),
      top: n.y - n.h / 2,
      bottom: n.y + n.h / 2,
    };
  });
  return geom;
}
