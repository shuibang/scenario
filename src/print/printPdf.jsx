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
const MM_TO_PT = 2.8346;

function makeStyles(preset, metrics) {
  const { pdfFamily: ff } = resolveFont(preset, 'pdf');
  const fs   = preset?.fontSize    ?? 11;
  const lh   = preset?.lineHeight  ?? 1.6;
  const { dialogueGapPt, margins, contentWpt } = metrics;

  return StyleSheet.create({
    page: {
      fontFamily:    ff,
      fontSize:      fs,
      lineHeight:    lh,
      color:         '#000',
      // mm 문자열로 지정 → react-pdf가 내부 단위 변환 직접 담당 (수치 오차 방지)
      paddingTop:    `${margins.top}mm`,
      paddingRight:  `${margins.right}mm`,
      paddingBottom: `${margins.bottom}mm`,
      paddingLeft:   `${margins.left}mm`,
    },
    // ── cover
    coverWrap:        { flex: 1, position: 'relative' },
    coverTitleGroup:  { position: 'absolute', top: '28%', left: 0, right: 0, alignItems: 'center' },
    coverFieldsGroup: { position: 'absolute', top: '70%', left: 0, right: 0, alignItems: 'center' },
    coverTitle:       { fontSize: fs + 11, fontWeight: 700, marginBottom: fs * lh, textAlign: 'center' },
    coverSubtitle:    { fontSize: fs + 5,  fontWeight: 400, marginBottom: 4, textAlign: 'center', color: '#555' },
    coverField:       { fontSize: fs,      marginBottom: 3, textAlign: 'center' },
    // ── page number
    pageNum: {
      position: 'absolute',
      bottom:   '15mm',
      left: 0, right: 0,
      textAlign: 'center',
      fontSize: fs - 2,
      color: '#555',
    },
    // ── synopsis / characters
    heading:  { fontWeight: 700, marginBottom: 2 },
    body:     { marginBottom: 1, textAlign: 'justify' },
    charName: { fontWeight: 700, marginTop: 6 },
    // ── episode
    epTitle:     { fontSize: fs + 2, fontWeight: 700, textAlign: 'center' },
    scene:       { fontWeight: 700, marginTop: 10, marginBottom: 2 },
    // action/paren: View wrapper에 width 명시 → 페이지 경계에서 flex 재계산 방지
    actionWrap:  { width: contentWpt, paddingLeft: '8mm', marginBottom: 1 },
    action:      { textAlign: 'justify' },
    dialogueRow: { width: contentWpt, flexDirection: 'row', marginBottom: 1 },
    charCell:    { width: dialogueGapPt, fontWeight: 700, flexShrink: 0 },
    speechCell:  { width: contentWpt - dialogueGapPt, textAlign: 'justify' },
    parenWrap:   { width: contentWpt, paddingLeft: dialogueGapPt, marginBottom: 1 },
    paren:       { fontSize: fs - 1, color: '#444' },
    transition:  { textAlign: 'right', marginVertical: 4 },
    blank:       { marginBottom: fs * lh },
  });
}

// ─── HTML → react-pdf children ────────────────────────────────────────────────
// 규칙: <Text> 자식은 string만 OR <Text>[]만 — 혼합 불가 (react-pdf 제약)
// 서식 태그 없으면 plain string 반환, 있으면 <Text>[] 반환
function htmlToPdfChildren(html) {
  if (!html) return '';
  // <br> → newline, 알 수 없는 태그 제거 (b/i/u 제외)
  const normalized = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(?!\/?[biu][\s>])[^>]+>/gi, '');

  // 서식 태그 없으면 plain string (parent <Text>에 string 자식 → 안전)
  if (!/<[biu][\s>]/i.test(normalized)) {
    return normalized.replace(/<[^>]+>/g, '');
  }

  // 서식 태그 있음 → 모든 segment를 <Text>로 감쌈 (string 혼합 없음)
  const tagRe = /<(\/?)([biu])[^>]*>/gi;
  const segments = [];
  let last = 0;
  const stack = { b: 0, i: 0, u: 0 };
  let match;
  let key = 0;

  const flush = (text) => {
    const clean = text.replace(/<[^>]+>/g, '');
    if (!clean) return;
    // fontWeight/fontStyle 항상 명시 — undefined이면 부모 상속으로 bold+italic 조합 발생
    // italic은 한국어 폰트 파일 미존재 → fontStyle 항상 'normal' (밑줄/볼드만 적용)
    segments.push(
      <Text key={key++} style={{
        fontWeight:     stack.b > 0 ? 700 : 400,
        fontStyle:      'normal',
        textDecoration: stack.u > 0 ? 'underline' : undefined,
      }}>{clean}</Text>
    );
  };

  while ((match = tagRe.exec(normalized)) !== null) {
    flush(normalized.slice(last, match.index));
    last = match.index + match[0].length;
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    stack[tag] = closing ? Math.max(0, stack[tag] - 1) : stack[tag] + 1;
  }
  flush(normalized.slice(last));

  if (segments.length === 0) return '';
  // 단일 segment도 <Text>[] 반환 — parent는 항상 <Text> 자식만 가짐
  return segments;
}

// ─── Token → PDF element ──────────────────────────────────────────────────────
function TokenEl({ token, text, S }) {
  const raw     = text ?? token.text ?? '';
  const content = htmlToPdfChildren(raw);
  // 서식 없는 plain text
  const plain   = typeof content === 'string' ? content : raw.replace(/<[^>]+>/g, '');

  switch (token.kind) {
    case 'blank':
      return <View style={S.blank} />;
    case 'scene_number':
      return <Text style={S.scene}>{plain}</Text>;
    case 'action':
      return (
        <View style={S.actionWrap}>
          <Text style={S.action}>{content}</Text>
        </View>
      );
    case 'dialogue':
      return (
        <View style={S.dialogueRow}>
          <Text style={S.charCell}>{token.charName || ''}</Text>
          <Text style={S.speechCell}>{content}</Text>
        </View>
      );
    case 'parenthetical':
      return (
        <View style={S.parenWrap}>
          <Text style={S.paren}>{plain}</Text>
        </View>
      );
    case 'transition':
      return <Text style={S.transition}>{plain}</Text>;
    case 'heading':
      return <Text style={S.heading}>{plain}</Text>;
    case 'ep_title':
      return <Text style={S.epTitle}>{plain}</Text>;
    case 'char_name':
      return <Text style={S.charName}>{plain}</Text>;
    case 'body':
    default:
      return <Text style={S.body}>{content}</Text>;
  }
}

// ─── Split-block line renderer ────────────────────────────────────────────────
// continuation / split 블록은 이미 pre-wrap된 줄들.
// \n으로 합쳐 단일 <Text>에 넣으면 textkit이 각 줄을 독립 단락으로 처리해
// justify가 오동작하므로, 줄마다 별도 <Text>로 렌더링한다.
function SplitLines({ kind, lines, token, S }) {
  const plain = (t) => t.replace(/<[^>]+>/g, '');
  switch (kind) {
    case 'action':
      return (
        <View style={S.actionWrap}>
          {lines.map((ln, i) => (
            <Text key={i} style={{ ...S.action, textAlign: 'left' }}>{plain(ln)}</Text>
          ))}
        </View>
      );
    case 'dialogue':
      return (
        <>
          {lines.map((ln, i) => (
            <View key={i} style={S.dialogueRow}>
              <Text style={S.charCell}>{i === 0 ? (token.charName || '') : ''}</Text>
              <Text style={{ ...S.speechCell, textAlign: 'left' }}>{plain(ln)}</Text>
            </View>
          ))}
        </>
      );
    case 'parenthetical':
      return (
        <View style={S.parenWrap}>
          {lines.map((ln, i) => (
            <Text key={i} style={{ ...S.paren, textAlign: 'left' }}>{plain(ln)}</Text>
          ))}
        </View>
      );
    case 'body':
    default:
      return (
        <>
          {lines.map((ln, i) => (
            <Text key={i} style={{ ...S.body, textAlign: 'left' }}>{htmlToPdfChildren(ln)}</Text>
          ))}
        </>
      );
  }
}

// ─── A single PDF page ────────────────────────────────────────────────────────
function PdfPage({ tokens, pageNum, showPageNum, S }) {
  // renderList 구성:
  //   isSplit=false → 블록 전체가 이 페이지에 있음 → TokenEl (blockText 원문, react-pdf가 wrap)
  //   isSplit=true  → 블록이 페이지를 걸침 → SplitLines (pre-wrap된 줄 개별 렌더, justify 오동작 방지)
  const renderList = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];

    // 페이지 중간에서 시작하는 continuation (직전 페이지에서 블록이 잘린 경우)
    if (tok.isFirstOfBlock === false) {
      const lines = [tok.text];
      i++;
      while (i < tokens.length && tokens[i].isFirstOfBlock === false && tokens[i].kind === tok.kind) {
        lines.push(tokens[i].text);
        i++;
      }
      renderList.push({ kind: tok.kind, lines, token: tok, isSplit: true });
      continue;
    }

    // 단일 줄 블록
    if (!tok.blockLineCount || tok.blockLineCount <= 1) {
      renderList.push({ kind: tok.kind, text: tok.rawHtml ?? tok.blockText ?? tok.text, token: tok, isSplit: false });
      i++;
      continue;
    }

    // 다중 줄 블록: 현재 페이지에 모두 있는지 확인
    let onPage = 0;
    for (let j = i + 1; j < tokens.length; j++) {
      const t = tokens[j];
      if (t.isFirstOfBlock === false && t.kind === tok.kind) onPage++;
      else break;
    }
    const fullyOnPage = onPage >= tok.blockLineCount - 1;

    if (fullyOnPage) {
      // 블록 전체가 이 페이지 → blockText 원문으로 react-pdf가 직접 wrap (justify 정상)
      renderList.push({ kind: tok.kind, text: tok.rawHtml ?? tok.blockText ?? tok.text, token: tok, isSplit: false });
      i++;
      while (i < tokens.length && tokens[i].isFirstOfBlock === false && tokens[i].kind === tok.kind) i++;
    } else {
      // 블록이 다음 페이지로 이어짐 → 이 페이지 줄들을 pre-wrap 개별 렌더
      const lines = [tok.text];
      i++;
      while (i < tokens.length && tokens[i].isFirstOfBlock === false && tokens[i].kind === tok.kind) {
        lines.push(tokens[i].text);
        i++;
      }
      renderList.push({ kind: tok.kind, lines, token: tok, isSplit: true });
    }
  }

  return (
    <Page size="A4" style={S.page}>
      {renderList.map((item, i) =>
        item.isSplit
          ? <SplitLines key={i} kind={item.kind} lines={item.lines} token={item.token} S={S} />
          : <TokenEl key={i} token={item.token} text={item.text} S={S} />
      )}
      {showPageNum && (
        <Text style={S.pageNum}>- {pageNum} -</Text>
      )}
    </Page>
  );
}

// ─── SceneList landscape table page ──────────────────────────────────────────
function SceneListPage({ section, S }) {
  const fs = 10; // 씬리스트 전용 10pt
  const COL = {
    num:    '6%',
    loc:    '11%',
    subloc: '10%',
    day:    '6%',
    night:  '6%',
    chars:  '12%',
    desc:   '38%',
    note:   '11%',
  };
  const cell    = { fontSize: fs, padding: '3pt 4pt', borderRight: '0.5pt solid #bbb' };
  const hCell   = { ...cell, fontWeight: 700, backgroundColor: '#ececec' };
  const rowBase = { flexDirection: 'row', borderBottom: '0.5pt solid #ddd' };
  const epTitle = `${section.episodeNumber}회 씬리스트${section.episodeTitle ? ` — ${section.episodeTitle}` : ''}`;

  return (
    <Page size="A4" orientation="landscape" style={{ ...S.page, fontSize: fs }}>
      <Text style={{ fontSize: fs + 1, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>{epTitle}</Text>
      <View fixed style={{ flexDirection: 'row', borderTop: '1pt solid #888', borderBottom: '1pt solid #888', backgroundColor: '#ececec' }}>
        <Text style={{ ...hCell, width: COL.num }}>씬번호</Text>
        <Text style={{ ...hCell, width: COL.loc }}>장소</Text>
        <Text style={{ ...hCell, width: COL.subloc }}>세부장소</Text>
        <Text style={{ ...hCell, width: COL.day }}>낮</Text>
        <Text style={{ ...hCell, width: COL.night }}>밤</Text>
        <Text style={{ ...hCell, width: COL.chars }}>등장인물</Text>
        <Text style={{ ...hCell, width: COL.desc }}>내용 요약</Text>
        <Text style={{ ...hCell, width: COL.note, borderRight: 'none' }}>비고</Text>
      </View>
      {section.scenes.map((scene, i) => {
        const bg = i % 2 === 1 ? '#f8f8f8' : '#fff';
        return (
          <View key={scene.id} style={{ ...rowBase, backgroundColor: bg }} wrap={false}>
            <Text style={{ ...cell, width: COL.num, fontWeight: 700 }}>{scene.sceneNum}</Text>
            <Text style={{ ...cell, width: COL.loc }}>{scene.location}</Text>
            <Text style={{ ...cell, width: COL.subloc }}>{scene.subLocation}</Text>
            <Text style={{ ...cell, width: COL.day }}>{scene.dayText}</Text>
            <Text style={{ ...cell, width: COL.night }}>{scene.nightText}</Text>
            <Text style={{ ...cell, width: COL.chars }}>{scene.characters?.join(', ') || ''}</Text>
            <Text style={{ ...cell, width: COL.desc }}>{scene.sceneListContent}</Text>
            <Text style={{ ...cell, width: COL.note, borderRight: 'none' }}>{''}</Text>
          </View>
        );
      })}
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
            <Text key={i} style={S.coverField}>{f.value}</Text>
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
    if (section.type === 'scenelist') {
      pages.push(<SceneListPage key={`scenelist-${section.episodeId}`} section={section} S={S} />);
      continue;
    }

    const tokens    = tokenizeSection(section, metrics);
    if (!tokens.length) continue; // 내용 없는 섹션은 빈 페이지 생성 방지
    const paginated = paginate(tokens, metrics, section.type);

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
    console.error('[printPdf] FAILED:', err?.message);
    console.error('[printPdf] stack:', err?.stack);
    throw new Error(`PDF 생성 실패: ${err.message}`);
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

export async function getPdfBlob(appState, selections) {
  ensureFontsRegistered();
  const preset     = appState.stylePreset;
  const printModel = buildPrintModel(appState, selections, preset);
  const doc        = buildPdfDocument(printModel);
  return pdf(doc).toBlob();
}
