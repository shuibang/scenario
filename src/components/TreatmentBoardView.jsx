import React, { useEffect, useRef, useState } from 'react';
import { getChipInlineStyle } from '../utils/emotionColor';
import { BUILTIN_GUIDES } from '../data/structureTags';

function structureTagColor(beat) {
  for (const g of BUILTIN_GUIDES) {
    if (g.beats.includes(beat)) return g.color;
  }
  return '#6b7280';
}

// ─── TreatmentBoardCard ──────────────────────────────────────────────────────
// 보기 전용. 클릭 시 부모가 리스트 뷰로 전환 + 해당 항목 포커스.
function TreatmentBoardCard({ item, seqNum, onClick }) {
  const hasTags = (item.emotionTags?.length || item.structureTags?.length);
  const hasText = !!item.text?.trim();
  return (
    <div
      onClick={onClick}
      draggable={false}
      title="클릭하여 리스트 뷰로 이동"
      style={{
        background: 'var(--c-card)',
        border: '1px solid var(--c-border)',
        borderRadius: 10,
        padding: '8px 10px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--c-accent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--c-border)'; }}
    >
      <div style={{ fontSize: 10, color: 'var(--c-accent2)', fontWeight: 600 }}>
        #{seqNum}
      </div>
      <div
        style={{
          fontSize: 11,
          lineHeight: 1.5,
          color: hasText ? 'var(--c-text3)' : 'var(--c-text6)',
          fontStyle: hasText ? 'normal' : 'italic',
          // 시각화 전용 — 본문은 max 3줄 ellipsis로 그리드 정렬. 자세한 내용은 클릭 → 리스트 뷰.
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          flex: 1,
        }}
      >
        {hasText ? item.text : '(빈 항목)'}
      </div>
      {hasTags ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {(item.emotionTags || []).map(tag => (
            <span
              key={`em-${tag.word}`}
              style={{
                ...getChipInlineStyle(tag.color, tag.intensity),
                padding: '1px 6px',
                borderRadius: 999,
                fontSize: 10,
                lineHeight: 1.5,
              }}
            >{tag.word}</span>
          ))}
          {(item.structureTags || []).map(beat => (
            <span
              key={`st-${beat}`}
              style={{
                padding: '1px 6px',
                borderRadius: 4,
                fontSize: 10,
                lineHeight: 1.5,
                color: '#fff',
                background: structureTagColor(beat),
              }}
            >{beat}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── TreatmentBoardView ──────────────────────────────────────────────────────
// Phase A: 표시 + 카드 클릭 → 리스트 뷰 전환 (드래그 X)
// groups: [{ ep, episodeNumber, isMissing, items }]
//   - 단일 회차 모드: groups.length === 1, isMissing === false
//   - 전체뷰 모드: groups.length === 회차 수
export default function TreatmentBoardView({
  groups,
  onCardClick,        // (epId, itemId) => void
  onCreateEpisode,    // (episodeNumber) => void
}) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(300);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width ?? el.clientWidth;
      setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gridCols =
    containerWidth < 250 ? 'repeat(2, 1fr)'
    : containerWidth < 500 ? 'repeat(3, 1fr)'
    : containerWidth < 700 ? 'repeat(auto-fill, minmax(150px, 1fr))'
    : 'repeat(auto-fill, minmax(180px, 1fr))';

  return (
    <div ref={containerRef}>
      {groups.map(({ ep, episodeNumber, isMissing, items }) => {
        const isEmpty = !items.length || (items.length === 1 && !items[0].text?.trim());
        return (
          <div key={ep?.id || `missing-${episodeNumber}`} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text3)', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--c-border2)' }}>
              {episodeNumber}회 {ep?.title || ''}
            </div>
            {isMissing ? (
              <div style={{
                border: '1px dashed var(--c-border3)',
                borderRadius: 8,
                padding: '14px 12px',
                background: 'var(--c-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}>
                <div style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--c-text5)' }}>
                  아직 생성되지 않은 회차입니다.
                </div>
                <button
                  onClick={() => onCreateEpisode(episodeNumber)}
                  className="shrink-0 px-3 py-1.5 rounded text-xs"
                  style={{
                    color: 'var(--c-text3)',
                    border: '1px solid var(--c-border3)',
                    background: 'transparent',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >{episodeNumber}회차 추가</button>
              </div>
            ) : isEmpty ? (
              <div style={{
                border: '1px dashed var(--c-border3)',
                borderRadius: 8,
                padding: '20px 12px',
                background: 'var(--c-card)',
                textAlign: 'center',
                fontSize: 11,
                color: 'var(--c-text5)',
              }}>
                항목이 없습니다. 리스트 뷰에서 추가하세요.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12 }}>
                {items.map((it, idx) => (
                  <TreatmentBoardCard
                    key={it.id}
                    item={it}
                    seqNum={idx + 1}
                    onClick={() => onCardClick(ep.id, it.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
