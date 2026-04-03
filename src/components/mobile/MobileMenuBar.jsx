import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../store/AppContext';
import { FONTS } from '../../print/FontRegistry';
import AdBanner from '../AdBanner';
import { mobileTbtnStyle } from '../../styles/tokens';
import { applyInlineFormat } from '../../utils/textFormat';

// WorkTimer is still in App.jsx — passed in as a prop to avoid circular deps
// until WorkTimer is extracted to its own file.
export default function MobileMenuBar({ onSave, onPrintPreview, WorkTimer }) {
  const { state, dispatch } = useApp();
  const { activeProjectId, stylePreset } = state;
  const [menuOpen, setMenuOpen] = useState(false);
  const [myOpen, setMyOpen]     = useState(false);
  const menuRef = useRef(null);

  // Close dropdown when tapping outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [menuOpen]);

  const dropItemStyle = {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', background: 'none', border: 'none',
    color: 'var(--c-text)', fontSize: 'clamp(11px, 3.2vw, 14px)',
    padding: '12px 18px', textAlign: 'left', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  };

  return (
    <div className="shrink-0 no-print" style={{ background: 'var(--c-header)', borderBottom: '1px solid var(--c-border)' }}>
      {/* Row 1: ☰ | 대본 작업실 | time+기록 */}
      <div style={{
        height: 'clamp(36px, 9vw, 44px)',
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        paddingLeft: 'max(14px, env(safe-area-inset-left, 14px))',
        paddingRight: 'max(14px, env(safe-area-inset-right, 14px))',
      }}>
        {/* Left: hamburger + dropdown */}
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{
              background: 'none', border: 'none',
              color: 'var(--c-text4)', fontSize: 'clamp(15px, 5vw, 20px)',
              cursor: 'pointer', padding: '6px 8px', lineHeight: 1,
              WebkitTapHighlightColor: 'transparent',
            }}
          >☰</button>
          {menuOpen && (
            <div style={{
              position: 'fixed', top: 'calc(var(--mobile-header-h, 44px) + 4px)', left: 14,
              background: 'var(--c-panel)', border: '1px solid var(--c-border)',
              borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              zIndex: 300, minWidth: 200,
              maxHeight: 'calc(100dvh - var(--mobile-header-h, 44px) - 24px)',
              overflowY: 'auto', padding: '6px 0',
            }}>
              <button style={dropItemStyle} onClick={() => setMenuOpen(false)}>로그인 준비 중</button>
              <div style={{ height: 1, background: 'var(--c-border)', margin: '4px 0' }} />
              <button
                style={dropItemStyle}
                onClick={(e) => { e.stopPropagation(); setMyOpen(v => !v); }}
              >
                <span>👤</span><span>마이페이지</span>
                <span style={{ marginLeft: 'auto' }}>{myOpen ? '˅' : '›'}</span>
              </button>
              {myOpen && (
                <div style={{ background: 'var(--c-active)' }}>
                  {[
                    { label: '작업통계', tab: 'stats' },
                    { label: '설정',     tab: 'settings' },
                    { label: 'Q&A',      tab: 'qa' },
                    { label: '멤버십',   tab: 'membership' },
                    { label: '오류 보고',tab: 'errors' },
                  ].map(({ label, tab }) => (
                    <button
                      key={tab}
                      style={{ ...dropItemStyle, paddingLeft: 36, fontSize: 'clamp(10px, 2.8vw, 12px)', color: 'var(--c-text5)' }}
                      onClick={() => {
                        dispatch({ type: 'SET_ACTIVE_DOC', payload: 'mypage' });
                        setTimeout(() => window.dispatchEvent(new CustomEvent('mypage:tab', { detail: tab })), 0);
                        setMenuOpen(false);
                      }}
                    >{label}</button>
                  ))}
                </div>
              )}
              {/* 하단 배너 광고 */}
              <div style={{ height: 1, background: 'var(--c-border)', margin: '4px 0' }} />
              <AdBanner slot="mobile-bottom" mobileHide={false} height={70} style={{ width: '100%', borderRadius: '0 0 10px 10px', overflow: 'hidden' }} />
            </div>
          )}
        </div>

        {/* Center: brand */}
        <span style={{ fontSize: 'clamp(13px, 4vw, 17px)', fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.05em' }}>
          대본 작업실
        </span>

        {/* Right: work timer (기록 button built in) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          {activeProjectId && WorkTimer && (
            <WorkTimer
              key={activeProjectId}
              projectId={activeProjectId}
              documentId={state.activeEpisodeId || state.activeDoc}
            />
          )}
        </div>
      </div>

      {/* Row 2: mobile toolbar */}
      <div style={{
        height: 'clamp(32px, 9vw, 42px)',
        display: 'flex', alignItems: 'center',
        paddingLeft: 'max(12px, env(safe-area-inset-left, 12px))',
        paddingRight: 'max(12px, env(safe-area-inset-right, 12px))',
        gap: 6,
        borderTop: '1px solid var(--c-border2)',
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        <button onClick={onSave} style={mobileTbtnStyle}>저장</button>
        <button
          onClick={onPrintPreview}
          style={{ ...mobileTbtnStyle, color: 'var(--c-accent)', borderColor: 'var(--c-accent)' }}
        >출력 미리보기</button>
        <div style={{ width: 1, height: 16, background: 'var(--c-border3)', margin: '0 2px', flexShrink: 0 }} />
        {[
          { label: 'B', title: '굵게', tag: 'bold', fw: 'bold' },
          { label: 'I', title: '기울임', tag: 'italic', fs: 'italic' },
          { label: 'U', title: '밑줄', tag: 'underline', td: 'underline' },
        ].map(({ label, title, tag, fw, fs, td }) => (
          <button
            key={tag}
            title={title}
            onMouseDown={e => { e.preventDefault(); applyInlineFormat(tag); }}
            style={{ ...mobileTbtnStyle, fontWeight: fw, fontStyle: fs, textDecoration: td }}
          >{label}</button>
        ))}
        <div style={{ width: 1, height: 16, background: 'var(--c-border3)', margin: '0 2px', flexShrink: 0 }} />
        {/* 글씨체 */}
        <span style={{ fontSize: 'clamp(9px, 2.4vw, 11px)', color: 'var(--c-text6)', flexShrink: 0 }}>글꼴</span>
        <select
          value={stylePreset?.fontFamily ?? '함초롱바탕'}
          onChange={e => dispatch({ type: 'SET_STYLE_PRESET', payload: { fontFamily: e.target.value } })}
          style={{ ...mobileTbtnStyle, padding: '2px 4px', maxWidth: 90 }}
        >
          {FONTS.filter(f => f.sourceType === 'bundled').map(f => (
            <option key={f.id} value={f.cssFamily}>{f.displayName}</option>
          ))}
          {FONTS.filter(f => f.sourceType === 'system').map(f => (
            <option key={f.id} value={f.cssFamily}>{f.displayName}</option>
          ))}
        </select>
        {/* 글씨크기 */}
        <span style={{ fontSize: 'clamp(9px, 2.4vw, 11px)', color: 'var(--c-text6)', flexShrink: 0 }}>크기</span>
        <button style={mobileTbtnStyle} onMouseDown={e => { e.preventDefault(); dispatch({ type: 'SET_STYLE_PRESET', payload: { fontSize: Math.max(9, (stylePreset?.fontSize ?? 11) - 1) } }); }}>−</button>
        <span style={{ fontSize: 'clamp(9px, 2.4vw, 11px)', color: 'var(--c-text4)', flexShrink: 0, minWidth: 24, textAlign: 'center' }}>{stylePreset?.fontSize ?? 11}pt</span>
        <button style={mobileTbtnStyle} onMouseDown={e => { e.preventDefault(); dispatch({ type: 'SET_STYLE_PRESET', payload: { fontSize: Math.min(18, (stylePreset?.fontSize ?? 11) + 1) } }); }}>+</button>
        {/* 인물/대사 간격 */}
        <span style={{ fontSize: 'clamp(9px, 2.4vw, 11px)', color: 'var(--c-text6)', flexShrink: 0 }}>간격</span>
        <button style={mobileTbtnStyle} onMouseDown={e => { e.preventDefault(); const v = Math.max(4, parseFloat(stylePreset?.dialogueGap ?? '7') - 0.5); dispatch({ type: 'SET_STYLE_PRESET', payload: { dialogueGap: `${v}em` } }); }}>−</button>
        <span style={{ fontSize: 'clamp(9px, 2.4vw, 11px)', color: 'var(--c-text4)', flexShrink: 0, minWidth: 28, textAlign: 'center' }}>{stylePreset?.dialogueGap ?? '7em'}</span>
        <button style={mobileTbtnStyle} onMouseDown={e => { e.preventDefault(); const v = Math.min(14, parseFloat(stylePreset?.dialogueGap ?? '7') + 0.5); dispatch({ type: 'SET_STYLE_PRESET', payload: { dialogueGap: `${v}em` } }); }}>+</button>
      </div>
    </div>
  );
}
