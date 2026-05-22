import React, { useState, useCallback, useRef } from 'react';
import AnnotationPopover from './AnnotationPopover';
import BlockAnnotations from './BlockAnnotations';
import { createAnnotation } from '../../utils/annotationUtils';
import { now } from '../../store/db';

// ─── AnnotationManager ────────────────────────────────────────────────────────
// 텍스트 선택 감지 → AnnotationPopover → 저장 → onAnnotationsChange 호출
//
// props:
//   blockId            — 소속 블록 id (현재 직접 사용 안 하지만 상위에서 식별용)
//   annotations        — 현재 블록의 annotations 배열
//   onAnnotationsChange(nextAnnotations) — 업데이트된 배열 전달 콜백
//   children           — 감싸는 블록 콘텐츠 (텍스트 선택 대상)
export default function AnnotationManager({ blockId, annotations = [], onAnnotationsChange, children }) {
  const [popoverState, setPopoverState] = useState(null); // null | { selectedText, position }
  const containerRef = useRef(null);

  // 텍스트 선택 이벤트: mouseup 시 selection 확인
  const handleMouseUp = useCallback((e) => {
    // 팝오버 내부 클릭이면 무시
    if (e.target.closest?.('[data-annotation-ui]')) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const selectedText = sel.toString().trim();
    if (!selectedText) return;

    // 선택 영역이 이 컨테이너 안에 있는지 확인
    const container = containerRef.current;
    if (!container) return;
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    // 팝오버 위치: selection 끝 지점 기준
    const rect = range.getBoundingClientRect();
    setPopoverState({
      selectedText,
      position: { x: rect.left, y: rect.bottom + 6 },
    });
  }, []);

  function handlePopoverSave(note) {
    if (!popoverState) return;
    const ann = createAnnotation(
      { selectedText: popoverState.selectedText, note },
      annotations
    );
    onAnnotationsChange([...annotations, ann]);
    setPopoverState(null);
    window.getSelection()?.removeAllRanges();
  }

  function handlePopoverClose() {
    setPopoverState(null);
    window.getSelection()?.removeAllRanges();
  }

  function handleUpdate(annotationId, note) {
    onAnnotationsChange(
      annotations.map(a =>
        a.id === annotationId ? { ...a, note, updatedAt: now() } : a
      )
    );
  }

  function handleDelete(annotationId) {
    onAnnotationsChange(annotations.filter(a => a.id !== annotationId));
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }} onMouseUp={handleMouseUp}>
      {children}

      {annotations.length > 0 && (
        <div data-annotation-ui>
          <BlockAnnotations
            annotations={annotations}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        </div>
      )}

      {popoverState && (
        <div data-annotation-ui>
          <AnnotationPopover
            selectedText={popoverState.selectedText}
            position={popoverState.position}
            onSave={handlePopoverSave}
            onClose={handlePopoverClose}
          />
        </div>
      )}
    </div>
  );
}
