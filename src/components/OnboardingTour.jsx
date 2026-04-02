import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { getItem, setItem, isPublicPcMode } from '../store/db';

// ── Persistence keys ──────────────────────────────────────────────────────────
const DONE_KEY      = 'onboardingDone';
const SESSION_KEY   = 'drama_onboardingSession';
const HINTS_KEY     = 'drama_pageHintsSeen'; // comma-separated list of seen page ids

// ── Initial 3-panel tour steps ────────────────────────────────────────────────
const STEPS = [
  {
    tourId: 'left-panel',
    navigateTo: 'cover',
    title: '왼쪽 패널 — 작품 구성',
    desc: '회차, 인물, 시놉시스 등 작품을 구성하는 메뉴가 모여 있습니다.\n원하는 항목을 클릭해 편집 화면으로 이동하세요.',
    placement: 'right',
  },
  {
    tourId: 'center-panel',
    navigateTo: 'cover',
    title: '가운데 패널 — 편집 영역',
    desc: '선택한 메뉴의 편집 화면이 표시됩니다.\n지금은 작품 표지 화면이 열려 있습니다.',
    placement: 'center',
  },
  {
    tourId: 'right-panel',
    navigateTo: 'cover',
    title: '오른쪽 패널 — 문맥 & 체크리스트',
    desc: '열려 있는 화면에 따라 관련 정보가 표시됩니다.\n체크리스트 탭에서 작업 항목을 관리할 수 있습니다.',
    placement: 'left',
  },
];

// ── Per-page contextual hints ─────────────────────────────────────────────────
const PAGE_HINTS = {
  cover: {
    title: '표지',
    desc: '작품 기본 정보(제목·작가·장르 등)를 입력하세요.\n출력 시 첫 장에 표시됩니다.',
    tourId: 'center-panel',
    placement: 'center',
  },
  synopsis: {
    title: '시놉시스',
    desc: '장르, 주제, 기획의도, 줄거리를 정리하는 공간입니다.\n작품의 방향을 잡는 데 활용하세요.',
    tourId: 'center-panel',
    placement: 'center',
  },
  script: {
    title: '대본 편집',
    desc: 'Ctrl+1 씬번호 · Ctrl+2 지문 · Ctrl+3 대사\n블록 유형을 전환하며 대본을 작성하세요.',
    tourId: 'center-panel',
    placement: 'center',
  },
  characters: {
    title: '인물 관리',
    desc: '등장인물을 등록하고 성격과 역할을 정리하세요.\n인물을 선택하면 오른쪽에 대본 등장 현황이 표시됩니다.',
    tourId: 'center-panel',
    placement: 'center',
  },
  scenelist: {
    title: '씬리스트',
    desc: '회차별 씬을 한눈에 정리하고 순서를 구성하세요.\n씬 설명을 작성하면 대본 작성 시 참고할 수 있습니다.',
    tourId: 'center-panel',
    placement: 'center',
  },
  treatment: {
    title: '트리트먼트',
    desc: '씬별 내용을 요약해 전체 흐름을 확인하세요.\n항목을 대본으로 가져와 씬번호로 변환할 수 있습니다.',
    tourId: 'center-panel',
    placement: 'center',
  },
  biography: {
    title: '인물이력서',
    desc: '인물의 과거 사건과 연표를 기록하세요.\n작품 배경을 구체화하는 데 도움이 됩니다.',
    tourId: 'center-panel',
    placement: 'center',
  },
  structure: {
    title: '구조 설계',
    desc: '막/단락 구조를 시각적으로 설계하는 공간입니다.\n이야기 흐름을 큰 그림으로 파악하세요.',
    tourId: 'center-panel',
    placement: 'center',
  },
  relationships: {
    title: '인물관계도',
    desc: '인물 간의 관계를 시각적으로 정리하세요.\n선을 그어 관계를 표현할 수 있습니다.',
    tourId: 'center-panel',
    placement: 'center',
  },
  resources: {
    title: '자료수집',
    desc: '작품 관련 자료와 메모를 보관하세요.\n링크, 이미지, 텍스트를 자유롭게 저장할 수 있습니다.',
    tourId: 'center-panel',
    placement: 'center',
  },
};

// ── Layout helpers ────────────────────────────────────────────────────────────
const CARD_W     = 320;
const CARD_H_EST = 220;
const EDGE_PAD   = 12;
const GAP        = 14;
const SPOT_PAD   = 6;

function getCardPos(rect, placement) {
  const vw    = window.innerWidth;
  const vh    = window.innerHeight;
  const cardW = Math.min(CARD_W, vw - EDGE_PAD * 2);

  if (!rect || placement === 'center') {
    return {
      top:   Math.max(EDGE_PAD, (vh - CARD_H_EST) / 2),
      left:  Math.max(EDGE_PAD, (vw - cardW) / 2),
      width: cardW,
    };
  }

  let top, left;
  switch (placement) {
    case 'bottom':
      top  = rect.bottom + GAP;
      left = rect.left + (rect.width - cardW) / 2;
      break;
    case 'top':
      top  = rect.top - CARD_H_EST - GAP;
      left = rect.left + (rect.width - cardW) / 2;
      break;
    case 'right':
      top  = rect.top + (rect.height - CARD_H_EST) / 2;
      left = rect.right + GAP;
      break;
    case 'left':
    default:
      top  = rect.top + (rect.height - CARD_H_EST) / 2;
      left = rect.left - cardW - GAP;
  }

  if (placement === 'bottom' && top + CARD_H_EST > vh - EDGE_PAD)
    top = rect.top - CARD_H_EST - GAP;
  if (placement === 'right' && left + cardW > vw - EDGE_PAD)
    left = rect.left - cardW - GAP;
  if (placement === 'left' && left < EDGE_PAD)
    left = rect.right + GAP;

  top  = Math.max(EDGE_PAD, Math.min(top,  vh - CARD_H_EST - EDGE_PAD));
  left = Math.max(EDGE_PAD, Math.min(left, vw - cardW - EDGE_PAD));

  return { top, left, width: cardW };
}

// ── Helpers for seen-hints persistence ───────────────────────────────────────
function getSeenHints() {
  try {
    const v = localStorage.getItem(HINTS_KEY);
    return v ? new Set(v.split(',')) : new Set();
  } catch { return new Set(); }
}
function markHintSeen(pageId) {
  try {
    const seen = getSeenHints();
    seen.add(pageId);
    localStorage.setItem(HINTS_KEY, [...seen].join(','));
  } catch {}
}
export function resetPageHints() {
  try { localStorage.removeItem(HINTS_KEY); } catch {}
}

// ── Card UI (shared by tour + page hints) ─────────────────────────────────────
function HintCard({ title, desc, rect, placement, footer, onClick }) {
  const isCenter = !rect || placement === 'center';
  const cardPos  = getCardPos(rect, placement);
  const btnBase  = {
    fontSize: 12, borderRadius: 6, cursor: 'pointer',
    border: 'none', padding: '6px 14px', lineHeight: 1.4,
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: isCenter ? 'rgba(0,0,0,0.6)' : 'transparent',
          pointerEvents: 'all',
        }}
        onClick={onClick}
      />

      {/* Spotlight */}
      {!isCenter && rect && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top:    rect.top    - SPOT_PAD,
            left:   rect.left   - SPOT_PAD,
            width:  rect.width  + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
            borderRadius: 8,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
            border: '2px solid var(--c-accent)',
            outline: '4px solid rgba(90,90,245,0.2)',
            zIndex: 9001,
            pointerEvents: 'none',
            transition: 'all 0.25s ease',
          }}
        />
      )}

      {/* Card */}
      <div
        style={{
          position: 'fixed',
          top:   cardPos.top,
          left:  cardPos.left,
          width: cardPos.width,
          zIndex: 9002,
          pointerEvents: 'all',
          background: 'var(--c-card)',
          border: '1px solid var(--c-border2)',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          padding: 20,
          transition: 'top 0.25s ease, left 0.25s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 8, lineHeight: 1.4 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--c-text3)', lineHeight: 1.8, marginBottom: 16, whiteSpace: 'pre-line' }}>
          {desc}
        </div>
        {footer({ btnBase })}
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OnboardingTour() {
  const { state, dispatch } = useApp();
  const stateRef = useRef(state);
  stateRef.current = state;

  // ─ Initial tour state
  const [tourStep,    setTourStep]    = useState(0);
  const [tourVisible, setTourVisible] = useState(false);
  const [tourRect,    setTourRect]    = useState(null);
  const savedRef = useRef(null);

  // ─ Page hint state
  const [hintPage,    setHintPage]    = useState(null); // pageId string or null
  const [hintRect,    setHintRect]    = useState(null);
  const hintShownRef = useRef(false); // prevent double-fire within same doc change

  const currentStep = STEPS[tourStep];
  const currentHint = hintPage ? PAGE_HINTS[hintPage] : null;

  // ─ Measure target element rect (with delay for render) ────────────────────
  function measureRect(tourId, setter, delay = 250) {
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-tour-id="${tourId}"]`);
      setter(el ? el.getBoundingClientRect() : null);
    }, delay);
    return timer;
  }

  // ─ Tour: spotlight tracking ────────────────────────────────────────────────
  useEffect(() => {
    if (!tourVisible || !currentStep?.tourId) { setTourRect(null); return; }
    let timer;
    const update = () => {
      const el = document.querySelector(`[data-tour-id="${currentStep.tourId}"]`);
      setTourRect(el ? el.getBoundingClientRect() : null);
    };
    timer = setTimeout(update, 250);
    window.addEventListener('resize', update);
    return () => { clearTimeout(timer); window.removeEventListener('resize', update); };
  }, [tourVisible, tourStep, currentStep?.tourId]);

  // ─ Tour: auto-show on first visit ─────────────────────────────────────────
  useEffect(() => {
    const shouldShow = isPublicPcMode()
      ? !sessionStorage.getItem(SESSION_KEY)
      : !getItem(DONE_KEY);
    if (shouldShow) setTourVisible(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─ Tour: save original page state ─────────────────────────────────────────
  useEffect(() => {
    if (tourVisible && state.initialized && !savedRef.current) {
      savedRef.current = { activeDoc: state.activeDoc, activeEpisodeId: state.activeEpisodeId };
    }
  }, [tourVisible, state.initialized, state.activeDoc, state.activeEpisodeId]);

  // ─ Tour: manual trigger ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      savedRef.current = {
        activeDoc: stateRef.current.activeDoc,
        activeEpisodeId: stateRef.current.activeEpisodeId,
      };
      setTourStep(0);
      setTourVisible(true);
    };
    window.addEventListener('drama:startTour', handler);
    return () => window.removeEventListener('drama:startTour', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyNavigation = useCallback((stepIdx) => {
    const { navigateTo } = STEPS[stepIdx];
    if (!navigateTo) return;
    if (navigateTo === 'script') {
      const { episodes, activeProjectId, activeEpisodeId } = stateRef.current;
      const ep = activeEpisodeId
        ? episodes.find(e => e.id === activeEpisodeId)
        : episodes.find(e => e.projectId === activeProjectId);
      if (ep) dispatch({ type: 'SET_ACTIVE_EPISODE', id: ep.id });
      else     dispatch({ type: 'SET_ACTIVE_DOC', payload: 'cover' });
    } else {
      dispatch({ type: 'SET_ACTIVE_DOC', payload: navigateTo });
    }
  }, [dispatch]);

  const restoreState = useCallback(() => {
    const saved = savedRef.current;
    if (!saved) return;
    if (saved.activeDoc === 'script' && saved.activeEpisodeId)
      dispatch({ type: 'SET_ACTIVE_EPISODE', id: saved.activeEpisodeId });
    else if (saved.activeDoc)
      dispatch({ type: 'SET_ACTIVE_DOC', payload: saved.activeDoc });
    savedRef.current = null;
  }, [dispatch]);

  const closeTour = useCallback(() => {
    setTourVisible(false);
    setItem(DONE_KEY, true);
    if (isPublicPcMode()) sessionStorage.setItem(SESSION_KEY, 'true');
    restoreState();
  }, [restoreState]);

  const goNext = useCallback(() => {
    if (tourStep >= STEPS.length - 1) { closeTour(); return; }
    const next = tourStep + 1;
    applyNavigation(next);
    setTourStep(next);
  }, [tourStep, closeTour, applyNavigation]);

  const goPrev = useCallback(() => {
    if (tourStep === 0) return;
    const prev = tourStep - 1;
    applyNavigation(prev);
    setTourStep(prev);
  }, [tourStep, applyNavigation]);

  // ─ Tour: keyboard ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tourVisible) return;
    const onKey = (e) => {
      if (e.key === 'Escape')     { e.preventDefault(); closeTour(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tourVisible, closeTour, goNext, goPrev]);

  // ─ Page hints: show on activeDoc change ───────────────────────────────────
  useEffect(() => {
    if (tourVisible) return;        // don't show hints during tour
    if (!state.initialized) return;

    const pageId = state.activeDoc === 'script' && state.activeEpisodeId
      ? 'script'
      : state.activeDoc;

    if (!pageId || !PAGE_HINTS[pageId]) return;

    const seen = getSeenHints();
    if (seen.has(pageId)) return;

    // Small delay to let the page render first
    hintShownRef.current = false;
    const timer = setTimeout(() => {
      if (hintShownRef.current) return;
      hintShownRef.current = true;
      setHintPage(pageId);
      const hint = PAGE_HINTS[pageId];
      if (hint.tourId) {
        const el = document.querySelector(`[data-tour-id="${hint.tourId}"]`);
        setHintRect(el ? el.getBoundingClientRect() : null);
      } else {
        setHintRect(null);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [state.activeDoc, state.activeEpisodeId, state.initialized, tourVisible]);

  const closeHint = useCallback(() => {
    if (hintPage) markHintSeen(hintPage);
    setHintPage(null);
    setHintRect(null);
  }, [hintPage]);

  // ─ Hint: keyboard ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hintPage) return;
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeHint(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hintPage, closeHint]);

  // ─ Render: initial tour ───────────────────────────────────────────────────
  if (tourVisible) {
    const isLast   = tourStep === STEPS.length - 1;
    const isCenter = !tourRect || currentStep.placement === 'center';

    return (
      <HintCard
        title={currentStep.title}
        desc={currentStep.desc}
        rect={tourRect}
        placement={currentStep.placement}
        onClick={closeTour}
        footer={({ btnBase }) => (
          <>
            {/* Step dots */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14 }}>
              {STEPS.map((_, i) => (
                <div key={i} style={{
                  height: 6, width: i === tourStep ? 18 : 6, borderRadius: 3, flexShrink: 0,
                  background: i === tourStep ? 'var(--c-accent)' : i < tourStep ? 'var(--c-accent2)' : 'var(--c-border3)',
                  transition: 'width 0.2s, background 0.2s',
                }} />
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--c-text6)' }}>
                {tourStep + 1} / {STEPS.length}
              </span>
            </div>

            <div style={{ fontSize: 10, color: 'var(--c-text6)', marginBottom: 12 }}>
              ← → 방향키 이동 · Esc 닫기
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {tourStep > 0 && (
                <button onClick={goPrev} style={{ ...btnBase, background: 'transparent', border: '1px solid var(--c-border3)', color: 'var(--c-text4)' }}>
                  이전
                </button>
              )}
              <button onClick={goNext} autoFocus style={{ ...btnBase, background: 'var(--c-accent)', color: '#fff', fontWeight: 600 }}>
                {isLast ? '시작하기 →' : '다음'}
              </button>
              <button onClick={closeTour} style={{ ...btnBase, marginLeft: 'auto', background: 'transparent', color: 'var(--c-text6)', fontSize: 11, padding: '4px 8px' }}>
                건너뛰기
              </button>
            </div>
          </>
        )}
      />
    );
  }

  // ─ Render: page hint ──────────────────────────────────────────────────────
  if (hintPage && currentHint) {
    return (
      <HintCard
        title={currentHint.title}
        desc={currentHint.desc}
        rect={hintRect}
        placement={currentHint.placement}
        onClick={closeHint}
        footer={({ btnBase }) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={closeHint} autoFocus style={{ ...btnBase, background: 'var(--c-accent)', color: '#fff', fontWeight: 600 }}>
              확인
            </button>
            <span style={{ fontSize: 10, color: 'var(--c-text6)', marginLeft: 4 }}>
              아무 곳이나 클릭해도 닫힙니다
            </span>
          </div>
        )}
      />
    );
  }

  return null;
}
