/**
 * 공유/피드백 누적 통계 — 뱃지용.
 *
 * Supabase `user_share_counters` 에서 본인 row 를 가져와 localStorage 캐시.
 * useBadges 가 동기 캐시 값으로 즉시 뱃지 평가, 마운트 시점에 백그라운드 갱신.
 *
 * 트리거(20260520_user_share_counters.sql)가 INSERT 시점에 카운터를 올리므로
 * 클라이언트가 별도 RPC 를 호출할 필요 없음 — fetch 만으로 최신 누계 확보.
 */

import { supabase } from '../store/supabaseClient';

const STORAGE_KEY = 'drama_share_stats_v1';
const REFRESH_TTL_MS = 30_000; // 30초 디바운스 — useBadges 가 여러 컴포넌트에서 마운트되므로

let inflightPromise = null;
let lastFetchedAt = 0;

const EMPTY = Object.freeze({ shareLinksCreated: 0, feedbackReceived: 0 });

export function getCachedShareStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return {
      shareLinksCreated: Number(parsed?.shareLinksCreated) || 0,
      feedbackReceived:  Number(parsed?.feedbackReceived)  || 0,
    };
  } catch {
    return EMPTY;
  }
}

function writeCache(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('share-stats:updated', { detail: next }));
  } catch { /* localStorage 가득 — 무시 */ }
}

/**
 * 서버에서 누계를 가져와 캐시 갱신.
 *  - 로그인 안 했으면 EMPTY 반환(캐시 변경 없음).
 *  - 30초 디바운스 + in-flight 공유로 중복 호출 차단.
 *  - 실패는 silent — 다음 호출에서 재시도.
 *
 * @param {boolean} [force=false] true 면 디바운스 무시
 */
export async function refreshShareStats(force = false) {
  if (!supabase) return getCachedShareStats();
  if (inflightPromise) return inflightPromise;
  if (!force && Date.now() - lastFetchedAt < REFRESH_TTL_MS) return getCachedShareStats();

  inflightPromise = (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return getCachedShareStats();
      const { data, error } = await supabase
        .from('user_share_counters')
        .select('share_links_created, feedback_received')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) return getCachedShareStats();
      const next = {
        shareLinksCreated: Number(data?.share_links_created) || 0,
        feedbackReceived:  Number(data?.feedback_received)  || 0,
      };
      writeCache(next);
      return next;
    } catch {
      return getCachedShareStats();
    } finally {
      lastFetchedAt = Date.now();
      inflightPromise = null;
    }
  })();

  return inflightPromise;
}

export function clearShareStatsCache() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  lastFetchedAt = 0;
}
