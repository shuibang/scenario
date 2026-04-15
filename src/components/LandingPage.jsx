import React, { useState, useEffect, useRef, useCallback } from 'react';
import { guardedSignInWithGoogle } from '../utils/guardedSignIn';

// ─── 데이터 ────────────────────────────────────────────────────────────────────
const COMPARE_ROWS = [
  { label: '가격',              vals: ['무료', '약 30~37만원 ($199~$249)', '₩88,000~₩141,000 ($59~$94)', '월 ₩7,500~₩15,000 ($5~$9.92)', '무료(2편 제한)~연 ₩149,000 ($99)'] },
  { label: '한국어 포맷',       vals: ['✅', '❌', '❌', '❌', '❌'] },
  { label: 'HWPX 내보내기',    vals: ['✅', '❌', '❌', '❌', '❌'] },
  { label: '씬번호 실시간 연동', vals: ['✅', '❌', '△', '❌', '❌'] },
  { label: '로그인 없이 사용',  vals: ['✅', '❌', '❌', '❌', '❌'] },
  { label: '모바일 편집',       vals: ['✅', '❌', '❌', '✅', '△ (iOS만)'] },
  { label: '시놉시스 통합편집', vals: ['✅', '△', '❌', '❌', '❌'] },
  { label: '인물 관리 패널',    vals: ['✅', '❌', '△', '❌', '△'] },
];
const COMPARE_HEADERS = ['', '대본 작업실', 'Final Draft', 'Scrivener', 'WriterDuet', 'Arc Studio'];

const FEATURES = [
  { icon: '🔗', title: '회상 씬 번호 자동 연동', desc: '지문에서 씬을 참조할 때, 씬 순서가 바뀌면 그 번호도 실시간으로 자동으로 따라 바뀝니다. Final Draft도, Scrivener도 지원하지 않는 기능입니다.' },
  { icon: '✍️', title: '버튼 + 단축키로 바로 쓰기', desc: '씬 헤딩, 지문, 대사, 씬 연결 — Ctrl+1/2/3으로 바로 전환됩니다. 태그 문법을 외울 필요 없고, 영어 표기도 단축키로 입력할 수 있어요.' },
  { icon: '🇰🇷', title: '한국 대본 포맷 특화', desc: '공모전 당선 서식·드라마 대본집 기준의 "인물(여백)대사" 형식을 구현했습니다. PDF, DOCX, HWPX 내보내기를 지원합니다.' },
  { icon: '📱', title: '모바일·태블릿 완벽 지원', desc: '아이패드, 폰에서도 편집 가능합니다. 구글 로그인만 하면 구글 드라이브에 자동저장됩니다. 언제 어디서나 이어서 쓰세요.' },
  { icon: '🔒', title: 'AI 없음 — 단순 편집기', desc: '내 이야기가 어딘가에 쌓이는 찜찜함 없이, 온전히 내 것으로만 남아있어요. 편집 기능에만 집중했습니다.' },
  { icon: '📦', title: '표지·시놉시스·구조 통합', desc: '표지, 시놉시스, 인물 관리, 씬리스트, 트리트먼트, 구조 점검까지 — 하나의 작업실에서 대본 작업의 전 과정을 관리하세요.' },
];

// ─── 스크롤 리빌 훅 ────────────────────────────────────────────────────────────
function useScrollReveal(threshold = 0.12) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

function Reveal({ children, delay = 0, style }) {
  const [ref, visible] = useScrollReveal();
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(28px)',
      transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── 블록 포맷 전환 데모 ──────────────────────────────────────────────────────
// 흐름: 텍스트 입력 → 버튼 클릭 → 씬헤딩/지문/대사 포맷으로 변환 반복
const DEMO_TEXTS = {
  scene:    '카페 내부, 낮',
  action:   '민준이 들어서며 주위를 둘러본다.',
  dialogue: '민준   오늘 여기서 쓰는 거야.',
};
const TOOLBAR_BTNS = ['S#', '지문', '대사', '등장', '연결', '기타'];

function BlinkCursor() {
  return <span style={{ display: 'inline-block', width: 2, height: '0.85em', background: 'var(--c-accent)', verticalAlign: 'middle', marginLeft: 1, animation: 'blink 1s step-end infinite' }} />;
}

function BlockFormatDemo() {
  // phase:
  //  0 = 대기
  //  1 = scene 타이핑    2 = S# 버튼 클릭 → 씬헤딩 포맷
  //  3 = action 타이핑   4 = 지문 버튼 클릭 → 지문 포맷
  //  5 = dialogue 타이핑 6 = 대사 버튼 클릭 → 대사 포맷
  //  7 = 완료 대기 → 루프
  const [phase, setPhase] = useState(0);
  const [typedLen, setTypedLen] = useState(0);
  const [fadeRef, visible] = useScrollReveal(0.1);

  // 0→1: 뷰포트 진입 후 시작
  useEffect(() => {
    if (phase === 0 && visible) {
      const t = setTimeout(() => setPhase(1), 700);
      return () => clearTimeout(t);
    }
  }, [phase, visible]);

  // 홀수 phase(1,3,5): 타이핑
  const typingText = phase === 1 ? DEMO_TEXTS.scene : phase === 3 ? DEMO_TEXTS.action : phase === 5 ? DEMO_TEXTS.dialogue : null;
  useEffect(() => {
    if (!typingText) return;
    if (typedLen >= typingText.length) {
      const t = setTimeout(() => setPhase(p => p + 1), 480);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTypedLen(n => n + 1), 46);
    return () => clearTimeout(t);
  }, [phase, typedLen, typingText]);

  // 짝수 phase(2,4,6): 버튼 플래시 후 다음 타이핑 or 완료
  useEffect(() => {
    let t;
    if (phase === 2) t = setTimeout(() => { setTypedLen(0); setPhase(3); }, 850);
    else if (phase === 4) t = setTimeout(() => { setTypedLen(0); setPhase(5); }, 850);
    else if (phase === 6) t = setTimeout(() => setPhase(7), 850);
    else if (phase === 7) t = setTimeout(() => { setTypedLen(0); setPhase(0); }, 3000);
    return () => clearTimeout(t);
  }, [phase]);

  const activeBtn = phase === 2 ? 'S#' : phase === 4 ? '지문' : phase === 6 ? '대사' : null;
  const sceneFormatted   = phase >= 2;
  const actionFormatted  = phase >= 4;
  const dialogueFormatted = phase >= 6;

  // 현재 타이핑 중인 텍스트 (각 단계별)
  const sceneDisplayed   = phase >= 1 ? (phase === 1 ? DEMO_TEXTS.scene.slice(0, typedLen)    : DEMO_TEXTS.scene)   : null;
  const actionDisplayed  = phase >= 3 ? (phase === 3 ? DEMO_TEXTS.action.slice(0, typedLen)   : DEMO_TEXTS.action)  : null;
  const dialogueDisplayed = phase >= 5 ? (phase === 5 ? DEMO_TEXTS.dialogue.slice(0, typedLen) : DEMO_TEXTS.dialogue) : null;

  return (
    <div ref={fadeRef} style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(20px)', transition: 'all 0.6s ease', maxWidth: 540, margin: '0 auto' }}>
      <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.22)' }}>

        {/* 툴바 — 실제 버튼 스타일 */}
        <div style={{ background: 'var(--c-header)', borderBottom: '1px solid var(--c-border)', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--c-text4)', padding: '2px 10px', border: '1px solid var(--c-border3)', borderRadius: 12, marginRight: 2 }}>1회</span>
          {TOOLBAR_BTNS.map(btn => {
            const isActive = activeBtn === btn;
            return (
              <span key={btn} style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 12,
                border: `1px solid ${isActive ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                background: isActive ? 'var(--c-accent)' : 'transparent',
                color: isActive ? '#fff' : 'var(--c-text4)',
                transition: 'all 0.25s ease',
                fontWeight: isActive ? 600 : 400,
                userSelect: 'none',
              }}>{btn}</span>
            );
          })}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--c-text5)', whiteSpace: 'nowrap' }}>1/1 &nbsp;●&nbsp; 저장됨</span>
        </div>

        {/* 편집 영역 */}
        <div style={{ padding: '14px 20px', fontFamily: 'monospace', fontSize: 12.5, lineHeight: 2.1, minHeight: 160, background: 'var(--c-bg)' }}>

          {/* 씬 헤딩 블록 */}
          {sceneDisplayed !== null && (
            <div style={{ color: sceneFormatted ? 'var(--c-accent)' : 'var(--c-text)', fontWeight: sceneFormatted ? 700 : 400, transition: 'all 0.3s ease' }}>
              {sceneFormatted && 'S#1. '}
              {sceneDisplayed}
              {phase === 1 && <BlinkCursor />}
            </div>
          )}

          {/* 지문 블록 */}
          {actionDisplayed !== null && (
            <div style={{ paddingLeft: actionFormatted ? '1.5rem' : 0, color: actionFormatted ? 'var(--c-text3)' : 'var(--c-text)', transition: 'all 0.35s ease' }}>
              {actionDisplayed}
              {phase === 3 && <BlinkCursor />}
            </div>
          )}

          {/* 대사 블록 */}
          {dialogueDisplayed !== null && (
            dialogueFormatted ? (
              <div style={{ display: 'flex', transition: 'all 0.35s ease' }}>
                <span style={{ fontWeight: 700, color: 'var(--c-text)', minWidth: '7em', flexShrink: 0 }}>민준</span>
                <span style={{ color: 'var(--c-text)' }}>오늘 여기서 쓰는 거야.</span>
              </div>
            ) : (
              <div style={{ color: 'var(--c-text)' }}>
                {dialogueDisplayed}
                {phase === 5 && <BlinkCursor />}
              </div>
            )
          )}
        </div>
      </div>

      {/* 설명 텍스트 */}
      <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, minHeight: 20 }}>
        {(phase === 1 || phase === 3 || phase === 5) && <span style={{ color: 'var(--c-text5)' }}>텍스트 입력 후 버튼을 누르면…</span>}
        {phase === 2 && <span style={{ color: 'var(--c-accent)', fontWeight: 600 }}>S# 클릭 → 씬 헤딩 포맷으로 변환</span>}
        {phase === 4 && <span style={{ color: 'var(--c-accent)', fontWeight: 600 }}>지문 클릭 → 지문 포맷으로 변환</span>}
        {phase === 6 && <span style={{ color: 'var(--c-accent)', fontWeight: 600 }}>대사 클릭 → 한국 대본 대사 포맷으로 변환</span>}
        {phase === 7 && <span style={{ color: '#22c55e', fontWeight: 600 }}>태그 문법 없이, 버튼·단축키로 바로 씁니다 ✓</span>}
      </div>
    </div>
  );
}

// ─── 씬번호 자동연동 데모 ──────────────────────────────────────────────────────
// 흐름: S#1 아래에서 타이핑으로 새 씬 추가 → S#2·S#3 번호 밀림 → 지문 참조 자동 갱신
// 씬리스트는 편집기에서 추가된 내용이 오른쪽에 자동 반영됨 (직접 추가 불가)
const NEW_SCENE_TITLE = 'S#2. 골목 — 저녁';

function SceneRefDemo() {
  // phase: 0=초기대기 1=타이핑 2=번호밀림 3=참조갱신 4=완료대기
  const [phase, setPhase] = useState(0);
  const [typedLen, setTypedLen] = useState(0);
  const [fadeRef, visible] = useScrollReveal(0.2);

  // phase 0→1: 뷰포트 진입 후 대기
  useEffect(() => {
    if (phase === 0 && visible) {
      const t = setTimeout(() => setPhase(1), 1400);
      return () => clearTimeout(t);
    }
  }, [phase, visible]);

  // phase 1: 타이핑 효과
  useEffect(() => {
    if (phase !== 1) return;
    if (typedLen >= NEW_SCENE_TITLE.length) {
      const t = setTimeout(() => setPhase(2), 650);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTypedLen(n => n + 1), 50);
    return () => clearTimeout(t);
  }, [phase, typedLen]);

  // phase 2→3→4→loop
  useEffect(() => {
    let t;
    if (phase === 2) t = setTimeout(() => setPhase(3), 1000);
    else if (phase === 3) t = setTimeout(() => setPhase(4), 1400);
    else if (phase === 4) t = setTimeout(() => { setTypedLen(0); setPhase(0); }, 3200);
    return () => clearTimeout(t);
  }, [phase]);

  const numbersShifted = phase >= 2;
  const refUpdated     = phase >= 3;

  // 씬리스트: 편집기 내용을 그대로 반영 (추가 버튼 없음)
  const sceneList = numbersShifted
    ? [
        { num: 1, title: '카페 — 낮' },
        { num: 2, title: '골목 — 저녁', isNew: true },
        { num: 3, title: '골목 — 낮' },
        { num: 4, title: '민준의 방 — 밤' },
      ]
    : [
        { num: 1, title: '카페 — 낮' },
        { num: 2, title: '골목 — 낮' },
        { num: 3, title: '민준의 방 — 밤' },
      ];

  // 지문 속 참조 번호: 원래 S#2(골목—낮)를 가리키던 게 S#3으로 자동 갱신
  const refNum = refUpdated ? 3 : 2;

  return (
    <div ref={fadeRef} style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(24px)', transition: 'all 0.6s ease' }}>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>

        {/* ── 왼쪽: 대본 편집기 ── */}
        <div style={{ flex: '1 1 320px', maxWidth: 420, background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 8, overflow: 'hidden' }}>
          {/* 헤더 */}
          <div style={{ height: 28, background: 'var(--c-header)', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 10px', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--c-text5)', fontWeight: 600 }}>대본 편집기 — 1회차</span>
            <div style={{ flex: 1 }} />
            {['Ctrl+1', 'Ctrl+2', 'Ctrl+3'].map(k => (
              <span key={k} style={{ fontSize: 8.5, padding: '1px 5px', border: '1px solid var(--c-border3)', borderRadius: 3, color: 'var(--c-text6)' }}>{k}</span>
            ))}
          </div>
          {/* 스크립트 내용 */}
          <div style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.95 }}>

            {/* S#1 (변하지 않음) */}
            <div style={{ color: 'var(--c-accent)', fontWeight: 700 }}>S#1. 카페 — 낮</div>
            <div style={{ paddingLeft: '1.4rem', color: 'var(--c-text3)' }}>민준, 창가에 앉아 커피를 마신다.</div>
            <div style={{ color: 'var(--c-text)', whiteSpace: 'pre' }}>{'민준     오늘따라 왜 이리 설레지.'}</div>

            {/* 새 씬 타이핑 영역 */}
            <div style={{ minHeight: '1.95em', marginTop: 2 }}>
              {phase >= 1 && (
                <div style={{
                  color: 'var(--c-accent)', fontWeight: 700,
                  background: phase === 1 ? 'rgba(90,90,245,0.08)' : 'transparent',
                  borderRadius: 3, transition: 'background 0.5s',
                }}>
                  {NEW_SCENE_TITLE.slice(0, typedLen)}
                  {phase === 1 && (
                    <span style={{ display: 'inline-block', width: 2, height: '0.85em', background: 'var(--c-accent)', verticalAlign: 'middle', marginLeft: 1, animation: 'blink 1s step-end infinite' }} />
                  )}
                </div>
              )}
            </div>

            {/* S#2→S#3 골목—낮 */}
            <div>
              <span style={{ color: 'var(--c-accent)', fontWeight: 700, transition: 'all 0.4s' }}>
                S#{numbersShifted ? 3 : 2}. 골목 — 낮
              </span>
              {numbersShifted && (
                <span style={{ fontSize: 9, color: '#f59e0b', marginLeft: 7, fontWeight: 500, animation: 'slideDown 0.3s ease' }}>↑ 번호 밀림</span>
              )}
            </div>
            <div style={{ paddingLeft: '1.4rem', color: 'var(--c-text3)' }}>서진이 걸어온다.</div>

            {/* S#3→S#4 민준의 방 */}
            <div style={{ marginTop: 2 }}>
              <span style={{ color: 'var(--c-accent)', fontWeight: 700, transition: 'all 0.4s' }}>
                S#{numbersShifted ? 4 : 3}. 민준의 방 — 밤
              </span>
            </div>
            <div style={{
              paddingLeft: '1.4rem', color: 'var(--c-text3)',
              background: refUpdated ? 'rgba(90,90,245,0.18)' : 'transparent',
              borderRadius: 3, transition: 'background 0.35s ease',
            }}>
              {'S#'}<span style={{
                color: refUpdated ? 'var(--c-accent)' : 'inherit',
                fontWeight: refUpdated ? 700 : 400,
                transition: 'color 0.35s ease',
              }}>{refNum}</span>{'에서 봤던 그 눈빛이—'}
            </div>
          </div>
        </div>

        {/* ── 오른쪽: 씬리스트 (자동 반영, 직접 추가 불가) ── */}
        <div style={{ flex: '0 0 auto', width: 200, background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ height: 28, background: 'var(--c-header)', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 10px' }}>
            <span style={{ fontSize: 10, color: 'var(--c-text5)', fontWeight: 600, flex: 1 }}>씬 리스트</span>
            <span style={{ fontSize: 9, color: 'var(--c-text6)', background: 'var(--c-input)', padding: '1px 6px', borderRadius: 10 }}>자동 연동</span>
          </div>
          {sceneList.map(s => (
            <div key={s.num + s.title} style={{
              padding: '7px 12px', borderBottom: '1px solid var(--c-border2)',
              display: 'flex', gap: 8, alignItems: 'center',
              background: s.isNew ? 'rgba(90,90,245,0.08)' : 'transparent',
              transition: 'all 0.45s ease',
              animation: s.isNew && numbersShifted ? 'slideDown 0.35s ease' : 'none',
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, minWidth: 28, color: s.isNew ? 'var(--c-accent)' : 'var(--c-text6)', flexShrink: 0, transition: 'color 0.4s' }}>
                S#{s.num}
              </span>
              <span style={{ fontSize: 11, color: s.isNew ? 'var(--c-accent)' : 'var(--c-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.title}
              </span>
              {s.isNew && <span style={{ fontSize: 8, color: 'var(--c-accent)', fontWeight: 700, flexShrink: 0 }}>NEW</span>}
            </div>
          ))}
          <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--c-text6)', textAlign: 'center' }}>
            편집기에서 자동 생성됨
          </div>
        </div>
      </div>

      {/* 설명 */}
      <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12.5, minHeight: 22 }}>
        {phase === 0 && <span style={{ color: 'var(--c-text5)' }}>S#1 아래 줄에서 새 씬을 입력하면…</span>}
        {phase === 1 && <span style={{ color: 'var(--c-accent)' }}>새 씬 헤딩 입력 중…</span>}
        {phase === 2 && <span style={{ color: 'var(--c-text3)' }}>씬 번호가 자동으로 밀립니다 (S#2→S#3, S#3→S#4)</span>}
        {phase === 3 && <span style={{ color: 'var(--c-accent)', fontWeight: 600 }}>지문 속 씬 참조도 자동 갱신 S#2→S#3 ✓</span>}
        {phase === 4 && <span style={{ color: '#22c55e', fontWeight: 600 }}>씬리스트에도 실시간 반영 — Final Draft·Scrivener에 없는 기능 ✓</span>}
      </div>
    </div>
  );
}

// ─── CSS 인젝션 (keyframes) ────────────────────────────────────────────────────
function InjectStyles() {
  useEffect(() => {
    const id = 'landing-keyframes';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
      @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      @keyframes lp-fadein { from{opacity:0} to{opacity:1} }
    `;
    document.head.appendChild(s);
    return () => document.getElementById(id)?.remove();
  }, []);
  return null;
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function LandingPage({ onStart, onLogin }) {
  const [loginOpen, setLoginOpen] = useState(false);

  const handleLogin = (userData) => {
    onLogin?.(userData);
    setLoginOpen(false);
    onStart?.();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--c-bg)', color: 'var(--c-text)', fontFamily: 'inherit', overflowY: 'auto', overflowX: 'hidden',  }}>
      <InjectStyles />

      {/* ── 헤더 ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--c-header)', borderBottom: '1px solid var(--c-border)', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--c-accent)', letterSpacing: '0.05em' }}>대본 작업실</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { window.location.hash = '#director'; }} style={{ ...headerBtnStyle, color: 'var(--c-accent2)', borderColor: 'var(--c-accent2)' }}>연출 작업실</button>
          <button onClick={() => setLoginOpen(true)} style={headerBtnStyle}>로그인</button>
          <button onClick={onStart} style={{ ...headerBtnStyle, background: 'var(--c-accent)', color: '#fff', border: 'none' }}>바로 시작하기</button>
        </div>
      </header>

      {/* ── 히어로 ── */}
      <section style={{ padding: '72px 32px 56px', maxWidth: 720, margin: '0 auto', textAlign: 'center', animation: 'fadeUp 0.7s ease both' }}>
        <div style={{ display: 'inline-block', background: 'var(--c-accent)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 12px', borderRadius: 20, marginBottom: 20, letterSpacing: '0.05em' }}>
          무료 베타 공개 중
        </div>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.2, marginBottom: 18, color: 'var(--c-text)' }}>
          드라마 대본,<br />이제 편하게, 어디서든
        </h1>
        <p style={{ fontSize: 'clamp(14px, 2vw, 17px)', color: 'var(--c-text4)', lineHeight: 1.75, marginBottom: 32 }}>
          한국 드라마 작가를 위해 직접 만든 전문 대본 편집기.<br />
          설치 없이, 로그인 없이, 완전 무료로 지금 바로 시작하세요.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={onStart} style={heroPrimaryBtn}>로그인 없이 시작하기 →</button>
          <button onClick={() => setLoginOpen(true)} style={heroSecondaryBtn}>구글 로그인 (자동저장)</button>
        </div>
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => { window.location.hash = '#director'; }}
            style={{ fontSize: 12, color: 'var(--c-accent2)', background: 'none', border: '1px solid var(--c-accent2)', borderRadius: 6, padding: '6px 16px', cursor: 'pointer', opacity: 0.85 }}
          >
            🎬 감독이신가요? 연출 작업실 입장 →
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--c-text6)', marginTop: 12 }}>로그인 없이도 이 기기에 자동저장 — 구글 로그인 시 어디서든 이어서 작업</p>
      </section>

      {/* ── 버튼/단축키 포맷 데모 ── */}
      <section style={{ padding: '0 24px 64px', maxWidth: 620, margin: '0 auto' }}>
        <BlockFormatDemo />
      </section>

      {/* ── 실제 화면 ── */}
      <Reveal style={{ padding: '0 24px 72px', maxWidth: 1100, margin: '0 auto' }}>
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--c-text6)', marginBottom: 24, letterSpacing: '0.1em', textTransform: 'uppercase' }}>실제 서비스 화면</p>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {/* 데스크톱 프레임 */}
          <div style={{ flex: '0 0 auto', width: 'min(780px, 85vw)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.35)', border: '1px solid var(--c-border)' }}>
            <div style={{ height: 28, background: 'var(--c-header)', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6 }}>
              <span style={macDot('#ff5f57')} /><span style={macDot('#febc2e')} /><span style={macDot('#28c840')} />
              <div style={{ flex: 1, marginLeft: 12, height: 16, background: 'var(--c-input)', borderRadius: 4, maxWidth: 280 }} />
            </div>
            <img src="/screenshots/desktop.png" alt="대본 작업실 데스크톱 화면 — 표지 편집기" style={{ width: '100%', display: 'block' }} loading="lazy" />
          </div>
          {/* 모바일 프레임 */}
          <div style={{ flex: '0 0 auto', width: 'clamp(110px, 13vw, 170px)', marginLeft: 'clamp(-55px, -6.5vw, -85px)', marginTop: 'clamp(28px, 5vw, 56px)', borderRadius: 22, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.4)', border: '1px solid var(--c-border)', background: '#111', position: 'relative', zIndex: 2 }}>
            <div style={{ height: 16, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 44, height: 7, background: '#222', borderRadius: 4 }} />
            </div>
            <img src="/screenshots/mobile.jpg" alt="대본 작업실 모바일 화면" style={{ width: '100%', display: 'block' }} loading="lazy" />
          </div>
        </div>
      </Reveal>

      {/* ── 씬번호 자동연동 시연 ── */}
      <section style={{ background: 'var(--c-card)', borderTop: '1px solid var(--c-border)', borderBottom: '1px solid var(--c-border)', padding: '64px 24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Reveal>
            <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--c-accent)', marginBottom: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>핵심 기능 시연</p>
            <h2 style={{ ...sectionH2, marginBottom: 10 }}>회상 씬 번호, 자동으로 따라갑니다</h2>
            <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--c-text4)', marginBottom: 40, lineHeight: 1.7 }}>
              "S#3씬에서 봤던 그 기억처럼—" 씬 순서가 바뀌어도<br />지문 속 참조 번호가 자동으로 갱신됩니다.
            </p>
          </Reveal>
          <SceneRefDemo />
        </div>
      </section>

      {/* ── 만든 이유 ── */}
      <Reveal style={{ padding: '56px 24px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '36px 40px' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 18, color: 'var(--c-text2)' }}>대본 쓰다 불편해서 직접 만들었어요</h2>
          <p style={storyP}>안녕하세요, 드라마 작가 지망생이자 개발자입니다.</p>
          <p style={storyP}>대본을 쓰면서 늘 불편했던 것들이 있었어요. 수정할 때마다 지문 속 씬 번호가 밀리진 않았는지 하나하나 고치고 확인하고… Final Draft는 너무 비싸고, Scrivener는 태그 문법을 배워야 하고, 따로 구입해야 하는 아이패드 버전에선 아예 적용도 안 되고.</p>
          <p style={{ ...storyP, marginBottom: 0 }}>그래서 직접 만들었어요. 현재 베타 버전입니다. 버그나 불편한 점 피드백 주시면 빠르게 반영할게요!</p>
        </div>
      </Reveal>

      {/* ── 주요 기능 ── */}
      <section style={{ padding: '56px 24px 64px', maxWidth: 1080, margin: '0 auto' }}>
        <Reveal><h2 style={sectionH2}>주요 기능</h2></Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginTop: 32 }}>
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 60}>
              <div style={featureCard}>
                <div style={{ fontSize: 26, marginBottom: 10 }}>{f.icon}</div>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--c-text)' }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: 'var(--c-text4)', lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 기타 기능 ── */}
      <Reveal style={{ background: 'var(--c-card)', borderTop: '1px solid var(--c-border)', borderBottom: '1px solid var(--c-border)', padding: '40px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ ...sectionH2, textAlign: 'left', fontSize: 15, marginBottom: 16 }}>그 외 기능</h2>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              '로그인 없이도 이 기기에 자동저장 (구글 로그인 시 어디서든 이어서 작업)',
              '다크모드 지원 (현재 기기 설정과 자동 연동)',
              '검토 링크 공유 기능 (읽기 전용)',
              '협업·공유 기능 예정 (베타버전 미지원)',
            ].map(item => (
              <li key={item} style={{ fontSize: 13, color: 'var(--c-text3)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--c-accent)', flexShrink: 0, marginTop: 2 }}>•</span>{item}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      {/* ── 비교표 ── */}
      <section style={{ padding: '64px 24px', maxWidth: 1080, margin: '0 auto' }}>
        <Reveal><h2 style={sectionH2}>타 프로그램 비교</h2></Reveal>
        <Reveal delay={100} style={{ overflowX: 'auto', marginTop: 32, borderRadius: 10, border: '1px solid var(--c-border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
            <thead>
              <tr style={{ background: 'var(--c-card)' }}>
                {COMPARE_HEADERS.map((h, i) => (
                  <th key={i} style={{ padding: '12px 16px', textAlign: i === 0 ? 'left' : 'center', fontWeight: 600, color: i === 1 ? 'var(--c-accent)' : 'var(--c-text3)', borderBottom: '1px solid var(--c-border)', fontSize: i === 0 ? 11 : 13, whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'var(--c-card)' }}>
                  <td style={{ padding: '11px 16px', color: 'var(--c-text3)', fontWeight: 500, fontSize: 12, borderBottom: '1px solid var(--c-border2)' }}>{row.label}</td>
                  {row.vals.map((v, vi) => (
                    <td key={vi} style={{ padding: '11px 16px', textAlign: 'center', borderBottom: '1px solid var(--c-border2)', fontSize: 13, fontWeight: vi === 0 ? 600 : 400, color: v === '✅' ? '#22c55e' : v === '❌' ? 'var(--c-text6)' : v.startsWith('△') ? '#f59e0b' : vi === 0 ? 'var(--c-accent)' : 'var(--c-text3)' }}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
        <p style={{ fontSize: 11, color: 'var(--c-text6)', marginTop: 12, textAlign: 'center' }}>가격 기준: 2026년 기준, 환율 1,500원/USD 적용. Final Draft 정가 $249 / Scrivener 데스크톱 ₩88,000 · 번들 ₩140,800 / WriterDuet 월 $5~$9.92 / Arc Studio 무료(2편)~연 $99.</p>
      </section>

      {/* ── 가격 ── */}
      <Reveal style={{ background: 'var(--c-card)', borderTop: '1px solid var(--c-border)', borderBottom: '1px solid var(--c-border)', padding: '64px 24px', textAlign: 'center' }}>
        <h2 style={sectionH2}>가격</h2>
        <div style={{ display: 'inline-block', marginTop: 28, padding: '36px 56px', background: 'var(--c-bg)', border: '2px solid var(--c-accent)', borderRadius: 16 }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--c-accent)', lineHeight: 1 }}>무료</div>
          <div style={{ fontSize: 13, color: 'var(--c-text4)', marginTop: 12, lineHeight: 1.9 }}>
            로그인도, 설치도, 결제도 없어요.<br />광고만 조금 달았어요.
          </div>
          <div style={{ marginTop: 18, padding: '10px 14px', background: 'var(--c-input)', borderRadius: 8, fontSize: 12, color: 'var(--c-text5)' }}>
            추후 광고 제거 + 추가 기능을 담은 유료 앱을 플레이스토어/앱스토어에 출시 예정
          </div>
        </div>
      </Reveal>

      {/* ── CTA ── */}
      <Reveal style={{ padding: '72px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 700, marginBottom: 14, color: 'var(--c-text)' }}>지금 바로 시작해보세요</h2>
        <p style={{ fontSize: 14, color: 'var(--c-text4)', marginBottom: 32 }}>설치 없이, 로그인 없이, 브라우저에서 바로 시작할 수 있어요.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={onStart} style={heroPrimaryBtn}>무료로 시작하기 →</button>
          <button onClick={() => setLoginOpen(true)} style={heroSecondaryBtn}>구글 로그인 (자동저장)</button>
        </div>
      </Reveal>

      {/* ── 푸터 ── */}
      <footer style={{ background: 'var(--c-header)', borderTop: '1px solid var(--c-border)', padding: '24px', textAlign: 'center', fontSize: 12, color: 'var(--c-text6)' }}>
        <p style={{ margin: 0 }}>대본 작업실 — 드라마 작가를 위한 무료 대본 편집기</p>
        <p style={{ margin: '6px 0 0' }}>버그 제보 및 피드백은 서비스 내 QnA 또는 이메일로 알려주세요</p>
        <p style={{ margin: '10px 0 0', display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { href: '/notice.html', label: '공지사항' },
            { href: '/changelog.html', label: '업데이트 내역' },
            { href: '/help.html', label: '사용 설명서' },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--c-text4)', textDecoration: 'none', borderBottom: '1px solid var(--c-border3)', paddingBottom: 1 }}
            >{label}</a>
          ))}
        </p>
      </footer>

      {loginOpen && <LandingLoginModal onClose={() => setLoginOpen(false)} />}
    </div>
  );
}

// ─── 랜딩용 로그인 모달 ──────────────────────────────────────────────────────
function LandingLoginModal({ onClose }) {
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    guardedSignInWithGoogle();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 16, padding: 32, width: 320, display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)', marginBottom: 6 }}>로그인 / 회원가입</div>
          <div style={{ fontSize: 12, color: 'var(--c-text5)' }}>로그인하면 구글 드라이브에 자동저장됩니다</div>
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
        <div style={{ fontSize: 10, textAlign: 'center', color: 'var(--c-text6)' }}>Kakao / Naver 로그인은 준비 중입니다</div>
        <button onClick={onClose} style={{ fontSize: 12, color: 'var(--c-text6)', background: 'none', border: 'none', cursor: 'pointer' }}>닫기</button>
      </div>
    </div>
  );
}

// ─── 스타일 상수 ─────────────────────────────────────────────────────────────
const macDot = (bg) => ({ width: 10, height: 10, borderRadius: '50%', background: bg, display: 'inline-block', flexShrink: 0 });

const headerBtnStyle = { padding: '6px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer', border: '1px solid var(--c-border3)', background: 'transparent', color: 'var(--c-text3)' };
const heroPrimaryBtn = { padding: '13px 28px', borderRadius: 8, fontSize: 15, fontWeight: 600, background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer', letterSpacing: '0.02em' };
const heroSecondaryBtn = { padding: '13px 28px', borderRadius: 8, fontSize: 15, fontWeight: 500, background: 'transparent', color: 'var(--c-text2)', border: '1px solid var(--c-border3)', cursor: 'pointer' };
const sectionH2 = { fontSize: 'clamp(18px, 3vw, 26px)', fontWeight: 700, textAlign: 'center', color: 'var(--c-text)', margin: 0 };
const featureCard = { background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '22px 20px', height: '100%' };
const storyP = { fontSize: 14, color: 'var(--c-text4)', lineHeight: 1.85, margin: '0 0 14px' };
