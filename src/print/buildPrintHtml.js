/**
 * buildPrintHtml — Generates a standalone A4 HTML document for Puppeteer PDF rendering.
 *
 * Uses CSS Paged Media (supported by Chromium):
 *  - @page for A4 size + margins + auto page numbers
 *  - break-before: page for section boundaries
 *  - Browser handles pagination naturally
 *
 * Fonts: @font-face with relative paths → Puppeteer resolves via baseURL option.
 */

import { buildPrintModel } from './PrintModel';
import { resolveFont, FONTS } from './FontRegistry';

function esc(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// ─── Section renderers ────────────────────────────────────────────────────────

function renderCover(section, margins) {
  const subtitleField   = section.fields.find(f => f.id === 'subtitle' || f.label === '부제목');
  const secondaryFields = section.fields.filter(f => f !== subtitleField);

  // 28% / 70% of A4 page height (relative to page, not content area)
  const topMm    = margins.top;
  const pageHmm  = 297;
  const titleTop = Math.max(0, (0.28 * pageHmm) - topMm);
  const fieldTop = Math.max(0, (0.70 * pageHmm) - topMm);

  return `<div class="cover">
  <div style="position:absolute;top:${titleTop}mm;left:0;right:0;text-align:center">
    <div class="cover-title">${esc(section.title)}</div>
    ${subtitleField ? `<div class="cover-subtitle">${esc(subtitleField.value)}</div>` : ''}
  </div>
  <div style="position:absolute;top:${fieldTop}mm;left:0;right:0;text-align:center">
    ${secondaryFields.map(f => `<div class="cover-field">${esc(f.value)}</div>`).join('')}
  </div>
</div>`;
}

function renderSynopsis(section, isFirst) {
  const breakClass = isFirst ? '' : ' page-break';
  const rows = [];

  if (section.genre)  rows.push(['장르',   section.genre]);
  if (section.theme)  rows.push(['주제',   section.theme]);
  if (section.intent) rows.push(['기획의도', section.intent]);
  if (section.story)  rows.push(['줄거리', section.story]);

  const charsHtml = section.characters?.length
    ? `<div class="heading" style="margin-top:12pt">주요 인물</div>
       ${section.characters.map(c => `
         <div class="char-entry">
           <div class="char-entry-name">${esc(c.name)}</div>
           ${(c.gender || c.age || c.job) ? `<div class="char-entry-meta">${[c.gender, c.age, c.job].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
           ${c.description ? `<div class="char-entry-desc">${esc(c.description)}</div>` : ''}
         </div>`).join('')}`
    : '';

  return `<div class="${breakClass.trim() || 'block'}">
  ${rows.map(([label, value]) => `
    <div class="synopsis-row">
      <div class="synopsis-label">${esc(label)}</div>
      <div class="synopsis-value">${esc(value)}</div>
    </div>`).join('')}
  ${charsHtml}
</div>`;
}

function renderEpisode(section, dialogueGap, isFirst) {
  const breakClass = isFirst ? '' : ' page-break';
  const epLabel = `${section.episodeNumber}회${section.episodeTitle ? ' ' + section.episodeTitle : ''}`;

  const blocksHtml = section.blocks.map(block => {
    const content = esc(block.content || '');
    switch (block.type) {
      case 'scene_number': {
        const label = esc(block.label || '');
        const full  = [label, content].filter(Boolean).join(' ');
        return `<div class="scene-number">${full}</div>`;
      }
      case 'action':
        return `<div class="action">${content}</div>`;
      case 'dialogue': {
        const charName = esc(block.charName || '');
        return `<div class="dialogue">
          <span class="char-col" style="width:${dialogueGap}">${charName}</span>
          <span class="speech-col">${content}</span>
        </div>`;
      }
      case 'parenthetical':
        return `<div class="parenthetical" style="margin-left:${dialogueGap}">${content}</div>`;
      case 'transition':
        return `<div class="transition">${content}</div>`;
      case 'scene_ref':
        return `<div class="scene-ref">${content}</div>`;
      default:
        return content ? `<div class="body-text">${content}</div>` : '';
    }
  }).filter(Boolean).join('\n');

  return `<div class="${breakClass.trim() || 'block'}">
  <div class="ep-title">${esc(epLabel)}</div>
  ${blocksHtml}
</div>`;
}

function renderCharacters(section, isFirst) {
  const breakClass = isFirst ? '' : ' page-break';
  return `<div class="${breakClass.trim() || 'block'}">
  <div class="heading" style="margin-bottom:8pt">등장인물</div>
  ${section.characters.map(c => `
    <div class="char-entry">
      <div class="char-entry-name">${esc(c.name)}${c.roleLabel ? ` <span class="char-entry-meta">(${esc(c.roleLabel)})</span>` : ''}</div>
      ${(c.gender || c.age || c.job) ? `<div class="char-entry-meta">${[c.gender, c.age, c.job].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
      ${c.description ? `<div class="char-entry-desc">${esc(c.description)}</div>` : ''}
    </div>`).join('')}
</div>`;
}

function renderBiography(section, isFirst) {
  const breakClass = isFirst ? '' : ' page-break';
  return `<div class="${breakClass.trim() || 'block'}">
  <div class="heading" style="margin-bottom:8pt">인물이력서</div>
  ${section.characters.map(c => `
    <div class="char-entry">
      <div class="char-entry-name">${esc(c.name)}</div>
      ${c.items.map(it => `<div class="body-text">${esc(it.text || '')}</div>`).join('')}
    </div>`).join('')}
</div>`;
}

function renderTreatment(section, isFirst) {
  const breakClass = isFirst ? '' : ' page-break';
  const epLabel = `${section.episodeNumber}회 트리트먼트${section.episodeTitle ? ' — ' + section.episodeTitle : ''}`;
  return `<div class="${breakClass.trim() || 'block'}">
  <div class="ep-title">${esc(epLabel)}</div>
  ${section.items.map((it, i) => `<div class="body-text">${i + 1}. ${esc(it.text || '')}</div>`).join('')}
</div>`;
}

// ─── Font face declarations ───────────────────────────────────────────────────

function buildFontFaces() {
  return FONTS.filter(f => f.sourceType === 'bundled').map(f => {
    const faces = [];
    if (f.pdfFiles.normal) {
      faces.push(`@font-face { font-family:'${f.cssFamily}'; src:url('${f.pdfFiles.normal}') format('truetype'); font-weight:400; font-style:normal; }`);
    }
    if (f.pdfFiles.bold && f.pdfFiles.bold !== f.pdfFiles.normal) {
      faces.push(`@font-face { font-family:'${f.cssFamily}'; src:url('${f.pdfFiles.bold}') format('truetype'); font-weight:700; font-style:normal; }`);
    }
    return faces.join('\n');
  }).join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * buildPrintHtml(appState, selections) → HTML string
 *
 * Generates a complete, standalone HTML document ready for Puppeteer.
 * Puppeteer should call:
 *   page.setContent(html, { waitUntil: 'networkidle0', url: appOrigin })
 * so that relative font URLs (/fonts/...) resolve correctly.
 */
export function buildPrintHtml(appState, selections) {
  const preset     = appState?.stylePreset || {};
  const { cssStack: fontFamily } = resolveFont(preset, 'preview');
  const fontSize   = preset.fontSize    ?? 11;
  const lineHeight = preset.lineHeight  ?? 1.6;
  const margins    = preset.pageMargins ?? { top: 35, right: 30, bottom: 30, left: 30 };
  const dialogueGap = preset.dialogueGap ?? '7em';

  const printModel = buildPrintModel(appState, selections, preset);

  const sectionsHtml = printModel.sections.map((section, i) => {
    const isFirst = i === 0;
    switch (section.type) {
      case 'cover':      return renderCover(section, margins);
      case 'synopsis':   return renderSynopsis(section, isFirst);
      case 'episode':    return renderEpisode(section, dialogueGap, isFirst);
      case 'characters': return renderCharacters(section, isFirst);
      case 'biography':  return renderBiography(section, isFirst);
      case 'treatment':  return renderTreatment(section, isFirst);
      default:           return '';
    }
  }).filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<style>
${buildFontFaces()}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: ${fontFamily};
  font-size: ${fontSize}pt;
  line-height: ${lineHeight};
  color: #000;
  background: #fff;
}

/* ── Paged media ─────────────────────────────────── */
@page {
  size: A4;
  margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
}
@page body-page {
  @bottom-center {
    content: "- " counter(page) " -";
    font-size: ${Math.max(fontSize - 2, 7)}pt;
    color: #555;
  }
}
@page cover-page {
  @bottom-center { content: none; }
}

.cover {
  page: cover-page;
  break-after: page;
  min-height: ${297 - margins.top - margins.bottom}mm;
  position: relative;
}

.page-break { break-before: page; page: body-page; }
.block      { page: body-page; }

/* ── Cover ───────────────────────────────────────── */
.cover-title    { font-size: ${fontSize + 11}pt; font-weight: 700; margin-bottom: ${(fontSize * lineHeight).toFixed(1)}pt; }
.cover-subtitle { font-size: ${fontSize + 5}pt;  color: #555; margin-bottom: 4pt; }
.cover-field    { font-size: ${fontSize}pt; margin-bottom: 3pt; }

/* ── Episode blocks ──────────────────────────────── */
.ep-title      { font-size: ${fontSize + 2}pt; font-weight: 700; text-align: center; margin-bottom: 4pt; }
.scene-number  { font-weight: 700; margin-top: 10pt; margin-bottom: 2pt; }
.action        { margin-left: 8mm; margin-bottom: 1pt; text-align: justify; white-space: pre-wrap; }
.dialogue      { display: flex; align-items: flex-start; margin-bottom: 1pt; break-inside: avoid; }
.char-col      { font-weight: 700; flex-shrink: 0; }
.speech-col    { flex: 1; text-align: justify; white-space: pre-wrap; }
.parenthetical { font-style: italic; font-size: ${fontSize - 1}pt; margin-bottom: 1pt; }
.transition    { text-align: right; margin: 4pt 0; }
.scene-ref     { color: #666; font-style: italic; }
.body-text     { margin-bottom: 1pt; text-align: justify; white-space: pre-wrap; }

/* ── Synopsis / Characters ───────────────────────── */
.heading         { font-weight: 700; margin-bottom: 2pt; }
.synopsis-row    { margin-bottom: 8pt; }
.synopsis-label  { font-weight: 700; font-size: ${fontSize - 1}pt; color: #555; margin-bottom: 2pt; }
.synopsis-value  { text-align: justify; white-space: pre-wrap; }
.char-entry      { margin-bottom: 8pt; break-inside: avoid; }
.char-entry-name { font-weight: 700; font-size: ${fontSize + 1}pt; }
.char-entry-meta { color: #555; font-size: ${fontSize - 1}pt; }
.char-entry-desc { margin-top: 2pt; text-align: justify; white-space: pre-wrap; }
</style>
</head>
<body>
${sectionsHtml}
</body>
</html>`;
}
