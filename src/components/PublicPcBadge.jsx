import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { isPublicPcMode } from '../store/db';

const baseStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  height: 24,
  padding: '0 8px',
  borderRadius: 999,
  border: '1px solid color-mix(in srgb, #f59e0b 34%, var(--c-border3))',
  background: 'color-mix(in srgb, #f59e0b 14%, var(--c-card))',
  color: '#f59e0b',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '-0.01em',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  cursor: 'pointer',
};

export default function PublicPcBadge({ onClick, compact = false }) {
  const [enabled, setEnabled] = useState(() => isPublicPcMode());

  useEffect(() => {
    const sync = () => setEnabled(isPublicPcMode());
    const handleChanged = (e) => {
      if (typeof e?.detail?.enabled === 'boolean') setEnabled(e.detail.enabled);
      else sync();
    };
    const handleStorage = (e) => {
      if (!e.key || e.key === 'drama_publicPcMode') sync();
    };

    window.addEventListener('public-pc-changed', handleChanged);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('public-pc-changed', handleChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  if (!enabled) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      title="공용 PC 모드 사용 중 — 환경 설정 열기"
      aria-label="공용 PC 모드 사용 중. 환경 설정 열기"
      style={{
        ...baseStyle,
        height: compact ? 22 : 24,
        padding: compact ? '0 7px' : '0 8px',
        fontSize: compact ? 10.5 : 11,
      }}
    >
      <Lock size={compact ? 11 : 12} strokeWidth={2} />
      <span>공용 PC</span>
    </button>
  );
}
