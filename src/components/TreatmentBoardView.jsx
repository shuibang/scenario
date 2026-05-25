import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getChipInlineStyle } from '../utils/emotionColor';
import { BUILTIN_GUIDES } from '../data/structureTags';

function structureTagColor(beat) {
  for (const g of BUILTIN_GUIDES) {
    if (g.beats.includes(beat)) return g.color;
  }
  return '#6b7280';
}

// ─── TreatmentBoardCard ──────────────────────────────────────────────────────
// 클릭 동작 없음. 데스크톱: HTML5 drag. 모바일: 롱프레스 touch drag.
// "+" 버튼: 데스크톱 hover 시 카드 하단. 모바일은 그룹 하단 버튼 별도 제공.
function TreatmentBoardCard({
  item, seqNum, epId, cardIdx,
  isMobile,
  isDragging, isOver,
  isTouchDragging, isTouchOver,
  dragProps, touchProps,
  onInsert,
}) {
  const [hovered, setHovered] = useState(false);
  const hasTags = (item.emotionTags?.length || item.structureTags?.length);
  const hasText = !!item.text?.trim();
  const isDraggable = !isMobile && !!dragProps;
  const isHighlighted = isOver || isTouchOver;

  const borderStyle = isHighlighted
    ? { border: '2px solid var(--c-accent)', padding: '7px 9px' }
    : { border: `1px solid ${hovered ? 'var(--c-accent)' : 'var(--c-border)'}`, padding: '8px 10px' };

  return (
    <div
      data-board-card=""
      data-ep-id={epId}
      data-card-idx={cardIdx}
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        {...(isDraggable ? dragProps : {})}
        {...(isMobile && touchProps ? touchProps : {})}
        style={{
          background: 'var(--c-card)',
          borderRadius: 10,
          cursor: isDraggable ? (isDragging ? 'grabbing' : 'grab') : 'default',
          opacity: (isDragging || isTouchDragging) ? 0.4 : 1,
          // 롱프레스 drag 중 elementFromPoint 통과용
          pointerEvents: isTouchDragging ? 'none' : 'auto',
          transition: 'border-color 0.15s, opacity 0.15s',
          userSelect: 'none',
          WebkitUserSelect: 'none',
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
            // 시각화 전용 — 본문은 max 3줄 ellipsis
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

      {/* 데스크톱 전용: hover 시 카드 하단 "+" 중간 삽입 버튼 */}
      {!isMobile && onInsert && hovered && !isDragging && (
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
// 데스크톱: HTML5 drag API — TreatmentPage에서 위임
// 모바일:   롱프레스(350ms) touch drag — 자체 관리
//           stale closure 방지: touchDragInfoRef/touchOverInfoRef로 최신값 동기 참조
// groups: [{ ep, episodeNumber, isMissing, items }]
export default function TreatmentBoardView({
  groups,
  onCreateEpisode,
  // 데스크톱 DnD
  dragInfo,
  overInfo,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  // 모바일 touch reorder 저장 콜백
  onReorder,          // (epId, fromIdx, toIdx) => void
  isMobile,
  // 항목 삽입
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

  // ─── 모바일 롱프레스 touch drag ────────────────────────────────────────────
  // touchDragInfo/touchOverInfo: 렌더링 피드백용 state
  // touchDragInfoRef/touchOverInfoRef: handleTouchEnd에서 즉시 읽기 위한 ref
  // (React 배치 커밋 전에 touchend가 발화해도 최신값 보장)
  const [touchDragInfo, setTouchDragInfo] = useState(null);
  const [touchOverInfo, setTouchOverInfo] = useState(null);
  const touchDragInfoRef   = useRef(null);
  const touchOverInfoRef   = useRef(null);
  const longPressTimerRef  = useRef(null);
  const touchStartPosRef   = useRef(null);
  const touchActiveDragRef = useRef(false);

  const setTouchDragInfoBoth = useCallback((val) => {
    touchDragInfoRef.current = val;
    setTouchDragInfo(val);
  }, []);

  const setTouchOverInfoBoth = useCallback((val) => {
    touchOverInfoRef.current = val;
    setTouchOverInfo(val);
  }, []);

  // 드래그 중 스크롤 차단 — passive:false 는 useEffect로만 등록 가능
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onTouchMove = (e) => {
      if (touchActiveDragRef.current) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  useEffect(() => () => clearTimeout(longPressTimerRef.current), []);

  const handleTouchStart = useCallback((e, epId, fromIdx) => {
    touchActiveDragRef.current = false;
    touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      touchActiveDragRef.current = true;
      navigator.vibrate?.(20);
      setTouchDragInfoBoth({ epId, fromIdx });
      setTouchOverInfoBoth(null);
    }, 350);
  }, [setTouchDragInfoBoth, setTouchOverInfoBoth]);

  const handleTouchMove = useCallback((e, epId) => {
    const touch = e.touches[0];
    if (!touchActiveDragRef.current) {
      // 롱프레스 대기 중 — 이동 거리 초과 시 취소
      if (touchStartPosRef.current) {
        const dx = touch.clientX - touchStartPosRef.current.x;
        const dy = touch.clientY - touchStartPosRef.current.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          clearTimeout(longPressTimerRef.current);
        }
      }
      return;
    }
    // 드래그 중 — 손가락 위치의 카드 탐색 (isTouchDragging 카드는 pointerEvents:none)
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const cardEl = el?.closest('[data-board-card]');
    if (!cardEl) return;
    const toEpId = cardEl.getAttribute('data-ep-id');
    const toIdx  = parseInt(cardEl.getAttribute('data-card-idx'), 10);
    if (toEpId === epId && !isNaN(toIdx)) {
      const prev = touchOverInfoRef.current;
      if (prev?.epId !== toEpId || prev?.toIdx !== toIdx) {
        setTouchOverInfoBoth({ epId: toEpId, toIdx });
      }
    }
  }, [setTouchOverInfoBoth]);

  const handleTouchEnd = useCallback((e, epId) => {
    clearTimeout(longPressTimerRef.current);
    // ref로 최신값 직접 읽기 — state 클로저 타이밍 문제 방지
    const tdi = touchDragInfoRef.current;
    const toi = touchOverInfoRef.current;
    if (touchActiveDragRef.current && tdi && toi) {
      const { fromIdx } = tdi;
      const { toIdx }   = toi;
      if (toIdx !== fromIdx) onReorder?.(epId, fromIdx, toIdx);
    }
    touchActiveDragRef.current = false;
    setTouchDragInfoBoth(null);
    setTouchOverInfoBoth(null);
  }, [onReorder, setTouchDragInfoBoth, setTouchOverInfoBoth]);

  const handleTouchCancel = useCallback(() => {
    clearTimeout(longPressTimerRef.current);
    touchActiveDragRef.current = false;
    setTouchDragInfoBoth(null);
    setTouchOverInfoBoth(null);
  }, [setTouchDragInfoBoth, setTouchOverInfoBoth]);

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
                항목이 없습니다.
                {onInsertItem && (
                  <button
                    onClick={() => onInsertItem(ep.id, 0)}
                    style={{
                      marginLeft: 6,
                      background: 'none',
                      border: 'none',
                      color: 'var(--c-accent)',
                      cursor: 'pointer',
                      fontSize: 11,
                      padding: 0,
                    }}
                  >+ 추가</button>
                )}
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12 }}>
                  {items.map((it, idx) => {
                    const isDragging      = hasDnd && dragInfo?.episodeId === ep.id && dragInfo?.fromIdx === idx;
                    const isOver          = hasDnd && overInfo?.episodeId === ep.id && overInfo?.idx === idx;
                    const isTouchDragging = isMobile && touchDragInfo?.epId === ep.id && touchDragInfo?.fromIdx === idx;
                    const isTouchOver     = isMobile && touchOverInfo?.epId === ep.id && touchOverInfo?.toIdx === idx;

                    const dragProps = hasDnd ? {
                      draggable: true,
                      onDragStart: (e) => { e.stopPropagation(); onDragStart(e, ep.id, idx); },
                      onDragOver:  (e) => onDragOver(e, ep.id, idx),
                      onDrop:      (e) => onDrop(e, ep.id, idx),
                      onDragEnd:   onDragEnd,
                    } : null;

                    const touchProps = isMobile ? {
                      onTouchStart:  (e) => handleTouchStart(e, ep.id, idx),
                      onTouchMove:   (e) => handleTouchMove(e, ep.id),
                      onTouchEnd:    (e) => handleTouchEnd(e, ep.id),
                      onTouchCancel: handleTouchCancel,
                    } : null;

                    return (
                      <TreatmentBoardCard
                        key={it.id}
                        item={it}
                        seqNum={idx + 1}
                        epId={ep.id}
                        cardIdx={idx}
                        isMobile={isMobile}
                        isDragging={isDragging}
                        isOver={isOver}
                        isTouchDragging={isTouchDragging}
                        isTouchOver={isTouchOver}
                        dragProps={dragProps}
                        touchProps={touchProps}
                        onInsert={onInsertItem ? () => onInsertItem(ep.id, idx + 1) : null}
                      />
                    );
                  })}
                </div>

                {/* 모바일: 그리드 하단 항목 추가 버튼 (hover 없는 환경 대응) */}
                {isMobile && onInsertItem && (
                  <button
                    onClick={() => onInsertItem(ep.id, items.length)}
                    style={{
                      marginTop: 10,
                      width: '100%',
                      padding: '6px 0',
                      background: 'transparent',
                      border: '1px dashed var(--c-border3)',
                      borderRadius: 8,
                      color: 'var(--c-text5)',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >+ 항목 추가</button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
