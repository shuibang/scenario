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
// Phase B: DnD 순서 변경 + 카드 하단 "+" 중간 삽입
function TreatmentBoardCard({ item, seqNum, onClick, isDragging, isOver, isMobile, dragProps, onInsert }) {
  const [hovered, setHovered] = useState(false);
  const hasTags = (item.emotionTags?.length || item.structureTags?.length);
  const hasText = !!item.text?.trim();
  const isDraggable = !isMobile && !!dragProps;

  // isOver(drop indicator)가 활성 중일 때 border width가 바뀌므로 padding 보정으로 레이아웃 이동 방지
  const borderStyle = isOver
    ? { border: '2px solid var(--c-accent)', padding: '7px 9px' }
    : { border: `1px solid ${hovered ? 'var(--c-accent)' : 'var(--c-border)'}`, padding: '8px 10px' };

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        {...(isDraggable ? dragProps : {})}
        onClick={() => { if (isDragging) return; onClick(); }}
        title={isDraggable ? '드래그로 순서 변경 / 클릭하여 리스트 뷰로 이동' : '클릭하여 리스트 뷰로 이동'}
        style={{
          background: 'var(--c-card)',
          borderRadius: 10,
          cursor: isDraggable ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
          opacity: isDragging ? 0.4 : 1,
          transition: 'border-color 0.15s, background 0.15s, opacity 0.15s',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          ...borderStyle,
        }}
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

      {/* 카드 사이 중간 삽입 "+" — hover 시 카드 하단 중앙에 절대 위치 */}
      {onInsert && hovered && !isDragging && (
        <button
          onClick={(e) => { e.stopPropagation(); onInsert(); }}
          title="아래에 새 항목 삽입"
          style={{
            position: 'absolute',
            bottom: -10,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'var(--c-accent)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            lineHeight: 1,
          }}
        >+</button>
      )}
    </div>
  );
}

// ─── TreatmentBoardView ──────────────────────────────────────────────────────
// Phase B: DnD 순서 변경 + 중간 삽입
// groups: [{ ep, episodeNumber, isMissing, items }]
//   - 단일 회차 모드: groups.length === 1, isMissing === false
//   - 전체뷰 모드: groups.length === 회차 수
// DnD 핸들러는 TreatmentPage에서 위임 (상태 이중화 없음).
// isMobile === true 이면 draggable 비활성, "+" 버튼만 유효.
export default function TreatmentBoardView({
  groups,
  onCardClick,        // (epId, itemId) => void
  onCreateEpisode,    // (episodeNumber) => void
  // DnD (TreatmentPage에서 위임)
  dragInfo,           // { episodeId, fromIdx } | null
  overInfo,           // { episodeId, idx } | null
  onDragStart,        // (e, episodeId, fromIdx) => void
  onDragOver,         // (e, episodeId, idx) => void
  onDrop,             // (e, episodeId, toIdx) => void
  onDragEnd,          // () => void
  isMobile,
  // 중간 삽입
  onInsertItem,       // (epId, insertIdx) => void
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

  const hasDnd = !!onDragStart && !isMobile;

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
                {items.map((it, idx) => {
                  const isDragging = hasDnd && dragInfo?.episodeId === ep.id && dragInfo?.fromIdx === idx;
                  const isOver     = hasDnd && overInfo?.episodeId === ep.id && overInfo?.idx === idx;
                  const dragProps  = hasDnd ? {
                    draggable: true,
                    onDragStart: (e) => { e.stopPropagation(); onDragStart(e, ep.id, idx); },
                    onDragOver:  (e) => onDragOver(e, ep.id, idx),
                    onDrop:      (e) => onDrop(e, ep.id, idx),
                    onDragEnd:   onDragEnd,
                  } : null;

                  return (
                    <TreatmentBoardCard
                      key={it.id}
                      item={it}
                      seqNum={idx + 1}
                      isDragging={isDragging}
                      isOver={isOver}
                      isMobile={isMobile}
                      dragProps={dragProps}
                      onClick={() => onCardClick(ep.id, it.id)}
                      onInsert={onInsertItem ? () => onInsertItem(ep.id, idx + 1) : null}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
