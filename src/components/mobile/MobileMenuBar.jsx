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
  const menuRef = useRef(null);
  const googleBtnRef = useRef(null);

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

  // 메뉴 열릴 때 Google 버튼 렌더링 (폴백용 hidden 컨테이너)
  useEffect(() => {
    if (!menuOpen || authUser || !GOOGLE_CLIENT_ID) return;
    if (!window.google?.accounts?.id) return;
    const el = googleBtnRef.current;
    if (!el) return;
    window.google.accounts.id.renderButton(el, {
      type: 'standard', theme: 'outline', size: 'medium',
      text: 'signin_with', locale: 'ko', width: 160,
    });
  }, [menuOpen, authUser]);

  useEffect(() => {
    if (authUser && tokenClientRef.current && driveStatus === 'none') {
      tokenClientRef.current.requestAccessToken({ prompt: '' });
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
                    <>
                      <button
                        onClick={() => window.google?.accounts?.id?.prompt?.()}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '8px 12px', borderRadius: 6,
                          border: '1px solid var(--c-border3)', background: 'var(--c-card)',
                          color: 'var(--c-text)', fontSize: 13, cursor: 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                        </svg>
                        구글 로그인
                      </button>
                      {/* 폴백: hidden 컨테이너 */}
                      <div ref={googleBtnRef} style={{ display: 'none' }} />
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--c-text6)' }}>로그인 기능 준비 중</div>
                  )}
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
              <AdBanner slot="mobile-bottom" mobileHide={false} height={60} />
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
