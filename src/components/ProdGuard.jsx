/**
 * ProdGuard.jsx
 *
 * PROD 환경 한정 클라이언트 방어 레이어.
 * import.meta.env.PROD === false 일 때 일절 동작하지 않음.
 *
 * 기능:
 *   1. DevTools 감지 (창 크기 차이 기반) → 워터마크 표시
 *   2. 에디터 외부 영역 우클릭·드래그 방지
 */

import { useEffect, useState } from 'react';

// ─── 1. DevTools 워터마크 ─────────────────────────────────────────────────────

const DEVTOOLS_THRESHOLD = 160; // px — 패널 열림 기준

function DevToolsWatermark() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    const check = () => {
      const widthDiff  = window.outerWidth  - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      setVisible(widthDiff > DEVTOOLS_THRESHOLD || heightDiff > DEVTOOLS_THRESHOLD);
    };

    check();
    const id = setInterval(check, 1500);
    window.addEventListener('resize', check);
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', check);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          fontSize: '13px',
          color: 'rgba(220, 38, 38, 0.55)',
          fontWeight: 700,
          letterSpacing: '0.05em',
          transform: 'rotate(-35deg)',
          whiteSpace: 'nowrap',
        }}
      >
        © 별하얌 — 무단 복제·크롤링 금지
      </span>
    </div>
  );
}

// ─── 2. 우클릭·드래그 방지 훅 ────────────────────────────────────────────────

/** 입력 가능한 요소이면 true (에디터 영역 보호) */
function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName?.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'INPUT') return true;
  // contenteditable 체크 (자신 또는 조상)
  let node = el;
  while (node) {
    if (node.isContentEditable) return true;
    node = node.parentElement;
  }
  return false;
}

function useContextMenuGuard() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;

    const onContextMenu = (e) => {
      if (!isEditableTarget(e.target)) e.preventDefault();
    };

    const onDragStart = (e) => {
      if (!isEditableTarget(e.target)) e.preventDefault();
    };

    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('dragstart',   onDragStart);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('dragstart',   onDragStart);
    };
  }, []);
}

// ─── 통합 컴포넌트 ────────────────────────────────────────────────────────────

export default function ProdGuard() {
  useContextMenuGuard();

  // 개발 환경에서는 아무것도 렌더링하지 않음
  if (!import.meta.env.PROD) return null;

  return <DevToolsWatermark />;
}
