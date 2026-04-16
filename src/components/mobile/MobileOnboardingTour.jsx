import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../../store/AppContext';
import { getItem, setItem, isPublicPcMode } from '../../store/db';

const DONE_KEY    = 'mobileOnboardingDone';
const SESSION_KEY = 'drama_mobileOnboardingSession';
const HINTS_KEY   = 'drama_mobileHintsSeen';

// ── 색상 태그 컴포넌트 ──────────────────────────────────────────────────────
function Tag({ children, color = '#6366f1' }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700,
      background: color, color: '#fff',
      borderRadius: 4, padding: '1px 7px', margin: '0 2px',
      verticalAlign: 'middle', lineHeight: 1.7, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// ── 초기 5단계 투어 ────────────────────────────────────────────────────────
const MOBILE_STEPS = [
  {
    tourId: 'mobile-hamburger',
    title: '메뉴 (☰)',
    accent: '#4285f4',
    desc: (
      <>
        Google 로그인과 <Tag color="#4285f4">마이페이지</Tag>에 접근할 수 있습니다.<br/>
        마이페이지에서 설정·작업통계·Q&A·오류 보고를 이용하세요.
      </>
    ),
  },
  {
    tourId: 'mobile-timer',
    title: '소요시간 / 기록',
    accent: '#10b981',
    desc: (
      <>
        실제 작업한 시간만 카운트됩니다.<br/>
        작업이 끝나면 <Tag color="#10b981">기록</Tag> 버튼을 눌러<br/>
        오늘의 작업을 통계로 저장하세요.<br/>
        체크리스트 완수 사항도 함께 기록됩니다.
      </>
    ),
  },
  {
    tourId: 'mobile-toolbar',
    title: '스타일 도구바',
    accent: '#f59e0b',
    desc: (
      <>
        <Tag color="#f59e0b">마이페이지 › 설정</Tag>에서 기본 스타일을 지정하고,<br/>
        이 도구바에서 글꼴·크기·저장·출력과<br/>
        등장인물-대사 간격을 직접 조정할 수 있습니다.
      </>
    ),
  },
  {
    tourId: 'center-panel',
    title: '편집 영역',
    accent: '#8b5cf6',
    desc: (
      <>
        페이지별 <Tag color="#8b5cf6">메인 편집 화면</Tag>입니다.<br/>
        하단 탭에서 메뉴를 선택하면 내용이 이 영역에 표시됩니다.
      </>
    ),
  },
  {
    tourId: 'mobile-tabs',
    title: '탭 메뉴',
    accent: '#ef4444',
    desc: (
      <>
        <Tag color="#3b82f6">대본</Tag> 표지·시놉시스·회차별 대본 작성<br/>
        <Tag color="#10b981">자료</Tag> 인물정보·관계도·자료수집<br/>
        <Tag color="#f59e0b">설계</Tag> 트리트먼트·씬리스트로 초안 및 구조 점검<br/>
        <Tag color="#8b5cf6">메모</Tag> 체크리스트 저장 및 관리
      </>
    ),
  },
];

// ── 페이지별 힌트 (모바일용) ──────────────────────────────────────────────
const MOBILE_PAGE_HINTS = {
  cover: {
    title: '표지',
    accent: '#6366f1',
    desc: (
      <>
        <Tag>표지</Tag>에 작품 기본 정보를 입력하세요.<br/>
        제목·작가·장르·방송사 등이 출력 첫 장에 표시됩니다.
      </>
    ),
  },
  script: {
    title: '대본 편집',
    accent: '#6366f1',
    desc: (
      <>
        <Tag>S#</Tag> <Tag>지문</Tag> <Tag>대사</Tag> 버튼으로 블록 유형을 전환하세요.
      </>
    ),
  },
  characters: {
    title: '인물 관리',
    accent: '#6366f1',
    desc: (
      <>
        <Tag>인물 패널</Tag>에 등장인물을 등록하고 성격·역할을 정리하세요.<br/>
        시놉시스의 인물설정에도 자동으로 반영됩니다.
      </>
    ),
  },
  treatment: {
    title: '트리트먼트',
    accent: '#6366f1',
    desc: (
      <>
        <Tag>트리트먼트</Tag>에서 씬별 내용을 요약해 전체 흐름을 확인하세요.<br/>
        항목을 대본으로 가져오면 씬번호 블록으로 변환됩니다.<br/>
        <span style={{ fontSize: 11, color: 'var(--c-text5)' }}>
          마이페이지 설정 › 설계 도구 설정에서 대본 자동 연동 여부를 설정할 수 있습니다.
        </span>
      </>
    ),
  },
  scenelist: {
    title: '씬리스트',
    accent: '#6366f1',
    desc: (
      <>
        <Tag>씬리스트</Tag>에서 회차별 씬을 표 형태로 한눈에 관리하세요.<br/>
        장소·세부장소·시간대·내용·등장인물·비고를 정리할 수 있으며,<br/>
        <span style={{ fontSize: 11, color: 'var(--c-text5)' }}>
          대본과 양방향 동기화 — 씬리스트 수정 시 대본 씬번호가 자동으로 업데이트됩니다.
        </span>
      </>
    ),
  },
  structure: {
    title: '구조 설계',
    accent: '#6366f1',
    desc: (
      <>
        <Tag>구조 설계</Tag>에서 씬에 붙인 <Tag color="#f59e0b">태그</Tag>로 전체 구조를 한눈에 파악하세요.<br/>
        Save the Cat·7시퀀스 등 내장 지침을 참고하거나,<br/>
        마이페이지 설정에서 나만의 태그를 직접 만들 수 있습니다.
      </>
    ),
  },
  relationships: {
    title: '인물관계도',
    accent: '#6366f1',
    desc: (
      <>
        <Tag>인물관계도</Tag>에서 인물 간 관계를 시각적으로 정리하세요.<br/>
        선을 그어 관계를 표현할 수 있습니다.
      </>
    ),
  },
  biography: {
    title: '인물이력서',
    accent: '#6366f1',
    desc: (
      <>
        <Tag>인물이력서</Tag>에 인물의 과거 사건과 연표를 기록하세요.
      </>
    ),
  },
  resources: {
    title: '자료수집',
    accent: '#6366f1',
    desc: (
      <>
        <Tag>자료수집</Tag>에 링크·이미지·텍스트 메모를 자유롭게 저장하세요.
      </>
    ),
  },
};

// ── 힌트 저장/불러오기 ────────────────────────────────────────────────────
function getSeenHints() {
  try {
    const v = localStorage.getItem(HINTS_KEY);
    return v ? new Set(v.split(',')) : new Set();
  } catch { return new Set(); }
}
function markHintSeen(id) {
  try {
    const seen = getSeenHints();
    seen.add(id);
    localStorage.setItem(HINTS_KEY, [...seen].join(','));
  } catch {}
}

// ── 카드 위치 계산 ────────────────────────────────────────────────────────
const PAD      = 10;
const CARD_H   = 220; // 카드 예상 높이

function calcCardPos(rect) {
  if (!rect) return { type: 'center' };
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 요소가 크면(화면의 40% 이상) 중앙에 배치
  if (rect.height > vh * 0.4 || rect.width > vw * 0.7) {
    return { type: 'center' };
  }

  const isNarrow  = rect.width < vw * 0.45;
  const isTopHalf = (rect.top + rect.height / 2) < vh * 0.5;
  const cardW     = Math.min(220, vw - rect.right - PAD * 2);

  // 좁은 요소 + 오른쪽 공간 충분 → 오른쪽에 배치
  if (isNarrow && rect.right + PAD + 140 < vw) {
    return {
      type:  'right',
      top:   Math.max(PAD, Math.min(rect.top, vh - CARD_H - PAD)),
      left:  rect.right + PAD,
      width: cardW,
    };
  }
  // 상단 요소 + 아래에 카드 공간 있음 → 아래에 배치
  if (isTopHalf && rect.bottom + PAD + CARD_H < vh) {
    return {
      type:  'below',
      top:   rect.bottom + PAD,
      left:  PAD,
      width: vw - PAD * 2,
    };
  }
  // 하단 요소 + 위에 카드 공간 있음 → 위에 배치
  if (!isTopHalf && rect.top - PAD - CARD_H > 0) {
    return {
      type:   'above',
      bottom: vh - rect.top + PAD,
      left:   PAD,
      width:  vw - PAD * 2,
    };
  }
  // 공간 부족 → 중앙
  return { type: 'center' };
}

// ── 콜아웃 카드 ───────────────────────────────────────────────────────────
function MobileHintCard({
  title, desc, accent = '#6366f1',
  rect, onNext, onSkip, onPrev,
  stepIdx, totalSteps, isLast, isHint,
}) {
  const pos = calcCardPos(rect);

  const cardStyle = pos.type === 'center'
    ? {
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: Math.min(320, window.innerWidth - PAD * 2),
      }
    : pos.type === 'above'
    ? {
        position: 'fixed',
        bottom: pos.bottom, left: pos.left,
        width: pos.width,
      }
    : {
        position: 'fixed',
        top: pos.top, left: pos.left,
        width: pos.width,
      };

  return (
    <>
      {/* 딤 배경 */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.55)', pointerEvents: 'all' }}
        onClick={isHint ? onSkip : onNext}
      />

      {/* 컬러 박스 (스포트라이트) */}
      {rect && (
        <div style={{
          position: 'fixed',
          top:    rect.top    - 4,
          left:   rect.left   - 4,
          width:  rect.width  + 8,
          height: rect.height + 8,
          borderRadius: 8,
          boxShadow: `0 0 0 9999px rgba(0,0,0,0.55)`,
          border: `2.5px solid ${accent}`,
          background: `${accent}18`,
          zIndex: 9001,
          pointerEvents: 'none',
          transition: 'all 0.2s ease',
        }} />
      )}

      {/* 설명 카드 */}
      <div
        style={{
          ...cardStyle,
          zIndex: 9002,
          background: 'var(--c-card)',
          border: `1px solid ${accent}44`,
          borderRadius: 12,
          boxShadow: `0 6px 24px rgba(0,0,0,0.35), 0 0 0 2px ${accent}22`,
          padding: '14px 16px',
          pointerEvents: 'all',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 제목 행: 컬러 인디케이터 + 텍스트 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: accent, flexShrink: 0 }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>{title}</div>
        </div>

        {/* 설명 */}
        <div style={{ fontSize: 12, color: 'var(--c-text3)', lineHeight: 2, marginBottom: 14 }}>
          {desc}
        </div>

        {/* 버튼 영역 */}
        {isHint ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onSkip}
              style={{ fontSize: 12, padding: '6px 16px', borderRadius: 6, background: accent, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >확인</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* 진행 점 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div key={i} style={{
                  height: 5, width: i === stepIdx ? 16 : 5, borderRadius: 3, flexShrink: 0,
                  background: i === stepIdx ? accent : i < stepIdx ? `${accent}88` : 'var(--c-border3)',
                  transition: 'width 0.2s, background 0.2s',
                }} />
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--c-text6)' }}>
                {stepIdx + 1} / {totalSteps}
              </span>
            </div>

            {/* 이동 버튼 */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {stepIdx > 0 && (
                <button onClick={onPrev} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, background: 'transparent', border: '1px solid var(--c-border3)', color: 'var(--c-text4)', cursor: 'pointer' }}>
                  이전
                </button>
              )}
              <button onClick={onNext} style={{ fontSize: 12, padding: '6px 18px', borderRadius: 6, background: accent, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                {isLast ? '시작하기 →' : '다음'}
              </button>
              <button onClick={onSkip} style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'transparent', border: 'none', color: 'var(--c-text6)', cursor: 'pointer' }}>
                건너뛰기
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export default function MobileOnboardingTour() {
  const { state } = useApp();

  // 투어 상태
  const [step,        setStep]        = useState(0);
  const [tourVisible, setTourVisible] = useState(false);
  const [rect,        setRect]        = useState(null);

  // 페이지 힌트 상태
  const [hintId,   setHintId]   = useState(null);
  const [hintRect, setHintRect] = useState(null);
  const hintShownRef = useRef(false);

  const currentStep = MOBILE_STEPS[step];
  const currentHint = hintId ? MOBILE_PAGE_HINTS[hintId] : null;

  // rect 측정
  function measure(tourId, setter, delay = 200) {
    setTimeout(() => {
      const el = document.querySelector(`[data-tour-id="${tourId}"]`);
      setter(el ? el.getBoundingClientRect() : null);
    }, delay);
  }

  // 투어 rect 업데이트
  useEffect(() => {
    if (!tourVisible) return;
    measure(currentStep.tourId, setRect);
    const handler = () => measure(currentStep.tourId, setRect);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [tourVisible, step]);

  // 첫 방문 시 투어 표시
  useEffect(() => {
    const shouldShow = isPublicPcMode()
      ? !sessionStorage.getItem(SESSION_KEY)
      : !getItem(DONE_KEY);
    if (shouldShow) setTourVisible(true);
  }, []);

  // 수동 투어 실행 이벤트 수신
  useEffect(() => {
    const handler = () => { setStep(0); setTourVisible(true); };
    window.addEventListener('drama:startTour', handler);
    return () => window.removeEventListener('drama:startTour', handler);
  }, []);

  const closeTour = useCallback(() => {
    setTourVisible(false);
    setItem(DONE_KEY, true);
    if (isPublicPcMode()) sessionStorage.setItem(SESSION_KEY, 'true');
  }, []);

  const goNext = useCallback(() => {
    if (step >= MOBILE_STEPS.length - 1) { closeTour(); return; }
    setStep(s => s + 1);
  }, [step, closeTour]);

  const goPrev = useCallback(() => {
    if (step === 0) return;
    setStep(s => s - 1);
  }, [step]);

  // 페이지 힌트: activeDoc 변경 시 — 먼저 기존 힌트 클리어
  useEffect(() => {
    setHintId(null);
    setHintRect(null);
  }, [state.activeDoc]);

  useEffect(() => {
    if (tourVisible || !state.initialized) return;
    const pageId = state.activeDoc === 'script' && state.activeEpisodeId
      ? 'script'
      : state.activeDoc;
    if (!pageId || !MOBILE_PAGE_HINTS[pageId]) return;
    if (getSeenHints().has(pageId)) return;

    hintShownRef.current = false;
    const timer = setTimeout(() => {
      if (hintShownRef.current) return;
      hintShownRef.current = true;
      setHintId(pageId);
      measure('center-panel', setHintRect);
    }, 400);
    return () => clearTimeout(timer);
  }, [state.activeDoc, state.activeEpisodeId, state.initialized, tourVisible]);

  const closeHint = useCallback(() => {
    if (hintId) markHintSeen(hintId);
    setHintId(null);
    setHintRect(null);
  }, [hintId]);

  // 투어 렌더
  if (tourVisible && currentStep) {
    return (
      <MobileHintCard
        title={currentStep.title}
        desc={currentStep.desc}
        accent={currentStep.accent}
        rect={rect}
        stepIdx={step}
        totalSteps={MOBILE_STEPS.length}
        isLast={step === MOBILE_STEPS.length - 1}
        onNext={goNext}
        onPrev={goPrev}
        onSkip={closeTour}
        isHint={false}
      />
    );
  }

  // 페이지 힌트 렌더
  if (hintId && currentHint) {
    return (
      <MobileHintCard
        title={currentHint.title}
        desc={currentHint.desc}
        accent={currentHint.accent}
        rect={hintRect}
        isHint
        onSkip={closeHint}
      />
    );
  }

  return null;
}
