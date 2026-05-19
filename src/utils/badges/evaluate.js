/**
 * 뱃지 평가 — workTimeLogs + projects + scriptBlocks + shareStats → 통계 + 획득 뱃지 ID
 *
 * 데이터 소스:
 *   - workTimeLogs[]   : { projectId, dateKey:'YYYY-MM-DD', activeDurationSec, ... }
 *   - projects[]       : 대본 배열 ({ id, status:'draft'|'revision'|'final' })
 *   - scriptBlocks[]   : { projectId, episodeId, type, content } — 글자수 누계용
 *   - shareStats       : { shareLinksCreated, feedbackReceived } — Supabase 캐시
 *   - ideaCount        : 아이디어 노트 개수 (ideasStore subscribeIdeas)
 *
 * shareStats 만 외부 캐시 의존(utils/shareStats.js). 그 외는 모두 로컬 상태에서 계산.
 */

import { BADGES } from './catalog';

const TAG_RE = /<[^>]+>/g;

export function computeBadgeStats(workTimeLogs = [], projects = [], scriptBlocks = [], shareStats = {}, ideaCount = 0) {
  const totalSec = workTimeLogs.reduce((s, l) => s + (l?.activeDurationSec || 0), 0);
  const projectCount = projects.length;
  const finalProjectCount = projects.filter((p) => p?.status === 'final').length;

  // 최장 스트릭 — dateKey 정렬 후 연속된 일자 카운트
  const dateKeys = [...new Set(workTimeLogs.map((l) => l?.dateKey).filter(Boolean))].sort();
  let longestStreak = dateKeys.length > 0 ? 1 : 0;
  let run = dateKeys.length > 0 ? 1 : 0;
  for (let i = 1; i < dateKeys.length; i++) {
    const prev = new Date(dateKeys[i - 1] + 'T00:00:00');
    const cur  = new Date(dateKeys[i]     + 'T00:00:00');
    const diff = Math.round((cur - prev) / 86400000);
    if (diff === 1) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 1;
    }
  }

  // 누적 글자수 — 공백 제외 (WordCountModal 의 'noSpace' 와 동일 정의)
  let totalChars = 0;
  for (const b of scriptBlocks) {
    const raw = (b?.content || '').replace(TAG_RE, '');
    if (!raw) continue;
    totalChars += raw.replace(/\s/g, '').length;
  }

  const shareLinksCreated = Number(shareStats?.shareLinksCreated) || 0;
  const feedbackReceived  = Number(shareStats?.feedbackReceived)  || 0;
  const ideaNoteCount     = Number(ideaCount) || 0;

  return {
    totalSec,
    projectCount,
    finalProjectCount,
    longestStreak,
    totalChars,
    shareLinksCreated,
    feedbackReceived,
    ideaNoteCount,
  };
}

export function evaluateBadges(workTimeLogs, projects, scriptBlocks, shareStats, ideaCount) {
  const stats = computeBadgeStats(workTimeLogs, projects, scriptBlocks, shareStats, ideaCount);
  const earned = BADGES.filter((b) => {
    try { return b.condition(stats); } catch { return false; }
  }).map((b) => b.id);
  return { stats, earnedIds: earned };
}
