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
function TokenRow({ token, metrics, fontFamily, fontSize, lineHeight }) {
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
        <div style={{ ...style, fontSize: `${fontSize + 2}pt`, fontWeight: 700, textAlign: 'center', marginBottom: '14pt' }}>
          {token.text}
        </div>
      );

    case 'scene_number':
      return <div style={{ ...style, fontWeight: 700, marginTop: '10pt', marginBottom: '2pt' }}>{token.text}</div>;

    case 'action':
      return <div style={{ ...style, marginLeft: '8mm', marginBottom: '1pt' }}>{token.text}</div>;

    case 'dialogue':
      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', ...style, margin: '1pt 0' }}>
          <span style={{ width: `${dialogueGapPt}pt`, fontWeight: 700, flexShrink: 0, fontFamily: style.fontFamily, fontSize: style.fontSize }}>
            {token.charName || ''}
          </span>
          <span style={{ flex: 1, fontFamily: style.fontFamily, fontSize: style.fontSize }}>
            {token.text}
          </span>
        </div>
      );

    case 'parenthetical':
      return (
        <div style={{ ...style, marginLeft: `${dialogueGapPt}pt`, fontStyle: 'italic', fontSize: `${fontSize - 1}pt` }}>
          {token.text}
        </div>
      );

    case 'transition':
      return <div style={{ ...style, textAlign: 'right', margin: '4pt 0' }}>{token.text}</div>;

    case 'heading':
      return <div style={{ ...style, fontWeight: 700, marginTop: '8pt', marginBottom: '2pt' }}>{token.text}</div>;

    case 'char_name':
      return <div style={{ ...style, fontWeight: 700, marginTop: '6pt' }}>{token.text}</div>;

    case 'cover_title':
      return (
        <div style={{ ...style, fontSize: `${fontSize + 11}pt`, fontWeight: 700, textAlign: 'center', marginBottom: '12pt' }}>
          {token.text}
        </div>
      );

    case 'cover_field':
      return (
        <div style={{ ...style, textAlign: 'center', marginBottom: '3pt' }}>
          {token.text}
        </div>
      );

    case 'body':
    default:
      return <div style={{ ...style, marginBottom: '1pt' }}>{token.text}</div>;
  }
}

// ─── Single A4 page ───────────────────────────────────────────────────────────
function A4Page({ tokens, pageNum, showPageNum, margins, metrics, fontFamily, fontSize, lineHeight, scale }) {
  const { top, right, bottom, left } = margins;
  const mmToPx = (mm) => (mm / 210) * A4_W_PX;

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
          top:    mmToPx(top),
          right:  mmToPx(right),
          bottom: mmToPx(bottom),
          left:   mmToPx(left),
          overflow: 'hidden',
        }}
      >
        {tokens.map((tok, i) => (
          <TokenRow
            key={i}
            token={tok}
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
  const mmToPx = (mm) => (mm / 210) * A4_W_PX;
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
      <div style={{ position: 'absolute', top: mmToPx(top), right: mmToPx(right), bottom: mmToPx(bottom), left: mmToPx(left) }}>
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
            <div style={{ width: A4_W_PX * scale, height: A4_H_PX * scale, position: 'relative' }}>
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
