import React from 'react';
import { useApp } from '../store/AppContext';

/**
 * AdBanner — 광고 슬롯 placeholder.
 * - isPro(유료) 사용자에게는 렌더링하지 않음.
 * - mobileHide: true → md(768px) 미만 화면에서 숨김.
 * - slot: 향후 AdSense 슬롯 ID로 사용 예정.
 */
export default function AdBanner({ slot, mobileHide = true, height = 56, style = {}, className = '' }) {
  const { state } = useApp();
  if (state.isPro) return null;

  const visibilityClass = mobileHide ? 'hidden md:flex' : 'flex';

  return (
    <div
      data-ad-slot={slot}
      className={`${visibilityClass} items-center justify-center shrink-0 ${className}`}
      style={{
        height,
        border: '1px dashed var(--c-border3)',
        borderRadius: 4,
        color: 'var(--c-text6)',
        fontSize: 10,
        userSelect: 'none',
        ...style,
      }}
    >
      광고 영역
    </div>
  );
}
