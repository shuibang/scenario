import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import {
  FONTS,
  FONT_STATUS,
  checkFontsAvailability,
  getFontPdfStatus,
  getFontByCssFamily,
} from './print/FontRegistry';
import { getItem, setItem, clearDramaStorage, isPublicPcMode } from './store/db';
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
function buildShareURL(state) {
  const { projects, episodes, characters, scenes, scriptBlocks, coverDocs, synopsisDocs, activeProjectId } = state;
  // Only share data for the active project
  const payload = {
    projects:     projects.filter(p => p.id === activeProjectId),
    episodes:     episodes.filter(e => e.projectId === activeProjectId),
    characters:   characters.filter(c => c.projectId === activeProjectId),
    scenes:       scenes.filter(s => s.projectId === activeProjectId),
    scriptBlocks: scriptBlocks.filter(b => b.projectId === activeProjectId),
    coverDocs:    coverDocs.filter(d => d.projectId === activeProjectId),
    synopsisDocs: synopsisDocs.filter(d => d.projectId === activeProjectId),
  };
  const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(payload)))));
  return `${window.location.origin}${window.location.pathname}#share=${encoded}`;
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
        className="text-[10px] px-1.5 py-0.5 rounded"
        style={{ background: 'var(--c-tag)', color: 'var(--c-text5)', border: '1px solid var(--c-border3)', cursor: 'pointer' }}
      >
        완료
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
          onLogin?.({ name: payload.name, email: payload.email, picture: payload.picture });
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
          <div className="text-xs text-center py-2 rounded" style={{ color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a' }}>
            VITE_GOOGLE_CLIENT_ID 환경변수가 설정되지 않았습니다.<br />
            <code className="text-[10px]">.env</code> 파일에 추가하세요.
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
  const [shareMsg, setShareMsg]          = useState('');
  const [fontAvailability, setFontAvail] = useState(null);
  const [loginOpen, setLoginOpen]        = useState(false);
  const [authUser, setAuthUser]          = useState(null);

  useEffect(() => {
    checkFontsAvailability().then(setFontAvail);
  }, []);

  const handleShare = async () => {
    if (!activeProjectId) return;
    const url = buildShareURL(state);
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg('링크 복사됨');
    } catch {
      const inp = document.createElement('input');
      inp.value = url;
      document.body.appendChild(inp);
      inp.select();
      document.execCommand('copy');
      document.body.removeChild(inp);
      setShareMsg('링크 복사됨');
    }
    setTimeout(() => setShareMsg(''), 2500);
  };

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

      {/* ── Row 1: identity + login + clock + timer + complete + theme ── */}
      <div className="h-9 flex items-center px-4 gap-2 overflow-x-auto" style={{ borderBottom: '1px solid var(--c-border2)', scrollbarWidth: 'none' }}>
        <span className="text-xs font-bold tracking-wider shrink-0" style={{ color: 'var(--c-accent)' }}>
          대본 작업실
        </span>

        {authUser ? (
          <div className="flex items-center gap-1.5 shrink-0">
            {authUser.picture && <img src={authUser.picture} alt="" className="w-5 h-5 rounded-full" />}
            <span className="text-xs" style={{ color: 'var(--c-text3)' }}>{authUser.name}</span>
            <button onClick={() => {
                if (isPublicPcMode()) clearDramaStorage();
                setAuthUser(null);
              }}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'transparent', border: '1px solid var(--c-border3)', color: 'var(--c-text6)', cursor: 'pointer' }}>
              로그아웃
            </button>
          </div>
        ) : (
          <>
            <button onClick={() => setLoginOpen(true)}
              className="px-2 py-0.5 rounded text-xs shrink-0"
              style={{ background: 'transparent', border: '1px solid var(--c-border3)', color: 'var(--c-text4)', cursor: 'pointer' }}>
              로그인
            </button>
            <button onClick={() => setLoginOpen(true)}
              className="px-2 py-0.5 rounded text-xs shrink-0"
              style={{ background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>
              회원가입
            </button>
          </>
        )}
        <button
          onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'mypage' })}
          className="px-2 py-0.5 rounded text-xs shrink-0"
          style={{ background: 'transparent', border: '1px solid var(--c-border3)', color: 'var(--c-text4)', cursor: 'pointer' }}
        >
          마이페이지
        </button>

        <Breadcrumb />

        <div className="ml-auto flex items-center gap-3 shrink-0">
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
        <MenuButton label={shareMsg || '공유'} onClick={handleShare} disabled={!activeProjectId} fixedWidth="4rem" />
        <MenuButton label="출력 미리보기" onClick={onPrintPreview} disabled={!activeProjectId} accent />

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

        <div className="ml-auto shrink-0">
          <button
            onClick={onToggleTheme}
            className="px-2 py-0.5 rounded text-xs transition-colors"
            style={{ background: 'transparent', border: '1px solid var(--c-border3)', color: 'var(--c-text3)', cursor: 'pointer' }}
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
      className="px-2.5 py-1 rounded text-xs transition-colors shrink-0"
      style={{
        color: accent ? 'var(--c-accent)' : 'var(--c-text3)',
        border: `1px solid ${accent ? 'var(--c-accent)' : 'var(--c-border3)'}`,
        background: 'transparent',
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...(fixedWidth ? { minWidth: fixedWidth, maxWidth: fixedWidth, textAlign: 'center' } : {}),
        ...extraStyle,
      }}
    >
      {label}
    </button>
  );
}

function Breadcrumb() {
  const { state } = useApp();
  const { projects, activeProjectId, activeEpisodeId, episodes } = state;
  const project = projects.find(p => p.id === activeProjectId);
  const episode = episodes.find(e => e.id === activeEpisodeId);
  return (
    <div className="ml-auto flex items-center gap-1 text-xs" style={{ color: 'var(--c-text6)' }}>
      {project && <span style={{ color: 'var(--c-text4)' }}>{project.title}</span>}
      {episode && <>
        <span style={{ color: 'var(--c-dim)' }}>/</span>
        <span style={{ color: 'var(--c-text5)' }}>{episode.number}회 {episode.title || ''}</span>
      </>}
    </div>
  );
}

// ─── CollapseButton ───────────────────────────────────────────────────────────
// Thin vertical strip used on tablet to collapse/expand left or right panel
function CollapseButton({ side, collapsed, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={collapsed ? '패널 펼치기' : '패널 접기'}
      style={{
        width: '14px', flexShrink: 0, border: 'none', cursor: 'pointer',
        background: 'var(--c-border2)', color: 'var(--c-text6)', fontSize: '9px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.1s', zIndex: 10,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-accent)'; e.currentTarget.style.opacity = '0.5'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--c-border2)'; e.currentTarget.style.opacity = '1'; }}
    >
      {side === 'left' ? (collapsed ? '›' : '‹') : (collapsed ? '‹' : '›')}
    </button>
  );
}

// ─── MobileBottomPanel ────────────────────────────────────────────────────────
// Bottom sheet with 탐색 (LeftPanel) / 보조 (RightPanel) tabs for mobile
function MobileBottomPanel({ open, onToggle, tab, onTabChange, onScrollToScene }) {
  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        display: 'flex',
        flexDirection: 'column',
        height: open ? '45dvh' : '40px',
        minHeight: open ? '45dvh' : '40px',
        transition: 'height 0.2s ease, min-height 0.2s ease',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          height: '40px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: '2px',
          padding: '0 10px',
          borderBottom: open ? '1px solid var(--c-border2)' : 'none',
        }}
      >
        <button
          onClick={onToggle}
          onContextMenu={e => e.preventDefault()}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--c-text5)', fontSize: '14px',
            padding: '4px 6px', marginRight: '6px', lineHeight: 1,
          }}
          title={open ? '보조 패널 접기' : '보조 패널 펼치기'}
        >
          {open ? '▾' : '▴'}
        </button>

        {[{ id: 'nav', label: '탐색' }, { id: 'context', label: '보조' }].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => { onTabChange(id); if (!open) onToggle(); }}
            style={{
              background: tab === id && open ? 'var(--c-active)' : 'none',
              border: 'none', cursor: 'pointer',
              color: tab === id && open ? 'var(--c-accent)' : 'var(--c-text5)',
              fontSize: '13px', fontWeight: tab === id && open ? 600 : 400,
              padding: '4px 14px', borderRadius: '6px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      {open && (
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {tab === 'nav'
            ? <div data-tour-id="left-panel" style={{ height: '100%' }}><LeftPanel /></div>
            : <div data-tour-id="right-panel" style={{ height: '100%' }}><RightPanel onScrollToScene={onScrollToScene} /></div>
          }
        </div>
      )}
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────
function Shell() {
  const [scrollToSceneId, setScrollToSceneId] = useState(null);
  const [isDark, setIsDark] = useState(true);
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

  // ── Mobile bottom panel state
  const [mobileBottomOpen, setMobileBottomOpen] = useState(true);
  const [mobileTab, setMobileTab]               = useState('nav');

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

  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      document.getElementById('root').dataset.theme = next ? 'dark' : 'light';
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
    setTimeout(() => dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' }), 400);
  }, [dispatch]);

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
    </>
  );

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="h-dvh w-screen flex flex-col overflow-hidden" style={{ background: 'var(--c-bg)' }}>
        {menuBar}
        <div data-tour-id="center-panel" className="flex-1 min-h-0 overflow-hidden">
          <CenterPanel scrollToSceneId={scrollToSceneId} onScrollHandled={() => setScrollToSceneId(null)} />
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

        <DragHandle onDrag={updateRightWidth} />

        <div data-tour-id="right-panel" style={{ width: panelWidths.right, flexShrink: 0, overflow: 'hidden' }}>
          <RightPanel onScrollToScene={id => setScrollToSceneId(id)} />
        </div>
      </div>

      {modals}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
