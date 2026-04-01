/**
 * LineTokenizer + Paginator
 *
 * Converts a PrintDocument section into LineToken arrays and distributes
 * them across A4 pages using an approximation of character width.
 *
 * LineToken = {
 *   kind: string,      — token type for renderers
 *   text: string,      — main text content
 *   charName?: string, — dialogue: speaker name (first line only)
 *   bold?: bool,
 *   italic?: bool,
 *   center?: bool,
 *   indent?: number,   — left indent multiplier (0=none, 1=1 level)
 *   height: number,    — line units consumed (1 = 1 line)
 * }
 */

// ─── A4 metrics ────────────────────────────────────────────────────────────────
const PT_PER_MM   = 2.8346;
const A4_W_MM     = 210;
const A4_H_MM     = 297;

export function getLayoutMetrics(preset) {
  const margins    = preset?.pageMargins ?? { top: 35, right: 30, bottom: 30, left: 30 };
  const fontSize   = preset?.fontSize   ?? 11;    // pt
  const lineHeight = preset?.lineHeight ?? 1.6;

  const contentWmm = A4_W_MM - margins.left - margins.right;   // 150 mm
  const contentHmm = A4_H_MM - margins.top  - margins.bottom;  // 232 mm
  const contentWpt = contentWmm * PT_PER_MM;   // ≈ 425 pt
  const contentHpt = contentHmm * PT_PER_MM;   // ≈ 658 pt
  const lineHpt    = fontSize * lineHeight;     // ≈ 17.6 pt
  const linesPerPage = Math.floor(contentHpt / lineHpt); // ≈ 37

  // dialogue gap in pt (preset.dialogueGap is "Nem" string)
  let dialogueGapPt = 7 * fontSize;
  const m = (preset?.dialogueGap || '7em').match(/^([\d.]+)em$/);
  if (m) dialogueGapPt = parseFloat(m[1]) * fontSize;

  // Average glyph width: Korean ≈ fontSize, Latin ≈ 0.6*fontSize → avg ~0.78*fontSize
  const avgCharPt      = fontSize * 0.78;
  const charsPerLine   = Math.floor(contentWpt / avgCharPt);
  const speechWpt      = contentWpt - dialogueGapPt;
  const charsInSpeech  = Math.max(20, Math.floor(speechWpt / avgCharPt));

  return {
    contentWpt, contentHpt, lineHpt, linesPerPage,
    dialogueGapPt, charsPerLine, charsInSpeech,
    margins, fontSize, lineHeight,
  };
}

// ─── Word-wrap a single string to a max char count ────────────────────────────
function wrapText(text, maxChars) {
  if (!text) return [''];
  const result = [];
  for (const rawLine of text.split('\n')) {
    if (!rawLine) { result.push(''); continue; }
    let remaining = rawLine;
    while (remaining.length > maxChars) {
      let cut = maxChars;
      // Try to break at space
      while (cut > 0 && remaining[cut] !== ' ') cut--;
      if (cut === 0) cut = maxChars;
      result.push(remaining.slice(0, cut).trimEnd());
      remaining = remaining.slice(cut).trimStart();
    }
    result.push(remaining);
  }
  return result.length ? result : [''];
}

// ─── Token helpers ────────────────────────────────────────────────────────────
// height = total vertical space consumed, in line-height units.
// Formula: text_lines * (rendered_font / base_font) + margins / lineHpt
//
// ep_title:      (fs+2)*lh + marginBottom 14pt  → ((fs+2)*lh + 14) / (fs*lh)
// scene_number:  fs*lh + marginTop 10pt + marginBottom 2pt → 1 + 12/lineHpt
// char_name:     fs*lh + marginTop 6pt → 1 + 6/lineHpt
// action/body/dialogue/parenthetical: fs*lh + marginBottom 1pt → 1 + 1/lineHpt
// blank:         1 full line unit (blank gap between blocks)
//
// All take (lineHeight, fontSize) so we can compute lineHpt = fontSize*lineHeight.
const TOKEN_HEIGHTS = {
  ep_title:     (lh, fs) => ((fs + 2) * lh + 14) / (fs * lh),
  scene_number: (lh, fs) => 1 + 12 / (fs * lh),
  char_name:    (lh, fs) => 1 + 6  / (fs * lh),
  blank:        ()       => 1,
  action:       (lh, fs) => 1 + 1  / (fs * lh),
  body:         (lh, fs) => 1 + 1  / (fs * lh),
  dialogue:     (lh, fs) => 1 + 1  / (fs * lh),
  parenthetical:(lh, fs) => 1 + 1  / (fs * lh),
  default:      ()       => 1,
};

function blank() {
  return { kind: 'blank', text: '', height: TOKEN_HEIGHTS.blank() };
}
function tok(kind, text, metrics, extra = {}) {
  const { lineHeight, fontSize } = metrics;
  const hFn = TOKEN_HEIGHTS[kind] || TOKEN_HEIGHTS.default;
  return { kind, text, height: hFn(lineHeight, fontSize), ...extra };
}

// ─── Section → LineToken[] ────────────────────────────────────────────────────
export function tokenizeSection(section, metrics) {
  const { charsPerLine, charsInSpeech, lineHpt } = metrics;
  const tokens = [];

  const T = (kind, text, extra = {}) => tok(kind, text, metrics, extra);
  const B = () => blank();

  // ── Cover
  if (section.type === 'cover') {
    tokens.push(T('cover_title', section.title, { bold: true, center: true }));
    section.fields.forEach(f =>
      tokens.push(T('cover_field', `${f.label}: ${f.value}`, { center: true }))
    );
    return tokens;
  }

  // ── Synopsis
  if (section.type === 'synopsis') {
    const addSection = (label, text) => {
      if (!text) return;
      tokens.push(T('heading', label, { bold: true }));
      wrapText(text, charsPerLine).forEach(t => tokens.push(T('body', t)));
      tokens.push(B());
    };
    addSection('장르',     section.genre);
    addSection('주제',     section.theme);
    addSection('기획의도', section.intent);
    if (section.characters.length) {
      tokens.push(T('heading', '인물설정', { bold: true }));
      section.characters.forEach(c => {
        const agePart = [c.gender, c.age].filter(Boolean).join(' / ');
        const nameLine = `${c.name}${agePart ? ` (${agePart})` : ''}${c.job ? ` ${c.job}` : ''}`;
        wrapText(nameLine, charsPerLine - 2).forEach((t, i) =>
          tokens.push(T('body', (i === 0 ? '  ' : '    ') + t))
        );
        if (c.description) {
          wrapText(c.description, charsPerLine - 4).forEach(t =>
            tokens.push(T('body', '    ' + t))
          );
        }
      });
      tokens.push(B());
    }
    addSection('줄거리', section.story);
    return tokens;
  }

  // ── Episode
  if (section.type === 'episode') {
    const epTitle = `${section.episodeNumber}회 ${section.episodeTitle}`.trim();
    tokens.push(T('ep_title', epTitle, { bold: true, center: true }));
    tokens.push(B());

    let prevBlock = null;
    for (const block of section.blocks) {
      if (prevBlock !== null && prevBlock.type !== block.type) tokens.push(B());

      switch (block.type) {
        case 'scene_number': {
          const sceneText = `${block.label} ${block.content}`.trim();
          tokens.push(T('scene_number', sceneText, { bold: true }));
          break;
        }
        case 'action': {
          wrapText(block.content, charsPerLine - 2).forEach(t =>
            tokens.push(T('action', t, { indent: 1 }))
          );
          break;
        }
        case 'dialogue': {
          const wrapped = wrapText(block.content, charsInSpeech);
          wrapped.forEach((t, i) =>
            tokens.push(T('dialogue', t, {
              charName:    i === 0 ? block.charName : '',
              isFirstLine: i === 0,
            }))
          );
          break;
        }
        case 'parenthetical': {
          wrapText(`(${block.content})`, charsInSpeech).forEach(t =>
            tokens.push(T('parenthetical', t, { italic: true, indent: 1 }))
          );
          break;
        }
        case 'scene_ref': {
          tokens.push(T('scene_ref', block.content || ''));
          break;
        }
        case 'transition': {
          tokens.push(T('transition', (block.content || '').toUpperCase(), { center: false }));
          break;
        }
        default:
          if (block.content) {
            wrapText(block.content, charsPerLine).forEach(t =>
              tokens.push(T('body', t))
            );
          }
      }
      prevBlock = block;
    }
    return tokens;
  }

  // ── Characters reference
  if (section.type === 'characters') {
    tokens.push(T('heading', '인물소개', { bold: true }));
    tokens.push(B());
    section.characters.forEach(c => {
      tokens.push(T('char_name', c.name, { bold: true }));
      const meta = [c.gender, c.age, c.job, c.roleLabel].filter(Boolean).join(' · ');
      if (meta) tokens.push(T('body', `  ${meta}`));
      if (c.description) {
        wrapText(c.description, charsPerLine - 4).forEach(t =>
          tokens.push(T('body', '    ' + t))
        );
      }
      tokens.push(B());
    });
    return tokens;
  }

  return tokens;
}

// ─── LineToken[] → Page[] (each page = LineToken[]) ──────────────────────────
export function paginate(tokens, metrics) {
  const { linesPerPage } = metrics;
  const pages = [];
  let page = [];
  let used = 0;

  for (const token of tokens) {
    const h = token.height || 1;
    if (used + h > linesPerPage && page.length > 0) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(token);
    used += h;
  }
  if (page.length > 0) pages.push(page);
  return pages.length ? pages : [[]];
}

// ─── Convenience: tokenize + paginate a section in one call ──────────────────
export function sectionToPages(section, metrics) {
  return paginate(tokenizeSection(section, metrics), metrics);
}
