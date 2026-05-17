import React, { useState, useEffect, useRef } from 'react';

// ─── DeleteConfirmModal — 삭제 확정 모달 (실수 방지 패턴) ─────────────────────
// "삭제" 텍스트 입력해야 확정 버튼 활성화. 모바일·데스크톱 공용.
//
// props:
//   open        boolean
//   title       string         — 강조 표시될 항목명 (예: 대본 제목)
//   description string|node    — 안내문 (기본: 30일간 휴지통 보관 문구)
//   onConfirm   () => void
//   onCancel    () => void

const inputStyle = {
  background: 'var(--c-input)', color: 'var(--c-text)',
  border: '1px solid var(--c-border3)', borderRadius: 6,
  outline: 'none', padding: '8px 12px',
  fontSize: 14, fontFamily: 'inherit',
  boxSizing: 'border-box', width: '100%',
};

const btnBase = {
  flex: 1, padding: '8px 12px', borderRadius: 6,
  fontSize: 14, fontWeight: 500,
  boxSizing: 'border-box',
};

export default function DeleteConfirmModal({ open, title, description, onConfirm, onCancel }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setText('');
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  const valid = text === '삭제';

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--c-panel)', borderRadius: 12, padding: 20,
          width: '100%', maxWidth: 360,
          display: 'flex', flexDirection: 'column', gap: 12,
          border: '1px solid var(--c-border)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 항목 강조 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 12, color: 'var(--c-text5)' }}>다음 항목을 삭제합니다</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)', wordBreak: 'break-all' }}>
            「{title || '제목 없음'}」
          </div>
        </div>

        {/* 안내문 */}
        <div style={{ fontSize: 13, color: 'var(--c-text4)', lineHeight: 1.55 }}>
          {description || '30일간 휴지통에 보관됩니다.'}
          <br />
          계속하려면 아래에 <strong>삭제</strong>를 입력해주세요.
        </div>

        {/* 입력란 */}
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="삭제"
          style={inputStyle}
          onKeyDown={e => {
            if (e.key === 'Enter' && valid) onConfirm();
            if (e.key === 'Escape') onCancel();
          }}
        />

        {/* 버튼 */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              ...btnBase,
              background: 'transparent',
              color: 'var(--c-text4)',
              border: '1px solid var(--c-border3)',
              cursor: 'pointer',
            }}
          >취소</button>
          <button
            onClick={() => { if (valid) onConfirm(); }}
            disabled={!valid}
            style={{
              ...btnBase,
              background: valid ? '#e53935' : 'var(--c-border3)',
              color:      valid ? '#fff'    : 'var(--c-text6)',
              border: 'none',
              cursor: valid ? 'pointer' : 'not-allowed',
            }}
          >삭제</button>
        </div>
      </div>
    </div>
  );
}
