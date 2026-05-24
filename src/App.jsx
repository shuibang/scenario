import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Undo2, Redo2, Sun, Moon, User, Clapperboard, ExternalLink, ChevronLeft, ChevronRight, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';
import { logShareSchema } from './utils/urlSchemas';
import { getTimelineColor } from './utils/color';
import { loadLogPayload, isShortReviewId as isUUID } from './utils/reviewShare';
import { AppProvider, useApp, mergeWorkLog, reducer as appReducer } from './store/AppContext';
import { getSceneFormat, rebuildSceneContent } from './utils/sceneFormat';
import { FONTS, FONT_STATUS, checkFontsAvailability, getFontPdfStatus, getFontByCssFamily, getFontPdfTooltip } from './print/FontRegistry';
import { getItem, setItem, getAll, setAll, DB_KEYS, clearDramaStorage, isPublicPcMode, genId, now } from './store/db';
import { setAccessToken, clearAccessToken, isTokenValid, saveSnapshot, saveDriveBackup, sanitizeFolderName } from './store/googleDrive';
import { handleDropboxCallback, consumeInitialDropboxCode, isDropboxTokenValid, saveDropboxBackup, connectDropbox, clearDropboxToken } from './store/dropbox';
import { getActiveProvider, setActiveProvider } from './store/storageProvider';
import { useDropboxAuthState } from './hooks/useDropboxAuthState';
import { describeDropboxError } from './utils/dropboxError';
import { serializeProject } from './utils/projectSerializer';
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
import DirectorNotesPage from './components/DirectorNotesPage';
import DirectorApp from './components/director/DirectorApp';
import TreatmentPage from './components/TreatmentPage';
import BiographyPage from './components/BiographyPage';
import RelationshipsPage from './components/RelationshipsPage';
import MyPage from './components/MyPage';
import ProjectsManagePage from './components/ProjectsManagePage';
import TrashPage from './components/TrashPage';
import OnboardingTour from './components/OnboardingTour';
import MobileOnboardingTour from './components/mobile/MobileOnboardingTour';
import SharedReviewView from './components/SharedReviewView';
import DirectorDeliveryView from './components/DirectorDeliveryView';
import SurveyPage from './components/SurveyPage';
import AdminPage from './components/admin/AdminPage';
import { isAdminHash, isAdminUser, getAdminHash } from './utils/adminAuth';
import { fetchAdminUnreadCounts } from './utils/adminBadge';
import { useBadges } from './utils/badges';
import { clearShareStatsCache } from './utils/shareStats';
import BadgeChip from './components/BadgeChip';
import BadgeToast from './components/BadgeToast';
import { Wrench, Lightbulb } from 'lucide-react';
import IdeaSheet from './components/ideas/IdeaSheet';
import IdeasFullPage from './components/ideas/IdeasFullPage';
import { applyIdeaSeed, buildProjectSeedFromIdea } from './store/promoteToProject';
import { migrateDocMemosToIdeas, hasMigrated as hasDocMemoMigrated } from './utils/migrateChecklistToIdeas';
import { fetchActiveContests as primeContestsCache } from './store/contestsApi';
import AdBanner, { KakaoAdBanner } from './components/AdBanner';
// ─── v2: extracted mobile components ──────────────────────────────────────────
import MobileMenuBar    from './components/mobile/MobileMenuBar';
import MobileBottomPanel from './components/mobile/MobileBottomPanel';
// ─── v2: shared utilities ─────────────────────────────────────────────────────
import { mobileTbtnStyle } from './styles/tokens';
import UpdateBanner from './components/UpdateBanner';
import { applyInlineFormat, stripHtml } from './utils/textFormat';
import * as findReplaceUtils from './utils/findReplace';
import FindReplaceMobileModal from './components/FindReplaceMobileModal';
import SnapshotPanel from './components/SnapshotPanel';
import SplitViewPanel from './components/SplitViewPanel';
import StatusBar from './components/StatusBar';
import PublicPcBadge from './components/PublicPcBadge';
import { getLayoutMetrics } from './print/LineTokenizer';
import { createFeedbackVersionShare } from './utils/reviewShare';
import { buildFeedbackSnapshot } from './utils/feedbackVersions';
import SizeGuardModal from './components/SizeGuardModal';
import { usePageTracking } from './hooks/usePageTracking';
import { useDriveAuthState } from './hooks/useDriveAuthState';
import { guardedSignInWithGoogle } from './utils/guardedSignIn';
import { describeDriveError } from './utils/driveError';
import Menubar from './components/Menubar/Menubar';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import OpenProjectModal  from './components/Modals/OpenProjectModal';
import ShareLinkModal    from './components/Modals/ShareLinkModal';
import ProjectInfoModal  from './components/Modals/ProjectInfoModal';
import NewProjectModal   from './components/Modals/NewProjectModal';
import ImportDocxModal       from './components/Modals/ImportDocxModal';
import ImportHwpxModal       from './components/Modals/ImportHwpxModal';
import StyleSettingsModal    from './components/Modals/StyleSettingsModal';
import UserSettingsModal     from './components/Modals/UserSettingsModal';
import InitialUserSettingsModal from './components/Modals/InitialUserSettingsModal';
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
  const [viewportHeight, setViewportHeight] = useState(0);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef(null);
  const dragStateRef = useRef(null);

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
    const syncMetrics = () => {
      setScrollTop(scrollEl.scrollTop);
      setContentHeight(scrollEl.scrollHeight);
      setViewportHeight(scrollEl.clientHeight);
    };
    const onScroll = () => setScrollTop(scrollEl.scrollTop);
    const ro = new ResizeObserver(syncMetrics);
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(scrollEl);
    syncMetrics();
    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [scrollEl]);

  // 1장 = 2분 고정, float 유지 → 0.5페이지 = 1.0분
  useEffect(() => {
    if (contentHeight <= viewportHeight) {
      dragStateRef.current = null;
      setDragging(false);
    }
  }, [contentHeight, viewportHeight]);

  const totalMins = totalPages * 2;
  const pxPerSec = contentHeight > 0 ? contentHeight / (totalMins * 60) : 0;
  const maxScrollTop = Math.max(0, contentHeight - viewportHeight);
  const thumbHeight = maxScrollTop > 0 ? 12 : 10;
  const thumbTravel = Math.max(0, viewportHeight - thumbHeight);
  const thumbTop = maxScrollTop > 0 && thumbTravel > 0
    ? (scrollTop / maxScrollTop) * thumbTravel
    : 0;

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

  const scrollTrackToClientY = useCallback((clientY, dragOffset) => {
    if (!scrollEl || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (!rect.height) return;
    if (maxScrollTop <= 0 || thumbTravel <= 0) {
      scrollEl.scrollTop = 0;
      return;
    }
    const pointerY = Math.min(Math.max(clientY - rect.top, 0), rect.height);
    const nextThumbTop = Math.min(Math.max(pointerY - dragOffset, 0), thumbTravel);
    const ratio = thumbTravel > 0 ? nextThumbTop / thumbTravel : 0;
    scrollEl.scrollTop = ratio * maxScrollTop;
  }, [scrollEl, maxScrollTop, thumbTravel]);

  const finishTrackDrag = useCallback((target, pointerId) => {
    if (!dragStateRef.current || dragStateRef.current.pointerId !== pointerId) return;
    dragStateRef.current = null;
    setDragging(false);
    try { target?.releasePointerCapture?.(pointerId); } catch {}
  }, []);

  const handleTrackPointerDown = useCallback((e) => {
    if (!scrollEl || maxScrollTop <= 0 || e.button !== 0) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect?.height) return;
    const pointerY = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    const clickedThumb = pointerY >= thumbTop && pointerY <= thumbTop + thumbHeight;
    const dragOffset = clickedThumb ? (pointerY - thumbTop) : (thumbHeight / 2);
    dragStateRef.current = { pointerId: e.pointerId, dragOffset };
    setDragging(true);
    e.preventDefault();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
    scrollTrackToClientY(e.clientY, dragOffset);
  }, [scrollEl, maxScrollTop, thumbHeight, thumbTop, scrollTrackToClientY]);

  const handleTrackPointerMove = useCallback((e) => {
    if (!dragStateRef.current || dragStateRef.current.pointerId !== e.pointerId) return;
    e.preventDefault();
    scrollTrackToClientY(e.clientY, dragStateRef.current.dragOffset);
  }, [scrollTrackToClientY]);

  return (
    <div
      className="shrink-0 select-none no-print"
      style={{ width: 36, borderLeft: '1px solid var(--c-border)', background: 'var(--c-panel)', display: 'flex', flexDirection: 'column' }}
    >
      {/* 툴바 높이 맞춤 빈 헤더 — 정렬용 스페이서 */}
      <div style={{ height: 37, flexShrink: 0, borderBottom: '1px solid var(--c-border2)' }} />

      {/* 눈금 영역 — 콘텐츠와 동기 스크롤 */}
      <div
        ref={trackRef}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onPointerUp={(e) => finishTrackDrag(e.currentTarget, e.pointerId)}
        onPointerCancel={(e) => finishTrackDrag(e.currentTarget, e.pointerId)}
        onLostPointerCapture={(e) => finishTrackDrag(e.currentTarget, e.pointerId)}
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          cursor: maxScrollTop > 0 ? (dragging ? 'grabbing' : 'grab') : 'default',
          touchAction: 'none',
        }}
      >

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
          pointerEvents: 'none',
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
        {viewportHeight > 0 && (
          <div style={{
            position: 'absolute',
            top: thumbTop,
            left: '50%',
            width: 8,
            marginLeft: -4,
            height: Math.max(thumbHeight, 0),
            borderRadius: 999,
            background: dragging ? 'rgba(96, 165, 250, 0.28)' : 'rgba(148, 163, 184, 0.16)',
            border: dragging ? '1px solid rgba(96, 165, 250, 0.55)' : '1px solid rgba(148, 163, 184, 0.28)',
            boxShadow: dragging ? '0 0 0 1px rgba(96, 165, 250, 0.15)' : 'none',
            pointerEvents: 'none',
            opacity: maxScrollTop > 0 ? 1 : 0.45,
            transition: dragging ? 'none' : 'background 120ms ease, border-color 120ms ease',
          }} />
        )}

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
function CenterPanel({ scrollToSceneId, onScrollHandled, keyboardUp, isMobile, focusMode, setFocusMode, onNewProject }) {
  const { state } = useApp();
  const { activeDoc, activeEpisodeId, activeProjectId, initialized } = state;

  if (!initialized) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--c-bg)' }}>
        <span style={{ color: 'var(--c-text6)' }} className="text-sm">불러오는 중…</span>
      </div>
    );
  }
  // MyPage / 대본 관리는 프로젝트와 무관하게 열람 가능 — 빈 상태에서도 진입할 수 있어야 함
  if (activeDoc === 'mypage') return <MyPage />;
  if (activeDoc === 'projects') return <ProjectsManagePage onNewProject={onNewProject} />;
  if (activeDoc === 'trash')    return <TrashPage />;
  if (!activeProjectId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ background: 'var(--c-bg)' }}>
        <div className="text-5xl" style={{ color: 'var(--c-border3)' }}>✎</div>
        <p style={{ color: 'var(--c-text5)' }} className="text-sm">좌측 패널에서 대본을 선택하거나 새로 만드세요</p>
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
export async function buildReviewURL(state, selections, options = {}) {
  const snapshotContent = buildFeedbackSnapshot(state, selections);
  const title = snapshotContent.projects?.[0]?.title || '피드백 버전';
  const share = await createFeedbackVersionShare({
    scriptId: state.activeProjectId,
    title,
    snapshotContent,
    watermarkText: options.watermarkText || null,
    senderBadge: options.senderBadge || null,
  });
  return share.url;
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
// 로컬 타임존 기준 YYYY-MM-DD (toISOString은 UTC라 자정 전후에 어긋남)
function toLocalDateKey(input) {
  const d = input instanceof Date ? input : new Date(input);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function WorkTimer({ projectId, documentId, onComplete, saveRef }) {
  const { state, dispatch } = useApp();
  const [elapsed, setElapsed] = useState(0);
  const [baselineSec, setBaselineSec] = useState(0); // 당일 projectId 누적(이전 저장본)
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

  // 공모전 보드 캐시 미리 채우기 — 메뉴 빨간점이 부팅 직후 정확하게 뜨도록
  useEffect(() => {
    const t = setTimeout(() => {
      primeContestsCache().catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  // DocMemo (문맥 패널 하단의 메모영역) 자리가 공모전 보드로 교체되면서,
  // 기존 사용자 메모(localStorage `drama_docMemo_<projectId>_<docKey>`)를
  // 아이디어 노트로 1회 자동 이전. INIT 충분히 끝난 시점 1회만.
  const docMemoMigratedRef = useRef(false);
  useEffect(() => {
    if (docMemoMigratedRef.current || hasDocMemoMigrated()) {
      docMemoMigratedRef.current = true;
      return;
    }
    const t = setTimeout(() => {
      if (docMemoMigratedRef.current) return;
      docMemoMigratedRef.current = true;
      migrateDocMemosToIdeas()
        .then((res) => {
          if (res?.migrated > 0 && typeof console !== 'undefined') {
            console.log(`[docMemo→ideas] ${res.migrated}개 메모 → ${res.groups}개 아이디어로 이전 완료`);
          }
        })
        .catch((err) => {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[docMemo→ideas] migration failed', err);
          }
        });
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  // 당일 누적 baseline — workTimeLogs 갱신 또는 projectId 변경 시 재계산
  useEffect(() => {
    if (!projectId) { setBaselineSec(0); return; }
    const key = toLocalDateKey(new Date());
    const base = (state.workTimeLogs || [])
      .filter(l => l && l.projectId === projectId && l.dateKey === key)
      .reduce((s, l) => s + (l.activeDurationSec || 0), 0);
    setBaselineSec(base);
  }, [projectId, state.workTimeLogs]);

  // projectId 변경 시 세션 상태 리셋
  useEffect(() => {
    elapsedRef.current = 0;
    setElapsed(0);
    startedAt.current = Date.now();
  }, [projectId]);

  // 이 세션(sinceTs 이후)에 완료 처리한 체크리스트 항목만 스냅샷에 담는다.
  // doneAt이 없는 과거 항목은 제외 — 한 번 체크한 항목이 이후 모든 기록에 따라붙던 문제 해결
  const buildSnapshot = (sinceTs) =>
    checklistRef.current
      .filter(it => it.projectId === projectId && it.done && it.doneAt && it.doneAt >= sinceTs)
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
    const onVisibility = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', onVisibility);

    tickTimer.current = setInterval(() => {
      if (activeRef.current) {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
      }
    }, 1000);
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdle));
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(idleTimer.current);
      clearInterval(tickTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, documentId]);

  const totalSec = baselineSec + elapsed;
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');

  const handleComplete = () => {
    if (elapsedRef.current > 0 && projectId) {
      dispatch({ type: 'ADD_WORK_LOG', payload: {
        projectId,
        documentId: documentId || null,
        startedAt: startedAt.current,
        completedAt: Date.now(),
        activeDurationSec: elapsedRef.current,
        dateKey: toLocalDateKey(startedAt.current),
        completedChecklistSnapshot: buildSnapshot(startedAt.current),
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
      dateKey: toLocalDateKey(startedAt.current),
      completedChecklistSnapshot: buildSnapshot(startedAt.current),
    };
    dispatch({ type: 'ADD_WORK_LOG', payload: entry });
    // IndexedDB에 직접 기록 (페이지 언로드 시 state 업데이트가 persist되기 전에 닫힐 수 있으므로)
    // 같은 projectId+dateKey 엔트리가 있으면 병합 — reducer와 동일 로직
    const updated = mergeWorkLog(workLogsRef.current, entry);
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
function MenuBar({ isDark, onToggleTheme, onPrintPreview, onSave, onSnapshot, authUser, setAuthUser, onMenuAction, recentProjects, menuCheckedItems, cloudSaveOptions = [], isMobile = false }) {
  const { state, dispatch } = useApp();
  const { saveStatus, saveErrorMsg, activeProjectId, stylePreset, undoStack, redoStack, savedAt } = state;
  const canUndo = undoStack?.length > 0 || !!activeProjectId;
  const [scriptCanRedo, setScriptCanRedo] = useState(false);
  const timerSaveRef = useRef(null);

  const activeProject = state.projects.find(p => p.id === activeProjectId);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // 사용자 대표 뱃지 — 메뉴바 이름 앞에 표시
  const { featured: userBadge } = useBadges();

  // 어드민 unread 뱃지 — 미해결 오류/자동오류/새 설문응답 합계
  const [adminUnread, setAdminUnread] = useState(0);
  useEffect(() => {
    if (!isAdminUser(authUser)) { setAdminUnread(0); return; }
    let cancelled = false;
    const tick = async () => {
      if (document.hidden) return;
      const { total } = await fetchAdminUnreadCounts();
      if (!cancelled) setAdminUnread(total);
    };
    tick();
    // 어드민 진입/탈출 시(hashchange)와 5분 간격으로 갱신. 탭 복귀 시에도 즉시 갱신.
    const onHash = () => tick();
    const onVisible = () => { if (!document.hidden) tick(); };
    window.addEventListener('hashchange', onHash);
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(tick, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(id);
    };
  }, [authUser]);

  // savedAt/activeProjectId 기준 라벨 계산. 마운트 시 (창 크기 변경 등) 빈 라벨로 잠깐 보였다가 채워지는 깜빡임 방지 위해 함수 추출 + 첫 useState에서 즉시 평가.
  const computeSavedLabel = (sa, pid) => {
    if (!sa || !pid) return '';
    const mins = Math.floor((Date.now() - sa) / 60_000);
    if (mins < 1)  return '방금 저장됨';
    if (mins < 60) return `${mins}분 전 저장`;
    return `${Math.floor(mins / 60)}시간 전 저장`;
  };
  const [savedLabel, setSavedLabel] = useState(() => computeSavedLabel(savedAt, activeProjectId));
  useEffect(() => {
    const update = () => setSavedLabel(computeSavedLabel(savedAt, activeProjectId));
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [savedAt, activeProjectId]);

  const canRedo = redoStack?.length > 0 || scriptCanRedo;
  const [activeAlignment, setActiveAlignment] = useState(null);
  useEffect(() => {
    const handler = (e) => setActiveAlignment(e.detail);
    window.addEventListener('script:alignment:state', handler);
    return () => window.removeEventListener('script:alignment:state', handler);
  }, []);
  useEffect(() => {
    const handler = (e) => setScriptCanRedo(e.detail?.canRedo ?? false);
    window.addEventListener('scriptundostate', handler);
    return () => window.removeEventListener('scriptundostate', handler);
  }, []);

  const [fontAvailability, setFontAvail] = useState(null);
  useEffect(() => { checkFontsAvailability().then(setFontAvail); }, []);

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
  const latestStateRef = useRef(state);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

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
          onClick={() => { window.location.href = '/'; }}
          title="홈으로"
          className="flex items-center gap-1.5 shrink-0 rounded px-2 py-1"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', transition: 'background 120ms' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <img src="/favicon.svg" alt="" className="editor-brand-favicon" />
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
          <RealtimeClock />
          {activeProjectId && <WorkTimer key={activeProjectId} projectId={activeProjectId} documentId={state.activeEpisodeId || state.activeDoc} saveRef={timerSaveRef} />}
          <PublicPcBadge onClick={() => onMenuAction?.('tools:settings')} />

          <div style={{ width: 1, height: 16, background: 'var(--c-border3)', flexShrink: 0 }} />

          {/* 사용자 — 프로필 아이콘은 우측 마이페이지 진입 버튼에서만 노출(중복 방지) */}
          {authUser ? (
            <div className="flex items-center gap-1.5">
              {userBadge && <BadgeChip badge={userBadge} size={18} tooltip="label" />}
              <span style={{ fontSize: 12, color: 'var(--c-text4)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{authUser.name}</span>
              <button onClick={async () => {
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
                  await clearDramaStorage();   // localStorage drama_* + IDB 모두 wipe (await로 IDB 완료 보장)
                  window.location.reload();
                  return;
                }
                setDriveStatus('none');
                setAuthUser(null);
              }}
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
          {/* 어드민 진입 — admin 이메일이고 라우트 토큰이 설정된 경우에만 노출 */}
          {isAdminUser(authUser) && getAdminHash() && (
            <button
              onClick={() => { window.location.hash = getAdminHash(); }}
              title={adminUnread > 0 ? `관리자 — 새 자료 ${adminUnread}건` : '관리자'}
              className="flex items-center justify-center rounded"
              style={{ ...iconBtnStyle, color: 'var(--c-accent)', position: 'relative' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Wrench size={14} strokeWidth={2} />
              {adminUnread > 0 && (
                <span
                  aria-label={`새 자료 ${adminUnread}건`}
                  style={{
                    position: 'absolute',
                    top: 2, right: 2,
                    width: 7, height: 7,
                    borderRadius: '50%',
                    background: '#ef4444',
                    boxShadow: '0 0 0 1.5px var(--c-bg)',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Row 2: Radix 메뉴바 + 아이디어 노트 버튼 ── */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Menubar
            onAction={onMenuAction}
            recentProjects={recentProjects}
            checkedItems={menuCheckedItems}
            cloudSaveOptions={cloudSaveOptions}
          />
        </div>
        {!isMobile && (
          <button
            data-idea-trigger
            onClick={() => onMenuAction?.('ideas:open')}
            title="아이디어 노트"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              height: 24, padding: '0 10px',
              margin: '0 8px',
              fontSize: 12, fontWeight: 600,
              color: 'var(--c-accent)',
              background: 'var(--c-active)',
              border: '1px solid var(--c-accent)',
              borderRadius: 6,
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--c-accent)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--c-active)';
              e.currentTarget.style.color = 'var(--c-accent)';
            }}
          >
            <Lightbulb size={13} strokeWidth={2.2} />
            <span>아이디어 노트</span>
          </button>
        )}
      </div>

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
        <span style={{ fontSize: 11, color: 'var(--c-text5)', flexShrink: 0, letterSpacing: '-0.01em' }}>글꼴</span>
        <select value={stylePreset?.fontFamily ?? '함초롬바탕'} onChange={handleFontFamily} style={{ ...selectStyle, maxWidth: 110 }}>
          <optgroup label="내장 글꼴">
            {FONTS.filter(f => f.sourceType === 'bundled').map(f => {
              const status  = getFontPdfStatus(f.id, fontAvailability);
              // pdfBlocked는 SYSTEM 상태로 통일 → ⚠ 뱃지 + 툴팁 안내.
              const badge   = status === FONT_STATUS.FULL ? ' ✓' : status === FONT_STATUS.PARTIAL ? ' △' : status === FONT_STATUS.UNAVAILABLE ? ' ✗' : status === FONT_STATUS.SYSTEM ? ' ⚠' : '';
              const tooltip = getFontPdfTooltip(f);
              return <option key={f.id} value={f.cssFamily} title={tooltip}>{f.displayName}{badge}</option>;
            })}
          </optgroup>
          <optgroup label="시스템 글꼴">
            {FONTS.filter(f => f.sourceType === 'system').map(f => (
              <option key={f.id} value={f.cssFamily} title={getFontPdfTooltip(f)}>{f.displayName}</option>
            ))}
          </optgroup>
        </select>
        {fontStatusBadge}

        <span style={{ fontSize: 11, color: 'var(--c-text5)', marginLeft: 4, flexShrink: 0, letterSpacing: '-0.01em' }}>크기</span>
        <select value={stylePreset?.fontSize ?? 11} onChange={handleFontSize} style={selectStyle}>
          {[9,10,11,12,13,14,16,18].map(s => <option key={s} value={s}>{s}pt</option>)}
        </select>

        {sep}

        <span style={{ fontSize: 11, color: 'var(--c-text5)', flexShrink: 0, letterSpacing: '-0.01em' }}>간격</span>
        <input type="range" min="4" max="14" step="0.5"
          value={parseFloat(stylePreset?.dialogueGap ?? '7')}
          onChange={e => dispatch({ type: 'SET_STYLE_PRESET', payload: { dialogueGap: `${e.target.value}em` } })}
          style={{ width: 60, accentColor: 'var(--c-accent)', cursor: 'pointer', flexShrink: 0 }}
        />
        <span style={{ fontSize: 11, color: 'var(--c-text4)', minWidth: '2.5rem', flexShrink: 0 }}>{stylePreset?.dialogueGap ?? '7em'}</span>

        {sep}

        {/* B / I / U / S */}
        {[
          { label: 'B', title: '굵게 (Ctrl+B)',          tag: 'bold',          cls: 'font-bold' },
          { label: 'I', title: '기울임 (Ctrl+I)',        tag: 'italic',        cls: 'italic' },
          { label: 'U', title: '밑줄 (Ctrl+U)',          tag: 'underline',     cls: 'underline' },
          { label: 'S', title: '취소선 (Ctrl+Shift+X)',  tag: 'strikethrough', cls: 'line-through' },
        ].map(({ label, title, tag, cls }) => (
          <button key={tag} title={title}
            onMouseDown={e => { e.preventDefault(); applyInlineFormat(tag); }}
            className={`flex items-center justify-center shrink-0 rounded ${cls}`}
            style={{ ...iconBtnStyle }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >{label}</button>
        ))}

        {sep}

        {/* 정렬 */}
        {[
          { Icon: AlignLeft,    title: '왼쪽 정렬',  align: 'left' },
          { Icon: AlignCenter,  title: '가운데 정렬', align: 'center' },
          { Icon: AlignRight,   title: '오른쪽 정렬', align: 'right' },
          { Icon: AlignJustify, title: '양쪽 정렬',  align: 'justify' },
        ].map(({ Icon, title, align }) => (
          <button key={align} title={title}
            onMouseDown={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('script:alignment', { detail: align })); }}
            className="flex items-center justify-center shrink-0 rounded"
            style={{ ...iconBtnStyle, background: activeAlignment === align ? 'var(--c-active)' : 'transparent', color: activeAlignment === align ? 'var(--c-accent)' : undefined }}
            onMouseEnter={e => { if (activeAlignment !== align) e.currentTarget.style.background = 'var(--c-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = activeAlignment === align ? 'var(--c-active)' : 'transparent'; }}
          ><Icon size={14} strokeWidth={2} /></button>
        ))}

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

function DriveSaveNameDialog({ isDark, defaultValue, onConfirm, onCancel }) {
  const [name, setName] = useState(defaultValue);
  const inputRef = useRef(null);
  useEffect(() => { requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); }); }, []);
  const confirm = () => { const t = name.trim(); if (t) onConfirm(t); };
  const bg = isDark ? '#1a2236' : '#fff';
  const text = isDark ? '#e8eaf6' : '#111';
  const sub = isDark ? '#9ca3af' : '#6b7280';
  const inputBg = isDark ? '#0f1623' : '#f5f7fa';
  const border = isDark ? '#2d3a50' : '#d1d5db';
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.52)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{ background: bg, color: text, borderRadius: 16, padding: '28px 32px 24px', width: 380, maxWidth: 'calc(100vw - 40px)', boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); else if (e.key === 'Enter') confirm(); }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>☁ Drive에 저장</div>
        <div style={{ fontSize: 13, color: sub, marginBottom: 8 }}>파일 이름</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1, background: inputBg, border: `1px solid ${border}`, borderRadius: 8, padding: '10px 14px', fontSize: 14, color: text, outline: 'none', fontFamily: 'inherit' }}
            spellCheck={false}
          />
          <span style={{ fontSize: 13, color: sub, userSelect: 'none', flexShrink: 0 }}>.djs</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
          <button onClick={onCancel} style={{ padding: '9px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, background: 'transparent', border: `1px solid ${border}`, color: sub, cursor: 'pointer' }}>취소</button>
          <button onClick={confirm} disabled={!name.trim()} style={{ padding: '9px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, background: name.trim() ? '#2563eb' : (isDark ? '#1e2a3a' : '#e5e7eb'), color: name.trim() ? '#fff' : sub, border: 'none', cursor: name.trim() ? 'pointer' : 'default', transition: 'background 0.15s' }}>저장</button>
        </div>
      </div>
    </div>
  );
}

const getDriveFilenameKey = (projectId) => `drama_drive_filename_${projectId}`;

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
  const { state, dispatch } = useApp();

  // Panel widths with localStorage persistence
  const [panelWidths, setPanelWidths] = useState(() => loadPanelWidths());

  // 분할 뷰 너비 — updateSplitWidth 클램프 범위(240~700 px)와 일관
  const [splitViewWidth, setSplitViewWidth] = useState(() =>
    Math.min(700, Math.max(240, Math.round(window.innerWidth * 0.3)))
  );

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

  // ── 클라우드 저장소 프로바이더 상태
  const { valid: driveTokenValid } = useDriveAuthState();
  const { valid: dropboxTokenValid } = useDropboxAuthState();
  const [activeProvider, setActiveProviderState] = useState(() => getActiveProvider());
  useEffect(() => {
    const handler = (e) => setActiveProviderState(e.detail?.provider || getActiveProvider());
    window.addEventListener('storage:provider-changed', handler);
    return () => window.removeEventListener('storage:provider-changed', handler);
  }, []);

  // ── 아이디어 노트 Drive pull — 모바일 포함 모든 레이아웃에서 실행
  useEffect(() => {
    if (!authUser || !driveTokenValid) return;
    let cancelled = false;
    (async () => {
      try {
        const { pullIdeasFromDrive } = await import('./store/ideasStore');
        const res = await pullIdeasFromDrive();
        if (cancelled) return;
        if (res?.ok && (res.added > 0 || res.updated > 0)) {
          console.log('[ideas] Drive 머지 완료:', res);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [authUser, driveTokenValid]);

  // ── 아이디어 노트 시트
  const [ideaSheetOpen, setIdeaSheetOpen] = useState(false);
  const [promoteIdea, setPromoteIdea] = useState(null);   // 대본으로 승격 중인 아이디어
  const savedRightCollapsedRef = useRef(null);            // 시트 열기 직전 우측 패널 상태
  const savedRightForFeedbackRef = useRef(null);          // 피드백 노트 진입 직전 우측 패널 상태

  // 시트 열림 ↔ 우측 패널 자동 닫음 / 복원
  useEffect(() => {
    if (ideaSheetOpen) {
      if (savedRightCollapsedRef.current === null) {
        savedRightCollapsedRef.current = rightCollapsed;
        if (!rightCollapsed) setRightCollapsed(true);
      }
    } else {
      if (savedRightCollapsedRef.current !== null) {
        const prev = savedRightCollapsedRef.current;
        savedRightCollapsedRef.current = null;
        // 시트 열린 동안 사용자가 직접 토글했으면 강제로 복원하지 않음
        // — 현재 rightCollapsed 가 우리가 닫은 그 상태 그대로일 때만 복원
        if (rightCollapsed === true) setRightCollapsed(prev);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaSheetOpen]);

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

  // 피드백 노트 열림 ↔ 우측 패널 자동 닫음 / 복원
  useEffect(() => {
    const isFeedback = state.activeDoc === 'director_notes';
    if (isFeedback) {
      if (savedRightForFeedbackRef.current === null) {
        savedRightForFeedbackRef.current = rightCollapsed;
        if (!rightCollapsed) setRightCollapsed(true);
      }
    } else {
      if (savedRightForFeedbackRef.current !== null) {
        const prev = savedRightForFeedbackRef.current;
        savedRightForFeedbackRef.current = null;
        if (rightCollapsed === true) setRightCollapsed(prev);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const latestStateRef = useRef(state);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  const waitForEditorFlush = useCallback(() => new Promise(resolve => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setTimeout(resolve, 32);
      return;
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  }), []);

  const [saveToast, setSaveToast] = useState(false);
  const [saveToastMsg, setSaveToastMsg] = useState('저장되었습니다');
  const saveToastTimer = useRef(null);

  // Dropbox OAuth 콜백 결과 수신 (App 컴포넌트에서 발행)
  useEffect(() => {
    const handler = (e) => {
      clearTimeout(saveToastTimer.current);
      if (e.detail?.ok) {
        setSaveToastMsg('Dropbox 연결됨');
      } else {
        const { userMsg } = describeDropboxError({
          message: e.detail?.message || 'UNKNOWN',
          dropboxStatus: e.detail?.status,
          dropboxTag: e.detail?.tag,
        });
        setSaveToastMsg(userMsg || 'Dropbox 연결에 실패했어요.');
      }
      setSaveToast(true);
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 5000);
    };
    window.addEventListener('dropbox:callback-result', handler);
    return () => window.removeEventListener('dropbox:callback-result', handler);
  }, []);
  const [driveSaveDialog, setDriveSaveDialog] = useState({ open: false, defaultName: '' });
  const driveSaveResolveRef = useRef(null);
  const promptDriveSaveName = useCallback((defaultName) => new Promise((resolve) => {
    driveSaveResolveRef.current = resolve;
    setDriveSaveDialog({ open: true, defaultName });
  }), []);

  // ── 새 버전 감지 폴링
  const [newVersionReady, setNewVersionReady] = useState(false);
  const [updatingVersion, setUpdatingVersion] = useState(false);
  const [availableVersion, setAvailableVersion] = useState(null);
  const dismissedUpdateVersionRef = useRef(null);
  useEffect(() => {
    const DISMISS_KEY = 'drama_dismissed_update_version';
    try { dismissedUpdateVersionRef.current = localStorage.getItem(DISMISS_KEY); } catch {}
    let active = true;
    const currentVersion = import.meta.env.VITE_BUILD_VERSION ?? 'dev';
    const check = async () => {
      try {
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = await res.json();
        if (!active) return;
        if (version === 'dev' || currentVersion === 'dev') return;
        if (version === currentVersion) {
          if (dismissedUpdateVersionRef.current === version) {
            try { localStorage.removeItem(DISMISS_KEY); } catch {}
            dismissedUpdateVersionRef.current = null;
          }
          return;
        }
        if (dismissedUpdateVersionRef.current === version) return;
        setAvailableVersion(version);
        setNewVersionReady(true);
      } catch { /* 무시 */ }
    };
    check();
    const id = setInterval(check, 5 * 60 * 1000); // 5분마다
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // 10분마다 자동저장 스냅샷
  // 과거에는 dependency가 [state]라 매 편집마다 타이머가 리셋되어
  // 활발히 작업 중인 사용자에게는 자동 스냅샷이 거의 발동하지 않았음.
  // 최신 state는 ref로 읽고, 타이머는 init 시 한 번만 건다.
  const autoSnapStateRef = useRef(state);
  useEffect(() => { autoSnapStateRef.current = state; }, [state]);
  useEffect(() => {
    if (!state.initialized) return;
    const AUTO_INTERVAL = 10 * 60 * 1000;
    const timer = setInterval(async () => {
      const s = autoSnapStateRef.current;
      if (!s?.initialized || !s.activeProjectId) return;
      try {
        const snap = serializeProject(s, s.activeProjectId);
        if (snap) await saveSnapshot(snap, '자동저장', 'auto');
      } catch {}
    }, AUTO_INTERVAL);
    return () => clearInterval(timer);
  }, [state.initialized]);

  const promptDriveReauthForSave = useCallback(() => {
    if (!authUser) {
      clearTimeout(saveToastTimer.current);
      setSaveToastMsg('Drive 로그인 필요 — 백업 기록은 저장되지 않았습니다');
      setSaveToast(true);
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 3500);
      return;
    }

    clearTimeout(saveToastTimer.current);
    setSaveToastMsg('Drive 재로그인이 필요해요. 로그인 창을 열고 있어요.');
    setSaveToast(true);
    saveToastTimer.current = setTimeout(() => setSaveToast(false), 3500);
    guardedSignInWithGoogle();
  }, [authUser]);

  const handleSaveToDrive = useCallback(async () => {
    window.dispatchEvent(new Event('script:requestSave'));
    await waitForEditorFlush();

    const latestState = latestStateRef.current;
    const projectSnap = latestState.activeProjectId
      ? serializeProject(latestState, latestState.activeProjectId) : null;
    if (!projectSnap) return;

    try { await saveSnapshot(projectSnap, '수동저장', 'manual'); } catch {}

    const projectId = latestState.activeProjectId;
    let filename = localStorage.getItem(getDriveFilenameKey(projectId));

    if (!filename) {
      // 첫 저장 — 파일명 선택 후 기억
      const safeTitle = sanitizeFolderName(projectSnap.project?.title || '대본');
      const chosen = await promptDriveSaveName(safeTitle);
      if (!chosen) return;
      filename = chosen.endsWith('.djs') ? chosen : `${chosen}.djs`;
      localStorage.setItem(getDriveFilenameKey(projectId), filename);
    }

    clearTimeout(saveToastTimer.current);
    setSaveToastMsg('☁ 저장 중…');
    setSaveToast(true);

    try {
      if (!isTokenValid()) await refreshDriveToken();
      if (!isTokenValid()) { setSaveToast(false); promptDriveReauthForSave(); return; }

      await saveDriveBackup(projectSnap, filename);

      clearTimeout(saveToastTimer.current);
      setSaveToastMsg('☁ 저장됨');
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 2500);
    } catch (error) {
      const { kind } = describeDriveError(error);
      clearTimeout(saveToastTimer.current);
      setSaveToastMsg('저장 실패 — 다시 시도');
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 3500);
      if (kind === 'auth' || error?.message?.includes('401') || error?.message?.includes('DRIVE_AUTH_REQUIRED')) {
        promptDriveReauthForSave();
      }
    }
  }, [waitForEditorFlush, promptDriveReauthForSave, promptDriveSaveName]);

  // Dropbox에 저장
  const handleSaveToDropbox = useCallback(async () => {
    window.dispatchEvent(new Event('script:requestSave'));
    await waitForEditorFlush();

    const latestState = latestStateRef.current;
    const projectSnap = latestState.activeProjectId
      ? serializeProject(latestState, latestState.activeProjectId) : null;
    if (!projectSnap) return;

    try { await saveSnapshot(projectSnap, '수동저장', 'manual'); } catch {}

    if (!isDropboxTokenValid()) {
      clearTimeout(saveToastTimer.current);
      setSaveToastMsg('Dropbox 연결이 필요해요.');
      setSaveToast(true);
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 3500);
      connectDropbox();
      return;
    }

    clearTimeout(saveToastTimer.current);
    setSaveToastMsg('☁ 저장 중…');
    setSaveToast(true);

    try {
      await saveDropboxBackup(projectSnap);
      clearTimeout(saveToastTimer.current);
      setSaveToastMsg('☁ Dropbox 저장됨');
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 2500);
    } catch (error) {
      console.error('[Dropbox] backup save failed:', error);
      const { kind, userMsg } = describeDropboxError(error);
      clearTimeout(saveToastTimer.current);
      setSaveToastMsg(userMsg || '저장 실패 — 다시 시도');
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 3500);
      if (kind === 'auth') connectDropbox();
    }
  }, [waitForEditorFlush]);

  // 활성 프로바이더로 클라우드 저장
  const handleSaveToCloud = useCallback(() => {
    if (getActiveProvider() === 'dropbox') handleSaveToDropbox();
    else handleSaveToDrive();
  }, [handleSaveToDropbox, handleSaveToDrive]);

  // Drive에 다른 이름으로 저장 (Ctrl+Shift+S) — 항상 파일명 dialog 표시
  const handleSaveToLocalDrive = useCallback(async () => {
    window.dispatchEvent(new Event('script:requestSave'));
    await waitForEditorFlush();

    const latestState = latestStateRef.current;
    const projectSnap = latestState.activeProjectId
      ? serializeProject(latestState, latestState.activeProjectId) : null;
    if (!projectSnap) return;

    try { await saveSnapshot(projectSnap, '수동저장', 'manual'); } catch {}

    const projectId = latestState.activeProjectId;
    const saved = localStorage.getItem(getDriveFilenameKey(projectId));
    const defaultName = saved ? saved.replace(/\.djs$/, '') : sanitizeFolderName(projectSnap.project?.title || '대본');
    const chosen = await promptDriveSaveName(defaultName);
    if (!chosen) return;
    const filename = chosen.endsWith('.djs') ? chosen : `${chosen}.djs`;
    localStorage.setItem(getDriveFilenameKey(projectId), filename);

    clearTimeout(saveToastTimer.current);
    setSaveToastMsg('☁ 저장 중…');
    setSaveToast(true);

    try {
      if (!isTokenValid()) await refreshDriveToken();
      if (!isTokenValid()) { setSaveToast(false); promptDriveReauthForSave(); return; }

      await saveDriveBackup(projectSnap, filename);

      clearTimeout(saveToastTimer.current);
      setSaveToastMsg('☁ 저장됨');
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 2500);
    } catch (error) {
      const { kind } = describeDriveError(error);
      clearTimeout(saveToastTimer.current);
      setSaveToastMsg('저장 실패 — 다시 시도');
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 3500);
      if (kind === 'auth' || error?.message?.includes('401') || error?.message?.includes('DRIVE_AUTH_REQUIRED')) {
        promptDriveReauthForSave();
      }
    }
  }, [waitForEditorFlush, promptDriveReauthForSave, promptDriveSaveName]);

  // 열기 모달 로컬 탭에서 개별 대본 → Drive 저장 (활성 대본이 아니어도 동작)
  const handleSaveToDriveLocal = useCallback(async (project) => {
    if (!project?.id) return;

    if (!isTokenValid()) {
      clearTimeout(saveToastTimer.current);
      setSaveToastMsg('Drive에 연결 후 이용할 수 있어요');
      setSaveToast(true);
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 3000);
      return;
    }

    const latestState = latestStateRef.current;
    const projectSnap = serializeProject(latestState, project.id);
    if (!projectSnap) return;

    const saved = localStorage.getItem(getDriveFilenameKey(project.id));
    let filename = saved;
    if (!filename) {
      const safeTitle = sanitizeFolderName(project.title || '대본');
      filename = `${safeTitle}.djs`;
      localStorage.setItem(getDriveFilenameKey(project.id), filename);
    }

    clearTimeout(saveToastTimer.current);
    setSaveToastMsg('☁ 저장 중…');
    setSaveToast(true);

    try {
      if (!isTokenValid()) await refreshDriveToken();
      if (!isTokenValid()) { setSaveToast(false); promptDriveReauthForSave(); return; }

      await saveDriveBackup(projectSnap, filename);

      clearTimeout(saveToastTimer.current);
      setSaveToastMsg('☁ 저장됨');
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 2500);
    } catch (error) {
      const { kind } = describeDriveError(error);
      clearTimeout(saveToastTimer.current);
      setSaveToastMsg('저장 실패 — 다시 시도');
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 3500);
      if (kind === 'auth' || error?.message?.includes('401') || error?.message?.includes('DRIVE_AUTH_REQUIRED')) {
        promptDriveReauthForSave();
      }
    }
  }, [promptDriveReauthForSave]);

  const handleSaveToLocal = useCallback(async () => {
    clearTimeout(saveToastTimer.current);
    setSaveToastMsg('💾 파일 저장 창이 열립니다…');
    setSaveToast(true);

    window.dispatchEvent(new Event('script:requestSave'));
    await waitForEditorFlush();

    const latestState = latestStateRef.current;
    const projectSnap = latestState.activeProjectId
      ? serializeProject(latestState, latestState.activeProjectId) : null;
    if (!projectSnap) { setSaveToast(false); return; }

    try { await saveSnapshot(projectSnap, '수동저장', 'manual'); } catch {}

    try {
      const djs_readme = '이 파일은 대본작업실(daejak.kr) 전용 파일입니다. 일반 텍스트 편집기로 열지 마세요. daejak.kr에 접속한 후 파일 열기 메뉴에서 불러올 수 있습니다.';
      const blob = new Blob([JSON.stringify({ _readme: djs_readme, ...projectSnap }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFolderName(projectSnap.project?.title || '대본')}.djs`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      clearTimeout(saveToastTimer.current);
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 1500);
    } catch {
      clearTimeout(saveToastTimer.current);
      setSaveToastMsg('저장 실패 — 다시 시도');
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 3500);
    }
  }, [waitForEditorFlush]);

  // 전역 저장 단축키: Ctrl+S / Ctrl+Shift+S / Ctrl+Alt+S
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyS') return;
      e.preventDefault();
      if (e.shiftKey)     handleSaveToLocalDrive(); // 다른 이름으로 Drive 저장
      else if (e.altKey)  handleSaveToLocal();       // 내 컴퓨터에 저장
      else                handleSaveToCloud();        // 활성 클라우드 프로바이더에 저장
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSaveToCloud, handleSaveToLocalDrive, handleSaveToLocal]);

  const contextSceneId = state.scrollToSceneId;
  useEffect(() => {
    if (contextSceneId) {
      setScrollToSceneId(contextSceneId);
      dispatch({ type: 'SET_SCROLL_TO_SCENE', id: null });
    }
  }, [contextSceneId, dispatch]);

  // ── 메뉴바 모달 상태 ────────────────────────────────────────────────────────
  const [newProjectOpen,      setNewProjectOpen]      = useState(false);
  const [openProjectOpen,     setOpenProjectOpen]     = useState(false);
  const [shareLinkOpen,       setShareLinkOpen]       = useState(false);
  const [projectInfoOpen, setProjectInfoOpen] = useState(false);
  const [findPanelMode,   setFindPanelMode]   = useState(null); // null | 'find' | 'replace'
  const [importDocxOpen,       setImportDocxOpen]       = useState(false);
  const [importHwpxOpen,       setImportHwpxOpen]       = useState(false);
  const [styleSettingsOpen,    setStyleSettingsOpen]    = useState(false);
  const [userSettingsOpen,     setUserSettingsOpen]     = useState(false);
  const [userSettingsTab,      setUserSettingsTab]      = useState('sceneHeader');
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
      'font-hamcho':     fontFamily === '함초롬바탕' || fontFamily === '함초롱바탕',
      'font-noto-serif': fontFamily === 'Noto Serif KR',
      'font-noto-sans':  fontFamily === 'Noto Sans KR',
      'font-malgun':     fontFamily === 'Malgun Gothic',
      'font-nanum':      fontFamily === '나눔명조',
      [`fontsize-${fontSize}`]: true,
      [`lh-${lineHeightPct}`]:  true,
      [`dgap-${dgap}`]:         true,
      'cloud-save-google':  activeProvider === 'google',
      'cloud-save-dropbox': activeProvider === 'dropbox',
    };
  }, [viewCheckedItems, activeProject?.stylePreset, activeProvider]);

  // 클라우드 저장 서브메뉴 옵션 (파일메뉴 동적 삽입)
  const cloudSaveOptions = useMemo(() => [
    {
      id: 'cloud-save-google',
      label: 'Google Drive에 저장',
      action: 'file:saveCloud:google',
      checkable: true,
      shortcut: driveTokenValid ? '연결됨' : '미연결',
    },
    {
      id: 'cloud-save-dropbox',
      label: 'Dropbox에 저장',
      action: 'file:saveCloud:dropbox',
      checkable: true,
      shortcut: dropboxTokenValid ? '연결됨' : '미연결',
    },
    ...(dropboxTokenValid ? [
      'separator',
      { id: 'dropbox-disconnect', label: 'Dropbox 연결 해제', action: 'file:dropboxDisconnect' },
    ] : []),
  ], [driveTokenValid, dropboxTokenValid]);

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
    if (action === 'file:saveToDrive')   { handleSaveToDrive(); return; }
    if (action === 'file:saveToDriveAs') { handleSaveToLocalDrive(); return; }
    if (action === 'file:saveCloud:google')  { setActiveProvider('google');  handleSaveToDrive();   return; }
    if (action === 'file:saveCloud:dropbox') { setActiveProvider('dropbox'); handleSaveToDropbox(); return; }
    if (action === 'file:dropboxConnect')    { connectDropbox(); return; }
    if (action === 'file:dropboxDisconnect') {
      clearDropboxToken();
      clearTimeout(saveToastTimer.current);
      setSaveToastMsg('Dropbox 연결이 해제되었습니다.');
      setSaveToast(true);
      saveToastTimer.current = setTimeout(() => setSaveToast(false), 2500);
      return;
    }
    if (action === 'file:saveToLocal')   { handleSaveToLocal(); return; }
    if (action === 'file:share')       { setShareLinkOpen(true); return; }
    if (action === 'file:projectInfo')  { setProjectInfoOpen(true); return; }
    if (action === 'file:projectMgmt')  { dispatch({ type: 'SET_ACTIVE_DOC', payload: 'projects' }); return; }
    if (action === 'file:importDocx')   { setImportDocxOpen(true); return; }
    if (action === 'file:importHwpx')   { setImportHwpxOpen(true); return; }
    if (action === 'file:snapshot')     { setSnapshotOpen(true); return; }

    // 내보내기 — PrintPreviewModal 직접 오픈
    if (action === 'file:export') { setExportDefaultFormat('pdf'); window.dispatchEvent(new CustomEvent('editor:flush')); setPrintPreviewOpen(true); return; }

    // 최근 대본
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
    if (action === 'format:userSettings')  { setUserSettingsTab('sceneHeader'); setUserSettingsOpen(true); return; }
    if (action === 'format:tagManage')     { setTagManageOpen(true);        return; }
    if (action?.startsWith('format:type:')) { window.dispatchEvent(new CustomEvent('script:setBlockType', { detail: { type: action.slice(12) } })); return; }
    if (action?.startsWith('format:font:')) { dispatch({ type: 'SET_STYLE_PRESET', payload: { fontFamily: action.slice('format:font:'.length) } }); return; }
    if (action?.startsWith('format:fontSize:')) { dispatch({ type: 'SET_STYLE_PRESET', payload: { fontSize: Number(action.slice('format:fontSize:'.length)) } }); return; }
    if (action?.startsWith('format:lineHeight:')) { dispatch({ type: 'SET_STYLE_PRESET', payload: { lineHeight: Number(action.slice('format:lineHeight:'.length)) / 100 } }); return; }
    if (action?.startsWith('format:dialogueGap:')) { dispatch({ type: 'SET_STYLE_PRESET', payload: { dialogueGap: action.slice('format:dialogueGap:'.length) + 'em' } }); return; }

    // ── 도구 ──
    if (action === 'tools:settings')  { setAppSettingsOpen(true); return; }

    // ── 도움말 ──
    if (action === 'help:manual')  { window.open('/help.html', '_blank', 'noopener,noreferrer'); return; }
    if (action === 'help:about')   { window.open('/changelog.html', '_blank', 'noopener,noreferrer'); return; }
    if (action === 'help:notices') { setNoticesOpen(true); return; }
    if (action === 'help:qa')      { setQaOpen(true); return; }
    if (action === 'ideas:open')   { setIdeaSheetOpen((v) => !v); return; }
    if (action === 'help:kakao')   { window.open('https://open.kakao.com/me/daejak', '_blank', 'noopener,noreferrer'); return; }
    if (action === 'help:resetTour') {
      if (!window.confirm('시작 안내 팝업을 처음부터 다시 보려면 페이지를 새로고침합니다. 계속할까요?')) return;
      try {
        // 투어 완료 플래그 (localStorage, PREFIX=drama_)
        localStorage.removeItem('drama_onboardingDone');
        localStorage.removeItem('drama_mobileOnboardingDone');
        // 페이지별 힌트 표시 기록
        localStorage.removeItem('drama_pageHintsSeen');
        localStorage.removeItem('drama_mobileHintsSeen');
        // 공용 PC 모드에서 쓰는 세션 플래그
        sessionStorage.removeItem('drama_onboardingSession');
        sessionStorage.removeItem('drama_mobileOnboardingSession');
      } catch {}
      window.location.reload();
      return;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSaveToDrive, handleSaveToDropbox, handleSaveToLocalDrive, dispatch, setFocusMode]);

  // 메뉴바 전용 신규 단축키 (기존 Ctrl+S/Z/Y/B/I/U 는 각자 핸들러에서 처리)
  useKeyboardShortcuts({
    'ctrl+alt+n': () => handleMenuAction('file:new'),
    'ctrl+o':     () => setOpenProjectOpen(true),
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
      onSave={handleSaveToCloud}
      onSnapshot={() => setSnapshotOpen(true)}
      authUser={authUser}
      setAuthUser={setAuthUser}
      onMenuAction={handleMenuAction}
      recentProjects={recentProjects}
      menuCheckedItems={menuCheckedItems}
      cloudSaveOptions={cloudSaveOptions}
      isMobile={isMobile}
    />
  );
  const modals = (
    <>
      {/* ── 아이디어 노트 시트 ── */}
      <IdeaSheet
        open={ideaSheetOpen}
        onClose={() => setIdeaSheetOpen(false)}
        onExpand={() => { setIdeaSheetOpen(false); window.location.hash = '#ideas'; }}
        onPromote={(idea) => {
          setPromoteIdea(idea);
          setNewProjectOpen(true);
        }}
        isMobile={isMobile}
      />

      {/* ── Radix 기반 모달들 ── */}
      <NewProjectModal
        open={newProjectOpen}
        onClose={() => { setNewProjectOpen(false); setPromoteIdea(null); }}
        initialTitle={buildProjectSeedFromIdea(promoteIdea).title}
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
          // 아이디어로부터 시드 적용 (있을 때만)
          if (promoteIdea) {
            applyIdeaSeed({
              idea: promoteIdea,
              projectId: p.id,
              firstEpisodeId: eps[0]?.id,
              dispatch,
            });
            setPromoteIdea(null);
          }
        }}
      />
      <OpenProjectModal
        open={openProjectOpen}
        onClose={() => setOpenProjectOpen(false)}
        projects={state.projects}
        activeProjectId={state.activeProjectId}
        onSelect={id => dispatch({ type: 'SET_ACTIVE_PROJECT', id })}
        onFileImport={(imported, policy) => {
          // policy: 'replace' (덮어쓰기) | 'newId' (사본으로 추가)
          if (policy === 'replace') {
            dispatch({ type: 'REPLACE_PROJECT_DATA', payload: imported });
            // 덮어쓰기 후 해당 대본 활성화
            dispatch({ type: 'SET_ACTIVE_PROJECT', id: imported.project.id });
          } else {
            // ADD_IMPORTED_PROJECT_COPY가 새 ID 발급 + 활성화까지 처리
            dispatch({ type: 'ADD_IMPORTED_PROJECT_COPY', payload: imported });
          }
        }}
        onSaveToDriveLocal={handleSaveToDriveLocal}
      />
      <ShareLinkModal
        open={shareLinkOpen}
        onClose={() => setShareLinkOpen(false)}
      />
      <ImportDocxModal    open={importDocxOpen}    onClose={() => setImportDocxOpen(false)} />
      <ImportHwpxModal    open={importHwpxOpen}    onClose={() => setImportHwpxOpen(false)} />
      <StyleSettingsModal open={styleSettingsOpen} onClose={() => setStyleSettingsOpen(false)} />
      <UserSettingsModal open={userSettingsOpen} initialTab={userSettingsTab} onClose={() => setUserSettingsOpen(false)} />
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
      <SizeGuardModal />
      {!isMobile && <OnboardingTour />}
      {snapshotOpen && <SnapshotPanel onClose={() => setSnapshotOpen(false)} />}
      {driveSaveDialog.open && (
        <DriveSaveNameDialog
          isDark={isDark}
          defaultValue={driveSaveDialog.defaultName}
          onConfirm={(name) => { setDriveSaveDialog(d => ({ ...d, open: false })); driveSaveResolveRef.current?.(name); }}
          onCancel={() => { setDriveSaveDialog(d => ({ ...d, open: false })); driveSaveResolveRef.current?.(null); }}
        />
      )}
      {saveToast && (() => {
        const isSaving  = saveToastMsg.includes('\uC800\uC7A5 \uC911');
        const isSuccess = saveToastMsg.includes('\uC800\uC7A5\uB428');
        const isFail    = saveToastMsg.includes('\uC2E4\uD328') || saveToastMsg.includes('\uC624\uB958');
        const bg = isSaving ? '#1e3a5f' : isSuccess ? '#166534' : isFail ? '#991b1b' : '#92400e';
        const icon = isSaving ? '\u2026' : isSuccess ? '\u2713' : isFail ? '\u2715' : '\u2139';
        return (
          <div style={{
            position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 9999, background: bg, color: '#fff',
            borderRadius: 14, padding: '14px 28px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', gap: 12,
            minWidth: 220, maxWidth: 400,
            pointerEvents: 'none',
            animation: 'savePopupIn 0.18s ease-out',
          }}>
            <style>{`@keyframes savePopupIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, letterSpacing: '-0.01em' }}>{saveToastMsg}</span>
          </div>
        );
      })()}
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
              onClick={() => {
                if (availableVersion) {
                  try { localStorage.setItem('drama_dismissed_update_version', availableVersion); } catch {}
                  dismissedUpdateVersionRef.current = availableVersion;
                }
                setNewVersionReady(false);
              }}
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
            onSave={handleSaveToCloud}
            onPrintPreview={() => { setExportDefaultFormat('pdf'); window.dispatchEvent(new CustomEvent('editor:flush')); setPrintPreviewOpen(true); }}
            onSnapshot={() => setSnapshotOpen(true)}
            WorkTimer={WorkTimer}
            authUser={authUser}
            onLogout={() => setAuthUser(null)}
            onMenuAction={handleMenuAction}
            recentProjects={recentProjects}
            checkedItems={menuCheckedItems}
            cloudSaveOptions={cloudSaveOptions}
          />
          <UpdateBanner />
        </div>
        <div data-tour-id="center-panel" className="flex-1 min-h-0"
          style={{ paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, position: 'relative' }}
        >
          <CenterPanel scrollToSceneId={scrollToSceneId} onScrollHandled={() => setScrollToSceneId(null)} keyboardUp={keyboardUp} isMobile={isMobile} focusMode={focusMode} setFocusMode={setFocusMode} onNewProject={() => handleMenuAction('file:new')} />
        </div>
        {/* 광고 + 하단탭: 집중 모드에서 CSS로 숨김 (언마운트 방지) */}
        <div style={{ display: focusMode ? 'none' : 'contents' }}>
          {/* 광고 ↔ 하단 패널 토글 버튼 사이 간격 — 오클릭 방지 (패널 열리면 0) */}
          <div
            data-mobile-bottom-ad
            style={{
              flexShrink: 0,
              height: (keyboardUp || mobileBottomOpen) ? 0 : 100,
              marginTop: (keyboardUp || mobileBottomOpen) ? 0 : 8,
              marginBottom: (keyboardUp || mobileBottomOpen) ? 0 : 16,
              overflow: 'hidden',
              transition: 'height 0.2s ease, margin 0.2s ease',
            }}
          >
            <KakaoAdBanner unitId="DAN-0Eobamy6SYfeIpxd" width={320} height={100} mobileHide={false} />
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
                centerPanelNode={<CenterPanel scrollToSceneId={scrollToSceneId} onScrollHandled={() => setScrollToSceneId(null)} focusMode={focusMode} setFocusMode={setFocusMode} onNewProject={() => handleMenuAction('file:new')} />}
                borderRight
              />
              <SplitViewPanel defaultTab="characters" />
            </>
          ) : (
            <>
              <div data-tour-id="center-panel" className="flex-1 min-w-0 overflow-hidden" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <CenterPanel scrollToSceneId={scrollToSceneId} onScrollHandled={() => setScrollToSceneId(null)} focusMode={focusMode} setFocusMode={setFocusMode} onNewProject={() => handleMenuAction('file:new')} />
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
          <div className="no-print" style={{ margin: '0 8px 6px', display: 'flex', justifyContent: 'center' }}>
            {/* 태블릿(768~1279px): 본문 폭이 728을 보장 못 하므로 쿠팡 가로 배너 */}
            <AdBanner slot="bottom-fixed-1" mobileHide={false} height={60} style={{ borderRadius: 6, width: '100%', maxWidth: 728 }} />
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
      <BadgeToast />
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
                  onNewProject={() => handleMenuAction('file:new')}
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
                onNewProject={() => handleMenuAction('file:new')}
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
        <div className="no-print" style={{ margin: '0 8px 6px', display: 'flex', justifyContent: 'center' }}>
          {/* PC(≥1280px): 카카오 728×90 (PC 단위) 하나만 */}
          <KakaoAdBanner unitId="DAN-duuNkW51pfplIrP1" width={728} height={90} mobileHide={false} />
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
  const [page, setPage] = useState(0);

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

  const { logs = [], projects = [], exportedAt, hideProjectTitle = false, hideChecklist = false } = data;
  const totalSec = logs.reduce((s, l) => s + (l.activeDurationSec || 0), 0);
  const totalDays = new Set(logs.map(l => l.dateKey)).size;
  const sorted = [...logs].sort((a, b) => b.completedAt - a.completedAt);

  const PER_PAGE = 12;
  const pageCount = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const curPage = Math.min(page, pageCount - 1);
  const pageLogs = sorted.slice(curPage * PER_PAGE, curPage * PER_PAGE + PER_PAGE);

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

  const pageBtn = (active) => ({
    minWidth: 30, height: 30, padding: '0 8px', borderRadius: 6,
    border: '1px solid ' + (active ? '#8DA0BB' : '#e0e0e0'),
    background: active ? '#8DA0BB' : '#fff',
    color: active ? '#fff' : '#555',
    fontSize: 13, fontWeight: active ? 700 : 400,
    cursor: active ? 'default' : 'pointer',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#fff' }}>
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
        {pageLogs.map((log, i) => {
          const proj = projects.find(p => p.id === log.projectId);
          const snapshot = log.completedChecklistSnapshot || [];
          return (
            <div key={curPage * PER_PAGE + i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 16px', borderBottom: i < pageLogs.length - 1 ? '1px solid #f0f0f0' : 'none', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <span style={{ fontSize: 11, color: '#999', minWidth: 120, flexShrink: 0 }}>{fmtTs(log.completedAt)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>{hideProjectTitle ? '비공개' : (proj?.title || '삭제된 대본')}</div>
                {!hideChecklist && snapshot.length > 0 && (
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                    완료: {snapshot.map(s => s.text).join(', ')}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#8DA0BB', flexShrink: 0 }}>{fmt(log.activeDurationSec || 0)}</span>
            </div>
          );
        })}
      </div>

      {pageCount > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 20, flexWrap: 'wrap' }}>
          <button style={pageBtn(false)} disabled={curPage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>◀</button>
          {Array.from({ length: pageCount }, (_, idx) => (
            <button key={idx} style={pageBtn(idx === curPage)} onClick={() => setPage(idx)}>{idx + 1}</button>
          ))}
          <button style={pageBtn(false)} disabled={curPage === pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>▶</button>
        </div>
      )}
    </div>
    </div>
  );
}

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

  // hash 변경 시 재렌더 (#director, #review=, #delivery= 등 이동 즉시 반영)
  useEffect(() => {
    const handler = () => forceUpdate(n => n + 1);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  // #sl= 공유 링크 hash 정리 — replaceState로 hashchange 미발사 (이중 렌더 방지)
  useEffect(() => {
    if (window.location.hash.startsWith('#sl=')) {
      window.history.replaceState(null, '', '#director');
    }
  }, []);

  // Supabase 세션 복원 + 상태 변화 구독
  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') && session) {
        const userData = extractUserData(session);
        if (userData) {
          try { localStorage.setItem('drama_auth_user', JSON.stringify(userData)); } catch {}
          setAuthUser(userData);
        }
        if (session.provider_token) {
          setAccessToken(session.provider_token, session.expires_in ?? 3600);
        }
        // OAuth 복귀 후 검토 링크 등 이전 hash 복원
        if (event === 'SIGNED_IN') {
          try {
            const returnHash = localStorage.getItem('drama_pending_return_hash');
            if (returnHash) {
              localStorage.removeItem('drama_pending_return_hash');
              if (/^#[A-Za-z0-9=_\-.]{0,200}$/.test(returnHash)) {
                window.location.hash = returnHash;
              }
            }
          } catch {}
        }
      } else if (event === 'SIGNED_OUT') {
        try { localStorage.removeItem('drama_auth_user'); } catch {}
        clearAccessToken();
        clearShareStatsCache();
        setAuthUser(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Dropbox OAuth PKCE 콜백 처리 — 모듈 로드 시점에 캡처한 코드를 사용
  // (Supabase가 history.replaceState로 URL을 지우기 전에 dropbox.js가 먼저 캡처함)
  useEffect(() => {
    const code = consumeInitialDropboxCode();
    if (!code) return;
    handleDropboxCallback(code)
      .then(() => {
        window.dispatchEvent(new CustomEvent('dropbox:callback-result', { detail: { ok: true } }));
      })
      .catch(err => {
        console.error('[Dropbox] 콜백 처리 실패:', err);
        window.dispatchEvent(new CustomEvent('dropbox:callback-result', { detail: { ok: false, message: err.message, status: err.dropboxStatus, tag: err.dropboxTag } }));
      });
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
    return <DirectorApp authUser={authUser} />;
  }

  // 어드민 — env에 박힌 hash 토큰 + 이메일 화이트리스트 모두 만족해야 함.
  // 비인가 시 404 위장으로 어드민 존재 자체를 노출하지 않음.
  // 실제 데이터 가드는 Supabase RLS(`public.is_admin_user()`).
  if (isAdminHash(window.location.hash)) {
    if (!authUser || !isAdminUser(authUser)) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-bg)' }}>
          <div style={{ color: 'var(--c-text6)', fontSize: 14 }}>정상적인 페이지가 아닙니다.</div>
        </div>
      );
    }
    return <AdminPage authUser={authUser} />;
  }

  // 연출 작업실 — 감독 전용 독립 페이지
  if (window.location.hash === '#director')         return <DirectorApp authUser={authUser} />;

  // 아이디어 노트 풀스크린 — 정리·검색용. 인증 불필요(로컬 데이터).
  if (window.location.hash === '#ideas') {
    return (
      <AppProvider>
        <IdeasFullPage onBack={() => { window.location.hash = ''; }} />
      </AppProvider>
    );
  }

  // public — 감독 전송 링크 (인증 불필요, 의도적)
  if (window.location.hash.startsWith('#delivery=')) return <DirectorDeliveryView />;
  // public — 공유 링크 (인증 불필요, 의도적)
  if (window.location.hash.startsWith('#review=')) return <SharedReviewView />;
  // public — 작업기록 공유 (인증 불필요, 의도적)
  if (window.location.hash.startsWith('#log='))    return <LogShareView />;
  // public — 베타 설문 (인증 불필요, 의도적)
  if (window.location.hash === '#survey')          return <SurveyPage />;

  return (
    <AppProvider>
      <Shell authUser={authUser} setAuthUser={setAuthUser} />
      <StyleOnboardingGate />
      {webViewModal && <WebViewModal onClose={() => setWebViewModal(false)} />}
    </AppProvider>
  );
}

// 처음 사용자에게만 1회 표시되는 스타일 마법사 게이트.
// state.initialized 시점에 localStorage 확인 후 결정 — IndexedDB 로드 전에는
// stylePreset이 DEFAULT라 모달이 잘못된 값을 보여줄 수 있어 기다림.
//
// 기존 사용자(이전 투어 완료 / 로그인 / 회차·대본 데이터 존재) 마이그레이션:
// styleOnboarded=true를 자동 설정하여 모달이 뜨지 않도록 한다. 진짜 신규
// 사용자(완전 빈 상태)에게만 모달 표시.
function StyleOnboardingGate() {
  const { state } = useApp();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!state.initialized) return;
    try {
      if (localStorage.getItem('drama_styleOnboarded') === 'true') return;

      // episodes/projects는 createSeedData()가 신규 사용자에게도 자동 생성하므로
      // 판정 기준에서 제외. scriptBlocks는 seed에서 빈 배열이라 안전한 신호.
      const isExistingUser =
        localStorage.getItem('drama_onboardingDone') === 'true' ||
        localStorage.getItem('drama_mobileOnboardingDone') === 'true' ||
        !!localStorage.getItem('drama_auth_user') ||
        (state.scriptBlocks && state.scriptBlocks.length > 0);

      if (isExistingUser) {
        localStorage.setItem('drama_styleOnboarded', 'true');
        return;
      }

      setOpen(true);
    } catch {}
  }, [state.initialized]);

  return <InitialUserSettingsModal open={open} onClose={() => setOpen(false)} />;
}
