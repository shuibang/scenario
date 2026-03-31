/**
 * Export utilities: TXT, Fountain, PDF (print)
 */

function getCharName(block, characters) {
  if (block.characterId) {
    const c = characters.find(c => c.id === block.characterId);
    if (c) return c.name;
  }
  return block.characterName || '';
}

function escHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

// ─── TXT ─────────────────────────────────────────────────────────────────────
export function exportTXT(blocks, episode, project, characters) {
  const lines = [];
  const epTitle = episode ? `${episode.number}회 ${episode.title || ''}`.trim() : '';
  lines.push(project?.title || '');
  if (epTitle) lines.push(epTitle);
  lines.push('');
  lines.push('─'.repeat(40));
  lines.push('');

  for (const block of blocks) {
    const text = block.content || '';
    switch (block.type) {
      case 'scene_number':
        lines.push('');
        lines.push(`${block.label} ${text}`.trim());
        lines.push('');
        break;
      case 'action':
        lines.push(`  ${text}`);
        lines.push('');
        break;
      case 'dialogue': {
        const name = getCharName(block, characters);
        lines.push(`        ${name}`);
        lines.push(`  ${text}`);
        lines.push('');
        break;
      }
      case 'parenthetical':
        lines.push(`        (${text})`);
        break;
      case 'transition':
        lines.push('');
        lines.push(`                    ${text.toUpperCase()}`);
        lines.push('');
        break;
      default:
        if (text) lines.push(text);
    }
  }
  return lines.join('\n');
}

// ─── Fountain ─────────────────────────────────────────────────────────────────
export function exportFountain(blocks, episode, project, characters) {
  const lines = [];
  lines.push(`Title: ${project?.title || '제목 없음'}`);
  if (episode) lines.push(`Episode: ${episode.number}회 ${episode.title || ''}`.trim());
  lines.push('');
  lines.push('===');
  lines.push('');

  for (const block of blocks) {
    const text = block.content || '';
    switch (block.type) {
      case 'scene_number': {
        const heading = `${block.label} ${text}`.trim().toUpperCase();
        lines.push(heading);
        lines.push('');
        break;
      }
      case 'action':
        lines.push(text);
        lines.push('');
        break;
      case 'dialogue': {
        const name = getCharName(block, characters).toUpperCase();
        lines.push(name);
        lines.push(text);
        lines.push('');
        break;
      }
      case 'parenthetical':
        lines.push(`(${text})`);
        break;
      case 'transition':
        lines.push(`> ${text.toUpperCase()}`);
        lines.push('');
        break;
      default:
        if (text) { lines.push(text); lines.push(''); }
    }
  }
  return lines.join('\n');
}

// ─── Build full print HTML ────────────────────────────────────────────────────
export function buildPrintHTML({
  episodes = [],
  scriptBlocks = [],
  project = null,
  characters = [],
  coverDoc = null,
  synopsisDoc = null,
  margins = { top: 35, right: 30, bottom: 30, left: 30 },
  dialogueGap = '7em',
  fontFamily = '함초롱바탕',
  fontSize = 11,
  lineHeight = 1.6,
}) {
  const { top, right, bottom, left } = margins;
  const sections = [];

  if (coverDoc) {
    const titleVal = coverDoc.title || project?.title || '';
    const fields = (coverDoc.fields || []).filter(f => f.id !== 'title' && f.value);
    const customFields = (coverDoc.customFields || []).filter(f => f.value);
    const allExtra = [...fields, ...customFields];
    sections.push(`
      <div class="p-cover page-break-after">
        <div class="cover-title">${escHtml(titleVal)}</div>
        ${allExtra.map(f => `<div class="cover-field">${escHtml(f.label)}: ${escHtml(f.value)}</div>`).join('')}
      </div>`);
  }

  if (synopsisDoc) {
    const s = synopsisDoc;
    const parts = [];
    if (s.genre) parts.push(`<p><strong>장르</strong><br>${escHtml(s.genre)}</p>`);
    if (s.theme) parts.push(`<p><strong>주제</strong><br>${escHtml(s.theme)}</p>`);
    if (s.intent) parts.push(`<p><strong>기획의도</strong><br>${escHtml(s.intent)}</p>`);
    const projChars = characters.filter(c => c.projectId === project?.id);
    if (projChars.length) {
      const cHtml = projChars.map(c =>
        `<div class="char-entry"><strong>${escHtml(c.name)}</strong>${c.age ? ` (${escHtml(c.age)})` : ''}${c.job ? ` · ${escHtml(c.job)}` : ''} — ${escHtml(c.description || '')}</div>`
      ).join('');
      parts.push(`<p><strong>인물설정</strong></p>${cHtml}`);
    }
    if (s.story) parts.push(`<p><strong>줄거리</strong><br>${escHtml(s.story)}</p>`);
    if (parts.length) {
      sections.push(`<div class="p-synopsis page-break-after">${parts.join('')}</div>`);
    }
  }

  episodes.forEach((ep, idx) => {
    const epBlocks = scriptBlocks.filter(b => b.episodeId === ep.id);
    const epTitle = `${ep.number}회 ${ep.title || ''}`.trim();
    const blocksHtml = epBlocks.map(b => blockToHtml(b, characters, dialogueGap)).join('');
    const isLast = idx === episodes.length - 1;
    sections.push(`
      <div class="p-episode${isLast ? '' : ' page-break-after'}">
        <div class="ep-title">${escHtml(epTitle)}</div>
        ${blocksHtml}
      </div>`);
  });

  const pageStyle = `
    @page { size: A4; margin: ${top}mm ${right}mm ${bottom}mm ${left}mm; }
    @page { @bottom-center { content: "- " counter(page) " -"; font-size: 9pt; color: #555; } }
    * { box-sizing: border-box; }
    body {
      font-family: '함초롱바탕', 'HCR Batang', 'Malgun Gothic', sans-serif;
      font-size: ${fontSize}pt;
      line-height: ${lineHeight};
      color: #000;
      background: #fff;
    }
    .page-break-after { page-break-after: always; }
    .p-cover { text-align: center; padding-top: 25%; }
    .cover-title { font-size: 22pt; font-weight: bold; margin-bottom: 16pt; }
    .cover-field { font-size: 11pt; margin: 4pt 0; }
    .p-synopsis p { margin: 0 0 10pt 0; }
    .char-entry { margin: 2pt 0 2pt 1em; font-size: 10pt; }
    .ep-title { text-align: center; font-size: 13pt; font-weight: bold; margin-bottom: 18pt; }
    .p-scene { font-weight: bold; margin-top: 18pt; margin-bottom: 4pt; }
    .p-action { margin: 2pt 0 6pt 0; }
    .p-dialogue { display: flex; align-items: flex-start; margin: 4pt 0; }
    .p-char { font-weight: bold; min-width: ${dialogueGap}; flex-shrink: 0; }
    .p-speech { flex: 1; }
    .p-paren { margin-left: ${dialogueGap}; font-style: italic; font-size: 10pt; }
    .p-transition { text-align: right; margin: 8pt 0; }
  `;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${escHtml(project?.title || '대본')}</title>
<style>${pageStyle}</style>
</head>
<body>
${sections.join('\n')}
</body>
</html>`;
}

function blockToHtml(block, characters, dialogueGap) {
  const text = block.content || '';
  switch (block.type) {
    case 'scene_number':
      return `<div class="p-scene">${escHtml(block.label || '')} ${escHtml(text)}</div>`;
    case 'action':
      return `<div class="p-action">${escHtml(text)}</div>`;
    case 'dialogue': {
      const name = getCharName(block, characters);
      return `<div class="p-dialogue"><span class="p-char">${escHtml(name)}</span><span class="p-speech">${escHtml(text)}</span></div>`;
    }
    case 'parenthetical':
      return `<div class="p-paren">(${escHtml(text)})</div>`;
    case 'transition':
      return `<div class="p-transition">${escHtml(text.toUpperCase())}</div>`;
    default:
      return text ? `<div>${escHtml(text)}</div>` : '';
  }
}

// ─── PDF (browser print) ──────────────────────────────────────────────────────
export function printScript(fullHtml) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(fullHtml);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}

// ─── Download helper ──────────────────────────────────────────────────────────
export function downloadText(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
