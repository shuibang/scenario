/**
 * 뱃지 카탈로그 — MVP 12개
 *
 * 각 뱃지:
 *   - id        : 안정적인 식별자(localStorage·DB 저장에 사용)
 *   - emoji     : 임시 표시. 추후 SVG 교체.
 *   - label     : UI 라벨
 *   - tier      : 시각적 등급 (bronze < silver < gold < platinum)
 *   - category  : 'time' | 'streak' | 'project'
 *   - hint      : 미획득 상태에서 보여줄 도달 조건 문구
 *   - publicLabel : 외부 노출(검토링크/연출 작업실)용 자연어 — '이 작가는 ...' 형태
 *
 * condition 함수는 evaluate.js 의 stats(누적시간/스트릭/작품수) 를 받아 boolean 반환.
 */

export const TIER_COLOR = {
  bronze:   '#a16207', // 갈색
  silver:   '#71717a', // 회색
  gold:     '#ca8a04', // 골드
  platinum: '#0e7490', // 청록
};

export const BADGES = [
  // ─── 작업시간 ─────────────────────────────────────────────────────────────
  {
    id: 'time_1h',
    category: 'time',
    tier: 'bronze',
    emoji: '🌱',
    label: '첫걸음',
    hint: '누적 작업 1시간 도달',
    publicLabel: '이제 막 첫걸음을 뗀 작가',
    condition: (s) => (s.totalSec || 0) >= 3600,
  },
  {
    id: 'time_10h',
    category: 'time',
    tier: 'bronze',
    emoji: '⏰',
    label: '10시간 클럽',
    hint: '누적 작업 10시간 도달',
    publicLabel: '10시간 이상 작업한 작가',
    condition: (s) => (s.totalSec || 0) >= 10 * 3600,
  },
  {
    id: 'time_50h',
    category: 'time',
    tier: 'silver',
    emoji: '💼',
    label: '50시간 작업자',
    hint: '누적 작업 50시간 도달',
    publicLabel: '50시간 이상 작업한 작가',
    condition: (s) => (s.totalSec || 0) >= 50 * 3600,
  },
  {
    id: 'time_100h',
    category: 'time',
    tier: 'gold',
    emoji: '🏆',
    label: '100시간 마스터',
    hint: '누적 작업 100시간 도달',
    publicLabel: '100시간 이상 작업한 작가',
    condition: (s) => (s.totalSec || 0) >= 100 * 3600,
  },
  {
    id: 'time_500h',
    category: 'time',
    tier: 'platinum',
    emoji: '👑',
    label: '500시간 베테랑',
    hint: '누적 작업 500시간 도달',
    publicLabel: '500시간 이상 작업한 베테랑 작가',
    condition: (s) => (s.totalSec || 0) >= 500 * 3600,
  },

  // ─── 연속작업 ─────────────────────────────────────────────────────────────
  {
    id: 'streak_3',
    category: 'streak',
    tier: 'bronze',
    emoji: '🔥',
    label: '3일 연속',
    hint: '3일 연속 작업 기록',
    publicLabel: '3일 이상 연속 작업한 작가',
    condition: (s) => (s.longestStreak || 0) >= 3,
  },
  {
    id: 'streak_7',
    category: 'streak',
    tier: 'silver',
    emoji: '⚡',
    label: '7일 연속',
    hint: '7일 연속 작업 기록',
    publicLabel: '한 주 내내 작업한 작가',
    condition: (s) => (s.longestStreak || 0) >= 7,
  },
  {
    id: 'streak_30',
    category: 'streak',
    tier: 'gold',
    emoji: '🌟',
    label: '30일 연속',
    hint: '30일 연속 작업 기록',
    publicLabel: '한 달 내내 매일 작업한 작가',
    condition: (s) => (s.longestStreak || 0) >= 30,
  },

  // ─── 작품 ─────────────────────────────────────────────────────────────────
  {
    id: 'project_1',
    category: 'project',
    tier: 'bronze',
    emoji: '📝',
    label: '첫 작품',
    hint: '대본 1개 생성',
    publicLabel: '대본 작업을 시작한 작가',
    condition: (s) => (s.projectCount || 0) >= 1,
  },
  {
    id: 'project_5',
    category: 'project',
    tier: 'silver',
    emoji: '📚',
    label: '다작 작가',
    hint: '대본 5개 생성',
    publicLabel: '여러 대본을 작업 중인 작가',
    condition: (s) => (s.projectCount || 0) >= 5,
  },
  {
    id: 'project_10',
    category: 'project',
    tier: 'gold',
    emoji: '🎬',
    label: '시나리오 컬렉터',
    hint: '대본 10개 생성',
    publicLabel: '10개 이상의 대본을 만든 작가',
    condition: (s) => (s.projectCount || 0) >= 10,
  },
];

export const CATEGORY_LABEL = {
  time:    '⏱️ 작업시간',
  streak:  '🔥 연속작업',
  project: '📚 작품',
};

const TIER_ORDER = { bronze: 0, silver: 1, gold: 2, platinum: 3 };

export function getBadge(id) {
  return BADGES.find((b) => b.id === id) || null;
}

export function compareBadgeTier(a, b) {
  if (!a || !b) return 0;
  return (TIER_ORDER[b.tier] || 0) - (TIER_ORDER[a.tier] || 0);
}
