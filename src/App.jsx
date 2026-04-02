import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import {
  FONTS,
  FONT_STATUS,
  checkFontsAvailability,
  getFontPdfStatus,
  getFontByCssFamily,
} from './print/FontRegistry';
import { getItem, setItem, clearDramaStorage, isPublicPcMode, genId, now } from './store/db';
import { setAccessToken, clearAccessToken, loadFromDrive } from './store/googleDrive';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import ScriptEditor from './components/ScriptEditor';
import CoverEditor from './components/CoverEditor';
import SynopsisEditor from './components/SynopsisEditor';
import CharacterPanel from './components/CharacterPanel';
import ResourcePanel from './components/ResourcePanel';
import PrintPreviewModal from './components/PrintPreviewModal';
import StructurePage from './components/StructurePage';
import SceneListPage from './components/SceneListPage';
import TreatmentPage from './components/TreatmentPage';
import BiographyPage from './components/BiographyPage';
import RelationshipsPage from './components/RelationshipsPage';
import MyPage from './components/MyPage';
import OnboardingTour from './components/OnboardingTour';
import SharedReviewView from './components/SharedReviewView';
import AdBanner from './components/AdBanner';

// ─── Panel width persistence ───────────────────────────────────────────────────
const PANEL_WIDTHS_KEY = 'panelWidths';
const DEFAULT_WIDTHS = { left: 224, right: 256 };
const MIN_LEFT = 160; const MAX_LEFT = 360;
const MIN_RIGHT = 180; const MAX_RIGHT = 400;

function loadPanelWidths() {
  const saved = getItem(PANEL_WIDTHS_KEY);
  if (saved && saved.left && saved.right) return saved;
  return DEFAULT_WIDTHS;
}

// ─── DragHandle ───────────────────────────────────────────────────────────────
function DragHandle({ onDrag, isLeft }) {
  const dragging = useRef(false);
  const startX = useRef(0);

  const onMouseDown = (e) => {
    dragging.current = true;
    startX.current = e.clientX;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev) => {
      if (!dragging.current) return;
      const delta = ev.clientX - startX.current;
      startX.current = ev.clientX;
      onDrag(delta);
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: '5px',
        cursor: 'col-resize',
        background: 'transparent',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-accent)'; e.currentTarget.style.opacity = '0.4'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = '1'; }}
    />
  );
}

// ─── Center panel ─────────────────────────────────────────────────────────────
function CenterPanel({ scrollToSceneId, onScrollHandled }) {
  const { state } = useApp();
  const { activeDoc, activeEpisodeId, activeProjectId, initialized } = state;

  if (!initialized) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--c-bg)' }}>
        <span style={{ color: 'var(--c-text6)' }} className="text-sm">불러오는 중…</span>
      </div>
    );
  }
  if (!activeProjectId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ background: 'var(--c-bg)' }}>
        <div className="text-5xl" style={{ color: 'var(--c-border3)' }}>✎</div>
        <p style={{ color: 'var(--c-text5)' }} className="text-sm">좌측 패널에서 작품을 선택하거나 새로 만드세요</p>
      </div>
    );
  }
  if (activeDoc === 'cover') return <CoverEditor />;
  if (activeDoc === 'synopsis') return <SynopsisEditor />;
  if (activeDoc === 'characters') return <CharacterPanel />;
  if (activeDoc === 'resources') return <ResourcePanel />;
  if (activeDoc === 'structure') return <StructurePage />;
  if (activeDoc === 'scenelist') return <SceneListPage />;
  if (activeDoc === 'treatment') return <TreatmentPage />;
  if (activeDoc === 'biography') return <BiographyPage />;
  if (activeDoc === 'relationships') return <RelationshipsPage />;
  if (activeDoc === 'mypage') return <MyPage />;
  if (activeDoc === 'script' && activeEpisodeId) {
    return <ScriptEditor scrollToSceneId={scrollToSceneId} onScrollHandled={onScrollHandled} />;
  }
  return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--c-bg)' }}>
      <span style={{ color: 'var(--c-text5)' }} className="text-sm">좌측에서 문서를 선택하세요</span>
    </div>
  );
}

// ─── Inline format helper ─────────────────────────────────────────────────────
function applyInlineFormat(tag) {
  const el = document.activeElement;
  if (!el || (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT')) return;
  const s = el.selectionStart ?? 0;
  const e = el.selectionEnd ?? 0;
  const val = el.value;
  const sel = val.substring(s, e);
  const markers = { bold: '**', italic: '*', underline: '__' };
  const m = markers[tag];
  if (!m) return;
  const replacement = `${m}${sel}${m}`;
  const setter = Object.getOwnPropertyDescriptor(
    el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
    'value'
  )?.set;
  if (setter) {
    setter.call(el, val.substring(0, s) + replacement + val.substring(e));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.setSelectionRange(s + m.length, s + m.length + sel.length);
  }
}

// ─── Share helper ─────────────────────────────────────────────────────────────
export function buildReviewURL(state, selections) {
  const { projects, episodes, characters, scenes, scriptBlocks, coverDocs, synopsisDocs, activeProjectId, stylePreset } = state;
  const payload = {
    projects:     projects.filter(p => p.id === activeProjectId),
    episodes:     episodes.filter(e => e.projectId === activeProjectId),
    characters:   characters.filter(c => c.projectId === activeProjectId),
    scenes:       scenes.filter(s => s.projectId === activeProjectId),
    scriptBlocks: scriptBlocks.filter(b => b.projectId === activeProjectId),
    coverDocs:    coverDocs.filter(d => d.projectId === activeProjectId),
    synopsisDocs: synopsisDocs.filter(d => d.projectId === activeProjectId),
    activeProjectId,
    stylePreset:  stylePreset || {},
    selections,
  };
  const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(payload)))));
  return `${window.location.origin}${window.location.pathname}#review=${encoded}`;
}

// ─── Realtime clock ───────────────────────────────────────────────────────────
function RealtimeClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const h = String(time.getHours()).padStart(2, '0');
  const m = String(time.getMinutes()).padStart(2, '0');
  const s = String(time.getSeconds()).padStart(2, '0');
  return (
    <span className="text-xs tabular-nums" style={{ color: 'var(--c-text5)', letterSpacing: '0.05em' }}>
      {h}:{m}:{s}
    </span>
  );
}

// ─── Mobile toolbar button style ─────────────────────────────────────────────
const mobileTbtnStyle = {
  flexShrink: 0, fontSize: 'clamp(10px, 2.8vw, 13px)', color: 'var(--c-text4)',
  padding: '4px 10px', border: '1px solid var(--c-border3)',
  borderRadius: 6, background: 'transparent', cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
};

// ─── Work timer (active-time accumulator) ─────────────────────────────────────
function WorkTimer({ projectId, documentId, onComplete }) {
  const { state, dispatch } = useApp();
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef  = useRef(0);           // always up-to-date for cleanup closure
  const activeRef   = useRef(false);
  const idleTimer   = useRef(null);
  const tickTimer   = useRef(null);
  const startedAt   = useRef(Date.now());
  // Keep a ref to checklistItems so cleanup closure has current data
  const checklistRef = useRef(state.checklistItems);
  useEffect(() => { checklistRef.current = state.checklistItems; }, [state.checklistItems]);

  const buildSnapshot = () =>
    checklistRef.current
      .filter(it => it.projectId === projectId && it.done)
      .map(it => ({ id: it.id, text: it.text, docId: it.docId || null }));

  const resetIdle = useCallback(() => {
    activeRef.current = true;
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => { activeRef.current = false; }, 30000);
  }, []);

  useEffect(() => {
    const events = ['keydown', 'mousedown', 'mousemove', 'scroll', 'dragstart'];
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }));
    resetIdle();
    tickTimer.current = setInterval(() => {
      if (activeRef.current) {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
      }
    }, 1000);
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdle));
      clearTimeout(idleTimer.current);
      clearInterval(tickTimer.current);
      // 확정 로그는 작업완료 버튼 클릭 시에만 저장 (cleanup 자동 저장 없음)
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, documentId]);

  const hh = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  const handleComplete = () => {
    if (elapsedRef.current > 0 && projectId) {
      dispatch({ type: 'ADD_WORK_LOG', payload: {
        projectId,
        documentId: documentId || null,
        startedAt: startedAt.current,
        completedAt: Date.now(),
        activeDurationSec: elapsedRef.current,
        dateKey: new Date(startedAt.current).toISOString().slice(0, 10),
        completedChecklistSnapshot: buildSnapshot(),
      }});
    }
    // reset for next session
    elapsedRef.current = 0;
    setElapsed(0);
    startedAt.current = Date.now();
    onComplete?.();
  };

  return (
    <div data-tour-id="work-timer" className="flex items-center gap-1">
      <span className="text-xs tabular-nums" style={{ color: 'var(--c-text6)', letterSpacing: '0.05em' }} title="활동 시간 (30초 비활동 시 중단)">
        ⏱ {hh}:{mm}:{ss}
      </span>
      <button
        onClick={handleComplete}
        title="작업완료 — 시간 기록 저장"
        style={{ ...mobileTbtnStyle, whiteSpace: 'nowrap' }}
      >
        기록
      </button>
    </div>
  );
}

// ─── Login modal — Google Identity Services ───────────────────────────────────
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function decodeJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch (_) {
    return null;
  }
}

function LoginModal({ onClose, onLogin }) {
  const googleBtnRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        const payload = decodeJwt(response.credential);
        if (payload) {
          const userData = { name: payload.name, email: payload.email, picture: payload.picture };
          localStorage.setItem('drama_auth_user', JSON.stringify(userData));
          onLogin?.(userData);
          onClose();
        } else {
          setError('로그인 실패: 토큰 파싱 오류');
        }
      },
    });
    if (googleBtnRef.current) {
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        locale: 'ko',
        width: 280,
      });
    }
  }, [onClose, onLogin]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="rounded-xl p-8 w-80 flex flex-col gap-4" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }} onClick={e => e.stopPropagation()}>
        <div className="text-center mb-2">
          <div className="text-lg font-bold mb-1" style={{ color: 'var(--c-text)' }}>로그인 / 회원가입</div>
          <div className="text-xs" style={{ color: 'var(--c-text5)' }}>소셜 계정으로 바로 시작하세요</div>
        </div>
        {GOOGLE_CLIENT_ID ? (
          <div className="flex justify-center">
            <div ref={googleBtnRef} />
          </div>
        ) : (
          <div className="text-xs text-center py-2" style={{ color: 'var(--c-text5)' }}>
            로그인 기능을 준비 중입니다.
          </div>
        )}
        {error && <div className="text-xs text-center" style={{ color: 'var(--c-error, #ef4444)' }}>{error}</div>}
        <div className="text-[10px] text-center" style={{ color: 'var(--c-text6)' }}>
          Kakao / Naver 로그인은 준비 중입니다
        </div>
        <button onClick={onClose} className="text-xs mt-1" style={{ color: 'var(--c-text6)', background: 'none', border: 'none', cursor: 'pointer' }}>닫기</button>
      </div>
    </div>
  );
}

// ─── MenuBar ──────────────────────────────────────────────────────────────────
function MenuBar({ isDark, onToggleTheme, onPrintPreview, onSave }) {
  const { state, dispatch } = useApp();
  const { saveStatus, saveErrorMsg, activeProjectId, stylePreset, undoStack, redoStack } = state;
  const canUndo = undoStack?.length > 0;
  const canRedo = redoStack?.length > 0;
  const [fontAvailability, setFontAvail] = useState(null);
  const [loginOpen, setLoginOpen]        = useState(false);
  const [authUser, setAuthUser]          = useState(() => {
    try {
      const saved = localStorage.getItem('drama_auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [driveStatus, setDriveStatus]    = useState('none'); // 'none'|'syncing'|'synced'|'error'
  const tokenClientRef  = useRef(null);
  const driveHandlerRef = useRef(null);

  // Drive 토큰 콜백 (항상 최신 state 참조를 위해 ref 사용)
  driveHandlerRef.current = async (tokenResponse) => {
    if (tokenResponse.error) {
      if (tokenResponse.error !== 'interaction_required' &&
          tokenResponse.error !== 'access_denied') {
        setDriveStatus('error');
      }
      return;
    }
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
    }
  };

  // GIS 로드 후 Drive 토큰 클라이언트 초기화
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const tryInit = () => {
      if (!window.google?.accounts?.oauth2) {
        setTimeout(tryInit, 800);
        return;
      }
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.appdata',
        callback: (tr) => driveHandlerRef.current(tr),
      });
      // 기존 로그인 유저 → 자동 silent 재인증 시도
      if (localStorage.getItem('drama_auth_user')) {
        tokenClientRef.current.requestAccessToken({ prompt: '' });
      }
    };
    tryInit();
  }, []);

  // 새 로그인 시 Drive 인증 요청
  useEffect(() => {
    if (authUser && tokenClientRef.current && driveStatus === 'none') {
      tokenClientRef.current.requestAccessToken({ prompt: '' });
    }
  }, [authUser]);

  useEffect(() => {
    checkFontsAvailability().then(setFontAvail);
  }, []);


  const handleFontSize   = (e) => dispatch({ type: 'SET_STYLE_PRESET', payload: { fontSize: Number(e.target.value) } });
  const handleFontFamily = (e) => dispatch({ type: 'SET_STYLE_PRESET', payload: { fontFamily: e.target.value } });

  const selectStyle = {
    background: 'var(--c-input)',
    color: 'var(--c-text2)',
    border: '1px solid var(--c-border3)',
    padding: '1px 4px',
    fontSize: '11px',
    borderRadius: '0.25rem',
    outline: 'none',
  };

  const fontStatusBadge = useMemo(() => {
    const font   = getFontByCssFamily(stylePreset?.fontFamily);
    const status = getFontPdfStatus(font?.id, fontAvailability);
    if (status === FONT_STATUS.SYSTEM)      return <span className="text-[9px] px-1 rounded" style={{ background: '#e8f0fe', color: '#3367d6' }}>화면 전용</span>;
    if (status === FONT_STATUS.UNAVAILABLE) return <span className="text-[9px] px-1 rounded" style={{ background: '#fce8e6', color: '#c5221f' }}>PDF ✗</span>;
    if (status === FONT_STATUS.PARTIAL)     return <span className="text-[9px] px-1 rounded" style={{ background: '#fff3e0', color: '#e37400' }}>PDF △</span>;
    return null;
  }, [stylePreset?.fontFamily, fontAvailability]);

  const sep = <div className="h-4 w-px mx-1 shrink-0" style={{ background: 'var(--c-border3)' }} />;

  return (
    <div data-tour-id="menubar" className="shrink-0 no-print" style={{ background: 'var(--c-header)', borderBottom: '1px solid var(--c-border)' }}>
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onLogin={setAuthUser} />}

      {/* ── Row 1: [left: login/mypage] [center: brand] [right: clock/timer] ── */}
      <div className="h-9 flex items-center px-4" style={{ borderBottom: '1px solid var(--c-border2)' }}>
        {/* Left: 로그인/마이페이지 */}
        <div className="flex items-center gap-2" style={{ flex: 1 }}>
          {authUser ? (
            <div className="flex items-center gap-1.5">
              {authUser.picture && <img src={authUser.picture} alt="" className="w-5 h-5 rounded-full" />}
              <span className="text-xs" style={{ color: 'var(--c-text3)' }}>{authUser.name}</span>
              {driveStatus === 'syncing' && (
                <span className="text-[10px]" style={{ color: 'var(--c-text5)' }}>☁ 동기화 중…</span>
              )}
              {driveStatus === 'synced' && (
                <span className="text-[10px]" style={{ color: '#4ade80' }}>☁ 동기화됨</span>
              )}
              {driveStatus === 'error' && (
                <span
                  className="text-[10px] cursor-pointer"
                  style={{ color: '#f87171' }}
                  title="Drive 연동 실패. 클릭해서 재시도"
                  onClick={() => {
                    setDriveStatus('none');
                    tokenClientRef.current?.requestAccessToken({ prompt: '' });
                  }}
                >☁ 연동 실패 (재시도)</span>
              )}
              <button onClick={() => {
                  if (isPublicPcMode()) clearDramaStorage();
                  localStorage.removeItem('drama_auth_user');
                  window.google?.accounts.id.disableAutoSelect();
                  clearAccessToken();
                  setDriveStatus('none');
                  setAuthUser(null);
                }}
                style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, background: 'transparent', border: '1px solid var(--c-border3)', color: 'var(--c-text6)', cursor: 'pointer' }}>
                로그아웃
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => setLoginOpen(true)}
                style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, background: 'transparent', border: '1px solid var(--c-border3)', color: 'var(--c-text4)', cursor: 'pointer' }}>
                로그인
              </button>
              <button onClick={() => setLoginOpen(true)}
                style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                회원가입
              </button>
            </>
          )}
          <button
            onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'mypage' })}
            style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, background: 'transparent', border: '1px solid var(--c-border3)', color: 'var(--c-text4)', cursor: 'pointer' }}
          >
            마이페이지
          </button>
        </div>

        {/* Center: brand */}
        <span className="text-xs font-bold tracking-wider"
          style={{ color: 'var(--c-accent)', flexShrink: 0 }}>
          대본 작업실
        </span>

        {/* Right: clock + timer */}
        <div className="flex items-center gap-3" style={{ flex: 1, justifyContent: 'flex-end' }}>
          <RealtimeClock />
          {activeProjectId && <WorkTimer key={activeProjectId} projectId={activeProjectId} documentId={state.activeEpisodeId || state.activeDoc} />}
        </div>
      </div>

      {/* ── Row 2: actions + format + font ── */}
      <div className="h-8 flex items-center px-4 gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <MenuButton
          label={saveStatus === 'saving' ? '저장 중…' : saveStatus === 'error' ? '저장 실패' : '저장'}
          onClick={onSave}
          disabled={!activeProjectId}
          fixedWidth="5rem"
          title={saveStatus === 'error' && saveErrorMsg ? saveErrorMsg : undefined}
          style={saveStatus === 'error' ? { color: '#c00', borderColor: '#f99' } : undefined}
        />
        <MenuButton label="출력" onClick={onPrintPreview} disabled={!activeProjectId} accent />

        {sep}

        {/* Undo / Redo */}
        <button
          onClick={() => dispatch({ type: 'UNDO' })}
          disabled={!canUndo}
          title="되돌리기 (Ctrl+Z)"
          className="w-6 h-6 rounded text-xs flex items-center justify-center shrink-0"
          style={{ color: canUndo ? 'var(--c-text3)' : 'var(--c-border3)', border: '1px solid var(--c-border3)', background: 'transparent', cursor: canUndo ? 'pointer' : 'not-allowed' }}
        >↩</button>
        <button
          onClick={() => dispatch({ type: 'REDO' })}
          disabled={!canRedo}
          title="다시하기 (Ctrl+Shift+Z / Ctrl+Y)"
          className="w-6 h-6 rounded text-xs flex items-center justify-center shrink-0"
          style={{ color: canRedo ? 'var(--c-text3)' : 'var(--c-border3)', border: '1px solid var(--c-border3)', background: 'transparent', cursor: canRedo ? 'pointer' : 'not-allowed' }}
        >↪</button>

        {sep}

        {/* Inline format buttons */}
        {[
          { label: 'B', title: '굵게', tag: 'bold', cls: 'font-bold' },
          { label: 'I', title: '기울임', tag: 'italic', cls: 'italic' },
          { label: 'U', title: '밑줄', tag: 'underline', cls: 'underline' },
        ].map(({ label, title, tag, cls }) => (
          <button
            key={tag}
            title={title}
            onMouseDown={e => { e.preventDefault(); applyInlineFormat(tag); }}
            className={`w-6 h-6 rounded text-xs flex items-center justify-center shrink-0 ${cls}`}
            style={{ color: 'var(--c-text3)', border: '1px solid var(--c-border3)', background: 'transparent' }}
          >
            {label}
          </button>
        ))}

        {sep}

        <label className="text-[10px] shrink-0" style={{ color: 'var(--c-text6)' }}>글꼴</label>
        <select value={stylePreset?.fontFamily ?? '함초롱바탕'} onChange={handleFontFamily}
          style={{ ...selectStyle, maxWidth: '110px' }}
        >
          <optgroup label="내장 글꼴">
            {FONTS.filter(f => f.sourceType === 'bundled').map(f => {
              const status = getFontPdfStatus(f.id, fontAvailability);
              const badge  = status === FONT_STATUS.FULL ? ' ✓' : status === FONT_STATUS.PARTIAL ? ' △' : status === FONT_STATUS.UNAVAILABLE ? ' ✗' : '';
              return <option key={f.id} value={f.cssFamily}>{f.displayName}{badge}</option>;
            })}
          </optgroup>
          <optgroup label="시스템 글꼴">
            {FONTS.filter(f => f.sourceType === 'system').map(f => (
              <option key={f.id} value={f.cssFamily}>{f.displayName}</option>
            ))}
          </optgroup>
        </select>
        {fontStatusBadge}

        <label className="text-[10px] ml-1 shrink-0" style={{ color: 'var(--c-text6)' }}>크기</label>
        <select value={stylePreset?.fontSize ?? 11} onChange={handleFontSize} style={selectStyle}>
          {[9,10,11,12,13,14,16,18].map(s => <option key={s} value={s}>{s}pt</option>)}
        </select>

        {sep}

        <label className="text-[10px] shrink-0" style={{ color: 'var(--c-text6)' }}>인물/대사 간격</label>
        <input
          type="range" min="4" max="14" step="0.5"
          value={parseFloat(stylePreset?.dialogueGap ?? '7')}
          onChange={e => dispatch({ type: 'SET_STYLE_PRESET', payload: { dialogueGap: `${e.target.value}em` } })}
          className="w-16 shrink-0"
          style={{ accentColor: 'var(--c-accent)', cursor: 'pointer' }}
        />
        <span className="text-[10px] shrink-0" style={{ color: 'var(--c-text5)', minWidth: '2.5rem' }}>
          {stylePreset?.dialogueGap ?? '7em'}
        </span>

        <div className="ml-auto shrink-0">
          <button
            onClick={onToggleTheme}
            style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, background: 'transparent', border: '1px solid var(--c-border3)', color: 'var(--c-text3)', cursor: 'pointer' }}
            title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
          >
            {isDark ? '☀ 라이트' : '🌙 다크'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuButton({ label, onClick, disabled, accent, fixedWidth, title, style: extraStyle }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '3px 10px', borderRadius: 4, fontSize: 11,
        color: accent ? 'var(--c-accent)' : 'var(--c-text3)',
        border: `1px solid ${accent ? 'var(--c-accent)' : 'var(--c-border3)'}`,
        background: 'transparent',
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
        ...(fixedWidth ? { minWidth: fixedWidth, maxWidth: fixedWidth, textAlign: 'center' } : {}),
        ...extraStyle,
      }}
    >
      {label}
    </button>
  );
}


// ─── CollapseButton ───────────────────────────────────────────────────────────
function CollapseButton({ side, collapsed, onToggle }) {
  const isOpen = !collapsed;
  // 왼쪽 패널: 열림=‹ 닫힘=›  /  오른쪽 패널: 열림=› 닫힘=‹
  const icon = side === 'left'
    ? (isOpen ? '‹' : '›')
    : (isOpen ? '›' : '‹');

  return (
    <div
      style={{
        width: '18px', flexShrink: 0, position: 'relative',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '40px', zIndex: 10,
      }}
    >
      <button
        onClick={onToggle}
        title={collapsed ? '패널 열기' : '패널 닫기'}
        style={{
          width: '20px', height: '52px',
          border: '1px solid var(--c-border2)',
          borderRadius: '10px',
          background: 'var(--c-card)',
          color: 'var(--c-text2)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: 600, lineHeight: 1,
          transition: 'background 0.15s, color 0.15s, border-color 0.15s',
          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
          padding: 0,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--c-accent)';
          e.currentTarget.style.color = '#fff';
          e.currentTarget.style.borderColor = 'var(--c-accent)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'var(--c-panel)';
          e.currentTarget.style.color = 'var(--c-text4)';
          e.currentTarget.style.borderColor = 'var(--c-border3)';
        }}
      >
        {icon}
      </button>
    </div>
  );
}

// ─── MobileScriptTab ─────────────────────────────────────────────────────────
function MobileScriptTab() {
  const { state, dispatch } = useApp();
  const { projects, episodes, activeProjectId, activeEpisodeId, activeDoc } = state;
  const [addingProject, setAddingProject] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjType, setNewProjType] = useState('series'); // 'series' | 'single'

  // ── swipe-to-delete state ──────────────────────────────────────────────────
  const [swipedId, setSwipedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, type: 'project'|'episode' }
  const [deleteText, setDeleteText] = useState('');
  const touchStartX = useRef({});

  const handleTouchStart = (id, e) => {
    touchStartX.current[id] = e.touches[0].clientX;
  };

  const handleTouchEnd = (id, e) => {
    const startX = touchStartX.current[id];
    if (startX === undefined) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (dx < -60) {
      setSwipedId(id);
    } else if (dx > 20 && swipedId === id) {
      setSwipedId(null);
    }
    delete touchStartX.current[id];
  };

  const openDeleteConfirm = (id, type, e) => {
    e.stopPropagation();
    setSwipedId(null);
    setDeleteTarget({ id, type });
    setDeleteText('');
  };

  const confirmDelete = () => {
    if (deleteText !== '삭제' || !deleteTarget) return;
    if (deleteTarget.type === 'project') dispatch({ type: 'DELETE_PROJECT', id: deleteTarget.id });
    else dispatch({ type: 'DELETE_EPISODE', id: deleteTarget.id });
    setDeleteTarget(null);
    setDeleteText('');
  };

  const submitNewProject = () => {
    if (!newProjName.trim()) return;
    const p = { id: genId(), title: newProjName.trim(), genre: '', status: 'draft', projectType: newProjType, createdAt: now(), updatedAt: now() };
    dispatch({ type: 'ADD_PROJECT', payload: p });
    dispatch({ type: 'SET_ACTIVE_PROJECT', id: p.id });
    setAddingProject(false);
    setNewProjName('');
    setNewProjType('series');
  };

  return (
    <div style={{ paddingBottom: 16 }}>
      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}
          onClick={() => { setDeleteTarget(null); setDeleteText(''); }}
        >
          <div
            style={{ background: 'var(--c-panel)', borderRadius: 12, padding: 20, width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>정말 삭제하시겠어요?</div>
            <div style={{ fontSize: 13, color: 'var(--c-text4)' }}>아래에 <strong>삭제</strong>를 입력하면 삭제됩니다</div>
            <input
              autoFocus
              className="m-input"
              value={deleteText}
              onChange={e => setDeleteText(e.target.value)}
              placeholder="삭제"
              onKeyDown={e => {
                if (e.key === 'Enter') confirmDelete();
                if (e.key === 'Escape') { setDeleteTarget(null); setDeleteText(''); }
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="m-btn"
                style={{ flex: 1 }}
                onClick={() => { setDeleteTarget(null); setDeleteText(''); }}
              >취소</button>
              <button
                className="m-btn"
                style={{
                  flex: 1,
                  background: deleteText === '삭제' ? '#e53935' : 'var(--c-border3)',
                  color: deleteText === '삭제' ? '#fff' : 'var(--c-text6)',
                  cursor: deleteText === '삭제' ? 'pointer' : 'not-allowed',
                  border: 'none',
                }}
                onClick={confirmDelete}
              >삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 새 작품 */}
      <div className="m-item accent" onClick={() => { setAddingProject(true); setNewProjName(''); setNewProjType('series'); }}>+ 새 작품</div>

      {addingProject && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-panel)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            autoFocus
            placeholder="작품명 입력"
            className="m-input"
            value={newProjName}
            onChange={e => setNewProjName(e.target.value)}
            onKeyDown={e => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') submitNewProject();
              if (e.key === 'Escape') setAddingProject(false);
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ v: 'series', label: '미니시리즈' }, { v: 'single', label: '단막' }].map(({ v, label }) => (
              <button
                key={v}
                onClick={() => setNewProjType(v)}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 'clamp(11px, 3vw, 13px)',
                  border: `1px solid ${newProjType === v ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                  background: newProjType === v ? 'var(--c-accent)' : 'transparent',
                  color: newProjType === v ? '#fff' : 'var(--c-text4)',
                  cursor: 'pointer',
                }}
              >{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="m-btn primary" style={{ flex: 1 }} onClick={submitNewProject}>만들기</button>
            <button className="m-btn" onClick={() => setAddingProject(false)}>취소</button>
          </div>
        </div>
      )}

      {projects.map(project => {
        const isActive = project.id === activeProjectId;
        const epList = episodes.filter(e => e.projectId === project.id).sort((a, b) => a.number - b.number);
        const projActive = isActive && !activeEpisodeId && activeDoc !== 'cover' && activeDoc !== 'synopsis';
        return (
          <div key={project.id}>
            <div style={{ position: 'relative', overflow: 'hidden' }}>
              <div
                className={`m-item${projActive ? ' active' : ''}`}
                style={{ transform: swipedId === project.id ? 'translateX(-80px)' : 'translateX(0)', transition: 'transform 0.2s' }}
                onClick={() => { if (swipedId === project.id) { setSwipedId(null); return; } dispatch({ type: 'SET_ACTIVE_PROJECT', id: project.id }); }}
                onTouchStart={e => handleTouchStart(project.id, e)}
                onTouchEnd={e => handleTouchEnd(project.id, e)}
              >
                <span className="m-text-xs">📁</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.title}</span>
              </div>
              {swipedId === project.id && (
                <button
                  style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 80, background: '#e53935', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  onClick={e => openDeleteConfirm(project.id, 'project', e)}
                >삭제</button>
              )}
            </div>

            {isActive && <>
              <div className={`m-item sub${activeDoc === 'cover' && !activeEpisodeId ? ' active' : ''}`}
                onClick={() => { dispatch({ type: 'SET_ACTIVE_PROJECT', id: project.id }); dispatch({ type: 'SET_ACTIVE_DOC', payload: 'cover' }); }}
              >표지</div>
              <div className={`m-item sub${activeDoc === 'synopsis' ? ' active' : ''}`}
                onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'synopsis' })}
              >작품 시놉시스</div>

              {epList.map(ep => {
                const isEpActive = activeEpisodeId === ep.id && activeDoc === 'script';
                return (
                  <div key={ep.id} style={{ position: 'relative', overflow: 'hidden' }}>
                    <div
                      className={`m-item sub${isEpActive ? ' active' : ''}`}
                      style={{ gap: 6, transform: swipedId === ep.id ? 'translateX(-80px)' : 'translateX(0)', transition: 'transform 0.2s' }}
                      onClick={() => { if (swipedId === ep.id) { setSwipedId(null); return; } dispatch({ type: 'SET_ACTIVE_EPISODE', id: ep.id }); }}
                      onTouchStart={e => handleTouchStart(ep.id, e)}
                      onTouchEnd={e => handleTouchEnd(ep.id, e)}
                    >
                      {project.projectType !== 'single' && (
                        <span className="m-text-xs" style={{ flexShrink: 0 }}>{ep.number}회</span>
                      )}
                      {isEpActive ? (
                        <input
                          className="m-input"
                          style={{ flex: 1, padding: '2px 6px', fontSize: 'inherit' }}
                          value={ep.title}
                          placeholder="제목 없음"
                          onClick={e => e.stopPropagation()}
                          onChange={e => dispatch({ type: 'UPDATE_EPISODE', payload: { id: ep.id, title: e.target.value } })}
                          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                        />
                      ) : (
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ep.title || <span className="m-text-xs" style={{ fontStyle: 'italic' }}>제목 없음</span>}
                        </span>
                      )}
                    </div>
                    {swipedId === ep.id && (
                      <button
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 80, background: '#e53935', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                        onClick={e => openDeleteConfirm(ep.id, 'episode', e)}
                      >삭제</button>
                    )}
                  </div>
                );
              })}

              <div className="m-item sub m-text-xs"
                onClick={() => {
                  const num = epList.length + 1;
                  const ep = { id: genId(), projectId: project.id, number: num, title: '', majorEpisodes: '', summaryItems: [], status: 'draft', createdAt: now(), updatedAt: now() };
                  dispatch({ type: 'ADD_EPISODE', payload: ep });
                  dispatch({ type: 'SET_ACTIVE_EPISODE', id: ep.id });
                }}
              >{project.projectType === 'single' ? '+ 추가' : '+ 회차 추가'}</div>
            </>}
          </div>
        );
      })}

      {projects.length === 0 && !addingProject && (
        <div className="m-empty">위 버튼으로 첫 작품을 만들어보세요</div>
      )}
    </div>
  );
}

// ─── MobileMemoTab ────────────────────────────────────────────────────────────
// 모바일 전용 메모 탭: 체크리스트 + 코멘트
function MobileMemoTab() {
  const { state, dispatch } = useApp();
  const { checklistItems, activeProjectId, activeDoc, activeEpisodeId } = state;
  const [inputVal, setInputVal] = useState('');

  const docKey = activeEpisodeId ? `ep-${activeEpisodeId}` : (activeDoc || 'default');
  const storageKey = `drama_docMemo_${activeProjectId}_${docKey}`;
  const [memo, setMemo] = useState(() => {
    try { return localStorage.getItem(storageKey) || ''; } catch { return ''; }
  });
  useEffect(() => {
    try { setMemo(localStorage.getItem(storageKey) || ''); } catch {}
  }, [storageKey]);
  const memoTimer = useRef(null);
  const saveMemo = (val) => {
    setMemo(val);
    clearTimeout(memoTimer.current);
    memoTimer.current = setTimeout(() => {
      try { localStorage.setItem(storageKey, val); } catch {}
    }, 400);
  };

  const items = checklistItems.filter(it => it.projectId === activeProjectId && !it.docId);
  const pending = items.filter(it => !it.done);
  const done    = items.filter(it => it.done);

  const addItem = () => {
    const text = inputVal.trim();
    if (!text || !activeProjectId) return;
    dispatch({ type: 'ADD_CHECKLIST_ITEM', payload: { id: genId(), projectId: activeProjectId, docId: null, text, done: false, createdAt: now() } });
    setInputVal('');
  };

  if (!activeProjectId) {
    return <div className="m-empty">작품을 선택하세요</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Checklist */}
      <div style={{ padding: '4px var(--m-pad-x)', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <input
            className="m-input"
            style={{ padding: '5px 10px' }}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') addItem(); }}
            placeholder="항목 추가..."
          />
          <button onClick={addItem} className="m-btn primary" style={{ flexShrink: 0, fontSize: 15, padding: '0 12px' }}>+</button>
        </div>
        {[...pending, ...done].map(it => (
          <div key={it.id} className="m-checklist-row" style={{ padding: '6px 0' }}>
            <button
              className={`m-check-box${it.done ? ' done' : ''}`}
              onClick={() => dispatch({ type: 'UPDATE_CHECKLIST_ITEM', payload: { id: it.id, done: !it.done } })}
            >{it.done && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}</button>
            <span className="m-text-base" style={{ flex: 1, textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--c-text6)' : undefined }}>{it.text}</span>
            <button onClick={() => dispatch({ type: 'DELETE_CHECKLIST_ITEM', id: it.id })} style={{ background: 'none', border: 'none', color: 'var(--c-text6)', cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>×</button>
          </div>
        ))}
        {items.length === 0 && <div className="m-text-xs" style={{ padding: '4px 0' }}>항목이 없습니다</div>}
      </div>

    </div>
  );
}

// ─── MobileMenuBar ────────────────────────────────────────────────────────────
function MobileMenuBar({ onSave, onPrintPreview }) {
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
        alignItems: 'center', padding: '0 14px',
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
              position: 'absolute', top: 'calc(100% + 4px)', left: 0,
              background: 'var(--c-panel)', border: '1px solid var(--c-border)',
              borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              zIndex: 300, minWidth: 180, padding: '6px 0',
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
          {activeProjectId && (
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
        padding: '0 12px', gap: 6,
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

// ─── MobileBottomPanel ────────────────────────────────────────────────────────
// 4-tab bottom sheet: 대본(LeftPanel) / 자료 / 설계 / 메모(RightPanel)
function MobileBottomPanel({ open, onToggle, tab, onTabChange, onScrollToScene }) {
  const { state, dispatch } = useApp();
  const { activeDoc } = state;

  // Swipe up = open, swipe down = close
  const touchStartY = useRef(null);
  const handleTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e) => {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    if (Math.abs(dy) < 20) return;
    if (dy < 0 && !open) onToggle();
    if (dy > 0 && open)  onToggle();
  };

  // Keyboard detection: auto-collapse panel when software keyboard appears
  const openRef     = useRef(open);
  const toggleRef   = useRef(onToggle);
  openRef.current   = open;
  toggleRef.current = onToggle;
  useEffect(() => {
    if (!window.visualViewport) return;
    const savedState = { wasOpen: false };
    const handler = () => {
      const keyboardUp = (window.visualViewport.height / window.screen.height) < 0.75;
      if (keyboardUp && openRef.current && !savedState.wasOpen) {
        savedState.wasOpen = true;
        toggleRef.current();
      } else if (!keyboardUp && savedState.wasOpen) {
        savedState.wasOpen = false;
        toggleRef.current();
      }
    };
    window.visualViewport.addEventListener('resize', handler);
    return () => window.visualViewport.removeEventListener('resize', handler);
  }, []);

  const TABS = [
    { id: 'script', icon: '📝', label: '대본' },
    { id: 'data',   icon: '👤', label: '자료' },
    { id: 'plan',   icon: '🗂',  label: '설계' },
    { id: 'memo',   icon: '✏️',  label: '메모' },
  ];

  const DATA_DOCS = [
    { doc: 'characters',    label: '인물' },
    { doc: 'biography',     label: '인물이력서' },
    { doc: 'relationships', label: '인물관계도' },
    { doc: 'resources',     label: '자료수집' },
  ];
  const PLAN_DOCS = [
    { doc: 'structure',  label: '구조' },
    { doc: 'treatment',  label: '트리트먼트' },
    { doc: 'scenelist',  label: '씬리스트' },
  ];

  const tabH = 'clamp(52px, 14vw, 64px)';


  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        display: 'flex', flexDirection: 'column',
        height: open ? '46%' : tabH,
        transition: 'height 0.25s ease',
        overflow: 'hidden',
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Tab bar */}
      <div style={{
        height: tabH, minHeight: tabH, flexShrink: 0,
        display: 'flex', alignItems: 'stretch',
        borderBottom: open ? '1px solid var(--c-border2)' : 'none',
      }}>
        {TABS.map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => { onTabChange(id); if (!open) onToggle(); }}
            style={{
              flex: 1, background: tab === id && open ? 'var(--c-active)' : 'none',
              border: 'none', borderRight: '1px solid var(--c-border)',
              cursor: 'pointer',
              color: tab === id && open ? 'var(--c-accent)' : 'var(--c-text5)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 4,
              WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            }}
          >
            <span style={{ fontSize: 'clamp(17px, 5vw, 22px)', lineHeight: 1 }}>{icon}</span>
            <span style={{ fontSize: 'clamp(10px, 2.8vw, 13px)', fontWeight: tab === id && open ? 600 : 400 }}>{label}</span>
          </button>
        ))}
        {/* Toggle button */}
        <button
          onClick={onToggle}
          onContextMenu={e => e.preventDefault()}
          style={{
            background: 'none', border: 'none',
            borderLeft: '1px solid var(--c-border)',
            color: 'var(--c-text5)', fontSize: 'clamp(13px, 4vw, 17px)',
            padding: '0 14px', cursor: 'pointer', flexShrink: 0,
            WebkitTapHighlightColor: 'transparent',
          }}
        >{open ? '▾' : '▴'}</button>
      </div>

      {/* Panel content */}
      {open && (
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0, touchAction: 'pan-y' }}>
          {tab === 'script' && (
            <div data-tour-id="left-panel" className="m-panel-content" style={{ height: '100%', overflowY: 'auto' }}>
              <MobileScriptTab />
            </div>
          )}
          {tab === 'data' && (
            <div className="m-panel-content">
              {DATA_DOCS.map(({ doc, label }, i) => (
                <div
                  key={`${doc}-${i}`}
                  className={`m-item${activeDoc === doc ? ' active' : ''}`}
                  onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: doc })}
                >
                  {label}
                </div>
              ))}
            </div>
          )}
          {tab === 'plan' && (
            <div className="m-panel-content">
              {PLAN_DOCS.map(({ doc, label }) => (
                <div
                  key={doc}
                  className={`m-item${activeDoc === doc ? ' active' : ''}`}
                  onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: doc })}
                >
                  {label}
                </div>
              ))}
            </div>
          )}
          {tab === 'memo' && <div className="m-panel-content" style={{ height: '100%' }}><MobileMemoTab /></div>}
        </div>
      )}
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────
function Shell() {
  const [scrollToSceneId, setScrollToSceneId] = useState(null);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('drama_theme');
    if (saved !== null) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const { state, dispatch } = useApp();

  // Panel widths with localStorage persistence
  const [panelWidths, setPanelWidths] = useState(() => loadPanelWidths());

  // ── Responsive breakpoint: track window width
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1280;

  // ── Tablet panel collapse state
  const [leftCollapsed,  setLeftCollapsed]  = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // 트리트먼트·씬리스트 페이지 전환 시 오른쪽 패널 자동 닫기
  useEffect(() => {
    const { activeDoc } = state;
    if (activeDoc === 'treatment' || activeDoc === 'scenelist') {
      setRightCollapsed(true);
    }
  }, [state.activeDoc]);

  // ── Mobile bottom panel state
  const [mobileBottomOpen, setMobileBottomOpen] = useState(true);
  const [mobileTab, setMobileTab]               = useState('script');

  useEffect(() => {
    if (state.activeDoc === 'mypage') setMobileBottomOpen(false);
  }, [state.activeDoc]);

  const updateLeftWidth = useCallback((delta) => {
    setPanelWidths(prev => {
      const next = { ...prev, left: Math.min(MAX_LEFT, Math.max(MIN_LEFT, prev.left + delta)) };
      setItem(PANEL_WIDTHS_KEY, next);
      return next;
    });
  }, []);

  const updateRightWidth = useCallback((delta) => {
    setPanelWidths(prev => {
      const next = { ...prev, right: Math.min(MAX_RIGHT, Math.max(MIN_RIGHT, prev.right - delta)) };
      setItem(PANEL_WIDTHS_KEY, next);
      return next;
    });
  }, []);

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y — only when not in a text input/textarea/contenteditable
  useEffect(() => {
    const onKey = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isText = tag === 'input' || tag === 'textarea' ||
                     document.activeElement?.isContentEditable;
      if (isText) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  // Apply theme on mount and whenever isDark changes
  useEffect(() => {
    const theme = isDark ? 'dark' : 'light';
    document.getElementById('root').dataset.theme = theme;
  }, [isDark]);

  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      localStorage.setItem('drama_theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  const [saveToast, setSaveToast] = useState(false);
  const saveToastTimer = useRef(null);

  const handleSave = useCallback(() => {
    window.dispatchEvent(new Event('script:requestSave'));
    clearTimeout(saveToastTimer.current);
    setSaveToast(true);
    saveToastTimer.current = setTimeout(() => setSaveToast(false), 2000);
  }, []);

  // 전역 Ctrl+S 단축키 → 토스트 포함 저장
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS' && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave]);

  const contextSceneId = state.scrollToSceneId;
  useEffect(() => {
    if (contextSceneId) {
      setScrollToSceneId(contextSceneId);
      dispatch({ type: 'SET_SCROLL_TO_SCENE', id: null });
    }
  }, [contextSceneId, dispatch]);

  const menuBar = (
    <MenuBar
      isDark={isDark}
      onToggleTheme={toggleTheme}
      onPrintPreview={() => setPrintPreviewOpen(true)}
      onSave={handleSave}
    />
  );
  const modals = (
    <>
      {printPreviewOpen && <PrintPreviewModal onClose={() => setPrintPreviewOpen(false)} />}
      <OnboardingTour />
      {saveToast && (
        <div style={{
          position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--c-accent)', color: '#fff',
          padding: '8px 20px', borderRadius: '8px',
          fontSize: '13px', zIndex: 9999,
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
          pointerEvents: 'none',
        }}>
          저장되었습니다
        </div>
      )}
    </>
  );

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div
        className="mobile-layout w-screen flex flex-col overflow-hidden"
        style={{
          background: 'var(--c-bg)',
          height: '100dvh',
          padding: '0 16px',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <MobileMenuBar
          onSave={handleSave}
          onPrintPreview={() => setPrintPreviewOpen(true)}
        />
        <div data-tour-id="center-panel" className="flex-1 min-h-0 overflow-hidden">
          <CenterPanel scrollToSceneId={scrollToSceneId} onScrollHandled={() => setScrollToSceneId(null)} />
        </div>
        {/* 광고: 하단 패널 닫혔을 때만 표시 */}
        <div style={{ flexShrink: 0, overflow: 'hidden', height: mobileBottomOpen ? 0 : 'auto' }}>
          <AdBanner slot="mobile-bottom" mobileHide={false} height={60} />
        </div>
        <MobileBottomPanel
          open={mobileBottomOpen}
          onToggle={() => setMobileBottomOpen(v => !v)}
          tab={mobileTab}
          onTabChange={setMobileTab}
          onScrollToScene={id => setScrollToSceneId(id)}
        />
        {modals}
      </div>
    );
  }

  // ── Tablet layout ──────────────────────────────────────────────────────────
  if (isTablet) {
    return (
      <div className="h-dvh w-screen flex flex-col overflow-hidden" style={{ background: 'var(--c-bg)' }}>
        {menuBar}
        <div className="flex flex-1 min-h-0">
          <CollapseButton side="left" collapsed={leftCollapsed} onToggle={() => setLeftCollapsed(v => !v)} />

          {!leftCollapsed && (
            <>
              <div data-tour-id="left-panel" style={{ width: panelWidths.left, flexShrink: 0, overflow: 'hidden' }}>
                <LeftPanel />
              </div>
              <DragHandle onDrag={updateLeftWidth} isLeft />
            </>
          )}

          <div data-tour-id="center-panel" className="flex-1 min-w-0 overflow-hidden">
            <CenterPanel scrollToSceneId={scrollToSceneId} onScrollHandled={() => setScrollToSceneId(null)} />
          </div>

          {!rightCollapsed && (
            <>
              <DragHandle onDrag={updateRightWidth} />
              <div data-tour-id="right-panel" style={{ width: panelWidths.right, flexShrink: 0, overflow: 'hidden' }}>
                <RightPanel onScrollToScene={id => setScrollToSceneId(id)} />
              </div>
            </>
          )}

          <CollapseButton side="right" collapsed={rightCollapsed} onToggle={() => setRightCollapsed(v => !v)} />
        </div>

        <AdBanner
          slot="bottom-fixed"
          mobileHide={false}
          height={48}
          className="no-print"
          style={{ margin: '0 8px 6px', borderRadius: 6 }}
        />

        {modals}
      </div>
    );
  }

  // ── PC layout (≥1280px) ────────────────────────────────────────────────────
  return (
    <div
      className="h-dvh w-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--c-bg)' }}
    >
      {menuBar}

      <div className="flex flex-1 min-h-0">
        <div data-tour-id="left-panel" style={{ width: panelWidths.left, flexShrink: 0, overflow: 'hidden' }}>
          <LeftPanel />
        </div>

        <DragHandle onDrag={updateLeftWidth} isLeft />

        <div data-tour-id="center-panel" className="flex-1 min-w-0 overflow-hidden">
          <CenterPanel
            scrollToSceneId={scrollToSceneId}
            onScrollHandled={() => setScrollToSceneId(null)}
          />
        </div>

        <CollapseButton side="right" collapsed={rightCollapsed} onToggle={() => setRightCollapsed(v => !v)} />

        {!rightCollapsed && (
          <>
            <DragHandle onDrag={updateRightWidth} />
            <div data-tour-id="right-panel" style={{ width: panelWidths.right, flexShrink: 0, overflow: 'hidden' }}>
              <RightPanel onScrollToScene={id => setScrollToSceneId(id)} />
            </div>
          </>
        )}
      </div>

      <AdBanner
        slot="bottom-fixed"
        mobileHide={false}
        height={48}
        className="no-print"
        style={{ margin: '0 8px 6px', borderRadius: 6 }}
      />

      {modals}
    </div>
  );
}

// ─── LogShareView — 읽기 전용 작업통계 ────────────────────────────────────────
function LogShareView() {
  const hash = window.location.hash;
  let data = null;
  try {
    data = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(hash.slice(5))))));
  } catch { /* decode 실패 */ }

  if (!data || data.type !== 'log-export') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#888' }}>
        유효하지 않은 링크입니다.
      </div>
    );
  }

  const { logs = [], projects = [], exportedAt } = data;
  const totalSec = logs.reduce((s, l) => s + (l.activeDurationSec || 0), 0);
  const totalDays = new Set(logs.map(l => l.dateKey)).size;
  const sorted = [...logs].sort((a, b) => b.completedAt - a.completedAt);

  const fmt = (sec) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}시간 ${m}분`;
    if (m > 0) return `${m}분 ${sec % 60}초`;
    return `${sec % 60}초`;
  };
  const fmtTs = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const s = { fontFamily: 'Pretendard, Apple SD Gothic Neo, sans-serif', maxWidth: 640, margin: '0 auto', padding: '40px 24px', color: '#1a1a1a' };

  return (
    <div style={s}>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>작업 기록 증빙</div>
      {exportedAt && <div style={{ fontSize: 12, color: '#999', marginBottom: 24 }}>내보내기: {fmtTs(exportedAt)}</div>}

      <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
        {[['총 작업시간', fmt(totalSec)], ['작업 일수', `${totalDays}일`], ['세션 수', `${logs.length}회`]].map(([label, val]) => (
          <div key={label} style={{ flex: 1, border: '1px solid #e0e0e0', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#555' }}>세션 목록</div>
      <div style={{ border: '1px solid #e8e8e8', borderRadius: 8, overflow: 'hidden' }}>
        {sorted.map((log, i) => {
          const proj = projects.find(p => p.id === log.projectId);
          const snapshot = log.completedChecklistSnapshot || [];
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 16px', borderBottom: i < sorted.length - 1 ? '1px solid #f0f0f0' : 'none', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <span style={{ fontSize: 11, color: '#999', minWidth: 120, flexShrink: 0 }}>{fmtTs(log.completedAt)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>{proj?.title || '삭제된 작품'}</div>
                {snapshot.length > 0 && (
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                    완료: {snapshot.map(s => s.text).join(', ')}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#5a5af5', flexShrink: 0 }}>{fmt(log.activeDurationSec || 0)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  if (window.location.hash.startsWith('#review=')) {
    return <SharedReviewView />;
  }
  if (window.location.hash.startsWith('#log=')) {
    return <LogShareView />;
  }
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
