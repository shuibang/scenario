/**
 * RTF exporter — Word / HWP-compatible
 * Korean text via \\uN? Unicode escapes (no external library needed)
 */

// ─── Unicode → RTF escape ─────────────────────────────────────────────────────
function rtfStr(str) {
  if (!str) return '';
  let out = '';
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code < 128) {
      // ASCII: escape special RTF chars
      if (ch === '\\') out += '\\\\';
      else if (ch === '{') out += '\\{';
      else if (ch === '}') out += '\\}';
      else if (ch === '\n') out += '\\line ';
      else out += ch;
    } else {
      // Non-ASCII: RTF Unicode escape \uN?
      // The ? is a fallback ASCII char for older RTF readers
      out += `\\u${code}?`;
    }
  }
  return out;
}

// ─── RTF paragraph builders ───────────────────────────────────────────────────
// twips: 1 inch = 1440 twips, 1 mm ≈ 56.7 twips
const MM_TO_TWIPS = 56.7;

function mmToTwips(mm) {
  return Math.round(mm * MM_TO_TWIPS);
}

// ─── Build RTF document ───────────────────────────────────────────────────────
// options: { episodes, scriptBlocks, project, characters, coverDoc, synopsisDoc,
//            margins, dialogueGap }
export function exportRTF(
  blocks,
  episode,
  project,
  characters,
  margins = { top: 35, right: 30, bottom: 30, left: 30 },
  dialogueGap = '7em',
  extras = {},
  projectChars = []
) {
  const { top, right, bottom, left } = margins || { top: 35, right: 30, bottom: 30, left: 30 };

  // A4 page dimensions in twips (210 x 297 mm)
  const pageW = mmToTwips(210);
  const pageH = mmToTwips(297);
  const mTop = mmToTwips(top);
  const mBottom = mmToTwips(bottom);
  const mLeft = mmToTwips(left);
  const mRight = mmToTwips(right);

  // Estimate dialogue tab stop from dialogueGap (e.g. "7em" → ~7 * 180 twips at 12pt)
  // 1em at 12pt ≈ 180 twips. Fallback to 7em = 1260 twips
  let gapTwips = 1260;
  const emMatch = typeof dialogueGap === 'string' && dialogueGap.match(/^([\d.]+)em$/);
  if (emMatch) gapTwips = Math.round(parseFloat(emMatch[1]) * 180);

  const lines = [];

  // RTF header
  lines.push(
    `{\\rtf1\\ansi\\ansicpg949\\cocoartf2639`,
    `{\\fonttbl\\f0\\fswiss\\fcharset129 MalgunGothic;\\f1\\froman\\fcharset0 Times New Roman;}`,
    `{\\colortbl;\\red0\\green0\\blue0;}`,
    `\\paperw${pageW}\\paperh${pageH}`,
    `\\margt${mTop}\\margb${mBottom}\\margl${mLeft}\\margr${mRight}`,
    `\\widowctrl\\hyphauto0`,
    `\\f0\\fs24\\cf1` // 12pt Malgun Gothic
  );

  // ── Helper: normal paragraph
  const para = (text, opts = {}) => {
    const indent = opts.indent ? `\\li${opts.indent}\\fi0 ` : '';
    const bold = opts.bold ? '\\b ' : '';
    const italic = opts.italic ? '\\i ' : '';
    const center = opts.center ? '\\qc ' : '\\ql ';
    const tabStop = opts.tabStop ? `\\tx${opts.tabStop} ` : '';
    return `{\\pard ${center}${tabStop}${indent}${bold}${italic}${rtfStr(text)}\\par}`;
  };

  // ── Helper: page break
  const pageBreak = () => `{\\pard\\page\\par}`;

  // ── Cover section
  if (extras.cover) {
    const doc = extras.cover;
    const title = doc.title || project?.title || '';
    lines.push(para('', {})); // top padding
    lines.push(para(title, { bold: true, center: true }));
    const fields = (doc.fields || []).filter(f => f.id !== 'title' && f.value);
    const customFields = (doc.customFields || []).filter(f => f.value);
    [...fields, ...customFields].forEach(f => {
      lines.push(para(`${f.label}: ${f.value}`, { center: true }));
    });
    lines.push(pageBreak());
  }

  // ── Synopsis section
  if (extras.synopsis) {
    const s = extras.synopsis;
    if (s.genre) { lines.push(para('장르', { bold: true })); lines.push(para(s.genre)); }
    if (s.theme) { lines.push(para('주제', { bold: true })); lines.push(para(s.theme)); }
    if (s.intent) { lines.push(para('기획의도', { bold: true })); lines.push(para(s.intent)); }
    if (projectChars.length) {
      lines.push(para('인물설정', { bold: true }));
      projectChars.forEach(c => {
        const age = c.age ? ` (${c.age})` : '';
        lines.push(para(`${c.name}${age}${c.description ? ' — ' + c.description : ''}`, { indent: 360 }));
      });
    }
    if (s.story) { lines.push(para('줄거리', { bold: true })); lines.push(para(s.story)); }
    lines.push(pageBreak());
  }

  // ── Script blocks
  // blocks may be a flat array (possibly with _ep marker) or just one episode's blocks
  const allBlocks = Array.isArray(blocks) ? blocks : [];

  // Group by episodeId to handle per-episode page-number reset visually
  const byEpisode = {};
  const epOrder = [];
  allBlocks.forEach(b => {
    const epId = b.episodeId || '_noep';
    if (!byEpisode[epId]) { byEpisode[epId] = []; epOrder.push(epId); }
    byEpisode[epId].push(b);
  });

  epOrder.forEach((epId, epIdx) => {
    const epBlocks = byEpisode[epId];
    const epMeta = epBlocks[0]?._ep || episode || null;
    const epTitle = epMeta ? `${epMeta.number}회 ${epMeta.title || ''}`.trim() : '';

    if (epIdx > 0) lines.push(pageBreak());
    if (epTitle) lines.push(para(epTitle, { bold: true, center: true }));
    lines.push(para('')); // blank line

    epBlocks.forEach(block => {
      switch (block.type) {
        case 'scene_number': {
          const sceneText = `${block.label || ''} ${block.text || ''}`.trim();
          lines.push(para('')); // empty line spacing instead of border
          lines.push(para(sceneText, { bold: true }));
          break;
        }
        case 'action':
          lines.push(para(block.text || ''));
          break;
        case 'dialogue': {
          const name = block.characterId
            ? (characters.find(c => c.id === block.characterId)?.name || block.characterName || '')
            : (block.characterName || '');
          // Dialogue: char name tab speech (hanging indent via tab stop)
          const dialogueLine = `{\\pard\\ql\\tx${gapTwips} {\\b ${rtfStr(name)}}\\tab ${rtfStr(block.text || '')}\\par}`;
          lines.push(dialogueLine);
          break;
        }
        case 'parenthetical': {
          const parenLine = `{\\pard\\ql\\li${gapTwips} {\\i (${rtfStr(block.text || '')})}\\par}`;
          lines.push(parenLine);
          break;
        }
        case 'transition':
          lines.push(para((block.text || '').toUpperCase(), { center: false }));
          break;
        default:
          if (block.text) lines.push(para(block.text));
      }
    });
  });

  lines.push('}'); // close RTF

  return lines.join('\n');
}
