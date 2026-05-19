import React, { useMemo } from 'react';
import { BADGES, CATEGORY_LABEL, TIER_COLOR } from '../utils/badges/catalog';
import { useBadges, setPinnedBadgeId, getPinnedBadgeId } from '../utils/badges';

/**
 * MyPage 🏅 뱃지 탭 — 획득/미획득 그리드 + 핀(대표 뱃지) 변경 UI
 */
export default function BadgesPanel() {
  const { earnedSet, stats, featured } = useBadges();
  const pinnedId = getPinnedBadgeId();

  const byCategory = useMemo(() => {
    const map = {};
    for (const b of BADGES) {
      (map[b.category] ||= []).push(b);
    }
    return map;
  }, []);

  const totalEarned = earnedSet.size;

  const onPin = (id) => {
    // 같은 걸 다시 누르면 핀 해제 → 자동 모드
    if (pinnedId === id) setPinnedBadgeId(null);
    else setPinnedBadgeId(id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 헤더 — 진척도 + 현재 대표 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '14px 16px',
        background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 8,
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--c-text6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            획득한 뱃지
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-text)', marginTop: 2 }}>
            {totalEarned} <span style={{ fontSize: 14, color: 'var(--c-text6)', fontWeight: 400 }}>/ {BADGES.length}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-text5)', marginTop: 6 }}>
            누적 {Math.round((stats.totalSec || 0) / 3600)}시간 · 최장 연속 {stats.longestStreak || 0}일 · 작품 {stats.projectCount || 0}개
          </div>
        </div>
        {featured && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56,
              fontSize: 32,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `inset 0 0 0 2px ${TIER_COLOR[featured.tier] || '#9ca3af'}55`,
              margin: '0 auto',
            }}>{featured.emoji}</div>
            <div style={{ fontSize: 10, color: 'var(--c-text6)', marginTop: 4 }}>대표 뱃지</div>
            <div style={{ fontSize: 11, color: 'var(--c-text3)', fontWeight: 600 }}>{featured.label}</div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--c-text6)', lineHeight: 1.6 }}>
        뱃지 위에 마우스를 올리면 설명이 나와요. 클릭하면 대표 뱃지로 핀 고정. 같은 걸 다시 누르면 자동(최고 등급) 모드로 돌아옵니다.
      </div>

      {/* 카테고리별 그리드 */}
      {Object.keys(byCategory).map((cat) => (
        <section key={cat}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text3)', marginBottom: 8 }}>
            {CATEGORY_LABEL[cat] || cat}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: 10,
          }}>
            {byCategory[cat].map((b) => {
              const earned = earnedSet.has(b.id);
              const isPinned = pinnedId === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => earned && onPin(b.id)}
                  disabled={!earned}
                  style={{
                    position: 'relative',
                    padding: '14px 10px 12px',
                    background: 'var(--c-card)',
                    border: `1px solid ${isPinned ? TIER_COLOR[b.tier] : 'var(--c-border)'}`,
                    borderRadius: 8,
                    cursor: earned ? 'pointer' : 'default',
                    textAlign: 'center',
                    filter: earned ? 'none' : 'grayscale(1) opacity(0.45)',
                    transition: 'border-color 120ms, transform 120ms',
                  }}
                  title={earned ? b.label : `🔒 ${b.hint}`}
                >
                  <div style={{ fontSize: 28, lineHeight: 1, marginBottom: 6 }}>{b.emoji}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text2)' }}>{b.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--c-text6)', marginTop: 3, lineHeight: 1.3 }}>
                    {earned ? b.hint : `🔒 ${b.hint}`}
                  </div>
                  {isPinned && (
                    <span style={{
                      position: 'absolute', top: 6, right: 8,
                      fontSize: 9, fontWeight: 700,
                      color: TIER_COLOR[b.tier] || '#9ca3af',
                    }}>★ 대표</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
