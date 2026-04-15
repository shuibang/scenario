import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import LandingPage from './components/LandingPage';
import { logShareSchema } from './utils/urlSchemas';
import { getTimelineColor } from './utils/color';
import { loadLogPayload, isShortReviewId as isUUID } from './utils/reviewShare';
import { AppProvider, useApp } from './store/AppContext';
import {
  FONTS,
  FONT_STATUS,
  checkFontsAvailability,
  getFontPdfStatus,
  getFontByCssFamily,
} from './print/FontRegistry';
import { getItem, setItem, setAll, DB_KEYS, clearDramaStorage, isPublicPcMode, genId, now } from './store/db';
import { setAccessToken, clearAccessToken, loadFromDrive, isTokenValid, saveSnapshot } from './store/googleDrive';
import { supabase, signInWithGoogle, supabaseSignOut, extractUserData, refreshDriveToken } from './store/supabaseClient';
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
import StoryboardPage from './components/StoryboardPage';
import DirectorNotesPage from './components/DirectorNotesPage';
import DirectorApp from './components/director/DirectorApp';
import TreatmentPage from './components/TreatmentPage';
import BiographyPage from './components/BiographyPage';
import RelationshipsPage from './components/RelationshipsPage';
import MyPage from './components/MyPage';
import OnboardingTour from './components/OnboardingTour';
import MobileOnboardingTour from './components/mobile/MobileOnboardingTour';
import SharedReviewView from './components/SharedReviewView';
import DirectorDeliveryView from './components/DirectorDeliveryView';
import SurveyPage from './components/SurveyPage';
import AdBanner from './components/AdBanner';
// ─── v2: extracted mobile components ──────────────────────────────────────────
import MobileMenuBar    from './components/mobile/MobileMenuBar';
import MobileBottomPanel from './components/mobile/MobileBottomPanel';
// ─── v2: shared utilities ─────────────────────────────────────────────────────
import { mobileTbtnStyle } from './styles/tokens';
import UpdateBanner from './components/UpdateBanner';
import { applyInlineFormat, stripHtml } from './utils/textFormat';
import SnapshotPanel from './components/SnapshotPanel';
import { getLayoutMetrics } from './print/LineTokenizer';
import { saveReviewPayload } from './utils/reviewShare';
import SyncConflictModal from './components/SyncConflictModal';
import { usePageTracking } from './hooks/usePageTracking';
import { guardedSignInWithGoogle } from './utils/guardedSignIn';

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
    const cleanup = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', cleanup);
      window.removeEventListener('blur', cleanup);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', cleanup);
    window.addEventListener('blur', cleanup);
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

// 마커가 콘텐츠와 함께 스크롤되는 타임라인
function TimelineStrip({ scrollEl }) {
  const { state } = useApp();
  const [scrollTop, setScrollTop] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const activeProject = state.projects.find(p => p.id === state.activeProjectId);
  const activeEpisodeId = state.activeEpisodeId;
  const blocks = state.scriptBlocks.filter(b => b.episodeId === activeEpisodeId);
  const stylePreset = activeProject?.stylePreset || {};

  // ScriptEditor의 PageCounter와 동일한 로직으로 총 페이지 수 계산
  const totalPages = useMemo(() => {
    if (!blocks.length) return 1;
    const m = getLayoutMetrics(stylePreset);
    const { charsPerLine, charsInSpeech, linesPerPage, fontSize, lineHeight } = m;
    const lineHpt = fontSize * lineHeight;
    let total = 0;
    // ep_title: TOKEN_HEIGHTS.ep_title = (fs+2)/fs (토크나이저와 동일)
    total += (fontSize + 2) / fontSize;
    for (const b of blocks) {
      switch (b.type) {
        case 'scene_number':
          total += 1 + 12 / lineHpt;
          break;
        case 'action': {
          const lines = Math.max(1, Math.ceil((stripHtml(b.content)?.length || 0) / (charsPerLine - 2)));
          total += lines * (1 + 1 / lineHpt);
          break;
        }
        case 'dialogue': {
          const lines = Math.max(1, Math.ceil((stripHtml(b.content)?.length || 0) / charsInSpeech));
          total += lines * (1 + 1 / lineHpt);
          break;
        }
        default: {
          const lines = Math.max(1, Math.ceil((stripHtml(b.content)?.length || 0) / charsPerLine));
          total += lines * (1 + 1 / lineHpt);
        }
      }
    }
    // float 그대로 유지 — Math.ceil 제거로 비례 분량 계산
    return Math.max(0.1, total / linesPerPage);
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

  // 1장 = 2분 고정, float 유지 → 0.5페이지 = 1.0분
  const totalMins = totalPages * 2;
  const pxPerSec = contentHeight > 0 ? contentHeight / (totalMins * 60) : 0;

  // 눈금 밀도 조절: 간격이 너무 좁으면 세밀한 눈금 생략
  const show1s = pxPerSec >= 3;
  const show5s = pxPerSec * 5 >= 3;
  const totalSecs = Math.ceil(totalMins * 60);

  const ticks = useMemo(() => {
    if (!pxPerSec) return [];
    const result = [];
    for (let s = 1; s <= totalSecs; s++) {
      const isMin = s % 60 === 0;
      const is10s = !isMin && s % 10 === 0;
      const is5s  = !isMin && !is10s && s % 5 === 0;
      const is1s  = !isMin && !is10s && !is5s;
      if (is1s && !show1s) continue;
      if (is5s && !show5s) continue;
      result.push({ s, top: s * pxPerSec, isMin, is10s, is5s, minNum: isMin ? s / 60 : null });
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pxPerSec, totalSecs, show1s, show5s]);

  return (
    <div
      className="shrink-0 select-none no-print"
      style={{ width: 36, borderLeft: '1px solid var(--c-border)', background: 'var(--c-panel)', display: 'flex', flexDirection: 'column' }}
    >
      {/* 툴바 높이 맞춤 빈 헤더 — 정렬용 스페이서 */}
      <div style={{ height: 37, flexShrink: 0, borderBottom: '1px solid var(--c-border2)' }} />

      {/* 눈금 영역 — 콘텐츠와 동기 스크롤 */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* "타임라인" 고정 레이블 — 항상 상단에 표시 */}
        <div style={{
          position: 'absolute', top: 6, left: 0, right: 0, zIndex: 2,
          display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: 9, color: 'var(--c-text3)', letterSpacing: 2,
            writingMode: 'vertical-rl', whiteSpace: 'nowrap',
            opacity: 0.85, userSelect: 'none',
          }}>타임라인</span>
        </div>

        {/* 스크롤 동기 눈금 컨테이너 */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: contentHeight,
          transform: `translateY(${-scrollTop}px)`,
          willChange: 'transform',
        }}>
          {ticks.map(({ s, top, isMin, is10s, is5s, minNum }) => {
            const tickW   = isMin ? 14 : is10s ? 9 : is5s ? 5 : 3;
            const opacity = isMin ? 0.85 : is10s ? 0.6 : is5s ? 0.4 : 0.25;
            return (
              <div key={s} style={{ position: 'absolute', top, right: 0, left: 0, height: 1 }}>
                {/* 눈금선 */}
                <div style={{
                  position: 'absolute', right: 0,
                  width: tickW, height: 1,
                  background: 'var(--c-text4)', opacity,
                }} />
                {/* 분 숫자 */}
                {isMin && (
                  <span style={{
                    position: 'absolute', right: tickW + 3, top: -4,
                    fontSize: 8, lineHeight: 1,
                    color: 'var(--c-text3)', opacity: 0.9,
                    whiteSpace: 'nowrap', userSelect: 'none',
                  }}>{minNum}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* 총 분량 레이블 — 하단 고정 */}
        <div style={{
          position: 'absolute', bottom: 4, left: 0, right: 0, zIndex: 2,
          display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: 8, color: 'var(--c-text3)', opacity: 0.8,
            writingMode: 'vertical-rl', whiteSpace: 'nowrap', userSelect: 'none',
          }}>{totalMins.toFixed(1)}분</span>
        </div>
      </div>
    </div>
  );
}

function ScriptWithTimeline({ scrollToSceneId, onScrollHandled, keyboardUp, isMobile, focusMode, setFocusMode }) {
  const [scrollEl, setScrollEl] = useState(null);
  return (
    <div className="h-full flex flex-row min-h-0 overflow-hidden">
      <div className="flex-1 min-w-0 min-h-0">
        <ScriptEditor
          scrollToSceneId={scrollToSceneId}
          onScrollHandled={onScrollHandled}
          keyboardUp={keyboardUp}
          isMobile={isMobile}
          onScrollRefReady={(ref) => { setScrollEl(ref.current); }}
          focusMode={focusMode}
          setFocusMode={setFocusMode}
        />
      </div>
      {!focusMode && <TimelineStrip scrollEl={scrollEl} />}
    </div>
  );
}

// ─── Center panel ─────────────────────────────────────────────────────────────
function CenterPanel({ scrollToSceneId, onScrollHandled, keyboardUp, isMobile, focusMode, setFocusMode }) {
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
  if (activeDoc === 'storyboard') return <StoryboardPage />;
  if (activeDoc === 'director_notes') return <DirectorNotesPage />;
  if (activeDoc === 'treatment') return <TreatmentPage />;
  if (activeDoc === 'biography') return <BiographyPage />;
  if (activeDoc === 'relationships') return <RelationshipsPage />;
  if (activeDoc === 'mypage') return <MyPage />;
  if (activeDoc === 'script' && activeEpisodeId) {
    return <ScriptWithTimeline scrollToSceneId={scrollToSceneId} onScrollHandled={onScrollHandled} keyboardUp={keyboardUp} isMobile={isMobile} focusMode={focusMode} setFocusMode={setFocusMode} />;
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
function WorkTimer({ projectId, documentId, onComplete, saveRef }) {
  const { state, dispatch } = useApp();
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef  = useRef(0);           // always up-to-date for cleanup closure
  const activeRef   = useRef(false);
  const idleTimer   = useRef(null);
  const tickTimer   = useRef(null);
  const startedAt   = useRef(Date.now());
  // Keep refs to avoid stale closures in event handlers
  const checklistRef = useRef(state.checklistItems);
  const workLogsRef  = useRef(state.workTimeLogs);
  useEffect(() => { checklistRef.current = state.checklistItems; }, [state.checklistItems]);
  useEffect(() => { workLogsRef.current  = state.workTimeLogs;   }, [state.workTimeLogs]);

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

  // 자동 저장 (로그아웃·창 닫기): dispatch + IndexedDB 직접 쓰기
  const autoSave = useCallback(() => {
    if (elapsedRef.current <= 0 || !projectId) return;
    const entry = {
      projectId,
      documentId: documentId || null,
      startedAt: startedAt.current,
      completedAt: Date.now(),
      activeDurationSec: elapsedRef.current,
      dateKey: new Date(startedAt.current).toISOString().slice(0, 10),
      completedChecklistSnapshot: buildSnapshot(),
    };
    dispatch({ type: 'ADD_WORK_LOG', payload: entry });
    // IndexedDB에 직접 기록 (페이지 언로드 시 state 업데이트가 persist되기 전에 닫힐 수 있으므로)
    const updated = [...workLogsRef.current, entry];
    setAll(DB_KEYS.workTimeLogs, updated).catch(() => {});
    elapsedRef.current = 0;
    startedAt.current = Date.now();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, documentId]);

  // saveRef를 통해 부모(MenuBar 로그아웃 버튼 등)가 직접 호출 가능
  useEffect(() => {
    if (saveRef) saveRef.current = autoSave;
  }, [saveRef, autoSave]);

  // 창 닫기 / 탭 닫기 / 새로고침 시 자동 저장
  useEffect(() => {
    const handleUnload = () => autoSave();
    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [autoSave]);

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

// ─── Login modal — Supabase OAuth ─────────────────────────────────────────────
function LoginModal({ onClose }) {
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    guardedSignInWithGoogle();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="rounded-xl p-8 w-80 flex flex-col gap-4" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }} onClick={e => e.stopPropagation()}>
        <div className="text-center mb-2">
          <div className="text-lg font-bold mb-1" style={{ color: 'var(--c-text)' }}>로그인 / 회원가입</div>
          <div className="text-xs" style={{ color: 'var(--c-text5)' }}>소셜 계정으로 바로 시작하세요</div>
        </div>
        <button
          onClick={handleGoogle}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 16px', borderRadius: 6, border: '1px solid var(--c-border3)',
            background: 'var(--c-card)', color: 'var(--c-text)', fontSize: 14,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, width: '100%',
          }}
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" style={{ width: 18, height: 18 }} />
          {loading ? '이동 중…' : 'Google로 계속하기'}
        </button>
        <div className="text-[10px] text-center" style={{ color: 'var(--c-text6)' }}>
          Kakao / Naver 로그인은 준비 중입니다
        </div>
        <button onClick={onClose} className="text-xs mt-1" style={{ color: 'var(--c-text6)', background: 'none', border: 'none', cursor: 'pointer' }}>닫기</button>
      </div>
    </div>
  );
}

// ─── Drive 동기화 중복 방지 ────────────────────────────────────────────────────
let _driveSyncing = false;

// ─── MenuBar ──────────────────────────────────────────────────────────────────
function MenuBar({ isDark, onToggleTheme, onPrintPreview, onSave, onSnapshot, authUser, setAuthUser, onSyncConflict }) {
  const { state, dispatch, loadFromDriveData } = useApp();
  const { saveStatus, saveErrorMsg, activeProjectId, stylePreset, undoStack, redoStack, savedAt } = state;
  const canUndo = undoStack?.length > 0 || !!activeProjectId;
  const [scriptCanRedo, setScriptCanRedo] = useState(false);
  const timerSaveRef = useRef(null); // WorkTimer의 autoSave 연결

  // 자동 저장 상대 시각 ("방금 저장됨" / "N분 전")
  const [savedLabel, setSavedLabel] = useState('');
  useEffect(() => {
    const update = () => {
      if (!savedAt || !activeProjectId) { setSavedLabel(''); return; }
      const mins = Math.floor((Date.now() - savedAt) / 60_000);
      if (mins < 1) setSavedLabel('방금 저장됨');
      else if (mins < 60) setSavedLabel(`${mins}분 전 저장`);
      else setSavedLabel(`${Math.floor(mins / 60)}시간 전 저장`);
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [savedAt, activeProjectId]);
  const canRedo = redoStack?.length > 0 || scriptCanRedo;
  useEffect(() => {
    const handler = (e) => setScriptCanRedo(e.detail?.canRedo ?? false);
    window.addEventListener('scriptundostate', handler);
    return () => window.removeEventListener('scriptundostate', handler);
  }, []);
  const [fontAvailability, setFontAvail] = useState(null);
  const [loginOpen, setLoginOpen]        = useState(false);
  const [driveStatus, setDriveStatus]    = useState('none'); // 'none'|'syncing'|'synced'|'error'

  // Drive 동기화 — Supabase provider_token 사용
  const runDriveSync = useCallback(async () => {
    if (_driveSyncing || !isTokenValid()) return;
    _driveSyncing = true;
    setDriveStatus('syncing');
    try {
      const driveData = await loadFromDrive();
      const localSavedAt = localStorage.getItem('drama_saved_at') || null;
      const hasLocalData = (() => {
        try {
          const raw = localStorage.getItem('drama_projects');
          return raw ? JSON.parse(raw).length > 0 : false;
        } catch { return false; }
      })();
      const driveHasData = (driveData?.projects?.length ?? 0) > 0;

      if (!driveData?.savedAt || !driveHasData) {
        setDriveStatus('synced');
      } else if (!hasLocalData) {
        loadFromDriveData(driveData);
        setDriveStatus('synced');
      } else {
        onSyncConflict?.({ localSavedAt, driveData });
        setDriveStatus('none');
        _driveSyncing = false;
        return;
      }
      setTimeout(() => setDriveStatus('none'), 3000);
    } catch (e) {
      if (e.message?.includes('401') || e.message?.includes('DRIVE_AUTH_REQUIRED')) {
        const newToken = await refreshDriveToken();
        if (newToken) { _driveSyncing = false; runDriveSync(); return; }
      }
      if (e.message?.includes('403')) {
        setDriveStatus('reauth');
      } else {
        setDriveStatus('error');
      }
      console.warn('[Drive] 불러오기 실패:', e);
    } finally {
      _driveSyncing = false;
    }
  }, [loadFromDriveData, onSyncConflict]);

  // 로그인 후 토큰이 유효하면 Drive 동기화 실행
  useEffect(() => {
    if (authUser && isTokenValid() && driveStatus === 'none') {
      runDriveSync();
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
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}

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
                  onClick={async () => {
                    setDriveStatus('none');
                    const newToken = await refreshDriveToken();
                    if (newToken) runDriveSync();
                    else guardedSignInWithGoogle();
                  }}
                >Drive 오류 (재시도)</span>
              )}
              {driveStatus === 'reauth' && (
                <span
                  className="text-[10px] cursor-pointer"
                  style={{ color: '#f6ad55' }}
                  title="Google Drive 권한이 없습니다. 클릭해서 재로그인"
                  onClick={() => guardedSignInWithGoogle()}
                >구글 드라이브 재연결이 필요해요</span>
              )}
              <button onClick={async () => {
                  timerSaveRef.current?.();
                  if (isPublicPcMode()) clearDramaStorage();
                  await supabaseSignOut();
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
        <button
          onClick={() => { window.location.hash = '#landing'; }}
          className="text-xs font-bold tracking-wider"
          style={{ color: 'var(--c-accent)', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          대본 작업실
        </button>

        {/* Right: clock + timer */}
        <div className="flex items-center gap-3" style={{ flex: 1, justifyContent: 'flex-end' }}>
          <RealtimeClock />
          {activeProjectId && <WorkTimer key={activeProjectId} projectId={activeProjectId} documentId={state.activeEpisodeId || state.activeDoc} saveRef={timerSaveRef} />}
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
        {saveStatus === 'saved' && savedLabel && (
          <span style={{ fontSize: 10, color: 'var(--c-text6)', whiteSpace: 'nowrap', opacity: 0.85 }}>
            {savedLabel}
          </span>
        )}
        <MenuButton label="출력" onClick={onPrintPreview} disabled={!activeProjectId} accent />

        {sep}

        <MenuButton label="백업/복원" onClick={onSnapshot} />

        {sep}

        {/* Undo / Redo */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('script:undo'))}
          disabled={!canUndo}
          title="되돌리기 (Ctrl+Z)"
          className="w-6 h-6 rounded text-xs flex items-center justify-center shrink-0"
          style={{ color: canUndo ? 'var(--c-text3)' : 'var(--c-border3)', border: '1px solid var(--c-border3)', background: 'transparent', cursor: canUndo ? 'pointer' : 'not-allowed' }}
        >↩</button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('script:redo'))}
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
  const [snapshotOpen, setSnapshotOpen]         = useState(false);
  const { state, dispatch, loadFromDriveData } = useApp();

  // Drive 동기화 충돌 — { localSavedAt, driveData } | null
  const [syncConflict, setSyncConflict] = useState(null);

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

  // ── Focus mode
  const [focusMode, setFocusMode] = useState(false);
  useEffect(() => {
    // 진입은 ScriptEditor 버튼 핸들러에서 동기 호출 (제스처 컨텍스트 유지)
    // 여기서는 focusMode 해제 시 fullscreen 종료만 담당
    if (!focusMode && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [focusMode]);
  // 브라우저 자체 ESC로 fullscreen 해제 시 focusMode도 같이 해제
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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

  // 키보드 올라오면 하단 패널 자동 닫기 — 단, 포커스가 하단패널 내부에 있으면 유지
  useEffect(() => {
    if (keyboardUp) {
      const bottomPanel = document.querySelector('[data-bottom-panel]');
      const hasFocusInPanel = bottomPanel?.contains(document.activeElement);
      if (!hasFocusInPanel) {
        setMobileBottomOpen(false);
      }
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
  const [saveToastMsg, setSaveToastMsg] = useState('저장되었습니다');
  const saveToastTimer = useRef(null);

  // ── 새 버전 감지 폴링
  const [newVersionReady, setNewVersionReady] = useState(false);
  const [updatingVersion, setUpdatingVersion] = useState(false);
  useEffect(() => {
    let dismissed = false;
    const currentVersion = import.meta.env.VITE_BUILD_VERSION ?? 'dev';
    const check = async () => {
      try {
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = await res.json();
        if (version !== 'dev' && currentVersion !== 'dev' && version !== currentVersion && !dismissed) {
          setNewVersionReady(true);
        }
      } catch { /* 무시 */ }
    };
    const id = setInterval(check, 5 * 60 * 1000); // 5분마다
    return () => clearInterval(id);
  }, []);

  // 10분마다 자동저장 스냅샷
  useEffect(() => {
    const AUTO_INTERVAL = 10 * 60 * 1000;
    const timer = setInterval(async () => {
      if (!state.initialized || !state.projects.length) return;
      try {
        const token = await refreshDriveToken();
        if (!token) {
          setSaveToastMsg('구글 드라이브 재연결이 필요해요');
          setSaveToast(true);
          setTimeout(() => setSaveToast(false), 3500);
          return;
        }
        await saveSnapshot({
          projects:       state.projects,
          episodes:       state.episodes,
          characters:     state.characters,
          scenes:         state.scenes,
          scriptBlocks:   state.scriptBlocks,
          coverDocs:      state.coverDocs,
          synopsisDocs:   state.synopsisDocs,
          resources:      state.resources,
          workTimeLogs:   state.workTimeLogs,
          checklistItems: state.checklistItems,
          stylePreset:    state.stylePreset,
        }, '자동저장', 'auto');
      } catch {}
    }, AUTO_INTERVAL);
    return () => clearInterval(timer);
  }, [state]);

  const handleSave = useCallback(() => {
    window.dispatchEvent(new Event('script:requestSave'));
    // 수동 저장 시 스냅샷 생성 — 토큰 없으면 갱신 후 시도
    const snap = {
      projects:       state.projects,
      episodes:       state.episodes,
      characters:     state.characters,
      scenes:         state.scenes,
      scriptBlocks:   state.scriptBlocks,
      coverDocs:      state.coverDocs,
      synopsisDocs:   state.synopsisDocs,
      resources:      state.resources,
      workTimeLogs:   state.workTimeLogs,
      checklistItems: state.checklistItems,
      stylePreset:    state.stylePreset,
    };
    (async () => {
      try {
        if (!isTokenValid()) await refreshDriveToken();
        if (isTokenValid()) {
          await saveSnapshot(snap, '수동저장', 'manual');
        } else {
          clearTimeout(saveToastTimer.current);
          setSaveToastMsg('Drive 로그인 필요 — 백업 기록은 저장되지 않았습니다');
          setSaveToast(true);
          saveToastTimer.current = setTimeout(() => setSaveToast(false), 3500);
        }
      } catch {}
    })();
    clearTimeout(saveToastTimer.current);
    setSaveToastMsg('저장되었습니다');
    setSaveToast(true);
    saveToastTimer.current = setTimeout(() => setSaveToast(false), 2000);
  }, [state]);

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
      onPrintPreview={() => { window.dispatchEvent(new CustomEvent('editor:flush')); setPrintPreviewOpen(true); }}
      onSave={handleSave}
      onSnapshot={() => setSnapshotOpen(true)}
      authUser={authUser}
      setAuthUser={setAuthUser}
      onSyncConflict={setSyncConflict}
    />
  );
  const modals = (
    <>
      {printPreviewOpen && <PrintPreviewModal onClose={() => { console.trace('[Modal] setPrintPreviewOpen(false) 호출'); setPrintPreviewOpen(false); }} />}
      {syncConflict && (
        <SyncConflictModal
          localSavedAt={syncConflict.localSavedAt}
          driveData={syncConflict.driveData}
          onKeepLocal={() => {
            // 로컬 유지 → Drive에 현재 데이터 업로드
            import('./store/googleDrive').then(({ saveToDrive }) => {
              saveToDrive({
                projects:       state.projects,
                episodes:       state.episodes,
                characters:     state.characters,
                scenes:         state.scenes,
                scriptBlocks:   state.scriptBlocks,
                coverDocs:      state.coverDocs,
                synopsisDocs:   state.synopsisDocs,
                resources:      state.resources,
                workTimeLogs:   state.workTimeLogs,
                checklistItems: state.checklistItems,
                stylePreset:    state.stylePreset,
              }).catch(() => {});
            });
            setSyncConflict(null);
          }}
          onLoadDrive={() => {
            loadFromDriveData(syncConflict.driveData);
            setSyncConflict(null);
          }}
          onDismiss={() => setSyncConflict(null)}
        />
      )}
      {!isMobile && <OnboardingTour />}
      {snapshotOpen && <SnapshotPanel onClose={() => setSnapshotOpen(false)} />}
      {saveToast && (
        <div style={{
          position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
          background: saveToastMsg === '저장되었습니다' ? 'var(--c-accent)' : '#b7791f',
          color: '#fff',
          padding: '8px 20px', borderRadius: '8px',
          fontSize: '13px', zIndex: 9999,
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
          pointerEvents: 'none',
          maxWidth: 360, textAlign: 'center',
        }}>
          {saveToastMsg}
        </div>
      )}
      {newVersionReady && !updatingVersion && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10000,
          background: 'var(--c-card)', borderTop: '1px solid var(--c-border4)',
          padding: '14px 20px', boxShadow: '0 -4px 20px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center',
        }}>
          <p style={{ fontSize: 13, color: 'var(--c-text2)', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
            새 버전이 있어요. 지금 업데이트하면<br />편집 중인 내용은 자동저장 후 새로고침돼요.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setNewVersionReady(false)}
              style={{ fontSize: 13, padding: '6px 16px', borderRadius: 8, border: '1px solid var(--c-border3)', background: 'transparent', color: 'var(--c-text4)', cursor: 'pointer' }}
            >나중에</button>
            <button
              onClick={async () => {
                setUpdatingVersion(true);
                // 1. 자동저장 먼저
                window.dispatchEvent(new Event('script:requestSave'));
                await new Promise(r => setTimeout(r, 600));
                // 2. IndexedDB flush 대기
                await new Promise(r => setTimeout(r, 400));
                window.location.reload();
              }}
              style={{ fontSize: 13, padding: '6px 20px', borderRadius: 8, border: 'none', background: 'var(--c-accent)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
            >업데이트</button>
          </div>
        </div>
      )}
      {updatingVersion && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10000,
          background: 'var(--c-card)', borderTop: '1px solid var(--c-border4)',
          padding: '16px 20px', textAlign: 'center', fontSize: 13, color: 'var(--c-text4)',
        }}>
          저장 중… 잠시만 기다려주세요
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
        <div style={{ display: focusMode ? 'none' : 'contents' }}>
          <MobileMenuBar
            onSave={handleSave}
            onPrintPreview={() => { window.dispatchEvent(new CustomEvent('editor:flush')); setPrintPreviewOpen(true); }}
            onSnapshot={() => setSnapshotOpen(true)}
            WorkTimer={WorkTimer}
            authUser={authUser}
            onLogout={() => setAuthUser(null)}
          />
          <UpdateBanner />
        </div>
        <div data-tour-id="center-panel" className="flex-1 min-h-0"
          style={{ paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, position: 'relative' }}
        >
          <CenterPanel scrollToSceneId={scrollToSceneId} onScrollHandled={() => setScrollToSceneId(null)} keyboardUp={keyboardUp} isMobile={isMobile} focusMode={focusMode} setFocusMode={setFocusMode} />
        </div>
        {/* 광고 + 하단탭: 집중 모드에서 CSS로 숨김 (언마운트 방지) */}
        <div style={{ display: focusMode ? 'none' : 'contents' }}>
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
        </div>
        <MobileOnboardingTour />
        {modals}
      </div>
    );
  }

  // ── Tablet layout ──────────────────────────────────────────────────────────
  if (isTablet) {
    return (
      <div className="w-screen flex flex-col overflow-hidden" style={{ background: 'var(--c-bg)', position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}>
        <div style={{ display: focusMode ? 'none' : 'contents' }}>
          {menuBar}
          <UpdateBanner />
        </div>
        <div className="flex flex-1 min-h-0">
          <div style={{ display: focusMode ? 'none' : 'contents' }}>
            <CollapseButton side="left" collapsed={leftCollapsed} onToggle={() => setLeftCollapsed(v => !v)} />
            {!leftCollapsed && (
              <>
                <div data-tour-id="left-panel" style={{ width: panelWidths.left, flexShrink: 0, overflow: 'hidden' }}>
                  <LeftPanel />
                </div>
                <DragHandle onDrag={updateLeftWidth} isLeft />
              </>
            )}
          </div>

          <div data-tour-id="center-panel" className="flex-1 min-w-0 overflow-hidden" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <CenterPanel scrollToSceneId={scrollToSceneId} onScrollHandled={() => setScrollToSceneId(null)} focusMode={focusMode} setFocusMode={setFocusMode} />
          </div>

          <div style={{ display: focusMode ? 'none' : 'contents' }}>
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
        </div>

        <div style={{ overflow: 'hidden', height: focusMode ? 0 : 'auto' }}>
          <AdBanner
            slot="bottom-fixed"
            mobileHide={false}
            height={48}
            className="no-print"
            style={{ margin: '0 8px 6px', borderRadius: 6 }}
          />
        </div>

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
      <div style={{ display: focusMode ? 'none' : 'contents' }}>
        {menuBar}
        <UpdateBanner />
      </div>

      <div className="flex flex-1 min-h-0">
        <div style={{ display: focusMode ? 'none' : 'contents' }}>
          <div data-tour-id="left-panel" style={{ width: panelWidths.left, flexShrink: 0, overflow: 'hidden' }}>
            <LeftPanel />
          </div>
          <DragHandle onDrag={updateLeftWidth} isLeft />
        </div>

        <div data-tour-id="center-panel" className="flex-1 min-w-0 overflow-hidden" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <CenterPanel
            scrollToSceneId={scrollToSceneId}
            onScrollHandled={() => setScrollToSceneId(null)}
            focusMode={focusMode}
            setFocusMode={setFocusMode}
          />
        </div>

        <div style={{ display: focusMode ? 'none' : 'contents' }}>
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
      </div>

      <div style={{ overflow: 'hidden', height: focusMode ? 0 : 'auto' }}>
        <AdBanner
          slot="bottom-fixed"
          mobileHide={false}
          height={48}
          className="no-print"
          style={{ margin: '0 8px 6px', borderRadius: 6 }}
        />
      </div>

      {modals}
    </div>
  );
}

// ─── LogShareView — 읽기 전용 작업통계 ────────────────────────────────────────
function LogShareView() {
  const hash = window.location.hash;
  const [data, setData] = useState(null);
  const [bad, setBad]   = useState(false);

  useEffect(() => {
    const val = hash.slice(5); // '#log=' 제거
    // UUID 방식 (신규)
    if (isUUID(val)) {
      loadLogPayload(val)
        .then(raw => { const parsed = logShareSchema.safeParse(raw); parsed.success ? setData(parsed.data) : setBad(true); })
        .catch(() => setBad(true));
    } else {
      // 구형 Base64 폴백
      try {
        const raw = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(val)))));
        const parsed = logShareSchema.safeParse(raw);
        parsed.success ? setData(parsed.data) : setBad(true);
      } catch { setBad(true); }
    }
  }, []);

  if (!data && !bad) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#aaa', fontSize: 13 }}>
        불러오는 중…
      </div>
    );
  }

  if (!data) {
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
    <div style={{ minHeight: '100vh', background: '#fff' }}>
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

// ─── WebView 안내 모달 ────────────────────────────────────────────────────────
function WebViewModal({ onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 16, padding: '32px 28px', maxWidth: 360, width: '100%', textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 40, marginBottom: 16 }}>🌐</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#111', marginBottom: 12 }}>
          외부 브라우저에서 열어주세요
        </div>
        <p style={{ fontSize: 13, color: '#555', lineHeight: 1.7, margin: '0 0 24px' }}>
          카카오톡·인스타그램 등 앱에서는 Google 로그인이 제한됩니다.<br />
          상단 메뉴(···)에서 <strong>'외부 브라우저로 열기'</strong>를 선택 후 다시 시도해주세요.
        </p>
        <button
          onClick={onClose}
          style={{ width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', background: '#e8b84b', color: '#1a1a1a', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >확인</button>
      </div>
    </div>
  );
}

export default function App() {
  usePageTracking();

  const [authUser, setAuthUser] = useState(() => {
    try { const s = localStorage.getItem('drama_auth_user'); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });
  const [, forceUpdate] = useState(0);
  const [webViewModal, setWebViewModal] = useState(false);

  // WebView 안내 모달 — guardedSignInWithGoogle()이 발사하는 이벤트 수신
  useEffect(() => {
    const handler = () => setWebViewModal(true);
    window.addEventListener('show-webview-modal', handler);
    return () => window.removeEventListener('show-webview-modal', handler);
  }, []);

  // hash 변경 시 재렌더 (#director, #landing 등 이동 즉시 반영)
  useEffect(() => {
    const handler = () => forceUpdate(n => n + 1);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  // Supabase 세션 복원 + 상태 변화 구독
  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') && session) {
        const userData = extractUserData(session);
        if (userData) {
          try { localStorage.setItem('drama_auth_user', JSON.stringify(userData)); } catch {}
          _shellEverRendered = true;
          setAuthUser(userData);
        }
        if (session.provider_token) {
          setAccessToken(session.provider_token, 3600);
        }
        // OAuth 복귀 후 검토 링크 등 이전 hash 복원
        if (event === 'SIGNED_IN') {
          try {
            const returnHash = localStorage.getItem('drama_pending_return_hash');
            if (returnHash) {
              localStorage.removeItem('drama_pending_return_hash');
              window.location.hash = returnHash;
            }
          } catch {}
        }
      } else if (event === 'SIGNED_OUT') {
        try { localStorage.removeItem('drama_auth_user'); } catch {}
        clearAccessToken();
        setAuthUser(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // 연출 작업실 — 감독 전용 독립 페이지
  if (window.location.hash === '#director')         return <DirectorApp authUser={authUser} />;

  // public — 감독 전송 링크 (인증 불필요, 의도적)
  if (window.location.hash.startsWith('#delivery=')) return <DirectorDeliveryView />;
  // public — 공유 링크 (인증 불필요, 의도적)
  if (window.location.hash.startsWith('#review=')) return <SharedReviewView />;
  // public — 작업기록 공유 (인증 불필요, 의도적)
  if (window.location.hash.startsWith('#log='))    return <LogShareView />;
  // dev-only — 랜딩 디자인 확인용, production에서 노출 차단
  if (window.location.hash === '#preview-landing' && import.meta.env.DEV) return <LandingPreview />;
  // public — 베타 설문 (인증 불필요, 의도적)
  if (window.location.hash === '#survey')          return <SurveyPage />;
  // 헤더 '대본 작업실' 클릭 시 랜딩 페이지로
  if (window.location.hash === '#landing') return (
    <LandingPage
      onStart={() => { window.location.hash = ''; forceUpdate(n => n + 1); }}
      onLogin={(userData) => {
        if (userData) {
          try { localStorage.setItem('drama_auth_user', JSON.stringify(userData)); } catch {}
          _shellEverRendered = true;
          setAuthUser(userData);
        }
        window.location.hash = '';
        forceUpdate(n => n + 1);
      }}
    />
  );

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
      {webViewModal && <WebViewModal onClose={() => setWebViewModal(false)} />}
    </AppProvider>
  );
}
