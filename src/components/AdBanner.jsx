import React, { useEffect, useRef } from 'react';
import { useApp } from '../store/AppContext';

const AD_CLIENT = 'ca-pub-5479563960989185';

// slot prop → { adSlot, format }
// 오른쪽 패널 계열은 수직형, 나머지는 가로형
const SLOT_CONFIG = {
  'cover-panel':       { adSlot: '9561548489', format: 'auto' },
  'synopsis-panel':    { adSlot: '9561548489', format: 'auto' },
  'checklist':         { adSlot: '9561548489', format: 'auto' },
  'bottom-fixed':      { adSlot: '3846187377', format: 'horizontal' },
  'print-modal-left':  { adSlot: '3846187377', format: 'horizontal' },
  'print-modal-right': { adSlot: '8715370672', format: 'auto' },
  'mobile-bottom':     { adSlot: '8715370672', format: 'auto' },
};
// char-* 슬롯은 수직형
function resolveConfig(slot) {
  if (slot?.startsWith('char-')) return { adSlot: '9561548489', format: 'auto' };
  return SLOT_CONFIG[slot] ?? { adSlot: '3846187377', format: 'horizontal' };
}

export default function AdBanner({ slot, mobileHide = true, height = 56, style = {}, className = '' }) {
  const { state } = useApp();
  const pushed = useRef(false);

  useEffect(() => {
    if (state.isPro || pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {}
  }, [state.isPro]);

  if (state.isPro) return null;

  const { adSlot, format } = resolveConfig(slot);
  const visibilityClass = mobileHide ? 'hidden md:block' : 'block';

  return (
    <div
      className={`${visibilityClass} shrink-0 overflow-hidden ${className}`}
      style={{ minHeight: height, ...style }}
    >
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={adSlot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
