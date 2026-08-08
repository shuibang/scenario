/**
 * 인물관계도 인쇄 — 자체 완결 HTML 생성 + hidden iframe 인쇄.
 *
 * 앱 셸(position:fixed + overflow:hidden)을 그대로 인쇄하면 좌우 패널이 A4 폭을 다 먹어
 * 가운데가 0으로 눌리고 관계도가 통째로 잘린다. 그래서 화면을 인쇄하지 않고,
 * 관계도만 담은 독립 문서를 만들어 hidden iframe에서 인쇄한다.
 * (이 앱의 기존 인쇄 경로 src/print/pdfViaServer.js 와 같은 방식.)
 *
 * 외부 CSS·폰트·스크립트를 참조하지 않는다. 사진은 이미 data URL이라 그대로 이식된다.
 */

import { CANVAS_H, NAME_H, NODE_W, PHOTO_H, PHOTO_W } from '../utils/relationshipLayout';
import { ARROW_LEN, LABEL_H, buildNodeGeom, edgeGeometry, pairSideOffset } from '../utils/relationshipEdges';

// A4 여백만 고정(index.css의 @page와 동일: 위 35mm / 좌우·아래 30mm).
// 용지 크기·비율에 의존하는 px 계산은 하지 않는다 — 아래 주석 참고.
export const PAGE = { top: 35, right: 30, bottom: 30, left: 30 };

export const DEFAULT_ORIENTATION = 'landscape';

// 방향 필드가 없는 기존 작품은 기본 가로. 마이그레이션 없이 읽는 쪽에서만 폴백한다.
export function normalizeOrientation(v) {
  return v === 'portrait' ? 'portrait' : DEFAULT_ORIENTATION;
}

// 카드 내부 여백(패딩 4×2 + 보더 1.5×2) — 화면 카드와 동일
const CARD_INSET = 11;
const CARD_PAD_X = 8;
const PHOTO_GAP = 2;
const CHIP_H = 15;
const CHIP_GAP = 2;
const NAME_FS = 11;
const CHIP_FS = 8.5;

// SVG에는 text-overflow가 없어 폭을 직접 재야 한다.
// 한글·CJK는 약 1em, 나머지는 약 0.55em으로 근사한다.
export function estimateTextWidth(text, fontSize) {
  let units = 0;
  for (const ch of String(text ?? '')) {
    units += /[ᄀ-ᇿ⺀-鿿가-힯＀-｠]/.test(ch) ? 1 : 0.55;
  }
  return units * fontSize;
}

// 폭을 넘으면 말줄임. 화면 카드의 text-overflow:ellipsis에 대응한다.
export function truncateToWidth(text, maxWidth, fontSize) {
  const s = String(text ?? '');
  if (!s || estimateTextWidth(s, fontSize) <= maxWidth) return s;
  const chars = [...s];
  const ellipsisW = estimateTextWidth('…', fontSize);
  let out = '';
  for (const ch of chars) {
    if (estimateTextWidth(out + ch, fontSize) + ellipsisW > maxWidth) break;
    out += ch;
  }
  return out ? `${out}…` : '…';
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 인쇄용 고정 색. 화면은 CSS 변수를 쓰지만 독립 문서에는 변수가 없다.
const C = {
  text: '#111',
  cardBg: '#fff',
  cardBorder: '#999',
  line: '#555',
  labelText: '#444',
  photoBg: '#eee',
};

// 카드도 SVG로 그린다. HTML div + transform:scale이면 축소 비율을 px로 심어야 하는데,
// 그 값은 인쇄 팝업에서 용지 방향을 바꾸는 순간 실제 페이지 박스와 어긋난다.
function cardSvg(node) {
  const x = node.x - NODE_W / 2;
  const y = node.y - node.h / 2;

  // 화면 카드와 같은 세로 배치: 콘텐츠를 카드 안에서 세로 중앙 정렬
  const contentTop = y + CARD_INSET / 2;
  const contentH = node.h - CARD_INSET;
  const used = (node.photoDataUrl ? PHOTO_H + PHOTO_GAP : 0) + NAME_H;
  const start = contentTop + (contentH - used) / 2;

  let out = `<rect x="${x}" y="${y}" width="${NODE_W}" height="${node.h}" rx="8" `
    + `fill="${C.cardBg}" stroke="${C.cardBorder}" stroke-width="1.5" />`;

  if (node.photoDataUrl) {
    const px = node.x - PHOTO_W / 2;
    const clip = `photo-${escapeHtml(node.id)}`;
    out += `<clipPath id="${clip}"><rect x="${px}" y="${start}" width="${PHOTO_W}" height="${PHOTO_H}" rx="4" /></clipPath>`
      + `<rect x="${px}" y="${start}" width="${PHOTO_W}" height="${PHOTO_H}" rx="4" fill="${C.photoBg}" />`
      // slice = object-fit: cover
      + `<image href="${escapeHtml(node.photoDataUrl)}" x="${px}" y="${start}" width="${PHOTO_W}" height="${PHOTO_H}" `
      + `preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})" />`;
  }

  const nameTop = start + (node.photoDataUrl ? PHOTO_H + PHOTO_GAP : 0);
  const name = truncateToWidth(node.name, NODE_W - CARD_PAD_X * 2, NAME_FS);
  out += `<text x="${node.x}" y="${nameTop + 10.5}" text-anchor="middle" `
    + `font-size="${NAME_FS}" font-weight="600" fill="${C.text}">${escapeHtml(name)}</text>`;

  // 역할 칩 — 화면과 동일하게 카드 아래로 세로 나열
  let chipTop = y + node.h + 4;
  (node.roles || []).forEach(r => {
    const w = estimateTextWidth(r.label, CHIP_FS) + 12;
    out += `<rect x="${node.x - w / 2}" y="${chipTop}" width="${w}" height="${CHIP_H}" rx="6" `
      + `fill="${C.cardBg}" stroke="${escapeHtml(r.color)}" stroke-width="1" />`
      + `<text x="${node.x}" y="${chipTop + 10.5}" text-anchor="middle" font-size="${CHIP_FS}" `
      + `fill="${escapeHtml(r.color)}">${escapeHtml(r.label)}</text>`;
    chipTop += CHIP_H + CHIP_GAP;
  });

  return out;
}

function edgesSvg(nodes, edges) {
  const geom = buildNodeGeom(nodes);
  return edges.map(edge => {
    const from = geom[edge.fromId];
    const to   = geom[edge.toId];
    if (!from || !to) return '';
    const g = edgeGeometry(from, to, edge.label || '', pairSideOffset(edges, edge));
    if (!g) return '';
    const line = `<line x1="${g.p1.x}" y1="${g.p1.y}" x2="${g.p2.x}" y2="${g.p2.y}" `
      + `stroke="${C.line}" stroke-width="1.5" opacity="0.6" marker-end="url(#rel-arrow)" />`;
    if (!edge.label) return line;
    const lx = g.label.x;
    const ly = g.label.y;
    return line
      + `<rect x="${lx - g.label.w / 2}" y="${ly - 8}" width="${g.label.w}" height="${LABEL_H}" rx="3" fill="#fff" opacity="0.9" />`
      + `<text x="${lx}" y="${ly + 2}" text-anchor="middle" font-size="10" fill="${C.labelText}">${escapeHtml(edge.label)}</text>`;
  }).join('');
}

/**
 * 관계도 인쇄용 HTML 문서 전체.
 * nodes: [{ id, x, y, h, anchorOffsetY, name, photoDataUrl, roles:[{label,color}] }]
 *        좌표는 화면에 보이는 값 그대로 — 재배치하지 않는다.
 * edges: [{ id, fromId, toId, label }]
 */
export function buildRelationshipPrintHtml({ title, width, nodes = [], edges = [], orientation }) {
  const w = width > 0 ? width : NODE_W;
  const page = normalizeOrientation(orientation);

  // 크기·정렬을 px로 못박지 않는다. 인쇄 팝업에서 용지 방향을 바꾸면 페이지 박스만
  // 회전하고 심어둔 px는 그대로여서 관계도가 페이지 밖으로 밀려나기 때문이다.
  // 대신 body를 페이지 높이(100%)에 맞춘 flex 컬럼으로 두고, viewBox + meet에
  // 축소·가운데 정렬을 맡긴다 → 어떤 용지 방향에서도 브라우저가 다시 맞춘다.
  const svg = `<svg class="diagram" xmlns="http://www.w3.org/2000/svg" `
    + `viewBox="0 0 ${w} ${CANVAS_H}" preserveAspectRatio="xMidYMid meet">`
    + `<defs><marker id="rel-arrow" markerWidth="${ARROW_LEN - 2}" markerHeight="6" refX="${ARROW_LEN - 2}" refY="3" orient="auto">`
    + `<path d="M0,0 L${ARROW_LEN - 2},3 L0,6 Z" fill="${C.line}" opacity="0.75" /></marker></defs>`
    + edgesSvg(nodes, edges)
    + nodes.map(cardSvg).join('')
    + `</svg>`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>`
    + `<style>`
    + `@page{size:A4 ${page};margin:${PAGE.top}mm ${PAGE.right}mm ${PAGE.bottom}mm ${PAGE.left}mm}`
    + `*{box-sizing:border-box}`
    + `html,body{height:100%;margin:0;padding:0;background:#fff;color:${C.text};`
    + `font-family:'Malgun Gothic','AppleGothic',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}`
    // overflow:hidden — 내용이 페이지 높이를 넘어 빈 2쪽이 생기는 것을 막는다
    + `body{display:flex;flex-direction:column;overflow:hidden}`
    + `h1{flex:0 0 auto;font-size:14pt;font-weight:700;margin:0 0 10px}`
    + `.stage{flex:1 1 auto;min-height:0;display:flex}`
    + `svg.diagram{width:100%;height:100%;display:block}`
    + `</style></head><body>`
    + `<h1>${escapeHtml(title)}</h1>`
    + `<div class="stage">${svg}</div>`
    + `</body></html>`;
}

/**
 * hidden iframe에 문서를 넣고 인쇄. 팝업 차단에 걸리지 않는다.
 * src/print/pdfViaServer.js 의 검증된 패턴을 그대로 따른다(자체 완결 문서라 재사용 대신 별도 구현).
 * 인쇄 다이얼로그가 닫히면(afterprint) iframe을 제거하고, 이벤트가 안 오면 60초 뒤 강제 정리한다.
 */
export function printHtmlInIframe(html) {
  return new Promise((resolve, reject) => {
    let iframe;
    try {
      iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:1px;height:1px;border:none;';
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();

      let cleaned = false;
      let cleanupTimer = null;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clearTimeout(cleanupTimer);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        resolve();
      };

      let printed = false;
      const doPrint = () => {
        if (printed) return;
        printed = true;
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.addEventListener('afterprint', cleanup, { once: true });
          iframe.contentWindow.print();
          cleanupTimer = setTimeout(cleanup, 60_000);
        } catch (e) {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          reject(e);
        }
      };

      if (doc.readyState === 'complete') {
        setTimeout(doPrint, 300);
      } else {
        iframe.onload = () => setTimeout(doPrint, 300);
        setTimeout(doPrint, 1000); // onload가 발화하지 않는 경우 폴백
      }
    } catch (e) {
      if (iframe?.parentNode) iframe.parentNode.removeChild(iframe);
      reject(e);
    }
  });
}
