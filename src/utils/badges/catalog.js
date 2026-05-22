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

  // ─── 탈고 ─────────────────────────────────────────────────────────────────
  // '대본 정보 → 상태' 가 '탈고'(status: 'final') 인 작품 수 기준.
  // 단순 생성과 다르게 끝까지 마무리한 작업만 카운트 — 완성도 자체에 대한 인정.
  {
    id: 'final_1',
    category: 'final',
    tier: 'silver',
    emoji: '✅',
    label: '첫 탈고',
    hint: '대본 1개 탈고 완료',
    publicLabel: '대본 한 편을 끝까지 완성한 작가',
    condition: (s) => (s.finalProjectCount || 0) >= 1,
  },
  {
    id: 'final_3',
    category: 'final',
    tier: 'gold',
    emoji: '🎯',
    label: '완주 작가',
    hint: '대본 3개 탈고 완료',
    publicLabel: '3편 이상의 대본을 완성한 작가',
    condition: (s) => (s.finalProjectCount || 0) >= 3,
  },
  {
    id: 'final_5',
    category: 'final',
    tier: 'platinum',
    emoji: '🏅',
    label: '탈고 마스터',
    hint: '대본 5개 탈고 완료',
    publicLabel: '5편 이상의 대본을 완성한 마스터 작가',
    condition: (s) => (s.finalProjectCount || 0) >= 5,
  },

  // ─── 누적 글자수 ──────────────────────────────────────────────────────────
  // 모든 작품/회차에 걸친 누계 글자수(공백 제외). 하단 StatusBar 글자수의 공백 제외 정의와 동일.
  {
    id: 'chars_10k',
    category: 'chars',
    tier: 'bronze',
    emoji: '✍️',
    label: '1만 자',
    hint: '누적 1만 자 작성 (공백 제외)',
    publicLabel: '1만 자 이상 써 본 작가',
    condition: (s) => (s.totalChars || 0) >= 10_000,
  },
  {
    id: 'chars_50k',
    category: 'chars',
    tier: 'silver',
    emoji: '📝',
    label: '5만 자',
    hint: '누적 5만 자 작성 (공백 제외)',
    publicLabel: '5만 자 이상 써 온 작가',
    condition: (s) => (s.totalChars || 0) >= 50_000,
  },
  {
    id: 'chars_100k',
    category: 'chars',
    tier: 'gold',
    emoji: '📖',
    label: '10만 자',
    hint: '누적 10만 자 작성 (공백 제외)',
    publicLabel: '10만 자 이상 써 온 작가',
    condition: (s) => (s.totalChars || 0) >= 100_000,
  },
  {
    id: 'chars_500k',
    category: 'chars',
    tier: 'platinum',
    emoji: '📜',
    label: '50만 자',
    hint: '누적 50만 자 작성 (공백 제외)',
    publicLabel: '50만 자 이상 써 온 작가',
    condition: (s) => (s.totalChars || 0) >= 500_000,
  },

  // ─── 공유 (검토링크 생성) ─────────────────────────────────────────────────
  // user_share_counters.share_links_created — 새 버전+링크 / 기존 버전 추가 링크 모두 포함.
  // 검토링크 자체는 7일 후 만료되지만 카운터는 트리거로 영구 누계.
  {
    id: 'share_1',
    category: 'share',
    tier: 'bronze',
    emoji: '🔗',
    label: '첫 공유',
    hint: '검토링크 1개 만들기',
    publicLabel: '첫 검토링크를 공유한 작가',
    condition: (s) => (s.shareLinksCreated || 0) >= 1,
  },
  {
    id: 'share_5',
    category: 'share',
    tier: 'silver',
    emoji: '📤',
    label: '공유 단골',
    hint: '검토링크 5개 만들기',
    publicLabel: '검토링크를 5번 이상 공유한 작가',
    condition: (s) => (s.shareLinksCreated || 0) >= 5,
  },
  {
    id: 'share_20',
    category: 'share',
    tier: 'gold',
    emoji: '🌐',
    label: '공유 마스터',
    hint: '검토링크 20개 만들기',
    publicLabel: '검토링크를 20번 이상 공유한 작가',
    condition: (s) => (s.shareLinksCreated || 0) >= 20,
  },

  // ─── 피드백 (받은 횟수) ───────────────────────────────────────────────────
  // user_share_counters.feedback_received — feedback_sessions INSERT 1건 = 1회.
  // (받은 코멘트 수가 아니라 보낸 사람 단위. 한 명이 코멘트 50개 보내도 1회.)
  {
    id: 'feedback_1',
    category: 'feedback',
    tier: 'bronze',
    emoji: '💬',
    label: '첫 피드백',
    hint: '피드백 1회 받기',
    publicLabel: '첫 피드백을 받은 작가',
    condition: (s) => (s.feedbackReceived || 0) >= 1,
  },
  {
    id: 'feedback_10',
    category: 'feedback',
    tier: 'silver',
    emoji: '👂',
    label: '경청하는 작가',
    hint: '피드백 10회 받기',
    publicLabel: '피드백을 10회 이상 받은 작가',
    condition: (s) => (s.feedbackReceived || 0) >= 10,
  },
  {
    id: 'feedback_50',
    category: 'feedback',
    tier: 'gold',
    emoji: '🤝',
    label: '집단지성',
    hint: '피드백 50회 받기',
    publicLabel: '피드백을 50회 이상 받은 작가',
    condition: (s) => (s.feedbackReceived || 0) >= 50,
  },

  // ─── 아이디어 노트 ────────────────────────────────────────────────────────
  // ideasStore 의 항목 수. 대본과 무관한 별도 컬렉션이라 작품 뱃지와 별개.
  // 5단계 진행 — bronze→silver→gold→gold→platinum (티어 시스템은 4종이라 gold 2개).
  {
    id: 'idea_1',
    category: 'idea',
    tier: 'bronze',
    emoji: '💡',
    label: '번뜩 유망주',
    hint: '아이디어 노트 1개 작성',
    publicLabel: '아이디어를 막 떠올리기 시작한 작가',
    condition: (s) => (s.ideaNoteCount || 0) >= 1,
  },
  {
    id: 'idea_10',
    category: 'idea',
    tier: 'silver',
    emoji: '🗂️',
    label: '아이디어 뱅크',
    hint: '아이디어 노트 10개 작성',
    publicLabel: '10개 이상의 아이디어를 모아둔 작가',
    condition: (s) => (s.ideaNoteCount || 0) >= 10,
  },
  {
    id: 'idea_30',
    category: 'idea',
    tier: 'gold',
    emoji: '✨',
    label: '영감 폭발',
    hint: '아이디어 노트 30개 작성',
    publicLabel: '영감이 끊임없이 쏟아지는 작가',
    condition: (s) => (s.ideaNoteCount || 0) >= 30,
  },
  {
    id: 'idea_60',
    category: 'idea',
    tier: 'gold',
    emoji: '🧠',
    label: '기획의 신',
    hint: '아이디어 노트 60개 작성',
    publicLabel: '60개 이상의 기획을 쌓아둔 작가',
    condition: (s) => (s.ideaNoteCount || 0) >= 60,
  },
  {
    id: 'idea_100',
    category: 'idea',
    tier: 'platinum',
    emoji: '🌌',
    label: '천재적 발상',
    hint: '아이디어 노트 100개 작성',
    publicLabel: '100개 이상의 아이디어를 가진 작가',
    condition: (s) => (s.ideaNoteCount || 0) >= 100,
  },
];

export const CATEGORY_LABEL = {
  time:     '⏱️ 작업시간',
  streak:   '🔥 연속작업',
  project:  '📚 작품',
  final:    '✅ 탈고',
  chars:    '✍️ 누적 글자수',
  share:    '🔗 공유',
  feedback: '💬 피드백',
  idea:     '💡 아이디어',
};

const TIER_ORDER = { bronze: 0, silver: 1, gold: 2, platinum: 3 };

export function getBadge(id) {
  return BADGES.find((b) => b.id === id) || null;
}

export function compareBadgeTier(a, b) {
  if (!a || !b) return 0;
  return (TIER_ORDER[b.tier] || 0) - (TIER_ORDER[a.tier] || 0);
}
