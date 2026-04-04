import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../store/AppContext';
import { FONTS } from '../../print/FontRegistry';
import AdBanner from '../AdBanner';
import { mobileTbtnStyle } from '../../styles/tokens';
import { applyInlineFormat } from '../../utils/textFormat';
import { setAccessToken, clearAccessToken, loadFromDrive } from '../../store/googleDrive';
import { isPublicPcMode } from '../../store/db';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function decodeJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

export default function MobileMenuBar({ onSave, onPrintPreview, WorkTimer }) {
  const { state, dispatch } = useApp();
  const { activeProjectId, stylePreset } = state;
  const [menuOpen, setMenuOpen] = useState(false);
  const [myOpen, setMyOpen]     = useState(false);
  const menuRef = useRef(null);

  // ── 로그인 / Drive 상태
  const [authUser, setAuthUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('drama_auth_user') || 'null'); } catch { return null; }
  });
  const [driveStatus, setDriveStatus] = useState('none');
  const tokenClientRef  = useRef(null);
  const driveHandlerRef = useRef(null);
  const syncingRef      = useRef(false);

  driveHandlerRef.current = async (tokenResponse) => {
    if (syncingRef.current) return;
    if (tokenResponse.error) {
      if (tokenResponse.error !== 'interaction_required' && tokenResponse.error !== 'access_denied') {
        setDriveStatus('error');
      }
      return;
    }
    syncingRef.current = true;
    setAccessToken(tokenResponse.access_token, tokenResponse.expires_in);
    setDriveStatus('syncing');
    try {
      const driveData = await loadFromDrive();
      if (driveData?.savedAt) {
        const driveSavedAt = new Date(driveData.savedAt).getTime();
        const localSavedAt = new Date(localStorage.getItem('drama_saved_at') || 0).getTime();
        if (driveSavedAt > localSavedAt) {
          dispatch({ type: 'LOAD_FROM_DRIVE', payload: driveData });
        }
      }
      setDriveStatus('synced');
    } catch (e) {
      console.warn('[Drive] 불러오기 실패:', e);
      setDriveStatus('error');
    } finally {
      syncingRef.current = false;
    }
  };

  // GIS 초기화
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const tryInit = () => {
      if (!window.google?.accounts?.oauth2) { setTimeout(tryInit, 800); return; }
      // Drive OAuth2 토큰 클라이언트
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.appdata',
        callback: (tr) => driveHandlerRef.current(tr),
      });
      // 사용자 ID 초기화 (로그인 버튼용)
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            const payload = decodeJwt(response.credential);
            if (payload) {
              const userData = { name: payload.name, email: payload.email, picture: payload.picture };
              localStorage.setItem('drama_auth_user', JSON.stringify(userData));
              setAuthUser(userData);
            }
          },
        });
      }
      if (localStorage.getItem('drama_auth_user')) {
        tokenClientRef.current.requestAccessToken({ prompt: '' });
      }
    };
    tryInit();
  }, []);

  useEffect(() => {
    if (authUser && tokenClientRef.current && driveStatus === 'none') {
      tokenClientRef.current.requestAccessToken({ prompt: '' });
    }
  }, [authUser]);

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

  const handleLogout = () => {
    if (isPublicPcMode()) { try { localStorage.clear(); } catch {} }
    localStorage.removeItem('drama_auth_user');
    window.google?.accounts.id.disableAutoSelect();
    clearAccessToken();
    setDriveStatus('none');
    setAuthUser(null);
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
                        {driveStatus === 'none'    && authUser.email}
                      </div>
                    </div>
                  </div>
                  {driveStatus === 'error' && (
                    <button
                      style={{ ...dropItemStyle, padding: '4px 0', fontSize: 11, color: '#f87171' }}
                      onClick={() => { setDriveStatus('none'); tokenClientRef.current?.requestAccessToken({ prompt: '' }); }}
                    >재연결 시도</button>
                  )}
                  <button
                    onClick={handleLogout}
                    style={{ fontSize: 11, color: 'var(--c-text6)', background: 'none', border: '1px solid var(--c-border3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', alignSelf: 'flex-start' }}
                  >로그아웃</button>
                </div>
              ) : (
                <div style={{ padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--c-text4)' }}>Google로 로그인하면 Drive에 자동 저장됩니다.</div>
                  {GOOGLE_CLIENT_ID ? (
                    <button
                      onClick={() => window.google?.accounts?.id?.prompt()}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 4, border: '1px solid #dadce0', background: '#fff', cursor: 'pointer', alignSelf: 'flex-start', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      <span style={{ fontSize: 12, color: '#3c4043', fontWeight: 500 }}>Google로 로그인</span>
                    </button>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--c-text6)' }}>로그인 기능 준비 중</div>
                  )}
                </div>
              )}

              <div style={{ height: 1, background: 'var(--c-border)', margin: '4px 0' }} />

              {/* 마이페이지 */}
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

            </div>
          )}
        </div>

        {/* Center: brand */}
        <span style={{ fontSize: 'clamp(13px, 4vw, 17px)', fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.05em' }}>
          대본 작업실
        </span>

        {/* Right: work timer */}
        <div data-tour-id="mobile-timer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
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
