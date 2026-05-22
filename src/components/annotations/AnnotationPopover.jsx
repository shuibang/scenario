import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// position: { x, y } — 팝오버 좌상단 기준 좌표 (호출측에서 selection 기반 계산)
export default function AnnotationPopover({ selectedText, position, onSave, onClose }) {
  const [note, setNote] = useState('');
  const textareaRef     = useRef(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleSave() {
    const trimmed = note.trim();
    if (!trimmed) return;
    onSave(trimmed, 'below');
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { handleSave(); return; }
    e.stopPropagation();
  }

  const popover = (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 299 }}
        onMouseDown={e => { e.preventDefault(); onClose(); }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="주석 추가"
        style={{
          position:    'fixed',
          top:         position.y,
          left:        position.x,
          zIndex:      300,
          background:  'var(--c-panel)',
          border:      '1px solid var(--c-border)',
          borderRadius: 8,
          boxShadow:   '0 4px 20px rgba(0,0,0,0.25)',
          padding:     '12px 14px',
          minWidth:    240,
          maxWidth:    320,
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {selectedText && (
          <div style={{
            fontSize:      12,
            color:         'var(--c-text3)',
            marginBottom:  8,
            padding:       '4px 6px',
            background:    'var(--c-bg)',
            borderRadius:  4,
            borderLeft:    '2px solid var(--c-accent)',
            wordBreak:     'break-all',
            maxHeight:     48,
            overflow:      'hidden',
            lineHeight:    1.4,
          }}>
            {selectedText.length > 60 ? selectedText.slice(0, 60) + '…' : selectedText}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="주석 내용 입력 (Ctrl+Enter 저장)"
          rows={3}
          style={{
            width:        '100%',
            boxSizing:    'border-box',
            resize:       'vertical',
            fontSize:     13,
            padding:      '6px 8px',
            background:   'var(--c-bg)',
            color:        'var(--c-text)',
            border:       '1px solid var(--c-border)',
            borderRadius: 4,
            outline:      'none',
            fontFamily:   'inherit',
            lineHeight:   1.5,
          }}
        />

        <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              fontSize: 12, padding: '3px 10px',
              background: 'transparent', color: 'var(--c-text3)',
              border: '1px solid var(--c-border)', borderRadius: 4, cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!note.trim()}
            style={{
              fontSize: 12, padding: '3px 10px',
              background: note.trim() ? 'var(--c-accent)' : 'var(--c-border)',
              color: note.trim() ? '#fff' : 'var(--c-text4)',
              border: 'none', borderRadius: 4, cursor: note.trim() ? 'pointer' : 'default',
            }}
          >
            저장
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(popover, document.body);
}
