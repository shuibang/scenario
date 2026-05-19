/**
 * 뱃지 훅 — useBadges()
 *
 *  - workTimeLogs · projects 를 받아 (또는 useApp 상태에서 직접 읽어) 자동 평가.
 *  - 대표 뱃지 핀: localStorage `drama_badge_pin` (사용자 수동 선택). 없으면 자동(가장 높은 tier).
 *  - 새 획득 toast: localStorage `drama_badges_seen` 와 비교해 신규면 'badge:unlock' 커스텀 이벤트 발사.
 *
 * 표시 컴포넌트(BadgeChip, BadgesPanel)는 이 훅의 결과만 받는다 — 분리 유지.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../store/AppContext';
import { BADGES, getBadge, compareBadgeTier } from './catalog';
import { evaluateBadges } from './evaluate';

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

  const { stats, earnedIds } = useMemo(
    () => evaluateBadges(workTimeLogs, projects),
    [workTimeLogs, projects]
  );

  const earnedSet = useMemo(() => new Set(earnedIds), [earnedIds]);
  const autoFeaturedId = useMemo(() => pickAutoFeatured(earnedIds), [earnedIds]);

  // 핀 — pin-changed 이벤트로 재렌더 트리거
  const pinTick = useRef(0);
  useEffect(() => {
    const h = () => { pinTick.current += 1; };
    window.addEventListener('badge:pin-changed', h);
    return () => window.removeEventListener('badge:pin-changed', h);
  }, []);
  const pinnedId = getPinnedBadgeId();
  // 핀이 미획득 뱃지를 가리키면 무시
  const pinnedValid = pinnedId && earnedSet.has(pinnedId) ? pinnedId : null;
  const featuredId  = pinnedValid || autoFeaturedId;
  const featured    = featuredId ? getBadge(featuredId) : null;

  // 새 획득 toast — 마운트 후 한 번, 이후 earnedIds 변경 시
  useEffect(() => {
    if (earnedIds.length === 0) return;
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
