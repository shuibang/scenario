import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { getItem, setItem, isPublicPcMode } from '../store/db';

// ── Persistence keys ──────────────────────────────────────────────────────────
const DONE_KEY    = 'onboardingDone';          // drama_onboardingDone via db.js
const SESSION_KEY = 'drama_onboardingSession'; // sessionStorage (public PC)

// ── Step definitions ──────────────────────────────────────────────────────────
// navigateTo: null (stay) | 'script' | 'characters' | 'synopsis' | <activeDoc value>
const STEPS = [
  {
    tourId: 'menubar',
    navigateTo: null,
    title: '상단 메뉴바',
    desc: '저장·공유·출력 미리보기, 되돌리기/다시하기, 글꼴·크기 서식, 다크모드 전환이 모두 여기에 있습니다.',
    placement: 'bottom',
  },
  {
    tourId: 'center-panel',
    navigateTo: 'script',
    title: '대본 편집기 — 집필 영역',
    desc: '좌측에서 회차를 선택하면 대본 편집기가 열립니다. 씬번호·지문·대사 블록을 조합해 대본을 작성합니다.',
    placement: 'center',
  },
  {
    tourId: 'right-panel',
    navigateTo: null,
    title: '오른쪽 패널 — 씬 개요 (대본 페이지)',
    desc: '대본 페이지에서 오른쪽 패널 "문맥" 탭에는 씬 목록이 표시됩니다. 씬 클릭 → 대본 위치 이동, 점 클릭 → 초안·작성 중·완료 상태 전환.',
    placement: 'left',
  },
  {
    tourId: 'scene-block-btns',
    navigateTo: null,
    title: 'S# / 지문 / 대사 — 블록 유형 전환',
    desc: 'S# 씬번호, 지문, 대사 버튼 또는 단축키로 현재 블록 유형을 전환합니다.\nCtrl+1 씬번호 · Ctrl+2 지문 · Ctrl+3 대사',
    placement: 'bottom',
  },
  {
    tourId: 'right-panel',
    navigateTo: 'characters',
    title: '오른쪽 패널 — 인물 현황 (인물 페이지)',
    desc: '인물 페이지에서 인물을 선택하면 오른쪽 패널(지금 강조된 영역)이 "인물 현황"으로 전환됩니다. 해당 인물이 대본의 어느 씬에 등장하는지 목록으로 확인할 수 있습니다.\n인물이 아직 없다면 인물 페이지에서 먼저 추가하세요.',
    placement: 'left',
  },
  {
    tourId: 'right-panel',
    navigateTo: 'synopsis',
    title: '오른쪽 패널 — 출력 미리보기 (시놉시스 페이지)',
    desc: '시놉시스 페이지에서는 오른쪽 패널이 표지·시놉시스 출력 미리보기로 전환됩니다. 실제 출력 레이아웃을 바로 확인할 수 있습니다.',
    placement: 'left',
  },
  {
    tourId: 'right-panel',
    navigateTo: 'script',
    title: '체크리스트 탭',
    desc: '오른쪽 패널 "체크리스트" 탭에서 항목을 추가합니다. 표지 화면 기준 = 프로젝트 공통 항목, 각 문서(회차·시놉시스 등) 기준 = 해당 문서 전용 항목. 완료된 항목은 하단으로 이동하고 작업완료 시 로그에 기록됩니다.',
    placement: 'left',
  },
  {
    tourId: null,
    navigateTo: null,
    title: '공유 링크 & 피드백 패널',
    desc: '"공유" 버튼으로 읽기 전용 링크를 생성합니다. 공유 링크에서는 오른쪽 하단에 피드백 패널이 별도로 나타나 줄 단위 댓글과 답글을 남길 수 있습니다. 공유 수신자는 본문 수정 없이 댓글만 작성합니다.',
    placement: 'center',
  },
  {
    tourId: 'work-timer',
    navigateTo: null,
    title: '작업 완료 & 마무리',
    desc: '활동 시간이 자동 측정됩니다. 완료 버튼을 누르면 세션이 마이페이지 작업통계에 기록됩니다. 저장 → 공유 → 작업완료 흐름으로 집필을 마무리하세요.',
    placement: 'bottom',
  },
];

// ── Layout constants ──────────────────────────────────────────────────────────
const CARD_W     = 320;
const CARD_H_EST = 260;
const EDGE_PAD   = 10;
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
      break;
  }

  // Flip if off-screen
  if (placement === 'bottom' && top + CARD_H_EST > vh - EDGE_PAD)
    top = rect.top - CARD_H_EST - GAP;
  if (placement === 'right' && left + cardW > vw - EDGE_PAD)
    left = rect.left - cardW - GAP;
  if (placement === 'left' && left < EDGE_PAD)
    left = rect.right + GAP;

  // Clamp within viewport
  top  = Math.max(EDGE_PAD, Math.min(top,  vh - CARD_H_EST - EDGE_PAD));
  left = Math.max(EDGE_PAD, Math.min(left, vw - cardW      - EDGE_PAD));

  return { top, left, width: cardW };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OnboardingTour() {
  const { state, dispatch } = useApp();
  const [step,    setStep]    = useState(0);
  const [visible, setVisible] = useState(false);
  const [rect,    setRect]    = useState(null);

  // Always-current ref to avoid stale closures in callbacks
  const stateRef = useRef(state);
  stateRef.current = state;

  // Saved state to restore when tour ends
  const savedRef = useRef(null);

  const current = STEPS[step];

  // ─ Apply page navigation for a given step ──────────────────────────────────
  const applyNavigation = useCallback((stepIdx) => {
    const { navigateTo } = STEPS[stepIdx];
    if (!navigateTo) return;

    if (navigateTo === 'script') {
      const { episodes, activeProjectId, activeEpisodeId } = stateRef.current;
      // Prefer already-active episode, else first episode of project
      const ep = activeEpisodeId
        ? episodes.find(e => e.id === activeEpisodeId)
        : episodes.find(e => e.projectId === activeProjectId);
      if (ep) {
        dispatch({ type: 'SET_ACTIVE_EPISODE', id: ep.id });
      } else {
        // No episode exists — fallback to cover so at least center-panel renders
        dispatch({ type: 'SET_ACTIVE_DOC', payload: 'cover' });
      }
    } else if (navigateTo === 'characters') {
      dispatch({ type: 'SET_ACTIVE_DOC', payload: 'characters' });
      // Auto-select first character so the usage panel renders immediately.
      // If no characters exist, the right panel still highlights the area where
      // the usage panel would appear, and the description explains what to expect.
      const { characters, activeProjectId } = stateRef.current;
      const firstChar = characters.find(c => c.projectId === activeProjectId);
      if (firstChar) {
        dispatch({ type: 'SET_SELECTED_CHARACTER', id: firstChar.id });
      }
    } else {
      dispatch({ type: 'SET_ACTIVE_DOC', payload: navigateTo });
    }
  }, [dispatch]);

  // ─ Restore the page the user was on before the tour ─────────────────────────
  const restoreState = useCallback(() => {
    const saved = savedRef.current;
    if (!saved) return;
    if (saved.activeDoc === 'script' && saved.activeEpisodeId) {
      dispatch({ type: 'SET_ACTIVE_EPISODE', id: saved.activeEpisodeId });
    } else if (saved.activeDoc) {
      dispatch({ type: 'SET_ACTIVE_DOC', payload: saved.activeDoc });
    }
    savedRef.current = null;
  }, [dispatch]);

  // ─ Spotlight: track target element rect (100 ms delay lets navigation render) ─
  useEffect(() => {
    if (!visible || !current?.tourId) { setRect(null); return; }
    let cancelled = false;
    const update = () => {
      const el = document.querySelector(`[data-tour-id="${current.tourId}"]`);
      if (!cancelled) setRect(el ? el.getBoundingClientRect() : null);
    };
    const timer = setTimeout(update, 100);
    window.addEventListener('resize', update);
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener('resize', update); };
  }, [visible, step, current?.tourId]);

  // ─ Auto-show on first visit ──────────────────────────────────────────────────
  useEffect(() => {
    const shouldShow = isPublicPcMode()
      ? !sessionStorage.getItem(SESSION_KEY)
      : !getItem(DONE_KEY);
    if (shouldShow) setVisible(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─ Save original page state once tour is visible + state is initialized ──────
  useEffect(() => {
    if (visible && state.initialized && !savedRef.current) {
      savedRef.current = {
        activeDoc: state.activeDoc,
        activeEpisodeId: state.activeEpisodeId,
      };
    }
  }, [visible, state.initialized, state.activeDoc, state.activeEpisodeId]);

  // ─ Manual trigger via custom DOM event ────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      // Save current state before re-starting tour
      savedRef.current = {
        activeDoc: stateRef.current.activeDoc,
        activeEpisodeId: stateRef.current.activeEpisodeId,
      };
      setStep(0);
      setVisible(true);
    };
    window.addEventListener('drama:startTour', handler);
    return () => window.removeEventListener('drama:startTour', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─ Persist completion ─────────────────────────────────────────────────────────
  const markDone = useCallback(() => {
    setItem(DONE_KEY, true);
    if (isPublicPcMode()) sessionStorage.setItem(SESSION_KEY, 'true');
  }, []);

  // ─ Close tour ─────────────────────────────────────────────────────────────────
  const close = useCallback(() => {
    setVisible(false);
    markDone();
    restoreState();
  }, [markDone, restoreState]);

  // ─ Navigate steps ─────────────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (step >= STEPS.length - 1) { close(); return; }
    const next = step + 1;
    applyNavigation(next);
    setStep(next);
  }, [step, close, applyNavigation]);

  const goPrev = useCallback(() => {
    if (step === 0) return;
    const prev = step - 1;
    applyNavigation(prev);
    setStep(prev);
  }, [step, applyNavigation]);

  // ─ Keyboard navigation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    const onKey = (e) => {
      if (e.key === 'Escape')      { e.preventDefault(); close(); }
      if (e.key === 'ArrowRight')  { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft')   { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, close, goNext, goPrev]);

  if (!visible) return null;

  const isLast   = step === STEPS.length - 1;
  const isCenter = !rect || current.placement === 'center';
  const cardPos  = getCardPos(rect, current.placement);

  const btnBase = {
    fontSize: 12, borderRadius: 6, cursor: 'pointer',
    border: 'none', padding: '6px 14px', lineHeight: 1.4,
  };

  return (
    <>
      {/* ── Backdrop / click-catcher ── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="사용 가이드 투어"
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: isCenter ? 'rgba(0,0,0,0.65)' : 'transparent',
          pointerEvents: 'all',
        }}
        onClick={close}
      />

      {/* ── Spotlight (only when targeting a real element) ── */}
      {!isCenter && rect && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top:    rect.top  - SPOT_PAD,
            left:   rect.left - SPOT_PAD,
            width:  rect.width  + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
            borderRadius: 8,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
            border: '2px solid var(--c-accent)',
            outline: '4px solid rgba(90,90,245,0.2)',
            zIndex: 9001,
            pointerEvents: 'none',
            transition: 'top 0.22s ease, left 0.22s ease, width 0.22s ease, height 0.22s ease',
          }}
        />
      )}

      {/* ── Card ── */}
      <div
        role="document"
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
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          padding: 20,
          transition: 'top 0.22s ease, left 0.22s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Step dots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14, flexWrap: 'wrap' }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                height: 6,
                width: i === step ? 18 : 6,
                borderRadius: 3,
                background: i === step
                  ? 'var(--c-accent)'
                  : i < step ? 'var(--c-accent2)' : 'var(--c-border3)',
                transition: 'width 0.2s, background 0.2s',
                flexShrink: 0,
              }}
            />
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--c-text6)', flexShrink: 0 }}>
            {step + 1} / {STEPS.length}
          </span>
        </div>

        {/* Title */}
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 8, lineHeight: 1.4 }}>
          {current.title}
        </div>

        {/* Description — preserve \n as line breaks */}
        <div style={{ fontSize: 12, color: 'var(--c-text3)', lineHeight: 1.75, marginBottom: 16, whiteSpace: 'pre-line' }}>
          {current.desc}
        </div>

        {/* Keyboard hint */}
        <div style={{ fontSize: 10, color: 'var(--c-text6)', marginBottom: 14 }}>
          ← → 방향키로 이동 · Esc 닫기
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {step > 0 && (
            <button
              onClick={goPrev}
              style={{ ...btnBase, background: 'transparent', border: '1px solid var(--c-border3)', color: 'var(--c-text4)' }}
            >
              이전
            </button>
          )}
          <button
            onClick={goNext}
            autoFocus
            style={{ ...btnBase, background: 'var(--c-accent)', color: '#fff', fontWeight: 600 }}
          >
            {isLast ? '시작하기 →' : '다음'}
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
            <button
              onClick={close}
              style={{ ...btnBase, background: 'transparent', color: 'var(--c-text6)', fontSize: 11, padding: '4px 8px' }}
            >
              건너뛰기
            </button>
            <button
              onClick={close}
              style={{ ...btnBase, background: 'transparent', color: 'var(--c-text6)', fontSize: 11, padding: '4px 8px' }}
            >
              다시 보지 않기
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
