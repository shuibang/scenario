import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../store/AppContext';
import { FONTS } from '../../print/FontRegistry';
import AdBanner from '../AdBanner';
import { mobileTbtnStyle } from '../../styles/tokens';
import { applyInlineFormat } from '../../utils/textFormat';
import { clearAccessToken, loadFromDrive, isTokenValid } from '../../store/googleDrive';
import { isPublicPcMode } from '../../store/db';
import { signInWithGoogle, supabaseSignOut, refreshDriveToken } from '../../store/supabaseClient';

export default function MobileMenuBar({ onSave, onPrintPreview, onSnapshot, WorkTimer, authUser, onLogout }) {
  const { state, dispatch } = useApp();
  const { activeProjectId, stylePreset } = state;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [driveStatus, setDriveStatus] = useState('none');
  const syncingRef = useRef(false);
  const timerSaveRef = useRef(null); // WorkTimer의 autoSave 연결

  // Drive 동기화 — Supabase provider_token 사용 (모바일은 자동 적용, 충돌 UI 없음)
  const runDriveSync = useCallback(async () => {
    if (syncingRef.current || !isTokenValid()) return;
    syncingRef.current = true;
    setDriveStatus('syncing');
    try {
      const driveData = await loadFromDrive();
      if (driveData?.savedAt) {
        const driveSavedAt = new Date(driveData.savedAt).getTime();
        const localSavedAt = new Date(localStorage.getItem('drama_saved_at') || 0).getTime();
        if (driveSavedAt > localSavedAt && (driveData.projects?.length ?? 0) > 0) {
          dispatch({ type: 'LOAD_FROM_DRIVE', payload: driveData });
        }
      }
      setDriveStatus('synced');
      setTimeout(() => setDriveStatus('none'), 3000);
    } catch (e) {
      if (e.message?.includes('401') || e.message?.includes('DRIVE_AUTH_REQUIRED')) {
        const newToken = await refreshDriveToken();
        if (newToken) { syncingRef.current = false; runDriveSync(); return; }
      }
      if (e.message?.includes('403')) {
        setDriveStatus('reauth');
      } else {
        setDriveStatus('error');
      }
      console.warn('[Drive] 불러오기 실패:', e);
    } finally {
      syncingRef.current = false;
    }
  }, [dispatch]);

  // 로그인 후 토큰 유효하면 Drive 동기화
  useEffect(() => {
    if (authUser && isTokenValid() && driveStatus === 'none') {
      runDriveSync();
    }
  }, [authUser]);

  // Close dropdown when tapping outside + prevent body scroll
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('pointerdown', handler);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const dropItemStyle = {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', background: 'none', border: 'none',
    color: 'var(--c-text)', fontSize: 'clamp(11px, 3.2vw, 14px)',
    padding: '12px 18px', textAlign: 'left', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  };

  const handleLogout = async () => {
    timerSaveRef.current?.();
    if (isPublicPcMode()) { try { localStorage.clear(); } catch {} }
    await supabaseSignOut();
    clearAccessToken();
    setDriveStatus('none');
    onLogout?.();
    setMenuOpen(false);
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
        <div style={{ position: 'relative' }} ref={menuRef} data-tour-id="mobile-hamburger">
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
              maxHeight: 'min(420px, calc(100dvh - var(--mobile-header-h, 44px) - 24px))',
              width: '40vw', minWidth: 192, maxWidth: 264,
              overflowY: 'auto', padding: '6px 0',
            }}>
              {/* 로그인 영역 */}
              {authUser ? (
                <div style={{ padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {authUser.picture && <img src={authUser.picture} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{authUser.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--c-text5)' }}>
                        {driveStatus === 'syncing' && '☁ 동기화 중…'}
                        {driveStatus === 'synced'  && '☁ Drive 연동됨'}
                        {driveStatus === 'error'   && '☁ 연동 실패'}
                        {driveStatus === 'reauth'  && '☁ 구글 드라이브 재연결 필요'}
                        {(driveStatus === 'none' || !driveStatus) && authUser.email}
                      </div>
                    </div>
                  </div>
                  {driveStatus === 'error' && (
                    <button
                      style={{ ...dropItemStyle, padding: '4px 0', fontSize: 11, color: '#f87171' }}
                      onClick={async () => {
                        setDriveStatus('none');
                        const newToken = await refreshDriveToken();
                        if (newToken) runDriveSync();
                        else signInWithGoogle();
                      }}
                    >재연결 시도</button>
                  )}
                  {driveStatus === 'reauth' && (
                    <button
                      style={{ ...dropItemStyle, padding: '4px 0', fontSize: 11, color: '#f6ad55' }}
                      onClick={() => signInWithGoogle()}
                    >구글 드라이브 재연결이 필요해요 (탭해서 재로그인)</button>
                  )}
                  <button
                    onClick={handleLogout}
                    style={{ fontSize: 11, color: 'var(--c-text6)', background: 'none', border: '1px solid var(--c-border3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', alignSelf: 'flex-start' }}
                  >로그아웃</button>
                </div>
              ) : (
                <div style={{ padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--c-text4)' }}>Google로 로그인하면 Drive에 자동 저장됩니다.</div>
                  <button
                    onClick={() => { signInWithGoogle(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '8px 12px', borderRadius: 6,
                      border: '1px solid var(--c-border3)', background: 'var(--c-card)',
                      color: 'var(--c-text)', fontSize: 13, cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" style={{ width: 16, height: 16, flexShrink: 0 }} />
                    Google로 로그인
                  </button>
                </div>
              )}

              <div style={{ height: 1, background: 'var(--c-border)', margin: '4px 0' }} />

              {[
                { icon: '📢', label: '공지사항', tab: 'notices' },
                { icon: '👤', label: '마이페이지', tab: 'stats' },
                { icon: '💬', label: 'Q&A',       tab: 'qa' },
                { icon: '🐞', label: '오류 보고',  tab: 'errors' },
              ].map(({ icon, label, tab }) => (
                <button
                  key={tab}
                  style={dropItemStyle}
                  onClick={() => {
                    dispatch({ type: 'SET_ACTIVE_DOC', payload: 'mypage' });
                    setTimeout(() => window.dispatchEvent(new CustomEvent('mypage:tab', { detail: tab })), 0);
                    setMenuOpen(false);
                  }}
                >
                  <span>{icon}</span><span>{label}</span>
                </button>
              ))}

              <div style={{ height: 1, background: 'var(--c-border)', margin: '4px 0' }} />
              <AdBanner slot="mobile-bottom" mobileHide={false} height={32} />
            </div>
          )}
        </div>

        {/* Center: brand */}
        <button
          onClick={() => { window.location.hash = '#landing'; }}
          style={{ fontSize: 'clamp(13px, 4vw, 17px)', fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.05em', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          대본 작업실
        </button>

        {/* Right: work timer */}
        <div data-tour-id="mobile-timer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          {activeProjectId && WorkTimer && (
            <WorkTimer
              key={activeProjectId}
              projectId={activeProjectId}
              documentId={state.activeEpisodeId || state.activeDoc}
              saveRef={timerSaveRef}
            />
          )}
        </div>
      </div>

      {/* Row 2: mobile toolbar */}
      <div data-tour-id="mobile-toolbar" style={{
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
        >출력</button>
        <button onClick={onSnapshot} style={mobileTbtnStyle}>백업/복원</button>
        <div style={{ width: 1, height: 16, background: 'var(--c-border3)', margin: '0 2px', flexShrink: 0 }} />
        <button
          title="되돌리기"
          onMouseDown={e => { e.preventDefault(); window.dispatchEvent(new Event('script:undo')); }}
          style={mobileTbtnStyle}
        >↩</button>
        <button
          title="다시하기"
          onMouseDown={e => { e.preventDefault(); dispatch({ type: 'REDO' }); }}
          style={mobileTbtnStyle}
        >↪</button>
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
        <span style={{ fontSize: 'clamp(9px, 2.4vw, 11px)', color: 'var(--c-text6)', flexShrink: 0 }}>크기</span>
        <button style={mobileTbtnStyle} onMouseDown={e => { e.preventDefault(); dispatch({ type: 'SET_STYLE_PRESET', payload: { fontSize: Math.max(9, (stylePreset?.fontSize ?? 11) - 1) } }); }}>−</button>
        <span style={{ fontSize: 'clamp(9px, 2.4vw, 11px)', color: 'var(--c-text4)', flexShrink: 0, minWidth: 24, textAlign: 'center' }}>{stylePreset?.fontSize ?? 11}pt</span>
        <button style={mobileTbtnStyle} onMouseDown={e => { e.preventDefault(); dispatch({ type: 'SET_STYLE_PRESET', payload: { fontSize: Math.min(18, (stylePreset?.fontSize ?? 11) + 1) } }); }}>+</button>
        <span style={{ fontSize: 'clamp(9px, 2.4vw, 11px)', color: 'var(--c-text6)', flexShrink: 0 }}>간격</span>
        <button style={mobileTbtnStyle} onMouseDown={e => { e.preventDefault(); const v = Math.max(4, parseFloat(stylePreset?.dialogueGap ?? '7') - 0.5); dispatch({ type: 'SET_STYLE_PRESET', payload: { dialogueGap: `${v}em` } }); }}>−</button>
        <span style={{ fontSize: 'clamp(9px, 2.4vw, 11px)', color: 'var(--c-text4)', flexShrink: 0, minWidth: 28, textAlign: 'center' }}>{stylePreset?.dialogueGap ?? '7em'}</span>
        <button style={mobileTbtnStyle} onMouseDown={e => { e.preventDefault(); const v = Math.min(14, parseFloat(stylePreset?.dialogueGap ?? '7') + 0.5); dispatch({ type: 'SET_STYLE_PRESET', payload: { dialogueGap: `${v}em` } }); }}>+</button>
      </div>
    </div>
  );
}
