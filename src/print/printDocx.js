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
function para(text, dp, opts = {}) {
  const run = baseRun(text, {
    bold:   opts.bold   || false,
    italics: opts.italic || false,
  }, dp);
  return new Paragraph({
    children:  [run],
    alignment: opts.center ? AlignmentType.CENTER
             : opts.right  ? AlignmentType.RIGHT
             : AlignmentType.LEFT,
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
  // Single tab jumps to gapTwips where speech starts.
  // Hanging indent: continuation lines align with speech start position.
  return new Paragraph({
    children: [
      new TextRun({ text: String(charName || ''), bold: true, font: { name: dp.fontFamily }, size: dp.fontSizeHalfPt }),
      new TextRun({ children: [new Tab()], font: { name: dp.fontFamily }, size: dp.fontSizeHalfPt }),
      new TextRun({ text: String(speech || ''), font: { name: dp.fontFamily }, size: dp.fontSizeHalfPt }),
    ],
    tabStops: [
      { type: TabStopType.LEFT, position: gapTwips },
    ],
    indent: { left: gapTwips, hanging: gapTwips },
    spacing: lineSpacing(dp),
  });
}

// ─── Cover title paragraph (large, bold, centered) ───────────────────────────
function coverTitlePara(text, dp) {
  const titleSizeHalfPt = (dp.fontSize + 11) * 2;
  return new Paragraph({
    children: [new TextRun({ text, bold: true, font: { name: dp.fontFamily }, size: titleSizeHalfPt })],
    alignment: AlignmentType.CENTER,
    // Do NOT use EXACT line rule — it clips oversized text. Let Word auto-size the title line.
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
function buildDocxSections(printModel, dp) {
  const docxSections = [];

  for (const section of printModel.sections) {
    const paras = [];

    if (section.type === 'cover') {
      // Cover: center-aligned, no footer (no page numbers)
      paras.push(blankPara(dp), blankPara(dp), blankPara(dp));
      paras.push(coverTitlePara(section.title, dp));
      // Spacer between title and secondary fields (mirrors PDF 70% vs 28% positioning)
      for (let i = 0; i < 8; i++) paras.push(blankPara(dp));
      section.fields.forEach(f => paras.push(para(`${f.label}: ${f.value}`, dp, { center: true })));
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

    // All other sections get page number footer (reset to 1)
    const footer = pageNumFooter(dp);

    if (section.type === 'synopsis') {
      const addBlock = (label, text) => {
        if (!text) return;
        paras.push(para(label, dp, { bold: true }));
        text.split('\n').forEach(l => paras.push(para(l, dp)));
        paras.push(blankPara(dp));
      };
      addBlock('장르',     section.genre);
      addBlock('주제',     section.theme);
      addBlock('기획의도', section.intent);
      if (section.characters.length) {
        paras.push(para('인물설정', dp, { bold: true }));
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
      paras.push(blankPara(dp));

      let prevBlock = null;
      for (const block of section.blocks) {
        if (prevBlock !== null && prevBlock.type !== block.type) paras.push(blankPara(dp));
        switch (block.type) {
          case 'scene_number':
            paras.push(para(`${block.label} ${block.content}`.trim(), dp, { bold: true }));
            break;
          case 'action':
            block.content.split('\n').forEach(l =>
              paras.push(para(l, dp, { indent: 8 }))
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

    docxSections.push({
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
          margin: dp.margins,
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      footers: { default: footer },
      children: paras,
    });
  }

  return docxSections;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * exportDocx(appState, selections, { onStep })
 * Builds and downloads a .docx file.
 * onStep(label) is called at each stage for UI progress tracking.
 */
export async function exportDocx(appState, selections, { onStep = () => {} } = {}) {
  console.log('[printDocx] export start — selections:', selections);
  let printModel, sections, blob;
  try {
    onStep('직렬화');
    const preset  = appState.stylePreset;
    printModel    = buildPrintModel(appState, selections, preset);
    console.log('[printDocx] printModel built — sections:', printModel.sections.map(s => s.type));

    onStep('레이아웃');
    const dp      = presetToDocxProps(preset);
    sections      = buildDocxSections(printModel, dp);
    console.log('[printDocx] docxSections built:', sections.length, 'sections');

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
    console.log('[printDocx] Document object built — packing…');
    blob = await Packer.toBlob(doc);
    console.log('[printDocx] blob size:', blob.size, 'bytes');
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
    console.log('[printDocx] download triggered:', a.download);
  } catch (err) {
    console.error('[printDocx] FAILED at download step:', err);
    throw new Error(`다운로드 실패: ${err.message}`);
  }
}
