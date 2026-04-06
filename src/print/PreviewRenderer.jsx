/**
 * PreviewRenderer — HTML A4 page previews using the same pipeline as actual exporters.
 *
 * Data flow:
 *   appState + selections → buildPrintModel → tokenizeSection → paginate → render
 *
 * Matches printPdf.jsx rendering rules (same token kinds, same layout metrics).
 * Scales each A4 page to fit the available preview column width.
 */

import React, { useMemo } from 'react';
import { buildPrintModel } from './PrintModel';
import { getLayoutMetrics, tokenizeSection, paginate } from './LineTokenizer';
import { resolveFont } from './FontRegistry';

// ─── A4 physical dimensions at 96 dpi ─────────────────────────────────────────
const A4_W_PX = 794;  // 210 mm
const A4_H_PX = 1123; // 297 mm

// ─── Token → DOM element ──────────────────────────────────────────────────────
function TokenRow({ token, text: textProp, metrics, fontFamily, fontSize, lineHeight }) {
  const content = textProp ?? token.text;
  const { dialogueGapPt } = metrics;
  const lineHpx = fontSize * lineHeight;
  const style = {
    fontFamily: fontFamily,
    fontSize: `${fontSize}pt`,
    lineHeight,
    minHeight: `${lineHpx}pt`,
    display: 'block',
  };

  switch (token.kind) {
    case 'blank':
      return <div style={{ ...style, minHeight: `${lineHpx}pt` }} />;

    case 'ep_title':
      return (
        <div style={{ ...style, fontSize: `${fontSize + 2}pt`, fontWeight: 700, textAlign: 'center' }}>
          {content}
        </div>
      );

    case 'scene_number':
      return <div style={{ ...style, fontWeight: 700, marginTop: '10pt', marginBottom: '2pt' }}>{content}</div>;

    case 'action':
      return <div style={{ ...style, marginLeft: '8mm', marginBottom: '1pt', textAlign: 'justify', whiteSpace: 'pre-wrap' }}>{content}</div>;

    case 'dialogue':
      return (
        <div style={{ ...style, display: 'flex', alignItems: 'flex-start', marginBottom: '1pt' }}>
          <span style={{ width: `${dialogueGapPt}pt`, fontWeight: 700, flexShrink: 0, fontFamily: style.fontFamily, fontSize: style.fontSize }}>
            {token.charName || ''}
          </span>
          <span style={{ flex: 1, fontFamily: style.fontFamily, fontSize: style.fontSize, textAlign: 'justify', whiteSpace: 'pre-wrap' }}>
            {content}
          </span>
        </div>
      );

    case 'parenthetical':
      return (
        <div style={{ ...style, marginLeft: `${dialogueGapPt}pt`, fontStyle: 'italic', fontSize: `${fontSize - 1}pt` }}>
          {content}
        </div>
      );

    case 'scene_ref':
      return <div style={{ ...style, color: '#666', fontStyle: 'italic' }}>{content}</div>;

    case 'transition':
      return <div style={{ ...style, textAlign: 'right', margin: '4pt 0' }}>{content}</div>;

    case 'heading':
      return <div style={{ ...style, fontWeight: 700, marginBottom: '2pt' }}>{content}</div>;

    case 'char_name':
      return <div style={{ ...style, fontWeight: 700, marginTop: '6pt' }}>{content}</div>;

    case 'cover_title':
      return (
        <div style={{ ...style, fontSize: `${fontSize + 11}pt`, fontWeight: 700, textAlign: 'center', marginBottom: '12pt' }}>
          {content}
        </div>
      );

    case 'cover_field':
      return (
        <div style={{ ...style, textAlign: 'center', marginBottom: '3pt' }}>
          {content}
        </div>
      );

    case 'body':
    default:
      return <div style={{ ...style, marginBottom: '1pt', textAlign: 'justify', whiteSpace: 'pre-wrap' }}>{content}</div>;
  }
}

// ─── Single A4 page ───────────────────────────────────────────────────────────
function A4Page({ tokens, pageNum, showPageNum, margins, metrics, fontFamily, fontSize, lineHeight, scale }) {
  const { top, right, bottom, left } = margins;
  const mmToXpx = (mm) => (mm / 210) * A4_W_PX;
  const mmToYpx = (mm) => (mm / 297) * A4_H_PX;
  const mmToPx  = mmToXpx; // 가로 방향 (right/left)

  // Build renderList: same blockText grouping as PdfPage in printPdf.jsx.
  // When all lines of a wrapped block fit on this page, pass the full paragraph
  // text (blockText) so the browser justifies interior lines naturally.
  const renderList = [];
  const absorbedKinds = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.isFirstOfBlock === false) {
      if (absorbedKinds.has(tok.kind)) continue;
      renderList.push({ token: tok, text: tok.text });
      continue;
    }
    absorbedKinds.clear();
    if (tok.isFirstOfBlock === true && tok.blockLineCount > 1) {
      let onPage = 0;
      for (let j = i + 1; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.isFirstOfBlock === false && t.kind === tok.kind) onPage++;
        else break;
      }
      const fullyOnPage = onPage >= tok.blockLineCount - 1;
      if (fullyOnPage) absorbedKinds.add(tok.kind);
      renderList.push({ token: tok, text: fullyOnPage ? (tok.blockText ?? tok.text) : tok.text });
    } else {
      renderList.push({ token: tok, text: tok.text });
    }
  }

  return (
    <div
      style={{
        width:           A4_W_PX,
        height:          A4_H_PX,
        background:      '#fff',
        color:           '#000',
        position:        'relative',
        transformOrigin: 'top left',
        transform:       `scale(${scale})`,
        boxShadow:       '0 2px 12px rgba(0,0,0,0.25)',
        overflow:        'hidden',
        flexShrink:      0,
      }}
    >
      {/* Content area */}
      <div
        style={{
          position: 'absolute',
          top:    mmToYpx(top),
          right:  mmToXpx(right),
          bottom: mmToYpx(bottom),
          left:   mmToXpx(left),
          overflow: 'hidden',
        }}
      >
        {renderList.map((item, i) => (
          <TokenRow
            key={i}
            token={item.token}
            text={item.text}
            metrics={metrics}
            fontFamily={fontFamily}
            fontSize={fontSize}
            lineHeight={lineHeight}
          />
        ))}
      </div>

      {/* Page number */}
      {showPageNum && (
        <div
          style={{
            position:  'absolute',
            bottom:    `${(15 / 297) * A4_H_PX}px`,
            left:      0,
            right:     0,
            textAlign: 'center',
            fontSize:  `${Math.max(fontSize - 2, 7)}pt`,
            color:     '#555',
            fontFamily: fontFamily,
          }}
        >
          - {pageNum} -
        </div>
      )}
    </div>
  );
}

// ─── Cover page ───────────────────────────────────────────────────────────────
function CoverPage({ section, margins, fontFamily, fontSize, lineHeight, scale }) {
  const mmToXpx = (mm) => (mm / 210) * A4_W_PX;
  const mmToYpx = (mm) => (mm / 297) * A4_H_PX;
  const { top, right, bottom, left } = margins;

  return (
    <div
      style={{
        width:           A4_W_PX,
        height:          A4_H_PX,
        background:      '#fff',
        color:           '#000',
        position:        'relative',
        transformOrigin: 'top left',
        transform:       `scale(${scale})`,
        boxShadow:       '0 2px 12px rgba(0,0,0,0.25)',
        overflow:        'hidden',
        flexShrink:      0,
      }}
    >
      {/* Content area wrapper */}
      <div style={{ position: 'absolute', top: mmToYpx(top), right: mmToXpx(right), bottom: mmToYpx(bottom), left: mmToXpx(left) }}>
        {/* Title group at ~1/3 page height (relative to content area) */}
        {(() => {
          const subtitleField = section.fields.find(f => f.label === '부제목' || f.id === 'subtitle');
          const secondaryFields = section.fields.filter(f => f !== subtitleField);
          return (
            <>
              <div style={{ position: 'absolute', top: '28%', left: 0, right: 0, textAlign: 'center' }}>
                <div style={{ fontSize: `${fontSize + 11}pt`, fontWeight: 700, marginBottom: '6pt', fontFamily }}>
                  {section.title}
                </div>
                {subtitleField && (
                  <div style={{ fontSize: `${fontSize + 2}pt`, color: '#555', marginBottom: '4pt', fontFamily }}>
                    {subtitleField.value}
                  </div>
                )}
              </div>
              <div style={{ position: 'absolute', top: '70%', left: 0, right: 0, textAlign: 'center' }}>
                {secondaryFields.map((f, i) => (
                  <div key={i} style={{ fontSize: `${fontSize}pt`, marginBottom: '3pt', fontFamily }}>
                    {f.label}: {f.value}
                  </div>
                ))}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

/**
 * PreviewRenderer
 * Props:
 *   appState   — full app state
 *   selections — { cover, synopsis, episodes: {[id]:bool}, chars }
 *   columnWidth — available width for preview (default 340)
 */
export default function PreviewRenderer({ appState, selections, columnWidth = 340 }) {
  const preset  = appState?.stylePreset || {};
  const metrics = useMemo(() => getLayoutMetrics(preset), [preset]);

  const { cssStack: fontFamily } = resolveFont(preset, 'preview');
  const fontSize   = preset.fontSize    ?? 11;
  const lineHeight = preset.lineHeight  ?? 1.6;
  const margins    = preset.pageMargins ?? { top: 35, right: 30, bottom: 30, left: 30 };
  const scale      = columnWidth / A4_W_PX;

  const printModel = useMemo(
    () => buildPrintModel(appState, selections, preset),
    [appState, selections, preset]
  );

  // Build flat list of { section, tokens[], pageIdx, isCover }
  const pages = useMemo(() => {
    const result = [];
    for (const section of printModel.sections) {
      if (section.type === 'cover') {
        result.push({ section, isCover: true, pageIdx: 0 });
        continue;
      }
      const tokens    = tokenizeSection(section, metrics);
      const paginated = paginate(tokens, metrics);
      paginated.forEach((pageTokens, pageIdx) => {
        result.push({ section, tokens: pageTokens, isCover: false, pageIdx });
      });
    }
    return result;
  }, [printModel, metrics]);

  if (!pages.length) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 13 }}>
        출력 대상을 선택하세요
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', padding: '16px 0' }}>
      {pages.map((p, i) => {
        const sectionLabel = p.isCover ? '표지'
          : p.section.type === 'synopsis' ? '시놉시스'
          : p.section.type === 'episode'  ? `${p.section.episodeNumber}회 대본`
          : p.section.type === 'characters' ? '인물소개'
          : '';

        return (
          <div key={i}>
            {p.pageIdx === 0 && (
              <div style={{ fontSize: 10, color: '#888', marginBottom: 4, textAlign: 'center' }}>
                {sectionLabel}
              </div>
            )}
            <div style={{ width: A4_W_PX * scale, height: A4_H_PX * scale, position: 'relative', overflow: 'hidden' }}>
              {p.isCover ? (
                <CoverPage
                  section={p.section}
                  margins={margins}
                  fontFamily={fontFamily}
                  fontSize={fontSize}
                  lineHeight={lineHeight}
                  scale={scale}
                />
              ) : (
                <A4Page
                  tokens={p.tokens}
                  pageNum={p.pageIdx + 1}
                  showPageNum={true}
                  margins={margins}
                  metrics={metrics}
                  fontFamily={fontFamily}
                  fontSize={fontSize}
                  lineHeight={lineHeight}
                  scale={scale}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
