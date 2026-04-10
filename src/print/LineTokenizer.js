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

function stripHtml(html) {
  return (html || '')
    .replace(/&lt;br\s*\/?&gt;/gi, '\n')           // &lt;br&gt; → 줄바꿈
    .replace(/<br\s*\/?>/gi, '\n')                  // <br> → 줄바꿈
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')   // 블록 닫힘 태그 → 줄바꿈
    .replace(/&lt;[^&]*&gt;/g, '')                  // 나머지 엔티티 태그 제거
    .replace(/<[^>]+>/g, '')                        // 나머지 실제 태그 제거
    .replace(/\n{3,}/g, '\n\n')                    // 연속 3개 이상 줄바꿈 → 2개로 압축
    .trimEnd();                                     // 끝에 붙은 빈 줄 제거
}

// ─── A4 metrics ────────────────────────────────────────────────────────────────
const PT_PER_MM   = 2.8346;
const A4_W_MM     = 210;
const A4_H_MM     = 297;

export function getLayoutMetrics(preset) {
  const margins    = preset?.pageMargins ?? { top: 35, right: 30, bottom: 30, left: 30 };
  const fontSize   = preset?.fontSize   ?? 11;    // pt
  const lineHeight = preset?.lineHeight ?? 1.6;

  const contentWmm = A4_W_MM - margins.left - margins.right;
  const contentHmm = A4_H_MM - margins.top  - margins.bottom;
  const contentWpt = contentWmm * PT_PER_MM;   // ≈ 425 pt
  const contentHpt = contentHmm * PT_PER_MM;   // ≈ 658 pt
  const lineHpt    = fontSize * lineHeight;     // ≈ 17.6 pt
  const linesPerPage = Math.floor(contentHpt / lineHpt);

  // dialogue gap in pt (preset.dialogueGap is "Nem" string)
  let dialogueGapPt = 7 * fontSize;
  const m = (preset?.dialogueGap || '7em').match(/^([\d.]+)em$/);
  if (m) dialogueGapPt = parseFloat(m[1]) * fontSize;

  // 함초롱바탕 한글 평균 자폭 ≈ fontSize * 0.55 (실측 기준)
  const avgCharPt      = fontSize * 0.55;
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
  ep_title:     (lh, fs) => (fs + 2) / fs,           // 더 큰 폰트만, marginBottom 없음
  scene_number: (lh, fs) => 1 + 12 / (fs * lh),
  char_name:    (lh, fs) => 1 + 6  / (fs * lh),
  heading:      (lh, fs) => 1 + 2  / (fs * lh),      // marginBottom: 2pt만 (marginTop 제거)
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
      tokens.push(T('cover_field', f.value, { center: true }))
    );
    return tokens;
  }

  // ── Synopsis
  if (section.type === 'synopsis') {
    // blockText + blockLineCount on the first token of each wrapped group lets
    // the PDF renderer pass the full paragraph to pdfkit when the block fits
    // entirely on one page (enabling justify on interior lines).
    const addSection = (label, text) => {
      if (!text) return;
      tokens.push(T('heading', label, { bold: true }));
      tokens.push(B()); // 항목명과 내용 사이 줄바꿈
      // Split by newline paragraphs; each paragraph is its own blockText block
      // so the PDF renderer can justify interior lines when the para fits on one page.
      const paras = text.split('\n');
      paras.forEach(para => {
        if (!para.trim()) return;
        const lines = wrapText(para, charsPerLine);
        lines.forEach((t, i) =>
          tokens.push(T('body', t, {
            isFirstOfBlock: i === 0,
            blockText:      i === 0 ? para : undefined,
            blockLineCount: i === 0 ? lines.length : undefined,
          }))
        );
      });
      tokens.push(B());
    };
    addSection('장르',     section.genre);
    addSection('주제',     section.theme);
    addSection('기획의도', section.intent);
    if (section.characters.length) {
      tokens.push(T('heading', '등장인물', { bold: true }));
      tokens.push(B()); // 인물설정 뒤 줄바꿈 (addSection과 동일하게)
      section.characters.forEach(c => {
        const agePart = [c.gender, c.age].filter(Boolean).join(' / ');
        const nameLine = `${c.name}${agePart ? ` (${agePart})` : ''}${c.job ? ` ${c.job}` : ''}`;
        const nameLines = wrapText(nameLine, charsPerLine - 2);
        nameLines.forEach((t, i) =>
          tokens.push(T('body', (i === 0 ? '  ' : '    ') + t, {
            isFirstOfBlock:    i === 0,
            isSynopsisCharName: i === 0, // 고아 복구: 다음 페이지의 설명과 함께 이동
            blockText:         i === 0 ? ('  ' + nameLine) : undefined,
            blockLineCount:    i === 0 ? nameLines.length : undefined,
          }))
        );
        if (c.description) {
          const descLines = wrapText(c.description, charsPerLine - 4);
          descLines.forEach((t, i) =>
            tokens.push(T('body', '    ' + t, {
              isFirstOfBlock: i === 0,
              blockText:      i === 0 ? ('    ' + c.description) : undefined,
              blockLineCount: i === 0 ? descLines.length : undefined,
            }))
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

    let prevBlock = null;
    for (const block of section.blocks) {

      switch (block.type) {
        case 'scene_number': {
          const sceneText = `${block.label} ${block.content}`.trim();
          tokens.push(T('scene_number', sceneText, { bold: true }));
          break;
        }
        case 'action': {
          const plainA = stripHtml(block.content);
          const rawHtmlA = block.content || '';
          const hasHtmlA = rawHtmlA !== plainA;
          const wrappedA = wrapText(plainA, charsPerLine - 2);
          wrappedA.forEach((t, i) =>
            tokens.push(T('action', t, {
              indent: 1,
              isFirstOfBlock: i === 0,
              blockText:      i === 0 ? plainA : undefined,
              blockLineCount: i === 0 ? wrappedA.length : undefined,
              rawHtml:        (i === 0 && hasHtmlA) ? rawHtmlA : undefined,
            }))
          );
          break;
        }
        case 'dialogue': {
          const plainD = stripHtml(block.content);
          const rawHtmlD = block.content || '';
          const hasHtmlD = rawHtmlD !== plainD;
          const wrappedD = wrapText(plainD, charsInSpeech);
          wrappedD.forEach((t, i) =>
            tokens.push(T('dialogue', t, {
              charName:       i === 0 ? block.charName : '',
              isFirstLine:    i === 0,
              isFirstOfBlock: i === 0,
              blockText:      i === 0 ? plainD : undefined,
              blockLineCount: i === 0 ? wrappedD.length : undefined,
              rawHtml:        (i === 0 && hasHtmlD) ? rawHtmlD : undefined,
            }))
          );
          break;
        }
        case 'parenthetical': {
          const parenText = `(${block.content || ''})`;
          const wrappedP = wrapText(parenText, charsInSpeech);
          wrappedP.forEach((t, i) =>
            tokens.push(T('parenthetical', t, {
              italic: true, indent: 1,
              isFirstOfBlock: i === 0,
              blockText:      i === 0 ? parenText : undefined,
              blockLineCount: i === 0 ? wrappedP.length : undefined,
            }))
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
        case 'tag':
          break; // 태그 블록은 출력 제외
        default:
          if (block.content) {
            wrapText(stripHtml(block.content), charsPerLine).forEach(t =>
              tokens.push(T('body', t))
            );
          }
      }
      prevBlock = block;
    }
    return tokens;
  }

  // ── Biography (인물이력서)
  if (section.type === 'biography') {
    tokens.push(T('ep_title', '인물이력서', { bold: true, center: true }));
    tokens.push(B());
    section.characters.forEach(c => {
      tokens.push(T('char_name', c.name, { bold: true }));
      c.items.forEach(item => {
        const line = `${item.year ? item.year + '  ' : ''}${item.event || ''}`;
        wrapText(line, charsPerLine - 2).forEach(t =>
          tokens.push(T('body', '  ' + t))
        );
      });
      tokens.push(B());
    });
    return tokens;
  }

  // ── Treatment (트리트먼트)
  if (section.type === 'treatment') {
    const epTitle = `${section.episodeNumber}회 트리트먼트${section.episodeTitle ? ` — ${section.episodeTitle}` : ''}`;
    tokens.push(T('ep_title', epTitle, { bold: true, center: true }));
    tokens.push(B());
    section.items.forEach((item, i) => {
      const prefix = `${i + 1}. `;
      const lines = wrapText(item.text || '', charsPerLine - prefix.length);
      lines.forEach((t, li) =>
        tokens.push(T('body', li === 0 ? prefix + t : '   ' + t))
      );
    });
    tokens.push(B());
    return tokens;
  }

  // ── SceneList (씬리스트)
  if (section.type === 'scenelist') {
    const epTitle = `${section.episodeNumber}회 씬리스트${section.episodeTitle ? ` — ${section.episodeTitle}` : ''}`;
    tokens.push(T('ep_title', epTitle, { bold: true, center: true }));
    tokens.push(B());
    section.scenes.forEach((scene, i) => {
      const loc = [scene.location, scene.subLocation].filter(Boolean).join(' / ');
      const sceneHead = [`S#${i + 1}`, loc, scene.timeOfDay].filter(Boolean).join('  ');
      tokens.push(T('scene_number', sceneHead, { bold: true }));
      const desc = scene.sceneListContent || scene.content || '';
      if (desc) {
        wrapText(desc, charsPerLine - 2).forEach((t, li) =>
          tokens.push(T('action', '  ' + t, {
            isFirstOfBlock: li === 0,
            blockText:      li === 0 ? desc : undefined,
            blockLineCount: li === 0 ? wrapText(desc, charsPerLine - 2).length : undefined,
          }))
        );
      }
    });
    return tokens;
  }

  // ── Characters reference
  if (section.type === 'characters') {
    tokens.push(T('heading', '등장인물', { bold: true }));
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

// ─── Orphan token detection ───────────────────────────────────────────────────
// 페이지 맨 끝에 홀로 남으면 안 되는 구조적 토큰.
// body 한 줄짜리 catch-all은 "그 외..." 같은 내용 줄도 구제해버리므로 제거.
// 시놉시스 인물명은 isSynopsisCharName 플래그로 명시적으로 처리.
function isOrphanToken(t) {
  return (
    t.kind === 'heading' ||
    t.kind === 'blank' ||
    t.kind === 'ep_title' ||
    t.kind === 'char_name' ||
    t.kind === 'scene_number' ||
    t.isSynopsisCharName === true
  );
}

// ─── LineToken[] → Page[] (each page = LineToken[]) ──────────────────────────
// sectionType: 섹션 종류에 따라 ② 조기 넘김의 블록 크기 상한이 달라짐.
//   episode/scenelist: 짧은 대사(≤4줄)만 이동 — 긴 액션 블록은 ③으로 자연 분할
//   synopsis/characters/등: 짧은 블록(≤20%)만 이동 — 긴 줄거리 단락은 자연 분할
export function paginate(tokens, metrics, sectionType = '') {
  const { linesPerPage } = metrics;
  const isEpisodeType = sectionType === 'episode' || sectionType === 'scenelist' || sectionType === '';
  // episode: 4줄 이하 블록만 ②로 이동 (긴 액션은 자연 분할 → 과도한 페이지 공백 방지)
  // synopsis: 약 20% 이하 블록만 이동
  const maxBlockH = isEpisodeType ? 4 : Math.ceil(linesPerPage / 5);
  const pages = [];
  let page = [];
  let used = 0;

  const totalH = tokens.reduce((s, t) => s + (t.height || 1), 0);

  // 현재 페이지 끝에서 고아 토큰을 제거하고 반환 (새 페이지 첫머리로 이동)
  const rescueTrailer = () => {
    const trailer = [];
    while (page.length > 0) {
      if (isOrphanToken(page[page.length - 1])) trailer.unshift(page.pop());
      else break;
    }
    return trailer;
  };

  const breakPage = (trailer = []) => {
    if (page.length > 0) pages.push(page);
    // 새 페이지 첫머리 빈줄 제거 (rescue된 heading 앞의 blank가 여백처럼 보이는 현상 방지)
    const firstContent = trailer.findIndex(t => t.kind !== 'blank');
    page = firstContent >= 0 ? [...trailer.slice(firstContent)] : [];
    used = page.reduce((s, t) => s + (t.height || 1), 0);
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const h = token.height || 1;
    const isContinuation = token.isFirstOfBlock === false;

    if (!isContinuation) {
      // ① 표준 페이지 넘김: 현재 페이지에 첫 줄이 안 들어갈 때
      //    고아 토큰(heading·scene_number 등)을 새 페이지로 함께 이동
      if (used + h > linesPerPage && page.length > 0) {
        breakPage(rescueTrailer());
      }

      // ② 조기 페이지 넘김: 블록 전체가 현재 페이지엔 안 들어가지만 새 페이지엔 들어갈 때.
      //    조건:
      //      - 페이지 75% 이상 찼을 때만 발동 (빈 공간이 많은데도 넘기는 현상 방지)
      //      - 블록 높이가 한 페이지의 약 20% 이하일 때만 발동
      //        (줄거리 등 긴 단락은 ②로 이동하지 않고 ③으로 자연스럽게 분할)
      if (token.blockLineCount > 1 && used >= linesPerPage * 0.75) {
        let blockH = h;
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].isFirstOfBlock === false) blockH += (tokens[j].height || 1);
          else break;
        }
        if (used + blockH > linesPerPage && blockH <= maxBlockH) {
          breakPage(rescueTrailer());
        }
      }
    } else {
      // ③ 연속 줄이 이 줄을 추가하면 linesPerPage를 초과하는 경우 → 분할 허용
      //    (블록이 한 페이지보다 긴 경우에만 해당)
      if (used + h > linesPerPage && page.length > 0) {
        breakPage();
      }
    }

    page.push(token);
    used += h;
  }
  if (page.length > 0) pages.push(page);
  const result = pages.length ? pages : [[]];


  return result;
}

// ─── Convenience: tokenize + paginate a section in one call ──────────────────
export function sectionToPages(section, metrics) {
  return paginate(tokenizeSection(section, metrics), metrics);
}
