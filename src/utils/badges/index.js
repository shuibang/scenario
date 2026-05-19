/**
 * 뱃지 훅 — useBadges()
 *
 *  - workTimeLogs · projects 를 받아 (또는 useApp 상태에서 직접 읽어) 자동 평가.
 *  - 대표 뱃지 핀: localStorage `drama_badge_pin` (사용자 수동 선택). 없으면 자동(가장 높은 tier).
 *  - 새 획득 toast: localStorage `drama_badges_seen` 와 비교해 신규면 'badge:unlock' 커스텀 이벤트 발사.
 *
 * 표시 컴포넌트(BadgeChip, BadgesPanel)는 이 훅의 결과만 받는다 — 분리 유지.
 */

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../store/AppContext';
import { BADGES, getBadge, compareBadgeTier } from './catalog';
import { evaluateBadges } from './evaluate';
import { getCachedShareStats, refreshShareStats } from '../shareStats';
import { listIdeasSync, subscribeIdeas } from '../../store/ideasStore';

const PIN_KEY  = 'drama_badge_pin';
const SEEN_KEY = 'drama_badges_seen';

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveSeen(set) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set])); }
  catch { /* localStorage 가득 — 무시 */ }
}

export function getPinnedBadgeId() {
  try { return localStorage.getItem(PIN_KEY) || null; }
  catch { return null; }
}

export function setPinnedBadgeId(id) {
  try {
    if (id) localStorage.setItem(PIN_KEY, id);
    else    localStorage.removeItem(PIN_KEY);
    window.dispatchEvent(new CustomEvent('badge:pin-changed'));
  } catch { /* ignore */ }
}

// 자동 대표 — 획득한 것 중 가장 높은 tier (동률이면 catalog 배열 뒤쪽이 우선)
function pickAutoFeatured(earnedIds) {
  if (!earnedIds || earnedIds.length === 0) return null;
  const earned = earnedIds.map(getBadge).filter(Boolean);
  if (earned.length === 0) return null;
  const sorted = [...earned].sort(compareBadgeTier);
  return sorted[0].id;
}

export function useBadges() {
  const { state } = useApp();
  const workTimeLogs = state?.workTimeLogs || [];
  const projects     = state?.projects     || [];
  const scriptBlocks = state?.scriptBlocks || [];

  // 공유/피드백 누계 — Supabase user_share_counters 캐시 값.
  // 마운트 시 백그라운드 갱신, 'share-stats:updated' 이벤트로 재렌더.
  const [shareStats, setShareStats] = useState(() => getCachedShareStats());
  useEffect(() => {
    const handler = (e) => {
      const next = e?.detail || getCachedShareStats();
      setShareStats(next);
    };
    window.addEventListener('share-stats:updated', handler);
    let isLoggedIn = false;
    try { isLoggedIn = !!localStorage.getItem('drama_auth_user'); } catch {}
    if (isLoggedIn) refreshShareStats();
    return () => window.removeEventListener('share-stats:updated', handler);
  }, []);

  // 아이디어 노트 수 — ideasStore 는 AppContext 밖이라 별도 구독.
  const [ideaCount, setIdeaCount] = useState(() => listIdeasSync().length);
  useEffect(() => {
    const unsub = subscribeIdeas((next) => setIdeaCount(Array.isArray(next) ? next.length : 0));
    return () => { try { unsub?.(); } catch {} };
  }, []);

  const { stats, earnedIds } = useMemo(
    () => evaluateBadges(workTimeLogs, projects, scriptBlocks, shareStats, ideaCount),
    [workTimeLogs, projects, scriptBlocks, shareStats, ideaCount]
  );

  const earnedSet = useMemo(() => new Set(earnedIds), [earnedIds]);
  const autoFeaturedId = useMemo(() => pickAutoFeatured(earnedIds), [earnedIds]);

  // 핀 — pin-changed 이벤트로 재렌더 트리거.
  // (useRef 는 변경해도 재렌더가 일어나지 않아 useState 사용.)
  const [, bumpPinTick] = useState(0);
  useEffect(() => {
    const h = () => bumpPinTick((n) => n + 1);
    window.addEventListener('badge:pin-changed', h);
    return () => window.removeEventListener('badge:pin-changed', h);
  }, []);
  const pinnedId = getPinnedBadgeId();
  // 핀이 미획득 뱃지를 가리키면 무시
  const pinnedValid = pinnedId && earnedSet.has(pinnedId) ? pinnedId : null;
  const featuredId  = pinnedValid || autoFeaturedId;
  const featured    = featuredId ? getBadge(featuredId) : null;

  // 새 획득 toast — 마운트 후 한 번, 이후 earnedIds 변경 시
  // 로그인 안 한 상태에서는 토스트도 seen 기록도 건너뜀. 뱃지는 계정에 묶이는 개념이라
  // 로그인 전 활동은 평가만 하고 알림은 보류 — 로그인 후 Drive 동기화로 earnedIds 가
  // 바뀌면 그때 토스트가 발사된다.
  useEffect(() => {
    if (earnedIds.length === 0) return;
    let isLoggedIn = false;
    try { isLoggedIn = !!localStorage.getItem('drama_auth_user'); } catch {}
    if (!isLoggedIn) return;
    const seen = loadSeen();
    const newOnes = earnedIds.filter((id) => !seen.has(id));
    if (newOnes.length === 0) return;
    // seen 갱신 먼저(연속 발사 방지)
    newOnes.forEach((id) => seen.add(id));
    saveSeen(seen);
    // 약간의 지연 후 발사 — UI 안정 후
    setTimeout(() => {
      newOnes.forEach((id) => {
        const b = getBadge(id);
        if (b) window.dispatchEvent(new CustomEvent('badge:unlock', { detail: b }));
      });
    }, 800);
  }, [earnedIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    all: BADGES,
    earnedIds,
    earnedSet,
    stats,
    featured,        // 대표 뱃지 (객체) — 없으면 null
    pinnedId: pinnedValid,
  };
}
