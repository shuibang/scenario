import React, { useState } from 'react';
import { announcements } from '../data/announcements';

/**
 * 업데이트 공지 띠
 *
 * 새 공지 추가: src/data/announcements.js 맨 앞에 항목 추가 (id는 고유값)
 * 사용자가 닫으면 localStorage에 id를 기록 → 재방문 시 안 보임
 */
// 공지 단일 소스(src/data/announcements.js)의 별칭 — 기존 ANNOUNCEMENTS import 호환용 재-export.
export const ANNOUNCEMENTS = announcements;

const STORAGE_KEY = 'drama_dismissed_notice';

export default function UpdateBanner() {
  const announcement = ANNOUNCEMENTS[0];
  const [dismissed, setDismissed] = useState(() => {
    try {
      return announcement ? localStorage.getItem(STORAGE_KEY) === announcement.id : false;
    } catch { return false; }
  });

  if (!announcement || dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, announcement.id); } catch {}
    setDismissed(true);
  };

  return (
    <div className="no-print" style={{ display: 'flex', padding: '7px 14px', background: 'var(--c-active)', borderBottom: '1px solid var(--c-border2)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--c-accent)', fontWeight: 600, flexShrink: 0 }}>
          공지
        </span>
        <span style={{ fontSize: 11, color: 'var(--c-text2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {announcement.title}
        </span>
        <button
          onClick={dismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--c-text5)', fontSize: 14, lineHeight: 1,
            flexShrink: 0, padding: '0 2px',
          }}
          title="닫기"
        >×</button>
      </div>
    </div>
  );
}
