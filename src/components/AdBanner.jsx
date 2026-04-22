import React, { useEffect, useRef } from 'react';
import { useApp } from '../store/AppContext';

const AD_CLIENT = 'ca-pub-5479563960989185';

// slot → { adSlot, format }
// 각 슬롯은 고유 AdSense ad unit을 가져야 함 (이상적 상태).
// TODO 표시는 현재 기존 id를 재사용 중 — AdSense에서 unit 신규 등록 후 교체할 것.
const SLOT_CONFIG = {
  // ── Right panel — 2 광고씩 (각 슬롯 고유 id 필요) ──
  'cover-panel-1':         { adSlot: '9561548489', format: 'auto' },
  'cover-panel-2':         { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'synopsis-panel-1':      { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'synopsis-panel-2':      { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'biography-panel-1':     { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'biography-panel-2':     { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'relationships-panel-1': { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'relationships-panel-2': { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'resources-panel-1':     { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'resources-panel-2':     { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'treatment-panel-1':     { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'treatment-panel-2':     { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'characters-panel-1':    { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'characters-panel-2':    { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'scenelist-panel-1':     { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'scenelist-panel-2':     { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'settings-panel-1':      { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'settings-panel-2':      { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit

  // ── Right panel — 단일 광고 ──
  'structure-panel':       { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit
  'checklist':             { adSlot: '9561548489', format: 'auto' }, // TODO: unique unit

  // ── 에디터 하단 반응형 4분할 ──
  'bottom-fixed-1':        { adSlot: '3846187377', format: 'horizontal' },
  'bottom-fixed-2':        { adSlot: '3846187377', format: 'horizontal' }, // TODO: unique unit
  'bottom-fixed-3':        { adSlot: '3846187377', format: 'horizontal' }, // TODO: unique unit
  'bottom-fixed-4':        { adSlot: '3846187377', format: 'horizontal' }, // TODO: unique unit

  // ── 출력 미리보기 모달 ──
  'print-modal-left':      { adSlot: '3846187377', format: 'horizontal' }, // TODO: unique unit
  'print-modal-right':     { adSlot: '8715370672', format: 'auto' },

  // ── 모바일 ──
  'mobile-bottom':         { adSlot: '2569066048', format: 'autorelaxed' },
  'mobile-bottom-left':    { adSlot: '2569066048', format: 'autorelaxed' }, // TODO: unique unit
  'mobile-memo-bottom':    { adSlot: '2569066048', format: 'auto' }, // TODO: unique unit
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
