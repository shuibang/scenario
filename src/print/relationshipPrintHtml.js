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

import { CANVAS_H, NODE_W, PHOTO_H, PHOTO_W } from '../utils/relationshipLayout';
import { ARROW_LEN, LABEL_H, buildNodeGeom, edgeGeometry, pairSideOffset } from '../utils/relationshipEdges';

const MM_TO_PX = 96 / 25.4;

// A4 세로 + 기존 인쇄 여백(index.css의 @page와 동일: 위 35mm / 좌우·아래 30mm)
export const PAGE = { w: 210, h: 297, top: 35, right: 30, bottom: 30, left: 30 };
export const TITLE_BLOCK_H = 30; // 제목 줄이 차지하는 높이(px) — 축소 비율 계산에 반영

export function pageContentPx() {
  return {
    w: (PAGE.w - PAGE.left - PAGE.right) * MM_TO_PX,
    h: (PAGE.h - PAGE.top - PAGE.bottom) * MM_TO_PX,
  };
}

// 관계도 전체를 한 페이지에 넣기 위한 축소 비율. 확대는 하지 않는다(1 초과 없음).
export function computePrintScale(w, h, maxW, maxH) {
  if (!(w > 0) || !(h > 0)) return 1;
  return Math.min(1, maxW / w, maxH / h);
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

function cardHtml(node) {
  const left = node.x - NODE_W / 2;
  const top  = node.y - node.h / 2;
  const photo = node.photoDataUrl
    ? `<div style="width:${PHOTO_W}px;height:${PHOTO_H}px;border-radius:4px;overflow:hidden;flex-shrink:0;background:${C.photoBg}">`
      + `<img src="${escapeHtml(node.photoDataUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">`
      + `</div>`
    : '';
  const chips = (node.roles || []).map(r =>
    `<span style="font-size:8.5px;line-height:1.3;padding:1px 6px;border-radius:6px;background:${C.cardBg};`
    + `color:${escapeHtml(r.color)};border:1px solid ${escapeHtml(r.color)};white-space:nowrap">${escapeHtml(r.label)}</span>`
  ).join('');
  const chipBlock = chips
    ? `<div style="margin-top:4px;display:flex;flex-direction:column;align-items:center;gap:2px">${chips}</div>`
    : '';

  return `<div style="position:absolute;left:${left}px;top:${top}px;width:${NODE_W}px">`
    + `<div style="height:${node.h}px;background:${C.cardBg};border:1.5px solid ${C.cardBorder};border-radius:8px;`
    + `display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px;gap:2px">`
    + photo
    + `<div style="font-size:11px;font-weight:600;color:${C.text};text-align:center;line-height:1.2;`
    + `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%">${escapeHtml(node.name)}</div>`
    + `</div>${chipBlock}</div>`;
}

function edgesSvg(nodes, edges, width) {
  const geom = buildNodeGeom(nodes);
  const parts = edges.map(edge => {
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

  return `<svg width="${width}" height="${CANVAS_H}" viewBox="0 0 ${width} ${CANVAS_H}" `
    + `style="position:absolute;top:0;left:0;overflow:visible">`
    + `<defs><marker id="rel-arrow" markerWidth="${ARROW_LEN - 2}" markerHeight="6" refX="${ARROW_LEN - 2}" refY="3" orient="auto">`
    + `<path d="M0,0 L${ARROW_LEN - 2},3 L0,6 Z" fill="${C.line}" opacity="0.75" /></marker></defs>`
    + parts + `</svg>`;
}

/**
 * 관계도 인쇄용 HTML 문서 전체.
 * nodes: [{ id, x, y, h, anchorOffsetY, name, photoDataUrl, roles:[{label,color}] }]
 *        좌표는 화면에 보이는 값 그대로 — 재배치하지 않는다.
 * edges: [{ id, fromId, toId, label }]
 */
export function buildRelationshipPrintHtml({ title, width, nodes = [], edges = [] }) {
  const w = width > 0 ? width : NODE_W;
  const content = pageContentPx();
  const scale = computePrintScale(w, CANVAS_H, content.w, content.h - TITLE_BLOCK_H);

  const stage = `<div style="position:absolute;top:0;left:0;width:${w}px;height:${CANVAS_H}px;`
    + `transform:scale(${scale});transform-origin:top left">`
    + edgesSvg(nodes, edges, w)
    + nodes.map(cardHtml).join('')
    + `</div>`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>`
    + `<style>`
    + `@page{size:A4;margin:${PAGE.top}mm ${PAGE.right}mm ${PAGE.bottom}mm ${PAGE.left}mm}`
    + `*{box-sizing:border-box}`
    + `html,body{margin:0;padding:0;background:#fff;color:${C.text};`
    + `font-family:'Malgun Gothic','AppleGothic',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}`
    + `h1{font-size:14pt;font-weight:700;margin:0 0 10px}`
    + `</style></head><body>`
    + `<h1>${escapeHtml(title)}</h1>`
    + `<div style="position:relative;overflow:hidden;width:${w * scale}px;height:${CANVAS_H * scale}px">${stage}</div>`
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
