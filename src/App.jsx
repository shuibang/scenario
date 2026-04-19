import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { FileText, Undo2, Redo2, Sun, Moon, User, Clapperboard, ExternalLink, ChevronLeft, ChevronRight, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';
import LandingPage from './components/LandingPage';
import { logShareSchema } from './utils/urlSchemas';
import { getTimelineColor } from './utils/color';
import { loadLogPayload, isShortReviewId as isUUID } from './utils/reviewShare';
import { AppProvider, useApp } from './store/AppContext';
import { FONTS, FONT_STATUS, checkFontsAvailability, getFontPdfStatus, getFontByCssFamily } from './print/FontRegistry';
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
import { applyInlineFormat, applyBlockAlignment, stripHtml } from './utils/textFormat';
import * as findReplaceUtils from './utils/findReplace';
import FindReplaceMobileModal from './components/FindReplaceMobileModal';
import SnapshotPanel from './components/SnapshotPanel';
import SplitViewPanel from './components/SplitViewPanel';
import StatusBar from './components/StatusBar';
import { getLayoutMetrics } from './print/LineTokenizer';
import { saveReviewPayload } from './utils/reviewShare';
import SyncConflictModal from './components/SyncConflictModal';
import { usePageTracking } from './hooks/usePageTracking';
import { guardedSignInWithGoogle } from './utils/guardedSignIn';
import Menubar from './components/Menubar/Menubar';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import OpenProjectModal  from './components/Modals/OpenProjectModal';
import SaveAsModal       from './components/Modals/SaveAsModal';
import ShareLinkModal    from './components/Modals/ShareLinkModal';
import ProjectInfoModal  from './components/Modals/ProjectInfoModal';
import WordCountModal    from './components/Modals/WordCountModal';
import NewProjectModal   from './components/Modals/NewProjectModal';
import ImportDocxModal       from './components/Modals/ImportDocxModal';
import ImportHwpxModal       from './components/Modals/ImportHwpxModal';
import StyleSettingsModal    from './components/Modals/StyleSettingsModal';
import SceneFormatModal      from './components/Modals/SceneFormatModal';
import UserSettingsModal     from './components/Modals/UserSettingsModal';
import TagManageModal        from './components/Modals/TagManageModal';
import AppSettingsModal      from './components/Modals/AppSettingsModal';
import NoticesModal          from './components/Modals/NoticesModal';
import QnAModal              from './components/Modals/QnAModal';

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
          const content = stripHtml(b.content);
          if (!content?.trim()) break;
          const lines = Math.max(1, Math.ceil(content.length / (charsPerLine - 2)));
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
  return `${window.location.origin}/app#review=${id}`;
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

// ─── DropdownMenu ─────────────────────────────────────────────────────────────
function DropdownMenu({ label, items, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const menuBtnBase = {
    padding: '3px 10px',
    fontSize: 13,
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: disabled ? 'var(--c-text5)' : 'var(--c-text3)',
    whiteSpace: 'nowrap',
    transition: 'background 0.1s',
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => !disabled && setOpen(v => !v)}
        style={{ ...menuBtnBase, background: open ? 'var(--c-hover)' : 'transparent' }}
        onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--c-hover)'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        {label}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 1000,
          background: 'var(--c-card)', border: '1px solid var(--c-border)',
          borderRadius: 6, boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
          minWidth: 200, padding: '4px 0', marginTop: 2,
        }}>
          {items.map((item, i) => item === '---' ? (
            <div key={i} style={{ height: 1, background: 'var(--c-border2)', margin: '3px 0' }} />
          ) : (
            <button
              key={i}
              disabled={item.disabled}
              onClick={() => { if (!item.disabled) { item.onClick(); setOpen(false); } }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '6px 14px', fontSize: 13,
                background: 'transparent',
                color: item.disabled ? 'var(--c-text5)' : 'var(--c-text2)',
                border: 'none', cursor: item.disabled ? 'not-allowed' : 'pointer',
                textAlign: 'left', gap: 28,
              }}
              onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = 'var(--c-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span>{item.label}</span>
              {item.shortcut && <span style={{ fontSize: 11, color: 'var(--c-text5)', flexShrink: 0 }}>{item.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MenuBar ──────────────────────────────────────────────────────────────────
function MenuBar({ isDark, onToggleTheme, onPrintPreview, onSave, onSnapshot, authUser, setAuthUser, onSyncConflict, onMenuAction, recentProjects, menuCheckedItems }) {
  const { state, dispatch, loadFromDriveData } = useApp();
  const { saveStatus, saveErrorMsg, activeProjectId, stylePreset, undoStack, redoStack, savedAt } = state;
  const canUndo = undoStack?.length > 0 || !!activeProjectId;
  const [scriptCanRedo, setScriptCanRedo] = useState(false);
  const timerSaveRef = useRef(null);

  const activeProject = state.projects.find(p => p.id === activeProjectId);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

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
  useEffect(() => { checkFontsAvailability().then(setFontAvail); }, []);

  const [activeAlignment, setActiveAlignment] = useState(null);
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      let node = sel.getRangeAt(0).startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      const surface = document.querySelector('[data-editor-surface]');
      while (node && node !== surface) {
        if (node.dataset?.blockId) { setActiveAlignment(node.dataset.alignment || null); return; }
        node = node.parentElement;
      }
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  const handleFontSize   = (e) => dispatch({ type: 'SET_STYLE_PRESET', payload: { fontSize: Number(e.target.value) } });
  const handleFontFamily = (e) => dispatch({ type: 'SET_STYLE_PRESET', payload: { fontFamily: e.target.value } });


  const fontStatusBadge = useMemo(() => {
    const font   = getFontByCssFamily(stylePreset?.fontFamily);
    const status = getFontPdfStatus(font?.id, fontAvailability);
    if (status === FONT_STATUS.SYSTEM)      return <span className="text-[9px] px-1 rounded" style={{ background: '#e8f0fe', color: '#3367d6' }}>화면 전용</span>;
    if (status === FONT_STATUS.UNAVAILABLE) return <span className="text-[9px] px-1 rounded" style={{ background: '#fce8e6', color: '#c5221f' }}>PDF ✗</span>;
    if (status === FONT_STATUS.PARTIAL)     return <span className="text-[9px] px-1 rounded" style={{ background: '#fff3e0', color: '#e37400' }}>PDF △</span>;
    return null;
  }, [stylePreset?.fontFamily, fontAvailability]);

  const [loginOpen, setLoginOpen]        = useState(false);
  const [driveStatus, setDriveStatus]    = useState('none');

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
      if (e.message?.includes('403')) setDriveStatus('reauth');
      else setDriveStatus('error');
      console.warn('[Drive] 불러오기 실패:', e);
    } finally {
      _driveSyncing = false;
    }
  }, [loadFromDriveData, onSyncConflict]);

  useEffect(() => {
    if (authUser && isTokenValid() && driveStatus === 'none') runDriveSync();
  }, [authUser]);

  const commitTitle = () => {
    if (activeProject && titleDraft.trim()) {
      dispatch({ type: 'UPDATE_PROJECT', payload: { ...activeProject, title: titleDraft.trim() } });
    }
    setEditingTitle(false);
  };

  const sep = <div style={{ width: 1, height: 16, background: 'var(--c-border3)', margin: '0 4px', flexShrink: 0 }} />;

  const iconBtnStyle = {
    width: 28, height: 28, borderRadius: 6, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, color: 'var(--c-text3)',
    background: 'transparent', border: 'none', cursor: 'pointer',
  };

  const selectStyle = {
    height: 28, background: 'var(--c-header)', color: 'var(--c-text2)',
    border: '1px solid var(--c-border3)', padding: '0 6px',
    fontSize: 12, borderRadius: 6, outline: 'none',
  };

  return (
    <div data-tour-id="menubar" className="shrink-0 no-print" style={{ background: 'var(--c-header)', borderBottom: '1px solid var(--c-border2)' }}>
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}

      {/* ── Row 1: 헤더 — 로고 | 제목 | 우측 액션 ── */}
      <div className="flex items-center h-11 px-3 gap-2" style={{ borderBottom: '1px solid var(--c-border2)' }}>

        {/* 로고 */}
        <button
          onClick={() => { window.location.hash = '#landing'; }}
          title="홈으로"
          className="flex items-center gap-1.5 shrink-0 rounded px-2 py-1"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', transition: 'background 120ms' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <FileText size={15} strokeWidth={2} style={{ color: 'var(--c-accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text2)', letterSpacing: '-0.015em', whiteSpace: 'nowrap' }}>대본 작업실</span>
        </button>

        {/* 구분선 */}
        <div style={{ width: 1, height: 14, background: 'var(--c-border3)', flexShrink: 0, margin: '0 2px' }} />

        {/* 연출 작업실 바로가기 */}
        <a
          href="#director"
          onClick={e => { e.preventDefault(); window.location.hash = '#director'; }}
          title="연출 작업실으로 이동"
          className="flex items-center gap-1 shrink-0 rounded px-2 py-1"
          style={{
            textDecoration: 'none', color: 'var(--c-text4)', fontSize: 12,
            background: 'transparent', transition: 'background 120ms, color 120ms',
            lineHeight: 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; e.currentTarget.style.color = 'var(--c-text2)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--c-text4)'; }}
        >
          <Clapperboard size={13} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>연출 작업실</span>
          <ExternalLink size={10} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.6 }} />
        </a>

        {/* 로고 - 제목 구분선 */}
        <div style={{ width: 1, height: 16, background: 'var(--c-border3)', flexShrink: 0 }} />

        {/* 대본 제목 */}
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
            style={{
              background: 'var(--c-input)', color: 'var(--c-text)',
              border: '1px solid var(--c-border3)', borderRadius: 6,
              padding: '3px 10px', fontSize: 13, outline: 'none',
              boxShadow: '0 0 0 2px var(--c-active)',
              width: 240, flexShrink: 0,
            }}
          />
        ) : (
          <button
            onClick={() => { if (activeProjectId) { setTitleDraft(activeProject?.title || ''); setEditingTitle(true); } }}
            title={activeProjectId ? '클릭하여 제목 편집' : undefined}
            style={{
              background: 'transparent', border: 'none', borderRadius: 6,
              color: activeProjectId ? 'var(--c-text2)' : 'var(--c-text5)',
              fontSize: 13, fontWeight: 400, letterSpacing: '-0.01em',
              cursor: activeProjectId ? 'text' : 'default',
              padding: '3px 8px', maxWidth: 300,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'background 120ms',
            }}
            onMouseEnter={e => { if (activeProjectId) e.currentTarget.style.background = 'var(--c-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {activeProject?.title || '제목 없는 대본'}
          </button>
        )}

        {/* 오른쪽: 상태 + 저장/내보내기 + 사용자 */}
        <div className="flex items-center gap-2 shrink-0" style={{ marginLeft: 'auto' }}>
          {/* 상태 인디케이터 */}
          {saveStatus === 'saving' && <span style={{ fontSize: 11, color: 'var(--c-text5)', letterSpacing: '-0.01em' }}>저장 중…</span>}
          {saveStatus === 'saved' && savedLabel && <span style={{ fontSize: 11, color: 'var(--c-text5)', letterSpacing: '-0.01em' }}>{savedLabel}</span>}
          {saveStatus === 'error' && <span style={{ fontSize: 11, color: 'var(--c-error)' }} title={saveErrorMsg}>저장 실패</span>}
          {driveStatus === 'syncing' && <span style={{ fontSize: 11, color: 'var(--c-text5)' }}>동기화 중…</span>}
          {driveStatus === 'synced'  && <span style={{ fontSize: 11, color: 'var(--c-success)' }}>Drive ✓</span>}
          {driveStatus === 'error'   && (
            <span style={{ fontSize: 11, color: '#f87171', cursor: 'pointer' }} onClick={async () => { setDriveStatus('none'); const t = await refreshDriveToken(); if (t) runDriveSync(); else guardedSignInWithGoogle(); }}>Drive 오류</span>
          )}
          {driveStatus === 'reauth' && (
            <span style={{ fontSize: 11, color: '#f6ad55', cursor: 'pointer' }} onClick={() => guardedSignInWithGoogle()}>재연결 필요</span>
          )}
          <RealtimeClock />
          {activeProjectId && <WorkTimer key={activeProjectId} projectId={activeProjectId} documentId={state.activeEpisodeId || state.activeDoc} saveRef={timerSaveRef} />}


          <div style={{ width: 1, height: 16, background: 'var(--c-border3)', flexShrink: 0 }} />

          {/* 사용자 */}
          {authUser ? (
            <div className="flex items-center gap-1.5">
              {authUser.picture && <img src={authUser.picture} alt="" style={{ width: 22, height: 22, borderRadius: 4 }} />}
              <span style={{ fontSize: 12, color: 'var(--c-text4)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{authUser.name}</span>
              <button onClick={async () => { timerSaveRef.current?.(); if (isPublicPcMode()) clearDramaStorage(); await supabaseSignOut(); clearAccessToken(); setDriveStatus('none'); setAuthUser(null); }}
                style={{ height: 24, padding: '0 8px', fontSize: 11, background: 'transparent', border: '1px solid var(--c-border3)', borderRadius: 4, color: 'var(--c-text5)', cursor: 'pointer' }}>
                로그아웃
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={() => setLoginOpen(true)} style={{ height: 28, padding: '0 10px', fontSize: 12, background: 'transparent', border: '1px solid var(--c-border3)', borderRadius: 6, color: 'var(--c-text3)', cursor: 'pointer' }}>로그인</button>
              <button onClick={() => setLoginOpen(true)} style={{ height: 28, padding: '0 10px', fontSize: 12, background: 'var(--c-accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>회원가입</button>
            </div>
          )}
          <button onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'mypage' })}
            title="마이페이지"
            className="flex items-center justify-center rounded"
            style={{ ...iconBtnStyle }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <User size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ── Row 2: Radix 메뉴바 ── */}
      <Menubar
        onAction={onMenuAction}
        recentProjects={recentProjects}
        checkedItems={menuCheckedItems}
      />

      {/* ── Row 3: 포맷 툴바 ── */}
      <div className="flex items-center h-10 px-3 gap-1" style={{ overflowX: 'auto', scrollbarWidth: 'none', borderBottom: '1px solid var(--c-border2)' }}>
        {/* Undo / Redo */}
        <button onClick={() => window.dispatchEvent(new CustomEvent('script:undo'))} disabled={!canUndo} title="되돌리기 (Ctrl+Z)"
          className="flex items-center justify-center shrink-0 rounded"
          style={{ ...iconBtnStyle, opacity: canUndo ? 1 : 0.3, cursor: canUndo ? 'pointer' : 'not-allowed' }}
          onMouseEnter={e => { if (canUndo) e.currentTarget.style.background = 'var(--c-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        ><Undo2 size={14} strokeWidth={2} /></button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('script:redo'))} disabled={!canRedo} title="다시하기 (Ctrl+Y)"
          className="flex items-center justify-center shrink-0 rounded"
          style={{ ...iconBtnStyle, opacity: canRedo ? 1 : 0.3, cursor: canRedo ? 'pointer' : 'not-allowed' }}
          onMouseEnter={e => { if (canRedo) e.currentTarget.style.background = 'var(--c-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        ><Redo2 size={14} strokeWidth={2} /></button>

        {sep}

        {/* 글꼴 */}
        <select value={stylePreset?.fontFamily ?? '함초롬바탕'} onChange={handleFontFamily} style={{ ...selectStyle, maxWidth: 110 }}>
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

        {/* 크기 */}
        <select value={stylePreset?.fontSize ?? 11} onChange={handleFontSize} style={selectStyle}>
          {[9,10,11,12,13,14,16,18].map(s => <option key={s} value={s}>{s}pt</option>)}
        </select>

        {sep}

        {/* B / I / U */}
        {[
          { label: 'B', title: '굵게 (Ctrl+B)',   tag: 'bold',      cls: 'font-bold' },
          { label: 'I', title: '기울임 (Ctrl+I)', tag: 'italic',    cls: 'italic' },
          { label: 'U', title: '밑줄 (Ctrl+U)',   tag: 'underline', cls: 'underline' },
        ].map(({ label, title, tag, cls }) => (
          <button key={tag} title={title}
            onMouseDown={e => { e.preventDefault(); applyInlineFormat(tag); }}
            className={`flex items-center justify-center shrink-0 rounded ${cls}`}
            style={{ ...iconBtnStyle }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >{label}</button>
        ))}

        {/* 정렬 버튼: 양쪽 왼쪽 가운데 오른쪽 */}
        {[
          { align: 'justify', Icon: AlignJustify, title: '양쪽 정렬' },
          { align: 'left',    Icon: AlignLeft,    title: '왼쪽 정렬' },
          { align: 'center',  Icon: AlignCenter,  title: '가운데 정렬' },
          { align: 'right',   Icon: AlignRight,   title: '오른쪽 정렬' },
        ].map(({ align, Icon, title }) => (
          <button key={align} title={title}
            onMouseDown={e => { e.preventDefault(); applyBlockAlignment(align); setActiveAlignment(align); }}
            className="flex items-center justify-center shrink-0 rounded"
            style={{ ...iconBtnStyle, color: activeAlignment === align ? 'var(--c-accent)' : 'var(--c-text3)', border: `1px solid ${activeAlignment === align ? 'var(--c-accent)' : 'transparent'}` }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          ><Icon size={14} strokeWidth={2} /></button>
        ))}

        {sep}

        {/* 인물대사 간격 */}
        <span style={{ fontSize: 11, color: 'var(--c-text5)', flexShrink: 0, letterSpacing: '-0.01em' }}>간격</span>
        <input type="range" min="4" max="14" step="0.5"
          value={parseFloat(stylePreset?.dialogueGap ?? '7')}
          onChange={e => dispatch({ type: 'SET_STYLE_PRESET', payload: { dialogueGap: `${e.target.value}em` } })}
          style={{ width: 60, accentColor: 'var(--c-accent)', cursor: 'pointer', flexShrink: 0 }}
        />
        <span style={{ fontSize: 11, color: 'var(--c-text4)', minWidth: '2.5rem', flexShrink: 0 }}>{stylePreset?.dialogueGap ?? '7em'}</span>

        <div className="flex items-center shrink-0" style={{ marginLeft: 'auto' }}>
          <button onClick={onToggleTheme} title={isDark ? '라이트 모드' : '다크 모드'}
            className="flex items-center justify-center rounded"
            style={{ ...iconBtnStyle }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {isDark ? <Sun size={14} strokeWidth={2} /> : <Moon size={14} strokeWidth={2} />}
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
  const [hovered, setHovered] = React.useState(false);
  const isLeft = side === 'left';
  // 왼쪽: 열림=ChevronLeft(접기), 닫힘=ChevronRight(펼치기)
  // 오른쪽: 열림=ChevronRight(접기), 닫힘=ChevronLeft(펼치기)
  const Icon = isLeft
    ? (collapsed ? ChevronRight : ChevronLeft)
    : (collapsed ? ChevronLeft  : ChevronRight);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 10, flexShrink: 0, position: 'relative',
        display: 'flex', alignItems: 'stretch',
        cursor: 'pointer', zIndex: 10,
      }}
      onClick={onToggle}
      title={collapsed ? '패널 열기' : '패널 닫기'}
    >
      {/* 얇은 세로 바 */}
      <div style={{
        width: '1.5px', margin: '0 auto',
        background: hovered ? 'var(--c-accent)' : 'var(--c-border3)',
        transition: 'background 150ms',
        borderRadius: 2,
      }} />

      {/* 호버 시 나타나는 pill 버튼 */}
      {hovered && (
        <div style={{
          position: 'absolute',
          top: '50%', transform: 'translateY(-50%)',
          [isLeft ? 'right' : 'left']: -3,
          width: 20, height: 56,
          background: 'var(--c-accent)',
          borderRadius: isLeft ? '6px 0 0 6px' : '0 6px 6px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          color: '#fff',
          pointerEvents: 'none',
        }}>
          <Icon size={12} strokeWidth={2.5} />
        </div>
      )}
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

  // ── Dev: findReplace 브라우저 콘솔 테스트용 (개발 중에만 사용)
  useEffect(() => {
    if (import.meta.env.DEV) {
      window.__findReplace = findReplaceUtils;
      window.__getBlocks = () => state.scriptBlocks;
      window.__debugBlocks = state.scriptBlocks;
      window.__debugChars  = state.characters;
    }
  });

  // ── Tablet panel collapse state
  const [leftCollapsed,  setLeftCollapsed]  = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // ── Focus mode
  const [focusMode, setFocusMode] = useState(false);
  const focusModeRef = useRef(false);
  useEffect(() => { focusModeRef.current = focusMode; }, [focusMode]);

  useEffect(() => {
    // focusMode 해제 시 fullscreen도 종료
    if (!focusMode && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [focusMode]);
  // 브라우저 ESC로 fullscreen 해제 시 focusMode도 같이 해제
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

  const updateSplitWidth = useCallback((delta) => {
    setSplitViewWidth(prev => Math.min(700, Math.max(240, prev - delta)));
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
    document.documentElement.dataset.theme = theme;
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

  // ── 메뉴바 모달 상태 ────────────────────────────────────────────────────────
  const [newProjectOpen,  setNewProjectOpen]  = useState(false);
  const [openProjectOpen, setOpenProjectOpen] = useState(false);
  const [saveAsOpen,      setSaveAsOpen]      = useState(false);
  const [shareLinkOpen,   setShareLinkOpen]   = useState(false);
  const [projectInfoOpen, setProjectInfoOpen] = useState(false);
  const [findPanelMode,   setFindPanelMode]   = useState(null); // null | 'find' | 'replace'
  const [wordCountOpen,   setWordCountOpen]   = useState(false);
  const [importDocxOpen,       setImportDocxOpen]       = useState(false);
  const [importHwpxOpen,       setImportHwpxOpen]       = useState(false);
  const [styleSettingsOpen,    setStyleSettingsOpen]    = useState(false);
  const [sceneFormatOpen,      setSceneFormatOpen]      = useState(false);
  const [userSettingsOpen,     setUserSettingsOpen]     = useState(false);
  const [tagManageOpen,        setTagManageOpen]        = useState(false);
  const [appSettingsOpen,      setAppSettingsOpen]      = useState(false);
  const [noticesOpen,          setNoticesOpen]          = useState(false);
  const [qaOpen,               setQaOpen]               = useState(false);
  const [exportDefaultFormat, setExportDefaultFormat] = useState('pdf');

  const activeProject = state.projects.find(p => p.id === state.activeProjectId);

  // 메뉴바 토글 상태 (보기 > 프로젝트 탐색기 등)
  const [viewCheckedItems, setViewCheckedItems] = useState({ 'toggle-explorer': true, 'toggle-topbar': true, 'focus-mode': false, 'split-view': false });
  const toggleMenuCheck = (id) => setViewCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));

  const menuCheckedItems = useMemo(() => {
    const sp = activeProject?.stylePreset || {};
    const fontFamily  = sp.fontFamily  ?? '함초롬바탕';
    const fontSize    = sp.fontSize    ?? 11;
    const lineHeightPct = Math.round((sp.lineHeight ?? 1.6) * 100);
    const dgap        = Math.round(parseFloat(sp.dialogueGap ?? '7'));
    return {
      ...viewCheckedItems,
      'font-hamcho':     fontFamily === '함초롬바탕',
      'font-noto-serif': fontFamily === 'Noto Serif KR',
      'font-noto-sans':  fontFamily === 'Noto Sans KR',
      'font-malgun':     fontFamily === 'Malgun Gothic',
      'font-nanum':      fontFamily === '나눔명조',
      [`fontsize-${fontSize}`]: true,
      [`lh-${lineHeightPct}`]:  true,
      [`dgap-${dgap}`]:         true,
    };
  }, [viewCheckedItems, activeProject?.stylePreset]);

  // 최근 프로젝트 (최신순 5개)
  const recentProjects = useMemo(
    () => [...state.projects].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 5),
    [state.projects]
  );

  // 메뉴 명령 실행 시 포커스를 돌려줄 마지막 에디터 추적
  const lastEditorRef = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (e.target?.contentEditable === 'true') lastEditorRef.current = e.target;
    };
    document.addEventListener('focusin', handler);
    return () => document.removeEventListener('focusin', handler);
  }, []);

  const getEditor = () =>
    document.querySelector('[contenteditable="true"]:focus')
    || lastEditorRef.current
    || document.querySelector('[data-editor-surface] [contenteditable="true"]');

  // ── 메뉴 액션 핸들러 ────────────────────────────────────────────────────────
  const handleMenuAction = useCallback((action) => {
    // ── 파일 ──
    if (action === 'file:new') { setNewProjectOpen(true); return; }
    if (action === 'file:openList')    { setOpenProjectOpen(true); return; }
    if (action === 'file:openFile')    { setOpenProjectOpen(true); return; }
    if (action === 'file:save')        { handleSave(); return; }
    if (action === 'file:saveAs')      { setSaveAsOpen(true); return; }
    if (action === 'file:share')       { setShareLinkOpen(true); return; }
    if (action === 'file:projectInfo')  { setProjectInfoOpen(true); return; }
    if (action === 'file:importDocx')   { setImportDocxOpen(true); return; }
    if (action === 'file:importHwpx')   { setImportHwpxOpen(true); return; }
    if (action === 'file:snapshot')     { setSnapshotOpen(true); return; }

    // 내보내기 — PrintPreviewModal 직접 오픈
    if (action === 'file:export') { setExportDefaultFormat('pdf'); window.dispatchEvent(new CustomEvent('editor:flush')); setPrintPreviewOpen(true); return; }

    // 최근 작품
    if (action?.startsWith('file:openRecent:')) {
      dispatch({ type: 'SET_ACTIVE_PROJECT', id: action.slice('file:openRecent:'.length) });
      return;
    }

    // ── 편집 ──
    if (action === 'edit:undo') { window.dispatchEvent(new CustomEvent('script:undo')); return; }
    if (action === 'edit:redo') { window.dispatchEvent(new CustomEvent('script:redo')); return; }
    if (action === 'edit:find')    { window.dispatchEvent(new CustomEvent('editor:flush')); setFindPanelMode('find');    if (!isMobile) setLeftCollapsed(false); return; }
    if (action === 'edit:replace') { window.dispatchEvent(new CustomEvent('editor:flush')); setFindPanelMode('replace'); if (!isMobile) setLeftCollapsed(false); return; }
    if (action === 'edit:cut') {
      const el = getEditor(); if (el) el.focus();
      document.execCommand('cut');
      return;
    }
    if (action === 'edit:copy') {
      const el = getEditor(); if (el) el.focus();
      document.execCommand('copy');
      return;
    }
    if (action === 'edit:paste') {
      const el = getEditor();
      if (!el) return;
      el.focus();
      navigator.clipboard.readText().then(text => {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      }).catch(() => { document.execCommand('paste'); });
      return;
    }
    if (action === 'edit:selectAll') {
      const el = getEditor();
      if (!el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }

    // ── 보기 ──
    if (action === 'view:toggleExplorer') { setLeftCollapsed(v => !v); toggleMenuCheck('toggle-explorer'); return; }
    if (action === 'view:toggleTopbar')  { toggleMenuCheck('toggle-topbar'); return; }
    if (action === 'view:splitView')     { toggleMenuCheck('split-view'); return; }
    if (action === 'view:focusMode') {
      const entering = !focusModeRef.current;
      setFocusMode(entering);
      toggleMenuCheck('focus-mode');
      if (entering) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
      return;
    }
    if (action === 'view:fullscreen') { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.(); return; }

    // ── 삽입 ──
    if (action === 'insert:charCheck') { window.dispatchEvent(new CustomEvent('script:charCheck'));    return; }
    if (action === 'insert:sceneRef')  { window.dispatchEvent(new CustomEvent('script:openSceneRef')); return; }
    if (action === 'insert:symbol')    { window.dispatchEvent(new CustomEvent('script:openSymbol'));   return; }
    if (action === 'insert:tag')       { window.dispatchEvent(new CustomEvent('script:openTag'));      return; }
    if (action?.startsWith('insert:')) {
      const typeMap = { scene: 'scene_number', action: 'action', dialogue: 'dialogue', transition: 'transition' };
      const raw = action.slice(7);
      window.dispatchEvent(new CustomEvent('script:setBlockType', { detail: { type: typeMap[raw] || raw } }));
      return;
    }

    // ── 서식 ──
    if (action === 'format:bold')          { applyInlineFormat('bold');      return; }
    if (action === 'format:italic')        { applyInlineFormat('italic');    return; }
    if (action === 'format:underline')     { applyInlineFormat('underline'); return; }
    if (action === 'format:styleSettings') { setStyleSettingsOpen(true);    return; }
    if (action === 'format:sceneFormat')   { setSceneFormatOpen(true);      return; }
    if (action === 'format:userSettings')  { setUserSettingsOpen(true);     return; }
    if (action === 'format:tagManage')     { setTagManageOpen(true);        return; }
    if (action?.startsWith('format:type:')) { window.dispatchEvent(new CustomEvent('script:setBlockType', { detail: { type: action.slice(12) } })); return; }
    if (action?.startsWith('format:font:')) { dispatch({ type: 'SET_STYLE_PRESET', payload: { fontFamily: action.slice('format:font:'.length) } }); return; }
    if (action?.startsWith('format:fontSize:')) { dispatch({ type: 'SET_STYLE_PRESET', payload: { fontSize: Number(action.slice('format:fontSize:'.length)) } }); return; }
    if (action?.startsWith('format:lineHeight:')) { dispatch({ type: 'SET_STYLE_PRESET', payload: { lineHeight: Number(action.slice('format:lineHeight:'.length)) / 100 } }); return; }
    if (action?.startsWith('format:dialogueGap:')) { dispatch({ type: 'SET_STYLE_PRESET', payload: { dialogueGap: action.slice('format:dialogueGap:'.length) + 'em' } }); return; }

    // ── 도구 ──
    if (action === 'tools:settings')  { setAppSettingsOpen(true); return; }
    if (action === 'tools:wordcount') { setWordCountOpen(true); return; }

    // ── 도움말 ──
    if (action === 'help:manual')  { window.open('/help.html', '_blank', 'noopener,noreferrer'); return; }
    if (action === 'help:about')   { window.open('/changelog.html', '_blank', 'noopener,noreferrer'); return; }
    if (action === 'help:notices') { setNoticesOpen(true); return; }
    if (action === 'help:qa')      { setQaOpen(true); return; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSave, dispatch, setFocusMode]);

  // 메뉴바 전용 신규 단축키 (기존 Ctrl+S/Z/Y/B/I/U 는 각자 핸들러에서 처리)
  useKeyboardShortcuts({
    'ctrl+alt+n': () => handleMenuAction('file:new'),
    'ctrl+o':     () => setOpenProjectOpen(true),
    'ctrl+alt+s': () => setSaveAsOpen(true),
    'ctrl+alt+l': () => setShareLinkOpen(true),
    'ctrl+alt+1': () => handleMenuAction('view:toggleExplorer'),
    'ctrl+alt+2': () => handleMenuAction('view:splitView'),
    'ctrl+f':     () => handleMenuAction('edit:find'),
    'ctrl+h':     () => handleMenuAction('edit:replace'),
  });

  const menuBar = (
    <MenuBar
      isDark={isDark}
      onToggleTheme={toggleTheme}
      onPrintPreview={() => { setExportDefaultFormat('pdf'); window.dispatchEvent(new CustomEvent('editor:flush')); setPrintPreviewOpen(true); }}
      onSave={handleSave}
      onSnapshot={() => setSnapshotOpen(true)}
      authUser={authUser}
      setAuthUser={setAuthUser}
      onSyncConflict={setSyncConflict}
      onMenuAction={handleMenuAction}
      recentProjects={recentProjects}
      menuCheckedItems={menuCheckedItems}
    />
  );
  const modals = (
    <>
      {/* ── Radix 기반 모달들 ── */}
      <NewProjectModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCommit={({ title, projectType, totalEpisodes, createEpisodes, totalMins, climaxStart, climaxEnd }) => {
          const p = { id: genId(), title, genre: '', status: 'draft', projectType, totalEpisodes, totalMins, climaxStart, climaxEnd, createdAt: now(), updatedAt: now() };
          dispatch({ type: 'ADD_PROJECT', payload: p });
          dispatch({ type: 'SET_ACTIVE_PROJECT', id: p.id });
          const count = Math.max(1, createEpisodes);
          const eps = Array.from({ length: count }, (_, i) => ({
            id: genId(), projectId: p.id, number: i + 1,
            title: '', majorEpisodes: '', summaryItems: [],
            status: 'draft', createdAt: now(), updatedAt: now(),
          }));
          eps.forEach(ep => dispatch({ type: 'ADD_EPISODE', payload: ep }));
          dispatch({ type: 'SET_ACTIVE_EPISODE', id: eps[0].id });
        }}
      />
      <OpenProjectModal
        open={openProjectOpen}
        onClose={() => setOpenProjectOpen(false)}
        projects={state.projects}
        activeProjectId={state.activeProjectId}
        onSelect={id => dispatch({ type: 'SET_ACTIVE_PROJECT', id })}
        onDelete={id => dispatch({ type: 'DELETE_PROJECT', id })}
      />
      <SaveAsModal
        open={saveAsOpen}
        onClose={() => setSaveAsOpen(false)}
        projectTitle={activeProject?.title}
        onExport={(format, filename) => console.log('[stub] export', format, filename)}
      />
      <ShareLinkModal
        open={shareLinkOpen}
        onClose={() => setShareLinkOpen(false)}
      />
      <WordCountModal  open={wordCountOpen}  onClose={() => setWordCountOpen(false)} />
      <ImportDocxModal    open={importDocxOpen}    onClose={() => setImportDocxOpen(false)} />
      <ImportHwpxModal    open={importHwpxOpen}    onClose={() => setImportHwpxOpen(false)} />
      <StyleSettingsModal open={styleSettingsOpen} onClose={() => setStyleSettingsOpen(false)} />
      <SceneFormatModal   open={sceneFormatOpen}   onClose={() => setSceneFormatOpen(false)} />
      <UserSettingsModal   open={userSettingsOpen} onClose={() => setUserSettingsOpen(false)} />
      <TagManageModal      open={tagManageOpen}    onClose={() => setTagManageOpen(false)} />
      <AppSettingsModal    open={appSettingsOpen}  onClose={() => setAppSettingsOpen(false)} />
      <NoticesModal        open={noticesOpen}      onClose={() => setNoticesOpen(false)} />
      <QnAModal            open={qaOpen}           onClose={() => setQaOpen(false)} />
      <ProjectInfoModal
        open={projectInfoOpen}
        onClose={() => setProjectInfoOpen(false)}
        project={activeProject}
        onSave={(patch) => {
          if (activeProject) dispatch({ type: 'UPDATE_PROJECT', payload: { ...activeProject, ...patch } });
        }}
      />

      <FindReplaceMobileModal
        open={isMobile && !!findPanelMode}
        initialMode={findPanelMode}
        onClose={() => setFindPanelMode(null)}
      />

      {printPreviewOpen && <PrintPreviewModal onClose={() => setPrintPreviewOpen(false)} defaultFormat={exportDefaultFormat} />}
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
            onPrintPreview={() => { setExportDefaultFormat('pdf'); window.dispatchEvent(new CustomEvent('editor:flush')); setPrintPreviewOpen(true); }}
            onSnapshot={() => setSnapshotOpen(true)}
            WorkTimer={WorkTimer}
            authUser={authUser}
            onLogout={() => setAuthUser(null)}
            onMenuAction={handleMenuAction}
            recentProjects={recentProjects}
            checkedItems={menuCheckedItems}
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
          {!viewCheckedItems['split-view'] && (
            <div style={{ display: focusMode ? 'none' : 'contents' }}>
              <CollapseButton side="left" collapsed={leftCollapsed} onToggle={() => setLeftCollapsed(v => !v)} />
              {!leftCollapsed && (
                <>
                  <div data-tour-id="left-panel" style={{ width: panelWidths.left, flexShrink: 0, overflow: 'hidden' }}>
                    <LeftPanel findMode={findPanelMode} onFindClose={() => setFindPanelMode(null)} />
                  </div>
                  <DragHandle onDrag={updateLeftWidth} isLeft />
                </>
              )}
            </div>
          )}

          {viewCheckedItems['split-view'] && !focusMode ? (
            <>
              <div style={{ display: focusMode ? 'none' : 'contents' }}>
                <CollapseButton side="left" collapsed={leftCollapsed} onToggle={() => setLeftCollapsed(v => !v)} />
                {!leftCollapsed && (
                  <>
                    <div data-tour-id="left-panel" style={{ width: panelWidths.left, flexShrink: 0, overflow: 'hidden' }}>
                      <LeftPanel findMode={findPanelMode} onFindClose={() => setFindPanelMode(null)} />
                    </div>
                    <DragHandle onDrag={updateLeftWidth} isLeft />
                  </>
                )}
              </div>
              <SplitViewPanel
                defaultTab="main"
                centerPanelNode={<CenterPanel scrollToSceneId={scrollToSceneId} onScrollHandled={() => setScrollToSceneId(null)} focusMode={focusMode} setFocusMode={setFocusMode} />}
                borderRight
              />
              <SplitViewPanel defaultTab="characters" />
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        {!focusMode && <StatusBar />}

        <div style={{ overflow: 'hidden', height: focusMode ? 0 : 'auto' }}>
          <div className="no-print" style={{ display: 'flex', gap: 6, margin: '0 8px 6px' }}>
            <AdBanner slot="bottom-fixed-1" mobileHide={false} height={48} style={{ flex: 1, borderRadius: 6, margin: 0 }} />
            <AdBanner slot="bottom-fixed-2" mobileHide={false} height={48} style={{ flex: 1, borderRadius: 6, margin: 0 }} />
            <AdBanner slot="bottom-fixed-3" mobileHide={false} height={48} style={{ flex: 1, borderRadius: 6, margin: 0 }} />
          </div>
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
      <div style={{ display: (focusMode || !viewCheckedItems['toggle-topbar']) ? 'none' : 'contents' }}>
        {menuBar}
        <UpdateBanner />
      </div>

      <div className="flex flex-1 min-h-0">
        {viewCheckedItems['split-view'] && !focusMode ? (
          /* ── 분할 보기: 좌패널 유지, 중앙을 50/50 분할 ── */
          <>
            <div style={{ display: 'contents' }}>
              <CollapseButton side="left" collapsed={leftCollapsed} onToggle={() => setLeftCollapsed(v => !v)} />
              {!leftCollapsed && (
                <>
                  <div data-tour-id="left-panel" style={{ width: panelWidths.left, flexShrink: 0, overflow: 'hidden' }}>
                    <LeftPanel findMode={findPanelMode} onFindClose={() => setFindPanelMode(null)} />
                  </div>
                  <DragHandle onDrag={updateLeftWidth} isLeft />
                </>
              )}
            </div>
            <SplitViewPanel
              defaultTab="main"
              centerPanelNode={
                <CenterPanel
                  scrollToSceneId={scrollToSceneId}
                  onScrollHandled={() => setScrollToSceneId(null)}
                  focusMode={focusMode}
                  setFocusMode={setFocusMode}
                />
              }
              borderRight
            />
            <SplitViewPanel defaultTab="characters" />
          </>
        ) : (
          /* ── 일반 보기 ── */
          <>
            <div style={{ display: focusMode ? 'none' : 'contents' }}>
              <CollapseButton side="left" collapsed={leftCollapsed} onToggle={() => setLeftCollapsed(v => !v)} />
              {!leftCollapsed && (
                <>
                  <div data-tour-id="left-panel" style={{ width: panelWidths.left, flexShrink: 0, overflow: 'hidden' }}>
                    <LeftPanel findMode={findPanelMode} onFindClose={() => setFindPanelMode(null)} />
                  </div>
                  <DragHandle onDrag={updateLeftWidth} isLeft />
                </>
              )}
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
          </>
        )}
      </div>

      {!focusMode && <StatusBar />}

      <div style={{ overflow: 'hidden', height: focusMode ? 0 : 'auto' }}>
        <div className="no-print" style={{ display: 'flex', gap: 6, margin: '0 8px 6px' }}>
          <AdBanner slot="bottom-fixed-1" mobileHide={false} height={48} style={{ flex: 1, borderRadius: 6, margin: 0 }} />
          <AdBanner slot="bottom-fixed-2" mobileHide={false} height={48} style={{ flex: 1, borderRadius: 6, margin: 0 }} />
          <AdBanner slot="bottom-fixed-3" mobileHide={false} height={48} style={{ flex: 1, borderRadius: 6, margin: 0 }} />
          <AdBanner slot="bottom-fixed-4" mobileHide={false} height={48} style={{ flex: 1, borderRadius: 6, margin: 0 }} />
        </div>
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
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
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
          브라우저 메뉴(···)에서 <strong>'외부 브라우저로 열기'</strong>를 선택 후 다시 시도해주세요.
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

  // 씬리스트 공유 링크 수신 → 로컬 저장 후 연출 작업실으로
  if (window.location.hash.startsWith('#sl=')) {
    try {
      const encoded = window.location.hash.slice(4);
      const data = JSON.parse(decodeURIComponent(escape(atob(encoded))));
      const key = 'director_received_scenelists';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      if (!existing.some(s => s.id === data.id)) {
        localStorage.setItem(key, JSON.stringify([data, ...existing]));
      }
    } catch {}
    window.location.hash = '#director';
    return <DirectorApp authUser={authUser} />;
  }

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
