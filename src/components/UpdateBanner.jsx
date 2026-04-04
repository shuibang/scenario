import React, { useState } from 'react';

/**
 * 업데이트 공지 띠
 *
 * 새 공지 추가: NOTICES 배열 맨 앞에 항목 추가 (id는 고유값)
 * 사용자가 닫으면 localStorage에 id를 기록 → 재방문 시 안 보임
 */
const NOTICES = [
  {
    id: 'v1-20260404',
    date: '2026-04-04',
    content: '씬리스트 버그 수정: 씬 추가 후 목록이 사라지던 문제, 대본 연동 개선',
  },
];

const STORAGE_KEY = 'drama_dismissed_notice';

export default function UpdateBanner() {
  const latest = NOTICES[0];
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === latest.id; }
    catch { return false; }
  });

  if (!latest || dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, latest.id); } catch {}
    setDismissed(true);
  };

  return (
    <div
      className="no-print"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 14px',
        background: 'var(--c-active)',
        borderBottom: '1px solid var(--c-border2)',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--c-accent)', fontWeight: 600, flexShrink: 0 }}>
        업데이트 {latest.date}
      </span>
      <span style={{ fontSize: 11, color: 'var(--c-text3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {latest.content}
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
  );
}
