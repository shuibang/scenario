import React, { useState } from 'react';
import { TIER_COLOR } from '../utils/badges/catalog';

/**
 * 작은 뱃지 칩 — 메뉴바·검토링크 viewer·연출 작업실 등에서 인라인 표시용.
 *
 * props:
 *   - badge     : { emoji, label, tier, publicLabel? } — 없으면 null 반환
 *   - size      : 16 | 18 | 20  (기본 18)
 *   - tooltip   : 'label' | 'public' | 'none'  — 호버 시 노출할 텍스트
 *   - withRing  : tier 색 링 강조 여부 (기본 true)
 */
export default function BadgeChip({ badge, size = 18, tooltip = 'label', withRing = true }) {
  const [hover, setHover] = useState(false);
  if (!badge) return null;

  const tierColor = TIER_COLOR[badge.tier] || '#9ca3af';
  const tipText =
    tooltip === 'public' ? (badge.publicLabel || badge.label) :
    tooltip === 'label'  ? badge.label :
    null;

  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        fontSize: Math.round(size * 0.72),
        lineHeight: 1,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.04)',
        boxShadow: withRing ? `inset 0 0 0 1.5px ${tierColor}55` : 'none',
        flexShrink: 0,
        position: 'relative',
        cursor: 'default',
        userSelect: 'none',
      }}
      aria-label={badge.label}
    >
      <span aria-hidden>{badge.emoji}</span>
      {hover && tipText && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            top: '100%', left: '50%',
            transform: 'translate(-50%, 6px)',
            background: 'rgba(20,20,20,0.92)',
            color: '#fff',
            fontSize: 11, fontWeight: 500,
            padding: '4px 8px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 100,
          }}
        >{tipText}</span>
      )}
    </span>
  );
}
