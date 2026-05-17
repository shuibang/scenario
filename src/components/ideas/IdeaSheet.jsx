import React, { useEffect } from 'react';
import IdeaNotePanel from './IdeaNotePanel';

/**
 * IdeaSheet — 사이드/바텀 시트 래퍼
 *
 * 데스크톱: 우측에서 슬라이드되는 패널 (오버레이 X — 대본 모달 위에서도 보임)
 * 모바일:   바텀 시트
 *
 * Props:
 *   open
 *   onClose
 *   onExpand      — 풀스크린 페이지로 이동
 *   onPromote     — (idea) => void  : 대본으로 승격 핸들러
 *   isMobile      — 모바일 모드 여부
 */
export default function IdeaSheet({ open, onClose, onExpand, onPromote, isMobile = false }) {
  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  // 데스크톱: 우측 패널, 모바일: 바텀 시트
  if (isMobile) {
    return (
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, top: 50,
        zIndex: 9999,
        background: 'var(--c-bg)',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column',
        animation: 'idea-sheet-slide-up 0.18s ease-out',
      }}>
        <IdeaNotePanel
          density="compact"
          onExpand={onExpand}
          onClose={onClose}
          onPromote={onPromote}
        />
        <style>{`
          @keyframes idea-sheet-slide-up {
            from { transform: translateY(20px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div
      data-idea-sheet
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 440,
        zIndex: 9999,
        background: 'var(--c-bg)',
        borderLeft: '1px solid var(--c-border)',
        boxShadow: '-8px 0 20px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column',
        animation: 'idea-sheet-slide-in 0.18s ease-out',
      }}
    >
      <IdeaNotePanel
        density="compact"
        onExpand={onExpand}
        onClose={onClose}
        onPromote={onPromote}
      />
      <style>{`
        @keyframes idea-sheet-slide-in {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
