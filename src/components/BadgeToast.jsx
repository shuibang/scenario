import React, { useEffect, useState } from 'react';
import { TIER_COLOR } from '../utils/badges/catalog';

/**
 * 새 뱃지 획득 toast — `badge:unlock` 커스텀 이벤트 수신해 4초간 표시.
 * 여러 개가 동시에 발사되면 큐에 쌓아 순차 표시.
 * App 어디든 한 군데만 마운트하면 됨.
 */
export default function BadgeToast() {
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    const handler = (e) => {
      const b = e.detail;
      if (!b) return;
      setQueue((q) => [...q, b]);
    };
    window.addEventListener('badge:unlock', handler);
    return () => window.removeEventListener('badge:unlock', handler);
  }, []);

  useEffect(() => {
    if (queue.length === 0) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), 4000);
    return () => clearTimeout(t);
  }, [queue]);

  if (queue.length === 0) return null;
  const current = queue[0];
  const tierColor = TIER_COLOR[current.tier] || '#9ca3af';

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 60px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 18px 12px 14px',
        background: 'rgba(20,20,20,0.94)',
        color: '#fff',
        borderRadius: 10,
        boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
        borderLeft: `4px solid ${tierColor}`,
        maxWidth: 360,
        animation: 'badge-toast-in 280ms ease-out',
      }}
    >
      <div style={{
        width: 40, height: 40,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, flexShrink: 0,
        boxShadow: `inset 0 0 0 1.5px ${tierColor}88`,
      }}>{current.emoji}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, color: tierColor, fontWeight: 700, letterSpacing: '0.05em' }}>
          🏅 뱃지 획득!
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{current.label}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{current.hint}</div>
      </div>
      <style>{`
        @keyframes badge-toast-in {
          from { opacity: 0; transform: translate(-50%, -8px); }
          to   { opacity: 1; transform: translate(-50%, 0);    }
        }
      `}</style>
    </div>
  );
}
