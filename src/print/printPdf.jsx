/**
 * PDF renderer — @react-pdf/renderer
 *
 * Font setup:
 *   Place Korean font files in /public/fonts/ per FontRegistry.js paths.
 *   Each bundled font supports up to 4 variants: normal, bold, italic, boldItalic.
 *   null variants are skipped; missing files fall back to Helvetica at render time.
 */

import React from 'react';
import {
  Document, Page, View, Text, Font, StyleSheet, pdf,
} from '@react-pdf/renderer';
import { getLayoutMetrics, tokenizeSection, paginate } from './LineTokenizer';
import { buildPrintModel }  from './PrintModel';
import { FONTS, resolveFont } from './FontRegistry';

// ─── Font registration ─────────────────────────────────────────────────────────
let _fontsRegistered = false;

export function ensureFontsRegistered() {
  if (_fontsRegistered) return;
  _fontsRegistered = true;

  const alreadyRegistered = new Set(Font.getRegisteredFontFamilies());

  FONTS.filter(f => f.sourceType === 'bundled').forEach(f => {
    if (alreadyRegistered.has(f.cssFamily)) return;
    const variants = [];
    const { normal, bold, italic, boldItalic } = f.pdfFiles;
    const isVfFont = f.pdfVfOnly === true;

    if (normal) variants.push({ src: normal, fontWeight: 400, fontStyle: 'normal' });
    if (bold && !isVfFont && bold !== normal) {
      variants.push({ src: bold, fontWeight: 700, fontStyle: 'normal' });
    }
    if (italic)     variants.push({ src: italic,     fontWeight: 400, fontStyle: 'italic' });
    if (boldItalic) variants.push({ src: boldItalic, fontWeight: 700, fontStyle: 'italic' });

    if (variants.length > 0) {
      Font.register({ family: f.cssFamily, fonts: variants });
    }
  });

  Font.registerHyphenationCallback(w => [w]);
}

// ─── Shared style factory ─────────────────────────────────────────────────────
function makeStyles(preset, metrics) {
  const { pdfFamily: ff } = resolveFont(preset, 'pdf');
  const fs   = preset?.fontSize    ?? 11;
  const lh   = preset?.lineHeight  ?? 1.6;
  const { dialogueGapPt, margins } = metrics;

  return StyleSheet.create({
    page: {
      fontFamily:   ff,
      fontSize:     fs,
      lineHeight:   lh,
      color:        '#000',
      paddingTop:    `${margins.top}mm`,
      paddingRight:  `${margins.right}mm`,
      paddingBottom: `${margins.bottom}mm`,
      paddingLeft:   `${margins.left}mm`,
    },
    // ── cover
    coverWrap:        { flex: 1, position: 'relative' },
    coverTitleGroup:  { position: 'absolute', top: '28%', left: 0, right: 0, alignItems: 'center' },
    coverFieldsGroup: { position: 'absolute', top: '70%', left: 0, right: 0, alignItems: 'center' },
    coverTitle:       { fontSize: fs + 11, fontWeight: 700, marginBottom: 6, textAlign: 'center' },
    coverSubtitle:    { fontSize: fs + 2,  fontWeight: 400, marginBottom: 4, textAlign: 'center', color: '#555' },
    coverField:       { fontSize: fs,      marginBottom: 3, textAlign: 'center' },
    // ── page number
    pageNum: {
      position: 'absolute',
      bottom: '15mm',
      left: 0, right: 0,
      textAlign: 'center',
      fontSize: fs - 2,
      color: '#555',
    },
    // ── synopsis / characters
    heading:  { fontWeight: 700, marginTop: 8, marginBottom: 2 },
    body:     { marginBottom: 1, textAlign: 'justify' },
    charName: { fontWeight: 700, marginTop: 6 },
    charMeta: { marginLeft: 8, fontSize: fs - 1, color: '#444' },
    // ── episode
    epTitle:   { fontSize: fs + 2, fontWeight: 700, textAlign: 'center', marginBottom: 14 },
    scene:     { fontWeight: 700, marginTop: 10, marginBottom: 2 },
    action:    { marginLeft: '8mm', marginBottom: 1, textAlign: 'justify' },
    dialogueRow: { flexDirection: 'row', marginBottom: 1 },
    charCell:    { width: dialogueGapPt, fontWeight: 700, flexShrink: 0 },
    speechCell:  { flex: 1, textAlign: 'justify' },
    paren:  { marginLeft: dialogueGapPt, fontSize: fs - 1, color: '#444' },
    transition: { textAlign: 'right', marginVertical: 4 },
    blank: { marginBottom: fs * lh },
  });
}

// ─── Token → PDF element ──────────────────────────────────────────────────────
// Receives either a single token or a pre-grouped text (for multi-line action/body).
function TokenEl({ token, text, S }) {
  const content = text ?? token.text;
  switch (token.kind) {
    case 'blank':
      return <View style={S.blank} />;
    case 'scene_number':
      return <Text style={S.scene}>{content}</Text>;
    case 'action':
      return <Text style={S.action}>{content}</Text>;
    case 'dialogue':
      return (
        <View style={S.dialogueRow}>
          <Text style={S.charCell}>{token.charName || ''}</Text>
          <Text style={S.speechCell}>{content}</Text>
        </View>
      );
    case 'parenthetical':
      return <Text style={S.paren}>{content}</Text>;
    case 'transition':
      return <Text style={S.transition}>{content}</Text>;
    case 'heading':
      return <Text style={S.heading}>{content}</Text>;
    case 'ep_title':
      return <Text style={S.epTitle}>{content}</Text>;
    case 'char_name':
      return <Text style={S.charName}>{content}</Text>;
    case 'body':
    default:
      return <Text style={S.body}>{content}</Text>;
  }
}

// ─── A single PDF page ────────────────────────────────────────────────────────
// blockText logic:
//   • isFirstOfBlock=true tokens carry blockText (full unwrapped content) and
//     blockLineCount (total pre-wrapped line count for this block).
//   • The PDF renderer uses blockText ONLY when all lines of the block fit on
//     this page (blockLineCount lines present consecutively). This lets pdfkit
//     handle wrapping internally → textAlign:'justify' works on interior lines.
//   • When a block is split across pages, each fragment falls back to pre-wrapped
//     tok.text to respect the paginator's page boundaries.
//   • isFirstOfBlock=false tokens at the start of a page are continuation lines
//     from the previous page and render with tok.text as-is.
function PdfPage({ tokens, pageNum, showPageNum, S }) {
  const renderList = [];
  const absorbedKinds = new Set(); // kinds whose remaining false tokens are absorbed

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok.isFirstOfBlock === false) {
      if (absorbedKinds.has(tok.kind)) continue; // absorbed by preceding blockText
      // Continuation line from a block that started on a previous page
      renderList.push({ kind: tok.kind, text: tok.text, token: tok });
      continue;
    }

    // isFirstOfBlock === true or undefined → start of new logical unit; clear absorbed set
    absorbedKinds.clear();

    if (tok.isFirstOfBlock === true && tok.blockLineCount > 1) {
      // Count how many false tokens of this kind follow consecutively on this page
      let onPage = 0;
      for (let j = i + 1; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.isFirstOfBlock === false && t.kind === tok.kind) {
          onPage++;
        } else {
          break; // hit blank, new block, or different kind
        }
      }
      const fullyOnPage = onPage >= tok.blockLineCount - 1;
      if (fullyOnPage) absorbedKinds.add(tok.kind);
      renderList.push({
        kind:  tok.kind,
        text:  fullyOnPage ? (tok.blockText ?? tok.text) : tok.text,
        token: tok,
      });
    } else {
      renderList.push({ kind: tok.kind, text: tok.text, token: tok });
    }
  }

  return (
    <Page size="A4" style={S.page}>
      {renderList.map((item, i) => (
        <TokenEl key={i} token={item.token} text={item.text} S={S} />
      ))}
      {showPageNum && (
        <Text style={S.pageNum} fixed>- {pageNum} -</Text>
      )}
    </Page>
  );
}

// ─── Cover page ───────────────────────────────────────────────────────────────
function CoverPage({ section, S }) {
  const subtitleField   = section.fields.find(f => f.label === '부제목' || f.id === 'subtitle');
  const secondaryFields = section.fields.filter(f => f !== subtitleField);

  return (
    <Page size="A4" style={S.page}>
      <View style={S.coverWrap}>
        <View style={S.coverTitleGroup}>
          <Text style={S.coverTitle}>{section.title}</Text>
          {subtitleField && (
            <Text style={S.coverSubtitle}>{subtitleField.value}</Text>
          )}
        </View>
        <View style={S.coverFieldsGroup}>
          {secondaryFields.map((f, i) => (
            <Text key={i} style={S.coverField}>{f.label}: {f.value}</Text>
          ))}
        </View>
      </View>
    </Page>
  );
}

// ─── Build react-pdf Document from PrintModel ─────────────────────────────────
function buildPdfDocument(printModel) {
  const { sections, preset } = printModel;
  const metrics = getLayoutMetrics(preset);
  const S       = makeStyles(preset, metrics);
  const pages   = [];

  for (const section of sections) {
    if (section.type === 'cover') {
      pages.push(<CoverPage key="cover" section={section} S={S} />);
      continue;
    }

    const tokens    = tokenizeSection(section, metrics);
    const paginated = paginate(tokens, metrics);

    paginated.forEach((pageTokens, pageIdx) => {
      pages.push(
        <PdfPage
          key={`${section.type}-${section.episodeId || pageIdx}-${pageIdx}`}
          tokens={pageTokens}
          pageNum={pageIdx + 1}
          showPageNum={true}
          S={S}
        />
      );
    });
  }

  return <Document>{pages}</Document>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * exportPdf(appState, selections, { onStep })
 * Generates a PDF blob and triggers download.
 * onStep(label) is called at each stage for UI progress tracking.
 */
export async function exportPdf(appState, selections, { onStep = () => {} } = {}) {
  ensureFontsRegistered();
  console.log('[printPdf] export start — selections:', selections);
  let printModel, doc, blob;
  try {
    onStep('직렬화');
    const preset = appState.stylePreset;
    printModel   = buildPrintModel(appState, selections, preset);
    console.log('[printPdf] printModel built — sections:', printModel.sections.map(s => s.type));

    onStep('레이아웃');
    doc  = buildPdfDocument(printModel);
    console.log('[printPdf] react-pdf Document built — rendering…');

    onStep('파일 생성');
    blob = await pdf(doc).toBlob();
    console.log('[printPdf] blob size:', blob.size, 'bytes');
  } catch (err) {
    console.error('[printPdf] FAILED at render/blob step:', err);
    console.error('[printPdf] stack:', err?.stack);
    if (err.message?.includes('font') || err.message?.includes('Font') || err.message?.includes('resolve')) {
      throw new Error(`폰트 오류: ${err.message}\n\n'함초롱바탕' 글꼴로 변경 후 다시 시도하세요.`);
    }
    if (err.message?.includes('hasOwnProperty') || err.message?.includes('CreationDate') || err.message?.includes('undefined')) {
      throw new Error(`PDF 렌더링 오류\n\n해결 방법:\n• 개발 서버를 재시작하세요 (Vite 캐시 초기화)\n• 또는 '함초롱바탕' 글꼴로 변경 후 다시 시도하세요.\n\n원본 오류: ${err.message}`);
    }
    throw err;
  }
  try {
    onStep('다운로드');
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = `${printModel.projectTitle}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    console.log('[printPdf] download triggered:', a.download);
  } catch (err) {
    console.error('[printPdf] FAILED at download step:', err);
    throw new Error(`다운로드 실패: ${err.message}`);
  }
}

/**
 * getPdfBlob(appState, selections) → Blob
 * Used internally by preview.
 */
export async function getPdfBlob(appState, selections) {
  ensureFontsRegistered();
  const preset     = appState.stylePreset;
  const printModel = buildPrintModel(appState, selections, preset);
  const doc        = buildPdfDocument(printModel);
  return pdf(doc).toBlob();
}
