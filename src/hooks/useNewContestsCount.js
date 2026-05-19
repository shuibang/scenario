/**
 * useNewContestsCount — 마지막으로 본 시각 이후 등록된 신규 공모전 수
 *
 * - lastSeen: localStorage 'drama_contests_last_seen' (ContestBoard 가 갱신)
 * - 데이터: contestsApi 캐시 + subscribe
 * - ContestBoard 가 lastSeen 을 갱신하면 'drama_contests_seen' 이벤트 발행
 *   → 메뉴 뱃지가 즉시 사라지도록 이 hook 도 다시 계산
 */
import { useEffect, useState } from 'react';
import { subscribeActiveContests, fetchActiveContests, getActiveContestsCacheSync } from '../store/contestsApi';

const LAST_SEEN_KEY = 'drama_contests_last_seen';

function compute() {
  const list = getActiveContestsCacheSync();
  if (!Array.isArray(list)) return 0;
  let lastSeen = 0;
  try { lastSeen = parseInt(localStorage.getItem(LAST_SEEN_KEY) || '0', 10) || 0; } catch {}
  if (!lastSeen) return 0;
  return list.filter(c => {
    const t = c.approved_at ? new Date(c.approved_at).getTime() : 0;
    return t > lastSeen;
  }).length;
}

export function useNewContestsCount({ fetchOnMount = false } = {}) {
  const [count, setCount] = useState(() => compute());

  useEffect(() => {
    const recompute = () => setCount(compute());
    const unsub = subscribeActiveContests(recompute);
    if (fetchOnMount && getActiveContestsCacheSync() == null) {
      fetchActiveContests().catch(() => {});
    } else {
      recompute();
    }
    const onSeen = () => recompute();
    window.addEventListener('drama_contests_seen', onSeen);
    return () => {
      unsub();
      window.removeEventListener('drama_contests_seen', onSeen);
    };
  }, [fetchOnMount]);

  return count;
}
