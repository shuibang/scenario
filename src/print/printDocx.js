/**
 * DOCX renderer — uses the `docx` npm package.
 *
 * Produces proper OOXML (Open XML) .docx files.
 * Korean text is encoded correctly (UTF-16 internally in OOXML).
 * Word and Hancom HWP 2014+ can open these files without garbling.
 *
 * Structure:
 *   buildPrintModel → sections → OOXML sections → Packer.toBlob() → download
 */

import {
  Document, Packer, Paragraph, TextRun, Tab,
  AlignmentType, TabStopType,
  convertMillimetersToTwip,
  Footer, PageNumber,
  SectionType, LineRuleType, NumberFormat,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx';
import { buildPrintModel } from './PrintModel';
import { resolveFont } from './FontRegistry';

// ─── Preset → twip/pt helpers ─────────────────────────────────────────────────
const PT_TO_HALF_PT = 2;  // docx uses half-points for font size

function presetToDocxProps(preset) {
  const margins   = preset?.pageMargins ?? { top: 35, right: 30, bottom: 30, left: 30 };
  const fontSize  = preset?.fontSize   ?? 11; // pt
  const lineHeight = preset?.lineHeight ?? 1.6;
  const { fontName: fontFamily } = resolveFont(preset, 'docx');

  const dialogueGapPt = (() => {
    const m = (preset?.dialogueGap || '7em').match(/^([\d.]+)em$/);
    return m ? parseFloat(m[1]) * fontSize : 7 * fontSize;
  })();

  // Line spacing in twips: 240 = single, 360 = 1.5, 480 = double
  // We use exact line rule: lineRule = 'exact', line = fontSize(pt) * lineHeight * 20 (twips)
  const lineSpacingTwips = Math.round(fontSize * lineHeight * 20);

  return {
    margins: {
      top:    convertMillimetersToTwip(margins.top),
      right:  convertMillimetersToTwip(margins.right),
      bottom: convertMillimetersToTwip(margins.bottom),
      left:   convertMillimetersToTwip(margins.left),
    },
    fontSize,
    fontSizeHalfPt: fontSize * PT_TO_HALF_PT,
    lineSpacingTwips,
    fontFamily,
    dialogueGapTwips: Math.round(dialogueGapPt * 20), // 1pt = 20 twips
  };
}

// ─── Base run options ─────────────────────────────────────────────────────────
function baseRun(text, props, dp) {
  return new TextRun({
    text,
    font:     { name: dp.fontFamily },
    size:     dp.fontSizeHalfPt,
    ...props,
  });
}

// ─── HTML → TextRun[] (b/i/u 태그만 처리) ─────────────────────────────────────
function htmlToRuns(html, dp, extraProps = {}) {
  if (!html) return [baseRun('', extraProps, dp)];
  // Replace <br> with newline
  const normalized = html.replace(/<br\s*\/?>/gi, '\n');
  const runs = [];
  // Parse segments: text and <b>/<i>/<u> spans
  // We iterate with a simple state stack
  const tagRe = /<(\/?)([biu])\b[^>]*>/gi;
  let last = 0;
  const stack = { b: 0, i: 0, u: 0 };
  let match;
  const flush = (text) => {
    if (!text) return;
    runs.push(new TextRun({
      text,
      font:      { name: dp.fontFamily },
      size:      dp.fontSizeHalfPt,
      bold:      (stack.b > 0) || !!extraProps.bold,
      italics:   (stack.i > 0) || !!extraProps.italics,
      underline: (stack.u > 0) ? {} : extraProps.underline,
    }));
  };
  while ((match = tagRe.exec(normalized)) !== null) {
    flush(normalized.slice(last, match.index));
    last = match.index + match[0].length;
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    stack[tag] = closing ? Math.max(0, stack[tag] - 1) : stack[tag] + 1;
  }
  flush(normalized.slice(last));
  return runs.length ? runs : [baseRun('', extraProps, dp)];
}

// ─── Paragraph spacing ────────────────────────────────────────────────────────
function lineSpacing(dp) {
  return {
    line:     dp.lineSpacingTwips,
    lineRule: LineRuleType.EXACT,
    before:   0,
    after:    0,
  };
}

// ─── Common paragraph builder ─────────────────────────────────────────────────
// opts.html=true → text is HTML, parse inline formatting
function para(text, dp, opts = {}) {
  const children = opts.html
    ? htmlToRuns(text, dp, { bold: opts.bold || false, italics: opts.italic || false })
    : [baseRun(text, { bold: opts.bold || false, italics: opts.italic || false }, dp)];
  return new Paragraph({
    children,
    alignment: opts.center ? AlignmentType.CENTER
             : opts.right  ? AlignmentType.RIGHT
             : opts.noJustify ? AlignmentType.LEFT
             : AlignmentType.BOTH,
    spacing: lineSpacing(dp),
    indent: opts.indent ? { left: convertMillimetersToTwip(opts.indent) } : undefined,
  });
}

function blankPara(dp) {
  return new Paragraph({ children: [baseRun('', {}, dp)], spacing: lineSpacing(dp) });
}

// ─── Section break (new section resets page numbers) ─────────────────────────
function sectionBreak() {
  return new Paragraph({
    children:  [],
    pageBreakBefore: true,
  });
}

// ─── Dialogue paragraph (character name + speech, tab-based) ──────────────────
function dialoguePara(charName, speech, dp) {
  const gapTwips = dp.dialogueGapTwips;
  const speechRuns = htmlToRuns(speech, dp);
  return new Paragraph({
    children: [
      new TextRun({ text: String(charName || ''), bold: true, font: { name: dp.fontFamily }, size: dp.fontSizeHalfPt }),
      new TextRun({ children: [new Tab()], font: { name: dp.fontFamily }, size: dp.fontSizeHalfPt }),
      ...speechRuns,
    ],
    tabStops: [
      { type: TabStopType.LEFT, position: gapTwips },
    ],
    indent: { left: gapTwips, hanging: gapTwips },
    alignment: AlignmentType.BOTH,
    spacing: lineSpacing(dp),
  });
}

// ─── Cover title paragraph (large, bold, centered) ───────────────────────────
function coverTitlePara(text, dp) {
  const titleSizeHalfPt = (dp.fontSize + 11) * 2;
  return new Paragraph({
    children: [new TextRun({ text, bold: true, font: { name: dp.fontFamily }, size: titleSizeHalfPt })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120 },
  });
}

function coverSubtitlePara(text, dp) {
  const subtitleSizeHalfPt = (dp.fontSize + 5) * 2;
  return new Paragraph({
    children: [new TextRun({ text, font: { name: dp.fontFamily }, size: subtitleSizeHalfPt, color: '555555' })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 240 },
  });
}

function parenPara(text, dp) {
  return new Paragraph({
    children: [baseRun(`(${text})`, { italics: true }, dp)],
    indent:   { left: dp.dialogueGapTwips },
    spacing:  lineSpacing(dp),
  });
}

// ─── Page number footer ───────────────────────────────────────────────────────
// PageNumber is an enum object (not a class). Page numbers go inside TextRun.children
// where the string constant PageNumber.CURRENT is handled by the Run constructor.
function pageNumFooter(dp) {
  const runOpts = { font: { name: dp.fontFamily }, size: dp.fontSizeHalfPt - 2 };
  return new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({ ...runOpts, text: '- ' }),
          new TextRun({ ...runOpts, children: [PageNumber.CURRENT] }),
          new TextRun({ ...runOpts, text: ' -' }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });
}

// ─── Build DOCX sections array ────────────────────────────────────────────────
function buildDocxSections(printModel, dp, { hancom = false } = {}) {
  const docxSections = [];

  for (const section of printModel.sections) {
    const paras = [];

    if (section.type === 'cover') {
      const subtitleField   = section.fields.find(f => f.label === '부제목' || f.id === 'subtitle');
      const secondaryFields = section.fields.filter(f => f !== subtitleField);
      // Cover: center-aligned, no footer (no page numbers)
      paras.push(blankPara(dp), blankPara(dp), blankPara(dp));
      paras.push(coverTitlePara(section.title, dp));
      if (subtitleField) paras.push(coverSubtitlePara(subtitleField.value, dp));
      // Spacer between title and secondary fields (mirrors PDF 70% vs 28% positioning)
      for (let i = 0; i < 8; i++) paras.push(blankPara(dp));
      secondaryFields.forEach(f => paras.push(para(f.value, dp, { center: true })));
      docxSections.push({
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
            margin: dp.margins,
          },
        },
        // No footer = no page numbers on cover
        children: paras,
      });
      continue;
    }

    // 쪽번호 footer (모든 포맷 동일하게 적용)
    const footer = pageNumFooter(dp);

    if (section.type === 'synopsis') {
      const addBlock = (label, text) => {
        if (!text) return;
        paras.push(para(label, dp, { bold: true }));
        paras.push(blankPara(dp)); // 항목명과 내용 사이 줄바꿈
        text.split('\n').forEach(l => paras.push(para(l, dp)));
        paras.push(blankPara(dp));
      };
      addBlock('장르',     section.genre);
      addBlock('주제',     section.theme);
      addBlock('기획의도', section.intent);
      if (section.characters.length) {
        paras.push(para('인물설정', dp, { bold: true }));
        paras.push(blankPara(dp)); // 인물설정 뒤 줄바꿈 (인물소개와 통일)
        section.characters.forEach(c => {
          // Format: 이름 (성별 / 나이) 직업
          const agePart = [c.gender, c.age].filter(Boolean).join(' / ');
          const nameLine = `  ${c.name}${agePart ? ` (${agePart})` : ''}${c.job ? ` ${c.job}` : ''}`;
          paras.push(para(nameLine, dp));
          if (c.description) paras.push(para(`    ${c.description}`, dp));
        });
        paras.push(blankPara(dp));
      }
      addBlock('줄거리', section.story);
    }

    else if (section.type === 'episode') {
      const epTitle = `${section.episodeNumber}회 ${section.episodeTitle}`.trim();
      paras.push(para(epTitle, dp, { bold: true, center: true }));
      if (!hancom) paras.push(blankPara(dp)); // 회차표기 뒤 빈줄 (한글은 생략)

      let prevBlock = null;
      for (const block of section.blocks) {
        if (prevBlock !== null && prevBlock.type !== block.type && prevBlock.type !== 'scene_number') paras.push(blankPara(dp));
        switch (block.type) {
          case 'scene_number':
            paras.push(para(`${block.label} ${block.content}`.trim(), dp, { bold: true, noJustify: true }));
            break;
          case 'action':
            // HTML 서식 포함 가능 — 줄 단위로 분리하되 각 줄을 html 모드로 렌더
            (block.content || '').split('\n').forEach(l =>
              paras.push(para(l, dp, { indent: 8, html: true }))
            );
            break;
          case 'dialogue':
            // First line: charName + speech together
            paras.push(dialoguePara(block.charName, block.content, dp));
            break;
          case 'parenthetical':
            paras.push(parenPara(block.content, dp));
            break;
          case 'transition':
            paras.push(para((block.content || '').toUpperCase(), dp, { right: true }));
            break;
          default:
            if (block.content) paras.push(para(block.content, dp));
        }
        prevBlock = block;
      }
    }

    else if (section.type === 'scenelist') {
      const SL_FS = 10 * PT_TO_HALF_PT; // 10pt in half-points
      const epTitle = `${section.episodeNumber}회 씬리스트${section.episodeTitle ? ` — ${section.episodeTitle}` : ''}`;
      paras.push(new Paragraph({
        children: [new TextRun({ text: epTitle, bold: true, font: { name: dp.fontFamily }, size: SL_FS + 2 })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 },
      }));

      // 컬럼 너비 (가로 A4: 297mm - 여백 40mm = 257mm → twip)
      const totalW = convertMillimetersToTwip(257);
      const COL_W = {
        num:    Math.round(totalW * 0.06),
        loc:    Math.round(totalW * 0.11),
        subloc: Math.round(totalW * 0.10),
        day:    Math.round(totalW * 0.06),
        night:  Math.round(totalW * 0.06),
        chars:  Math.round(totalW * 0.12),
        desc:   Math.round(totalW * 0.38),
        note:   Math.round(totalW * 0.11),
      };
      const HEADERS = ['씬번호', '장소', '세부장소', '낮', '밤', '등장인물', '내용 요약', '비고'];
      const WIDTHS  = Object.values(COL_W);
      const cellBorder = {
        top:    { style: BorderStyle.SINGLE, size: 4, color: '999999' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
        left:   { style: BorderStyle.SINGLE, size: 4, color: '999999' },
        right:  { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      };
      const makeCell = (text, w, bold = false, shade = false) => new TableCell({
        width: { size: w, type: WidthType.DXA },
        shading: shade ? { fill: 'ECECEC' } : undefined,
        borders: cellBorder,
        children: [new Paragraph({
          children: [new TextRun({ text: String(text ?? ''), bold, font: { name: dp.fontFamily }, size: SL_FS })],
          spacing: { before: 30, after: 30 },
        })],
      });

      const headerRow = new TableRow({
        tableHeader: true,
        children: HEADERS.map((h, i) => makeCell(h, WIDTHS[i], true, true)),
      });
      const dataRows = section.scenes.map(scene => new TableRow({
        children: [
          makeCell(scene.sceneNum,                         WIDTHS[0], true),
          makeCell(scene.location,                         WIDTHS[1]),
          makeCell(scene.subLocation,                      WIDTHS[2]),
          makeCell(scene.dayText   || '',                  WIDTHS[3]),
          makeCell(scene.nightText || '',                  WIDTHS[4]),
          makeCell((scene.characters || []).join(', '),    WIDTHS[5]),
          makeCell(scene.sceneListContent,                 WIDTHS[6]),
          makeCell('',                                     WIDTHS[7]),
        ],
      }));

      paras.push(new Table({
        width: { size: totalW, type: WidthType.DXA },
        rows: [headerRow, ...dataRows],
      }));

      // 씬리스트는 가로 용지 섹션으로 별도 push
      docxSections.push({
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            size: { width: convertMillimetersToTwip(297), height: convertMillimetersToTwip(210), orientation: 'landscape' },
            margin: { top: convertMillimetersToTwip(20), right: convertMillimetersToTwip(20), bottom: convertMillimetersToTwip(20), left: convertMillimetersToTwip(20) },
          },
        },
        footers: { default: pageNumFooter(dp) },
        children: paras,
      });
      continue; // 아래 공통 sectionDef push 스킵
    }

    else if (section.type === 'characters') {
      paras.push(para('인물소개', dp, { bold: true }));
      paras.push(blankPara(dp));
      section.characters.forEach(c => {
        paras.push(para(c.name, dp, { bold: true }));
        const meta = [c.gender, c.age, c.job, c.roleLabel].filter(Boolean).join(' · ');
        if (meta) paras.push(para(`  ${meta}`, dp));
        if (c.description) paras.push(para(`    ${c.description}`, dp));
        paras.push(blankPara(dp));
      });
    }

    const sectionDef = {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
          margin: dp.margins,
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      children: paras,
    };
    if (footer) sectionDef.footers = { default: footer };
    docxSections.push(sectionDef);
  }

  return docxSections;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * exportDocx(appState, selections, { onStep })
 * Builds and downloads a .docx file.
 * onStep(label) is called at each stage for UI progress tracking.
 */
export async function exportDocx(appState, selections, { onStep = () => {}, hancom = false } = {}) {
  let printModel, sections, blob;
  try {
    onStep('직렬화');
    const preset  = appState.stylePreset;
    printModel    = buildPrintModel(appState, selections, preset);

    onStep('레이아웃');
    const dp      = presetToDocxProps(preset);
    sections      = buildDocxSections(printModel, dp, { hancom });

    if (!sections.length) {
      const msg = '출력 대상이 없습니다. 최소 하나의 항목을 선택하세요.';
      console.warn('[printDocx]', msg);
      throw new Error(msg);
    }

    onStep('파일 생성');
    const doc = new Document({
      creator: '대본 작업실',
      title:   printModel.projectTitle,
      styles: {
        default: {
          document: {
            run: {
              font: { name: dp.fontFamily },
              size: dp.fontSizeHalfPt,
            },
          },
        },
      },
      sections,
    });
    blob = await Packer.toBlob(doc);
  } catch (err) {
    console.error('[printDocx] FAILED at build/pack step:', err);
    throw err;
  }
  try {
    onStep('다운로드');
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = `${printModel.projectTitle}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    console.error('[printDocx] FAILED at download step:', err);
    throw new Error(`다운로드 실패: ${err.message}`);
  }
}
