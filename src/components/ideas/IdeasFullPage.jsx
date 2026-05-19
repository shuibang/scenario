import React, { useEffect, useState } from 'react';
import IdeaNotePanel from './IdeaNotePanel';
import { KakaoAdBanner } from '../AdBanner';

/**
 * IdeasFullPage — `/app#ideas` 풀스크린 라우트
 *
 * 시트가 좁아서 정리·검색이 어려울 때 큰 화면에서 보는 용도.
 * 대본 만들기 흐름은 시트에서 처리하는 게 자연스러우므로 여기서는 onPromote 미제공
 * (필요하면 시트로 돌아가서 promote).
 */
export default function IdeasFullPage({ onBack }) {
  // 카카오 단위는 PC/모바일 분리 노출 필수 (정책) — 뷰포트 폭으로 분기.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--c-bg)',
      display: 'flex', flexDirection: 'column',
      zIndex: 10,
    }}>
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px',
        borderBottom: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
      }}>
        <button
          onClick={onBack}
          style={{
            padding: '4px 10px', borderRadius: 4, fontSize: 12,
            border: '1px solid var(--c-border3)', background: 'transparent',
            color: 'var(--c-text4)', cursor: 'pointer',
          }}
        >← 작업실로</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text2)' }}>💡 아이디어 노트</div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <IdeaNotePanel density="full" showHeader={false} />
      </div>

      {/* 카카오 애드핏 — 아이디어 노트 풀페이지 하단 (PC 728×90 / 모바일 320×100) */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: isMobile ? '6px 0' : '8px 0',
          background: 'var(--c-panel)',
          borderTop: '1px solid var(--c-border3)',
        }}
      >
        {isMobile ? (
          <KakaoAdBanner unitId="DAN-LACmX7j4f8ZyVZ79" width={320} height={100} />
        ) : (
          <KakaoAdBanner unitId="DAN-nCDPMSOTtkmrGUWw" width={728} height={90} />
        )}
      </div>
    </div>
  );
}
