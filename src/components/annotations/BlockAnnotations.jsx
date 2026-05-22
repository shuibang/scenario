import React, { useState } from 'react';
import { sortAnnotationsByOrder } from '../../utils/annotationUtils';
import { now } from '../../store/db';

// ─── 단일 주석 행 (뷰 + 인라인 편집) ────────────────────────────────────────
function AnnotationItem({ annotation, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(annotation.note);

  function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onUpdate(annotation.id, trimmed);
    setEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { setDraft(annotation.note); setEditing(false); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { handleSave(); return; }
    e.stopPropagation();
  }

  return (
    <div style={{
      display:       'flex',
      alignItems:    'flex-start',
      gap:           6,
      padding:       '4px 0',
      borderBottom:  '1px solid var(--c-border)',
    }}>
      <span style={{
        flexShrink:  0,
        fontSize:    11,
        color:       'var(--c-accent)',
        fontWeight:  700,
        minWidth:    18,
        lineHeight:  '20px',
      }}>
        {annotation.markerId}
      </span>

      {editing ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            style={{
              width:        '100%',
              boxSizing:    'border-box',
              resize:       'vertical',
              fontSize:     12,
              padding:      '4px 6px',
              background:   'var(--c-bg)',
              color:        'var(--c-text)',
              border:       '1px solid var(--c-border)',
              borderRadius: 3,
              fontFamily:   'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setDraft(annotation.note); setEditing(false); }}
              style={btnStyle('ghost')}
            >취소</button>
            <button onClick={handleSave} disabled={!draft.trim()} style={btnStyle('primary', !draft.trim())}>저장</button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1 }}>
          <span
            style={{ fontSize: 12, color: 'var(--c-text2)', lineHeight: 1.5, whiteSpace: 'pre-wrap', cursor: 'pointer' }}
            onClick={() => setEditing(true)}
            title="클릭해서 편집"
          >
            {annotation.note}
          </span>
          {annotation.selectedText && (
            <div style={{ fontSize: 11, color: 'var(--c-text4)', marginTop: 2, fontStyle: 'italic' }}>
              &ldquo;{annotation.selectedText.length > 30
                ? annotation.selectedText.slice(0, 30) + '…'
                : annotation.selectedText}&rdquo;
            </div>
          )}
        </div>
      )}

      {!editing && (
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button
            onClick={() => setEditing(true)}
            style={iconBtnStyle()}
            title="편집"
          >
            ✎
          </button>
          <button
            onClick={() => onDelete(annotation.id)}
            style={iconBtnStyle()}
            title="삭제"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function btnStyle(variant, disabled = false) {
  const base = { fontSize: 11, padding: '2px 8px', borderRadius: 3, cursor: disabled ? 'default' : 'pointer', border: 'none' };
  if (variant === 'primary') return { ...base, background: disabled ? 'var(--c-border)' : 'var(--c-accent)', color: disabled ? 'var(--c-text4)' : '#fff' };
  return { ...base, background: 'transparent', color: 'var(--c-text3)', border: '1px solid var(--c-border)' };
}

function iconBtnStyle() {
  return {
    fontSize: 13, lineHeight: 1, padding: '1px 4px',
    background: 'transparent', color: 'var(--c-text4)',
    border: 'none', cursor: 'pointer', borderRadius: 3,
  };
}

// ─── BlockAnnotations ─────────────────────────────────────────────────────────
// 모든 주석(position 무관)을 블록 바로 아래에 표시.
// 기존 'side' 데이터도 below와 동일하게 렌더링.
export default function BlockAnnotations({ annotations = [], onUpdate, onDelete }) {
  const items = sortAnnotationsByOrder(annotations);

  if (!items.length) return null;

  return (
    <div style={{
      marginTop:    6,
      padding:      '6px 10px',
      background:   'var(--c-panel)',
      border:       '1px solid var(--c-border2)',
      borderRadius: 4,
      borderLeft:   '3px solid var(--c-accent)',
    }}>
      {items.map(ann => (
        <AnnotationItem key={ann.id} annotation={ann} onUpdate={onUpdate} onDelete={onDelete} />
      ))}
    </div>
  );
}
