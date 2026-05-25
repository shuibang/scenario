import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getChipInlineStyle } from '../utils/emotionColor';
import { BUILTIN_GUIDES } from '../data/structureTags';

function structureTagColor(beat) {
  for (const g of BUILTIN_GUIDES) {
    if (g.beats.includes(beat)) return g.color;
  }
  return '#6b7280';
}

function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ─── TreatmentBoardCard ──────────────────────────────────────────────────────
// 데스크톱: 텍스트 클릭 → 인라인 편집 / 카드 테두리+헤더 드래그 → 순서 변경
// 모바일:   빠른 탭(< 300ms) → 인라인 편집 / 롱프레스(350ms) → 순서 변경
function TreatmentBoardCard({
  item, seqNum, epId, cardIdx,
  isMobile,
  isDragging, isOver,
  isTouchDragging, isTouchOver,
  dragProps, touchProps,
  onInsert,
  onSaveText,   // (newText: string) => void
}) {
  const [hovered,   setHovered]   = useState(false);
  const [editing,   setEditing]   = useState(false);
  const [draftText, setDraftText] = useState(item.text || '');
  const textareaRef       = useRef(null);
  const touchStartTimeRef = useRef(null);

  // 외부에서 item.text가 바뀌면(다른 경로의 저장) 편집 중이 아닐 때만 동기화
  useEffect(() => {
    if (!editing) setDraftText(item.text || '');
  }, [item.text, editing]);

  // 편집 진입 시 auto-focus + 커서 맨 뒤 + 높이 맞춤
  useEffect(() => {
    if (!editing || !textareaRef.current) return;
    const el = textareaRef.current;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
    autoResizeTextarea(el);
  }, [editing]);

  const hasTags     = (item.emotionTags?.length || item.structureTags?.length);
  const hasText     = !!item.text?.trim();
  // 편집 중에는 drag 비활성 (의도치 않은 순서 변경 방지)
  const isDraggable = !isMobile && !!dragProps && !editing;
  const isHighlighted = isOver || isTouchOver;

  const borderStyle = isHighlighted
    ? { border: '2px solid var(--c-accent)', padding: '7px 9px' }
    : editing
      ? { border: '1px solid var(--c-accent)', padding: '8px 10px' }
      : { border: `1px solid ${hovered ? 'var(--c-accent)' : 'var(--c-border)'}`, padding: '8px 10px' };

  const commitEdit = () => {
    onSaveText?.(draftText);
    setEditing(false);
  };
  const cancelEdit = () => {
    setDraftText(item.text || '');
    setEditing(false);
  };

  // 모바일 탭 감지 — touchstart 시각 기록, touchend에서 elapsed 판단
  const handleCardTouchStart = (e) => {
    touchStartTimeRef.current = Date.now();
    if (!editing) touchProps?.onTouchStart?.(e);
  };
  const handleCardTouchMove = (e) => {
    if (!editing) touchProps?.onTouchMove?.(e);
  };
  const handleCardTouchEnd = (e) => {
    const elapsed = Date.now() - (touchStartTimeRef.current || 0);
    if (!editing) touchProps?.onTouchEnd?.(e);
    // 빠른 탭(< 300ms, 롱프레스 발화 전) → 편집 진입
    if (elapsed < 300 && !editing) {
      setDraftText(item.text || '');
      setEditing(true);
    }
  };
  const handleCardTouchCancel = (e) => {
    if (!editing) touchProps?.onTouchCancel?.(e);
  };

  const mobileHandlers = isMobile ? {
    onTouchStart:  handleCardTouchStart,
    onTouchMove:   handleCardTouchMove,
    onTouchEnd:    handleCardTouchEnd,
    onTouchCancel: handleCardTouchCancel,
  } : {};

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
        {...mobileHandlers}
        style={{
          background: 'var(--c-card)',
          borderRadius: 10,
          cursor: isDraggable ? (isDragging ? 'grabbing' : 'grab') : 'default',
          opacity: (isDragging || isTouchDragging) ? 0.4 : 1,
          pointerEvents: isTouchDragging ? 'none' : 'auto',
          transition: 'border-color 0.15s, opacity 0.15s',
          userSelect: editing ? 'text' : 'none',
          WebkitUserSelect: editing ? 'text' : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          ...borderStyle,
        }}
      >
        {/* 시퀀스 번호 */}
        <div style={{ fontSize: 10, color: 'var(--c-accent2)', fontWeight: 600, flexShrink: 0 }}>
          #{seqNum}
        </div>

        {/* 본문: 편집 중이면 textarea, 아니면 텍스트 표시 */}
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draftText}
            onChange={(e) => {
              setDraftText(e.target.value);
              autoResizeTextarea(e.target);
            }}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
              if (e.key === 'Tab')    { e.preventDefault(); commitEdit(); }
            }}
            placeholder="내용 입력"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 11,
              lineHeight: 1.5,
              color: 'var(--c-text)',
              fontFamily: 'inherit',
              padding: 0,
              margin: 0,
              minHeight: '4em',
              overflow: 'hidden',
            }}
          />
        ) : (
          <div
            onClick={() => { if (!isMobile && !isDragging) { setDraftText(item.text || ''); setEditing(true); } }}
            title={!isMobile ? '클릭하여 편집' : undefined}
            style={{
              fontSize: 11,
              lineHeight: 1.5,
              color: hasText ? 'var(--c-text3)' : 'var(--c-text6)',
              fontStyle: hasText ? 'normal' : 'italic',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              flex: 1,
              cursor: !isMobile ? 'text' : 'default',
              minHeight: '4em',
            }}
          >
            {hasText ? item.text : '(탭하여 편집)'}
          </div>
        )}

        {/* 태그 */}
        {hasTags && !editing ? (
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
      {!isMobile && onInsert && hovered && !isDragging && !editing && (
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
  // 모바일 touch reorder
  onReorder,          // (epId, fromIdx, toIdx) => void
  isMobile,
  // 항목 삽입
  onInsertItem,       // (epId, insertIdx) => void
  // 텍스트 저장
  onSaveItemText,     // (epId, itemId, text) => void
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
      if (touchStartPosRef.current) {
        const dx = touch.clientX - touchStartPosRef.current.x;
        const dy = touch.clientY - touchStartPosRef.current.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          clearTimeout(longPressTimerRef.current);
        }
      }
      return;
    }
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
                border: '1px dashed var(--c-border3)', borderRadius: 8,
                padding: '14px 12px', background: 'var(--c-card)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--c-text5)' }}>
                  아직 생성되지 않은 회차입니다.
                </div>
                <button
                  onClick={() => onCreateEpisode(episodeNumber)}
                  className="shrink-0 px-3 py-1.5 rounded text-xs"
                  style={{ color: 'var(--c-text3)', border: '1px solid var(--c-border3)', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >{episodeNumber}회차 추가</button>
              </div>
            ) : isEmpty ? (
              <div style={{
                border: '1px dashed var(--c-border3)', borderRadius: 8,
                padding: '20px 12px', background: 'var(--c-card)',
                textAlign: 'center', fontSize: 11, color: 'var(--c-text5)',
              }}>
                항목이 없습니다.
                {onInsertItem && (
                  <button
                    onClick={() => onInsertItem(ep.id, 0)}
                    style={{ marginLeft: 6, background: 'none', border: 'none', color: 'var(--c-accent)', cursor: 'pointer', fontSize: 11, padding: 0 }}
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
                        onSaveText={onSaveItemText ? (text) => onSaveItemText(ep.id, it.id, text) : null}
                      />
                    );
                  })}
                </div>

                {/* 모바일: 그리드 하단 항목 추가 버튼 */}
                {isMobile && onInsertItem && (
                  <button
                    onClick={() => onInsertItem(ep.id, items.length)}
                    style={{
                      marginTop: 10, width: '100%', padding: '6px 0',
                      background: 'transparent', border: '1px dashed var(--c-border3)',
                      borderRadius: 8, color: 'var(--c-text5)', fontSize: 12, cursor: 'pointer',
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
