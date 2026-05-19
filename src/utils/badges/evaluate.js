/**
 * 뱃지 평가 — workTimeLogs + projects → 통계 + 획득한 뱃지 ID 목록
 *
 * 데이터 소스:
 *   - workTimeLogs[]   : { projectId, dateKey:'YYYY-MM-DD', activeDurationSec, ... }
 *   - projects[]       : 대본 배열 (id 만 있어도 충분)
 *
 * 서버 호출 없음 — 전부 로컬 상태에서 계산. 페이지마다 매번 호출해도 가볍다.
 */

import { BADGES } from './catalog';

export function computeBadgeStats(workTimeLogs = [], projects = []) {
  const totalSec = workTimeLogs.reduce((s, l) => s + (l?.activeDurationSec || 0), 0);
  const projectCount = projects.length;

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

  return { totalSec, projectCount, longestStreak };
}

export function evaluateBadges(workTimeLogs, projects) {
  const stats = computeBadgeStats(workTimeLogs, projects);
  const earned = BADGES.filter((b) => {
    try { return b.condition(stats); } catch { return false; }
  }).map((b) => b.id);
  return { stats, earnedIds: earned };
}
