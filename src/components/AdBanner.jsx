import React, { useEffect, useRef } from 'react';
import { useApp } from '../store/AppContext';

const AD_CLIENT = 'ca-pub-5479563960989185';

// slot → { adSlot, format }
// 각 슬롯은 고유 AdSense ad unit id를 가짐. 새 slot을 추가할 때는
// AdSense 콘솔에서 전용 unit을 만든 뒤 여기에 매핑을 추가할 것.
const SLOT_CONFIG = {
  // ── Right panel — 2 광고씩 (각 슬롯 고유 id) ──
  'cover-panel-1':         { adSlot: '9561548489', format: 'auto' },
  'cover-panel-2':         { adSlot: '7304491166', format: 'auto' },
  'synopsis-panel-1':      { adSlot: '1516765830', format: 'auto' },
  'synopsis-panel-2':      { adSlot: '4334500869', format: 'auto' },
  'biography-panel-1':     { adSlot: '9255867082', format: 'auto' },
  'biography-panel-2':     { adSlot: '1038465710', format: 'auto' },
  'relationships-panel-1': { adSlot: '4594567345', format: 'auto' },
  'relationships-panel-2': { adSlot: '3021419190', format: 'auto' },
  'resources-panel-1':     { adSlot: '1860592795', format: 'auto' },
  'resources-panel-2':     { adSlot: '4198769490', format: 'auto' },
  'treatment-panel-1':     { adSlot: '4295184444', format: 'auto' },
  'treatment-panel-2':     { adSlot: '8042857761', format: 'auto' },
  'characters-panel-1':    { adSlot: '4103612757', format: 'auto' },
  'characters-panel-2':    { adSlot: '7699030808', format: 'auto' },
  'scenelist-panel-1':     { adSlot: '7851286071', format: 'auto' },
  'scenelist-panel-2':     { adSlot: '6538204405', format: 'auto' },
  'settings-panel-1':      { adSlot: '9655322336', format: 'auto' },
  'settings-panel-2':      { adSlot: '9938181333', format: 'auto' },

  // ── Right panel — 단일 광고 ──
  'structure-panel':       { adSlot: '3867597000', format: 'auto' },
  'checklist':             { adSlot: '2554515337', format: 'auto' },

  // ── 에디터 하단 반응형 4분할 ──
  'bottom-fixed-1':        { adSlot: '3846187377', format: 'horizontal' },
  'bottom-fixed-2':        { adSlot: '3843546272', format: 'horizontal' },
  'bottom-fixed-3':        { adSlot: '1760520443', format: 'horizontal' },
  'bottom-fixed-4':        { adSlot: '7168759797', format: 'horizontal' },

  // ── 출력 미리보기 모달 ──
  'print-modal-left':      { adSlot: '2694116136', format: 'horizontal' },
  'print-modal-right':     { adSlot: '8715370672', format: 'auto' },

  // ── 모바일 ──
  // mobile-bottom-left / mobile-memo-bottom은 일반 디스플레이로 등록됨 → format 'auto'
  'mobile-bottom':         { adSlot: '2569066048', format: 'autorelaxed' },
  'mobile-bottom-left':    { adSlot: '1241433661', format: 'auto' },
  'mobile-memo-bottom':    { adSlot: '9066271181', format: 'auto' },
};

const IS_DEV = import.meta.env.DEV;

// char-* 슬롯은 인물 수가 가변적이라 통일 유지 (auto)
function resolveConfig(slot) {
  if (slot?.startsWith('char-')) return { adSlot: '9561548489', format: 'auto' };
  const cfg = SLOT_CONFIG[slot];
  if (!cfg) {
    if (IS_DEV) console.warn(`[AdBanner] Unknown slot: ${slot}`);
    return null;
  }
  return cfg;
}

export default function AdBanner({ slot, mobileHide = true, height = 56, style = {}, className = '' }) {
  const { state } = useApp();
  const pushed = useRef(false);

  useEffect(() => {
    if (IS_DEV || state.isPro || pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {}
  }, [state.isPro]);

  if (state.isPro) return null;

  const cfg = resolveConfig(slot);
  if (!cfg) return null;
  const { adSlot, format } = cfg;
  const visibilityClass = mobileHide ? 'hidden md:block' : 'block';

  if (IS_DEV) {
    return (
      <div
        className={`${visibilityClass} shrink-0 ${className}`}
        style={{
          ...style, minHeight: height, maxHeight: height,
          background: 'rgba(253,224,71,0.35)', border: '1px dashed #ca8a04',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxSizing: 'border-box',
        }}
      >
        <span style={{ fontSize: 10, color: '#92400e', fontWeight: 600 }}>AD {slot}</span>
      </div>
    );
  }

  return (
    <div
      className={`${visibilityClass} shrink-0 overflow-hidden ${className}`}
      style={{ ...style, minHeight: height, maxHeight: height, overflow: 'hidden' }}
    >
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', height: '100%' }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={adSlot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
