import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import LandingPage from './components/LandingPage';
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
import MobileOnboardingTour from './components/mobile/MobileOnboardingTour';
import SharedReviewView from './components/SharedReviewView';
import AdBanner from './components/AdBanner';
// ─── v2: extracted mobile components ──────────────────────────────────────────
import MobileMenuBar    from './components/mobile/MobileMenuBar';
import MobileBottomPanel from './components/mobile/MobileBottomPanel';
// ─── v2: shared utilities ─────────────────────────────────────────────────────
import { mobileTbtnStyle } from './styles/tokens';
import UpdateBanner from './components/UpdateBanner';
import { applyInlineFormat } from './utils/textFormat';
import { getLayoutMetrics } from './print/LineTokenizer';
import { saveReviewPayload } from './utils/reviewShare';

// ─── Panel width persistence ───────────────────────────────────────────────────
const PANEL_WIDTHS_KEY = 'panelWidths';
const MIN_LEFT = 150; const MAX_LEFT = 500;
const MIN_RIGHT = 150; const MAX_RIGHT = 500;

function loadPanelWidths() {
  const saved = getItem(PANEL_WIDTHS_KEY);
  if (saved && saved.left && saved.right) return saved;
  // 기본값: 창 너비의 20% (좌우 패널 각각), 결과적으로 본문 60%
  const w = window.innerWidth;
  const side = Math.round(w * 0.20);
  return {
    left:  Math.max(MIN_LEFT, Math.min(MAX_LEFT, side)),
    right: Math.max(MIN_RIGHT, Math.min(MAX_RIGHT, side)),
  };
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

// ─── Timeline Strip ───────────────────────────────────────────────────────────

function getTimelineColor(ratio) {
  // 0→0.85: 연한 라벤더(#c7d2fe) → 짙은 남색(#1e1b4b)
  // 0.85→1: 짙은 남색 → 살짝 옅은 인디고(#4338ca)
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const lerpColor = (c1, c2, t) => ({
    r: lerp(c1[0], c2[0], t),
    g: lerp(c1[1], c2[1], t),
    b: lerp(c1[2], c2[2], t),
  });
  const light  = [199, 210, 254]; // #c7d2fe indigo-200
  const dark   = [30,  46, 129];  // #1e2e81
  const mid    = [67,  56, 202];  // #4338ca indigo-700
  let c;
  if (ratio <= 0.85) {
    c = lerpColor(light, dark, ratio / 0.85);
  } else {
    c = lerpColor(dark, mid, (ratio - 0.85) / 0.15);
  }
  return `rgb(${c.r},${c.g},${c.b})`;
}

// 마커가 콘텐츠와 함께 스크롤되는 타임라인
function TimelineStrip({ scrollEl }) {
  const { state } = useApp();
  const [scrollTop, setScrollTop] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const activeProject = state.projects.find(p => p.id === state.activeProjectId);
  const activeEpisodeId = state.activeEpisodeId;
  const blocks = state.scriptBlocks.filter(b => b.episodeId === activeEpisodeId);
  const stylePreset = activeProject?.stylePreset || {};
  const targetMinutes = activeProject?.targetMinutes || 70;

  // ScriptEditor의 PageCounter와 동일한 로직으로 총 페이지 수 계산
  const totalPages = useMemo(() => {
    if (!blocks.length) return 1;
    const m = getLayoutMetrics(stylePreset);
    const { charsPerLine, charsInSpeech, linesPerPage, fontSize, lineHeight } = m;
    const lineHpt = fontSize * lineHeight;
    let total = 0;
    let prevType = null;
    total += ((fontSize + 2) * lineHeight + 14) / lineHpt + 1;
    for (const b of blocks) {
      if (prevType !== null && prevType !== b.type) total += 1;
      switch (b.type) {
        case 'scene_number':
          total += 1 + 12 / lineHpt;
          break;
        case 'action': {
          const lines = Math.max(1, Math.ceil((b.content?.length || 0) / (charsPerLine - 2)));
          total += lines * (1 + 1 / lineHpt);
          break;
        }
        case 'dialogue': {
          const lines = Math.max(1, Math.ceil((b.content?.length || 0) / charsInSpeech));
          total += lines * (1 + 1 / lineHpt);
          break;
        }
        default: {
          const lines = Math.max(1, Math.ceil((b.content?.length || 0) / charsPerLine));
          total += lines * (1 + 1 / lineHpt);
        }
      }
      prevType = b.type;
    }
    return Math.max(1, Math.ceil(total / linesPerPage));
  }, [blocks, stylePreset]);

  useEffect(() => {
    if (!scrollEl) return;
    const onScroll = () => setScrollTop(scrollEl.scrollTop);
    const ro = new ResizeObserver(() => setContentHeight(scrollEl.scrollHeight));
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(scrollEl);
    setScrollTop(scrollEl.scrollTop);
    setContentHeight(scrollEl.scrollHeight);
    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [scrollEl]);

  // 1분 = 1페이지 기준으로 각 마커의 픽셀 위치 계산
  const pxPerPage = contentHeight > 0 ? contentHeight / totalPages : 0;

  const markers = [];
  for (let m = 0; m <= targetMinutes; m++) {
    const top = m * pxPerPage;
    const ratio = m / Math.max(targetMinutes, 1);
    const color = getTimelineColor(ratio);
    const isLabel = m % 5 === 0;
    markers.push({ m, top, color, isLabel });
  }

  return (
    <div
      className="shrink-0 select-none no-print"
      style={{ width: 36, borderLeft: '1px solid var(--c-border)', background: 'var(--c-panel)', display: 'flex', flexDirection: 'column' }}
    >
      {/* 툴바와 높이 맞춤 헤더 */}
      <div style={{
        height: 37, flexShrink: 0,
        borderBottom: '1px solid var(--c-border2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontSize: 9, color: 'var(--c-text6)', letterSpacing: 1,
          writingMode: 'vertical-rl', transform: 'rotate(180deg)',
        }}>타임라인</span>
      </div>
      {/* 마커 영역 */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
      {/* contentHeight 높이의 내부 컨테이너를 scrollTop만큼 위로 이동 → 콘텐츠와 동기 스크롤 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: contentHeight,
        transform: `translateY(${-scrollTop}px)`,
        willChange: 'transform',
      }}>
        {markers.map(({ m, top, color, isLabel }) => (
          <div
            key={m}
            style={{
              position: 'absolute',
              top,
              left: 0,
              right: 0,
              height: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingRight: 4,
            }}
          >
            {isLabel ? (
              <span style={{
                fontSize: 9,
                color,
                fontWeight: 400,
                whiteSpace: 'nowrap',
                lineHeight: 1,
                opacity: 0.9,
              }}>
                {m}분
              </span>
            ) : (
              <span style={{
                display: 'inline-block',
                width: 3,
                height: 1,
                background: color,
                opacity: 0.5,
              }} />
            )}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

function ScriptWithTimeline({ scrollToSceneId, onScrollHandled, keyboardUp }) {
  const [scrollEl, setScrollEl] = useState(null);
  return (
    <div className="h-full flex flex-row min-h-0 overflow-hidden">
      <div className="flex-1 min-w-0 min-h-0">
        <ScriptEditor
          scrollToSceneId={scrollToSceneId}
          onScrollHandled={onScrollHandled}
          keyboardUp={keyboardUp}
          onScrollRefReady={(ref) => { setScrollEl(ref.current); }}
        />
      </div>
      <TimelineStrip scrollEl={scrollEl} />
    </div>
  );
}

// ─── Center panel ─────────────────────────────────────────────────────────────
function CenterPanel({ scrollToSceneId, onScrollHandled, keyboardUp }) {
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
    return <ScriptWithTimeline scrollToSceneId={scrollToSceneId} onScrollHandled={onScrollHandled} keyboardUp={keyboardUp} />;
  }
  return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--c-bg)' }}>
      <span style={{ color: 'var(--c-text5)' }} className="text-sm">좌측에서 문서를 선택하세요</span>
    </div>
  );
}

// ─── Share helper ─────────────────────────────────────────────────────────────
export async function buildReviewURL(state, selections) {
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
  const id = await saveReviewPayload(payload);
  return `${window.location.origin}${window.location.pathname}#review=${id}`;
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
    const events = ['keydown', 'mousedown', 'mousemove', 'scroll', 'dragstart', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }));
    resetIdle();

    // 창 포커스를 잃거나 탭이 숨겨지면 즉시 정지
    const pause = () => {
      activeRef.current = false;
      clearTimeout(idleTimer.current);
    };
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause();
    });

    tickTimer.current = setInterval(() => {
      if (activeRef.current) {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
      }
    }, 1000);
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdle));
      window.removeEventListener('blur', pause);
      clearTimeout(idleTimer.current);
      clearInterval(tickTimer.current);
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
  const onCloseRef = useRef(onClose);
  const onLoginRef = useRef(onLogin);
  onCloseRef.current = onClose;
  onLoginRef.current = onLogin;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        const payload = decodeJwt(response.credential);
        if (payload) {
          const userData = { name: payload.name, email: payload.email, picture: payload.picture };
          localStorage.setItem('drama_auth_user', JSON.stringify(userData));
          onLoginRef.current?.(userData);
          onCloseRef.current?.();
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
  }, []); // 마운트 1회만 실행 — onClose/onLogin은 ref로 참조

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

// ─── Drive 클라이언트 모듈-레벨 싱글턴 ─────────────────────────────────────────
// MenuBar가 breakpoint 전환으로 재마운트되어도 초기화·requestAccessToken을 1회만 실행
const _drive = { client: null, initialized: false, syncing: false, handler: null };

function initDriveOnce() {
  if (_drive.initialized || !GOOGLE_CLIENT_ID) return;
  const tryInit = () => {
    if (!window.google?.accounts?.oauth2) { setTimeout(tryInit, 800); return; }
    _drive.initialized = true;
    _drive.client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      callback: (tr) => _drive.handler?.(tr),
    });
    if (localStorage.getItem('drama_auth_user')) {
      _drive.client.requestAccessToken({ prompt: '' });
    }
  };
  tryInit();
}

// ─── MenuBar ──────────────────────────────────────────────────────────────────
function MenuBar({ isDark, onToggleTheme, onPrintPreview, onSave, authUser, setAuthUser }) {
  const { state, dispatch } = useApp();
  const { saveStatus, saveErrorMsg, activeProjectId, stylePreset, undoStack, redoStack } = state;
  const canUndo = undoStack?.length > 0;
  const canRedo = redoStack?.length > 0;
  const [fontAvailability, setFontAvail] = useState(null);
  const [loginOpen, setLoginOpen]        = useState(false);
  const [driveStatus, setDriveStatus]    = useState('none'); // 'none'|'syncing'|'synced'|'error'

  // Drive 토큰 콜백 — 항상 현재 마운트된 MenuBar의 상태 참조 (재마운트 후 자동 갱신)
  _drive.handler = async (tokenResponse) => {
    if (_drive.syncing) return;
    if (tokenResponse.error) {
      if (tokenResponse.error !== 'interaction_required' &&
          tokenResponse.error !== 'access_denied') {
        setDriveStatus('error');
      }
      return;
    }
    _drive.syncing = true;
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
      setTimeout(() => setDriveStatus('none'), 3000);
    } catch (e) {
      console.warn('[Drive] 불러오기 실패:', e);
      setDriveStatus('error');
    } finally {
      _drive.syncing = false;
    }
  };

  // GIS 로드 후 Drive 토큰 클라이언트 초기화 (재마운트 시 건너뜀)
  useEffect(() => { initDriveOnce(); }, []);

  // 새 로그인 시 Drive 인증 요청
  useEffect(() => {
    if (authUser && _drive.client && driveStatus === 'none') {
      _drive.client.requestAccessToken({ prompt: '' });
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
    fontSize: '12px',
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
                <span className="text-[10px]" style={{ color: 'var(--c-text5)' }}>동기화 중…</span>
              )}
              {driveStatus === 'synced' && (
                <span className="text-[10px]" style={{ color: '#4ade80' }}>저장됨</span>
              )}
              {driveStatus === 'error' && (
                <span
                  className="text-[10px] cursor-pointer"
                  style={{ color: '#f87171' }}
                  title="Drive 연동 실패. 클릭해서 재시도"
                  onClick={() => {
                    setDriveStatus('none');
                    _drive.client?.requestAccessToken({ prompt: '' });
                  }}
                >Drive 오류 (재시도)</span>
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

        <label className="text-[11px] shrink-0" style={{ color: 'var(--c-text6)' }}>글꼴</label>
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

        <label className="text-[11px] ml-1 shrink-0" style={{ color: 'var(--c-text6)' }}>크기</label>
        <select value={stylePreset?.fontSize ?? 11} onChange={handleFontSize} style={selectStyle}>
          {[9,10,11,12,13,14,16,18].map(s => <option key={s} value={s}>{s}pt</option>)}
        </select>

        {sep}

        <label className="text-[11px] shrink-0" style={{ color: 'var(--c-text6)' }}>인물/대사 간격</label>
        <input
          type="range" min="4" max="14" step="0.5"
          value={parseFloat(stylePreset?.dialogueGap ?? '7')}
          onChange={e => dispatch({ type: 'SET_STYLE_PRESET', payload: { dialogueGap: `${e.target.value}em` } })}
          className="w-16 shrink-0"
          style={{ accentColor: 'var(--c-accent)', cursor: 'pointer' }}
        />
        <span className="text-[11px] shrink-0" style={{ color: 'var(--c-text5)', minWidth: '2.5rem' }}>
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
        padding: '3px 10px', borderRadius: 4, fontSize: 12,
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

// ─── Mobile components are imported from src/components/mobile/ ─────────────


// ─── Shell ────────────────────────────────────────────────────────────────────
function Shell({ authUser, setAuthUser }) {
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

  // 트리트먼트·씬리스트 페이지 전환 시 오른쪽 패널 자동 열기
  useEffect(() => {
    const { activeDoc } = state;
    if (activeDoc === 'treatment' || activeDoc === 'scenelist') {
      setRightCollapsed(false);
    }
  }, [state.activeDoc]);

  // ── Mobile bottom panel state
  const [mobileBottomOpen, setMobileBottomOpen] = useState(false);
  const [mobileTab, setMobileTab]               = useState('script');

  // ── Mobile keyboard detection via visualViewport
  const [vvHeight, setVvHeight] = useState(() => window.visualViewport?.height ?? window.innerHeight);
  const [vvOffsetTop, setVvOffsetTop] = useState(0);
  useEffect(() => {
    if (!isMobile || !window.visualViewport) return;
    const handler = () => {
      setVvHeight(window.visualViewport.height);
      setVvOffsetTop(window.visualViewport.offsetTop);
    };
    window.visualViewport.addEventListener('resize', handler);
    window.visualViewport.addEventListener('scroll', handler);
    return () => {
      window.visualViewport.removeEventListener('resize', handler);
      window.visualViewport.removeEventListener('scroll', handler);
    };
  }, [isMobile]);
  const keyboardUp = isMobile && (window.innerHeight - vvHeight - vvOffsetTop) > 100;

  useEffect(() => {
    setMobileBottomOpen(false);
  }, [state.activeDoc]);

  // 키보드 올라오면 하단 패널 자동 닫기 (메모 탭은 입력란이 하단이므로 제외)
  useEffect(() => {
    if (keyboardUp && mobileTab !== 'memo') {
      setMobileBottomOpen(false);
    }
  }, [keyboardUp]);

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
      authUser={authUser}
      setAuthUser={setAuthUser}
    />
  );
  const modals = (
    <>
      {printPreviewOpen && <PrintPreviewModal onClose={() => setPrintPreviewOpen(false)} />}
      {!isMobile && <OnboardingTour />}
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
          position: 'fixed',
          top:    keyboardUp ? vvOffsetTop : 0,
          left: 0, right: 0,
          bottom: keyboardUp ? 'auto' : 0,
          height: keyboardUp ? vvHeight : undefined,
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <MobileMenuBar
          onSave={handleSave}
          onPrintPreview={() => setPrintPreviewOpen(true)}
          WorkTimer={WorkTimer}
        />
        <UpdateBanner />
        <div data-tour-id="center-panel" className="flex-1 min-h-0"
          style={{ paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, position: 'relative' }}
        >
          <CenterPanel scrollToSceneId={scrollToSceneId} onScrollHandled={() => setScrollToSceneId(null)} keyboardUp={keyboardUp} />
        </div>
        {/* 광고: 키보드 올라오거나 패널 열리면 숨김 */}
        <div style={{ flexShrink: 0, height: (keyboardUp || mobileBottomOpen) ? 0 : 20, overflow: 'hidden', transition: 'height 0.2s ease' }}>
          <AdBanner slot="mobile-bottom" mobileHide={false} height={20} />
        </div>
        <MobileBottomPanel
          open={mobileBottomOpen}
          onToggle={() => setMobileBottomOpen(v => !v)}
          onClose={() => setMobileBottomOpen(false)}
          tab={mobileTab}
          onTabChange={setMobileTab}
          onScrollToScene={id => setScrollToSceneId(id)}
        />
        <MobileOnboardingTour />
        {modals}
      </div>
    );
  }

  // ── Tablet layout ──────────────────────────────────────────────────────────
  if (isTablet) {
    return (
      <div className="w-screen flex flex-col overflow-hidden" style={{ background: 'var(--c-bg)', position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}>
        {menuBar}
        <UpdateBanner />
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

          <div data-tour-id="center-panel" className="flex-1 min-w-0 overflow-hidden" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <CenterPanel scrollToSceneId={scrollToSceneId} onScrollHandled={() => setScrollToSceneId(null)} />
          </div>

          {!rightCollapsed && (
            <>
              <DragHandle onDrag={updateRightWidth} />
              <div data-tour-id="right-panel" style={{ width: panelWidths.right, flexShrink: 0, overflow: 'clip' }}>
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
      className="w-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--c-bg)', position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
    >
      {menuBar}
      <UpdateBanner />

      <div className="flex flex-1 min-h-0">
        <div data-tour-id="left-panel" style={{ width: panelWidths.left, flexShrink: 0, overflow: 'hidden' }}>
          <LeftPanel />
        </div>

        <DragHandle onDrag={updateLeftWidth} isLeft />

        <div data-tour-id="center-panel" className="flex-1 min-w-0 overflow-hidden" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <CenterPanel
            scrollToSceneId={scrollToSceneId}
            onScrollHandled={() => setScrollToSceneId(null)}
          />
        </div>

        <CollapseButton side="right" collapsed={rightCollapsed} onToggle={() => setRightCollapsed(v => !v)} />

        {!rightCollapsed && (
          <>
            <DragHandle onDrag={updateRightWidth} />
            <div data-tour-id="right-panel" style={{ width: panelWidths.right, flexShrink: 0, overflow: 'clip' }}>
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

// ─── LandingPreview — 디자인 확인용 (#preview-landing) ────────────────────────
function LandingPreview() {
  useEffect(() => {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.getElementById('root').dataset.theme = isDark ? 'dark' : 'light';
  }, []);
  return (
    <LandingPage
      onStart={() => { window.location.hash = ''; window.location.reload(); }}
      onLogin={() => { window.location.hash = ''; window.location.reload(); }}
    />
  );
}

// 모듈-레벨 플래그: Shell이 한 번이라도 렌더됐으면 true — React remount·state 리셋 무관하게 유지
let _shellEverRendered = (() => {
  try { return !!localStorage.getItem('drama_auth_user') || localStorage.getItem('drama_editor_entered') === 'true'; }
  catch { return false; }
})();

export default function App() {
  const [authUser, setAuthUser] = useState(() => {
    try { const s = localStorage.getItem('drama_auth_user'); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });
  const [, forceUpdate] = useState(0);

  if (window.location.hash.startsWith('#review=')) return <SharedReviewView />;
  if (window.location.hash.startsWith('#log='))    return <LogShareView />;
  if (window.location.hash === '#preview-landing') return <LandingPreview />;

  // 매 렌더마다 localStorage 직접 확인 + 모듈 플래그 — 어떤 state 리셋에도 안전
  const lsAuth    = (() => { try { return !!localStorage.getItem('drama_auth_user'); } catch { return false; } })();
  const lsEntered = (() => { try { return localStorage.getItem('drama_editor_entered') === 'true'; } catch { return false; } })();
  const canEnter  = !!authUser || lsAuth || lsEntered || _shellEverRendered;

  if (!canEnter) {
    return (
      <LandingPage
        onStart={() => {
          try { localStorage.setItem('drama_editor_entered', 'true'); } catch {}
          _shellEverRendered = true;
          forceUpdate(n => n + 1);
        }}
        onLogin={(userData) => {
          try { localStorage.setItem('drama_editor_entered', 'true'); } catch {}
          _shellEverRendered = true;
          setAuthUser(userData);
        }}
      />
    );
  }

  // Shell 렌더 시 플래그 확정
  _shellEverRendered = true;

  return (
    <AppProvider>
      <Shell authUser={authUser} setAuthUser={setAuthUser} />
    </AppProvider>
  );
}
