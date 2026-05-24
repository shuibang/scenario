import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Clapperboard, ExternalLink } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { FONTS, getFontPdfTooltip } from '../../print/FontRegistry';
import AdBanner from '../AdBanner';
import { mobileTbtnStyle } from '../../styles/tokens';
import { applyInlineFormat } from '../../utils/textFormat';
import { clearAccessToken, isTokenValid } from '../../store/googleDrive';
import { isPublicPcMode, getAll, DB_KEYS, clearDramaStorage } from '../../store/db';
import { supabaseSignOut, refreshDriveToken } from '../../store/supabaseClient';
import { guardedSignInWithGoogle } from '../../utils/guardedSignIn';
import Menubar from '../Menubar/Menubar';
import PublicPcBadge from '../PublicPcBadge';
import { isAdminUser, getAdminHash } from '../../utils/adminAuth';
import { fetchAdminUnreadCounts } from '../../utils/adminBadge';
import { useBadges } from '../../utils/badges';
import BadgeChip from '../BadgeChip';

export default function MobileMenuBar({ onSave, onPrintPreview, onSnapshot, WorkTimer, authUser, onLogout, onMenuAction, recentProjects = [], checkedItems = {}, cloudSaveOptions = [] }) {
  const { state, dispatch } = useApp();
  const { activeProjectId, stylePreset } = state;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // 사용자 대표 뱃지 — 햄버거 안 사용자 이름 옆
  const { featured: userBadge } = useBadges();

  // 어드민 unread 뱃지 — 햄버거의 🛠 항목 옆 빨간점
  const [adminUnread, setAdminUnread] = useState(0);
  useEffect(() => {
    if (!isAdminUser(authUser)) { setAdminUnread(0); return; }
    let cancelled = false;
    const tick = async () => {
      const { total } = await fetchAdminUnreadCounts();
      if (!cancelled) setAdminUnread(total);
    };
    tick();
    const onHash = () => tick();
    window.addEventListener('hashchange', onHash);
    const id = setInterval(tick, 5 * 60 * 1000);
    return () => { cancelled = true; window.removeEventListener('hashchange', onHash); clearInterval(id); };
  }, [authUser]);

  const timerSaveRef = useRef(null); // WorkTimer의 autoSave 연결

  // Drive 동기화 — 데스크톱과 동일한 충돌 판정 기준.
  // 이전에는 "모바일은 자동 적용, 충돌 UI 없음" 설계였으나,
  // 여러 기기 간 동기화 시 모바일 데이터가 경고 없이 덮어써지는 사고가 있어
  // 양쪽에 의미 있는 데이터가 있고 타임스탬프가 다르면 충돌 모달을 띄우도록 통일.

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
    // 공용 PC 모드는 메모리(React state)도 비워야 다음 사용자에게 직전 대본 노출 안 됨 → 가장 안전한 방법은 reload.
    const isPublicPc = isPublicPcMode();
    try {
      await supabaseSignOut();
    } catch (e) {
      console.warn('signOut failed, proceeding with cleanup', e);
    } finally {
      clearAccessToken();
    }
    if (isPublicPc) {
      await clearDramaStorage();   // localStorage drama_* + IDB 모두 wipe (이전 localStorage.clear()는 무관 사이트 키까지 날리는 위험 + IDB 미정리)
      window.location.reload();
      return;
    }
    onLogout?.();
    setMenuOpen(false);
  };

  return (
    <div className="shrink-0 no-print" style={{ background: 'var(--c-header)', borderBottom: '1px solid var(--c-border2)' }}>
      {/* Row 1: ☰ | 대본 작업실 🎬 | timer */}
      <div style={{
        height: 44,
        display: 'flex', alignItems: 'center', gap: 2,
        paddingLeft: 'max(6px, env(safe-area-inset-left, 6px))',
        paddingRight: 'max(6px, env(safe-area-inset-right, 6px))',
        borderBottom: '1px solid var(--c-border2)',
      }}>
        {/* Left: hamburger + dropdown */}
        <div style={{ position: 'relative', flexShrink: 0 }} ref={menuRef} data-tour-id="mobile-hamburger">
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{
              background: 'none', border: 'none',
              color: 'var(--c-text4)', fontSize: 18,
              cursor: 'pointer', padding: '6px 5px', lineHeight: 1,
              WebkitTapHighlightColor: 'transparent',
            }}
          >☰</button>
          {menuOpen && (
            <div style={{
              position: 'fixed', top: 'calc(var(--mobile-header-h, 44px) + 4px)', left: 14,
              background: 'var(--c-panel)', border: '1px solid var(--c-border)',
              borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              zIndex: 300,
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>
                        {userBadge && <BadgeChip badge={userBadge} size={16} tooltip="label" />}
                        <span>{authUser.name}</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--c-text5)' }}>{authUser.email}</div>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    style={{ fontSize: 11, color: 'var(--c-text6)', background: 'none', border: '1px solid var(--c-border3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', alignSelf: 'flex-start' }}
                  >로그아웃</button>
                </div>
              ) : (
                <div style={{ padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--c-text4)' }}>Google로 로그인하면 Drive에 자동 저장됩니다.</div>
                  <button
                    onClick={() => { guardedSignInWithGoogle(); }}
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

              <button
                style={dropItemStyle}
                onClick={() => {
                  dispatch({ type: 'SET_ACTIVE_DOC', payload: 'projects' });
                  setMenuOpen(false);
                }}
              >
                <span>📁</span><span>대본 관리</span>
              </button>

              <div style={{ height: 1, background: 'var(--c-border)', margin: '4px 0' }} />

              {[
                { icon: '👤', label: '작업현황', tab: 'stats' },
                { icon: '🐞', label: '오류보고',  tab: 'errors' },
                { icon: '⭐', label: '멤버십',    tab: 'membership' },
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

              {/* 아이디어 노트 — 항상 노출 */}
              <button
                style={{ ...dropItemStyle, color: 'var(--c-accent)' }}
                onClick={() => {
                  onMenuAction?.('ideas:open');
                  setMenuOpen(false);
                }}
              >
                <span>💡</span><span>아이디어 노트</span>
              </button>

              {/* 어드민 — admin 이메일이고 라우트 토큰이 설정된 경우에만 노출 */}
              {isAdminUser(authUser) && getAdminHash() && (
                <button
                  style={{ ...dropItemStyle, color: 'var(--c-accent)', position: 'relative' }}
                  onClick={() => {
                    window.location.hash = getAdminHash();
                    setMenuOpen(false);
                  }}
                >
                  <span style={{ position: 'relative', display: 'inline-flex' }}>
                    🛠
                    {adminUnread > 0 && (
                      <span
                        aria-label={`새 자료 ${adminUnread}건`}
                        style={{
                          position: 'absolute',
                          top: -2, right: -4,
                          width: 7, height: 7,
                          borderRadius: '50%',
                          background: '#ef4444',
                          boxShadow: '0 0 0 1.5px var(--c-bg)',
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                  </span>
                  <span>관리자{adminUnread > 0 ? ` · 새 자료 ${adminUnread}건` : ''}</span>
                </button>
              )}

              <div style={{ height: 1, background: 'var(--c-border)', margin: '4px 0' }} />
              <AdBanner slot="mobile-bottom" mobileHide={false} height={32} />

              <div
                style={{
                  padding: '8px 14px 4px',
                  fontSize: 10,
                  color: 'var(--c-text6)',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  borderTop: '1px solid var(--c-border)',
                  marginTop: 4,
                }}
              >
                <a href="/about" target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'none' }}>소개</a>
                {' · '}
                <a href="/contact" target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'none' }}>문의</a>
                {' · '}
                <a href="/privacy" target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'none' }}>개인정보</a>
                {' · '}
                <a href="/terms" target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'none' }}>약관</a>
              </div>
            </div>
          )}
        </div>

        {/* 브랜드: favicon 아이콘 + 대본 작업실 */}
        <button
          onClick={() => { window.location.href = '/'; }}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'transparent', border: 'none', cursor: 'pointer',
            borderRadius: 6, padding: '4px 4px', flexShrink: 0,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <img src="/favicon.svg" alt="" className="editor-brand-favicon" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text2)', letterSpacing: '-0.015em', whiteSpace: 'nowrap' }}>대본 작업실</span>
        </button>

        {/* 구분선 */}
        <div style={{ width: 1, height: 14, background: 'var(--c-border3)', flexShrink: 0 }} />

        {/* 연출 작업실 바로가기 */}
        <a
          href="#director"
          onClick={e => { e.preventDefault(); window.location.hash = '#director'; }}
          title="연출 작업실"
          style={{
            display: 'flex', alignItems: 'center', gap: 3,
            textDecoration: 'none', color: 'var(--c-text4)', fontSize: 12,
            background: 'transparent', borderRadius: 6,
            padding: '4px 4px', flexShrink: 0, lineHeight: 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Clapperboard size={13} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>연출</span>
          <ExternalLink size={10} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.6 }} />
        </a>

        <PublicPcBadge compact onClick={() => onMenuAction?.('tools:settings')} />
        <div data-tour-id="mobile-timer" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
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

      {/* Row 2: 메뉴바 — 좌우 균등 배치 */}
      <div style={{ borderTop: '1px solid var(--c-border2)' }} className="mobile-menubar-row">
        <Menubar onAction={onMenuAction} recentProjects={recentProjects} checkedItems={checkedItems} cloudSaveOptions={cloudSaveOptions} isMobile />
      </div>

      {/* Row 3: mobile toolbar */}
      <div style={{ position: 'relative' }}>
      <div data-tour-id="mobile-toolbar" style={{
        height: 'clamp(32px, 9vw, 42px)',
        display: 'flex', alignItems: 'center',
        paddingLeft: 'max(12px, env(safe-area-inset-left, 12px))',
        paddingRight: 'max(12px, env(safe-area-inset-right, 12px))',
        gap: 6,
        borderTop: '1px solid var(--c-border2)',
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
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
          value={stylePreset?.fontFamily ?? '함초롬바탕'}
          onChange={e => dispatch({ type: 'SET_STYLE_PRESET', payload: { fontFamily: e.target.value } })}
          style={{ ...mobileTbtnStyle, padding: '2px 4px', maxWidth: 90 }}
        >
          {FONTS.filter(f => f.sourceType === 'bundled').map(f => (
            <option key={f.id} value={f.cssFamily} title={getFontPdfTooltip(f)}>{f.displayName}</option>
          ))}
          {FONTS.filter(f => f.sourceType === 'system').map(f => (
            <option key={f.id} value={f.cssFamily} title={getFontPdfTooltip(f)}>{f.displayName}</option>
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
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 32,
          background: 'linear-gradient(to right, transparent, var(--c-header))',
          pointerEvents: 'none',
        }} />
      </div>
    </div>
  );
}
