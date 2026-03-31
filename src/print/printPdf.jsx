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
// Register all bundled fonts with their available style variants.
// Guard: if a font is pdfVfOnly (same VF file for all weights), register only
// weight 400 to avoid pdfkit/fontkit confusion from duplicate file entries.
// Normal fonts with separate regular/bold TTFs register both weights fully.
FONTS.filter(f => f.sourceType === 'bundled').forEach(f => {
  const variants = [];
  const { normal, bold, italic, boldItalic } = f.pdfFiles;
  const isVfFont = f.pdfVfOnly === true;

  if (normal) variants.push({ src: normal, fontWeight: 400, fontStyle: 'normal' });
  // Register bold only when it's a distinct file (not a VF duplicate)
  if (bold && !isVfFont && bold !== normal) {
    variants.push({ src: bold, fontWeight: 700, fontStyle: 'normal' });
  }
  if (italic)     variants.push({ src: italic,     fontWeight: 400, fontStyle: 'italic' });
  if (boldItalic) variants.push({ src: boldItalic, fontWeight: 700, fontStyle: 'italic' });

  if (variants.length > 0) {
    Font.register({ family: f.cssFamily, fonts: variants });
  }
});
// Hyphenation off for Korean
Font.registerHyphenationCallback(w => [w]);

// ─── Shared style factory (depends on preset) ─────────────────────────────────
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
    // ── cover (title at ~1/3 page, fields at ~3/4 page)
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
    heading:   { fontWeight: 700, marginTop: 8, marginBottom: 2 },
    body:      { marginBottom: 1 },
    charName:  { fontWeight: 700, marginTop: 6 },
    charMeta:  { marginLeft: 8, fontSize: fs - 1, color: '#444' },
    // ── episode
    epTitle:   { fontSize: fs + 2, fontWeight: 700, textAlign: 'center', marginBottom: 14 },
    // ── scene
    scene:     { fontWeight: 700, marginTop: 10, marginBottom: 2 },
    // ── action
    action:    { marginLeft: 8,  marginBottom: 1 },
    // ── dialogue row
    dialogueRow: { flexDirection: 'row', marginBottom: 1 },
    charCell:    { width: dialogueGapPt, fontWeight: 700, flexShrink: 0 },
    speechCell:  { flex: 1 },
    // ── parenthetical
    paren:  { marginLeft: dialogueGapPt, fontStyle: 'italic', fontSize: fs - 1 },
    // ── transition
    transition: { textAlign: 'right', marginVertical: 4 },
    // ── blank
    blank: { marginBottom: fs * lh },
  });
}

// ─── Token → PDF element ──────────────────────────────────────────────────────
function TokenEl({ token, S }) {
  switch (token.kind) {
    case 'blank':
      return <View style={S.blank} />;

    case 'scene_number':
      return <Text style={S.scene}>{token.text}</Text>;

    case 'action':
      return <Text style={S.action}>{token.text}</Text>;

    case 'dialogue':
      return (
        <View style={S.dialogueRow}>
          <Text style={S.charCell}>{token.charName || ''}</Text>
          <Text style={S.speechCell}>{token.text}</Text>
        </View>
      );

    case 'parenthetical':
      return <Text style={S.paren}>{token.text}</Text>;

    case 'transition':
      return <Text style={S.transition}>{token.text}</Text>;

    case 'heading':
      return <Text style={S.heading}>{token.text}</Text>;

    case 'ep_title':
      return <Text style={S.epTitle}>{token.text}</Text>;

    case 'char_name':
      return <Text style={S.charName}>{token.text}</Text>;

    case 'body':
    default:
      return <Text style={S.body}>{token.text}</Text>;
  }
}

// ─── A single PDF page ────────────────────────────────────────────────────────
function PdfPage({ tokens, pageNum, showPageNum, S }) {
  return (
    <Page size="A4" style={S.page}>
      {tokens.map((tok, i) => (
        <TokenEl key={i} token={tok} S={S} />
      ))}
      {showPageNum && (
        <Text style={S.pageNum} fixed>- {pageNum} -</Text>
      )}
    </Page>
  );
}

// ─── Cover page ───────────────────────────────────────────────────────────────
function CoverPage({ section, S }) {
  // Separate subtitle field from secondary fields
  const subtitleField = section.fields.find(f => f.label === '부제목' || f.id === 'subtitle');
  const secondaryFields = section.fields.filter(f => f !== subtitleField);

  return (
    <Page size="A4" style={S.page}>
      <View style={S.coverWrap}>
        {/* Title group at ~1/3 page height */}
        <View style={S.coverTitleGroup}>
          <Text style={S.coverTitle}>{section.title}</Text>
          {subtitleField && (
            <Text style={S.coverSubtitle}>{subtitleField.value}</Text>
          )}
        </View>
        {/* Secondary fields at ~3/4 page height */}
        <View style={S.coverFieldsGroup}>
          {secondaryFields.map((f, i) => (
            <Text key={i} style={S.coverField}>{f.label}: {f.value}</Text>
          ))}
        </View>
      </View>
      {/* No page number on cover */}
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

    // Tokenize + paginate
    const tokens    = tokenizeSection(section, metrics);
    const paginated = paginate(tokens, metrics);

    // Section page numbering (cover excluded, each section resets)
    paginated.forEach((pageTokens, pageIdx) => {
      const showNum = section.type !== 'cover';
      pages.push(
        <PdfPage
          key={`${section.type}-${section.episodeId || pageIdx}-${pageIdx}`}
          tokens={pageTokens}
          pageNum={pageIdx + 1}
          showPageNum={showNum}
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
    // Surface a user-friendly message for common font errors
    if (err.message?.includes('font') || err.message?.includes('Font')) {
      throw new Error(`폰트 오류: ${err.message}\n\n'함초롱바탕' 글꼴로 변경 후 다시 시도하세요.`);
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
  const preset     = appState.stylePreset;
  const printModel = buildPrintModel(appState, selections, preset);
  const doc        = buildPdfDocument(printModel);
  return pdf(doc).toBlob();
}
