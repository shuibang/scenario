/**
 * contestsApi — 공모전 보드 Supabase 클라이언트
 *
 * - 사용자: fetchActiveContests, reportContest
 * - 어드민: fetchPendingContests, fetchAllContests, approveContest, rejectContest,
 *           updateContest, deleteContest, createContestManual
 * - 가벼운 in-memory 캐시 + subscribe 패턴 (보드/뱃지 모두 같은 캐시 공유)
 */
import { supabase } from './supabaseClient';

// 공통 카테고리 옵션 — 한 공모전이 여러 부문(단막+미니+영화 등)을 동시에
// 모집하는 경우가 많아 다중 선택 (text[] 컬럼).
// inferCategory(Edge Function) 출력과 동기화 — 자동수집 카테고리가 UI 필터에서도 선택 가능하게.
export const CONTEST_CATEGORIES = ['미니시리즈', '단막', '시나리오', '영화', '웹드라마', '웹소설', '문학', 'IP/원작', '기타'];

// 마지막 선택한 카테고리 — 같은 사용자가 단막은 단막, 웹소설은 웹소설 식으로
// 일관되게 등록·제보하는 경우가 많아 기본값으로 자동 복원.
const LAST_CATEGORIES_KEY = 'drama_contest_last_categories';

export function loadLastSelectedCategories() {
  try {
    const raw = localStorage.getItem(LAST_CATEGORIES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string' && s.trim()) : [];
  } catch { return []; }
}

export function saveLastSelectedCategories(cats) {
  try {
    if (typeof localStorage === 'undefined') return;
    const arr = Array.isArray(cats) ? cats : [];
    localStorage.setItem(LAST_CATEGORIES_KEY, JSON.stringify(arr));
  } catch {}
}

function normalizeCategories(input) {
  if (!input) return null;
  const arr = Array.isArray(input) ? input : [input];
  const cleaned = arr.map((s) => String(s || '').trim()).filter(Boolean);
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : null;
}

const _listeners = new Set();
let _activeCache = null;        // Array | null  (active 만)
let _lastFetchedAt = 0;
const STALE_MS = 60_000;        // 1분 캐시

function notify() {
  for (const l of _listeners) { try { l(_activeCache); } catch {} }
}

export function subscribeActiveContests(listener) {
  _listeners.add(listener);
  if (_activeCache) { try { listener(_activeCache); } catch {} }
  return () => _listeners.delete(listener);
}

export function getActiveContestsCacheSync() {
  return _activeCache ? _activeCache.slice() : null;
}

export async function fetchActiveContests({ force = false } = {}) {
  if (!supabase) return [];
  if (!force && _activeCache && Date.now() - _lastFetchedAt < STALE_MS) {
    return _activeCache.slice();
  }
  const { data, error } = await supabase
    .from('contests')
    .select('id,title,organizer,source_url,poster_url,prize,category,submit_start,submit_end,status,source_type,created_at,approved_at')
    .eq('status', 'active')
    .order('submit_end', { ascending: true })
    .limit(200);
  if (error) {
    if (typeof console !== 'undefined') console.warn('[contestsApi] fetchActiveContests', error);
    return _activeCache ? _activeCache.slice() : [];
  }
  _activeCache = Array.isArray(data) ? data : [];
  _lastFetchedAt = Date.now();
  notify();
  return _activeCache.slice();
}

/**
 * 사용자 제보. RLS가 status='pending_review', source_type='user_report', reported_by=self 강제.
 * @param {{title, organizer?, source_url, prize?, category?, submit_start?, submit_end, reporter_memo?, poster_url?}} payload
 */
export async function reportContest(payload) {
  if (!supabase) throw new Error('Supabase 미설정');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');

  const row = {
    title: String(payload.title || '').trim(),
    organizer: payload.organizer ? String(payload.organizer).trim() : null,
    source_url: String(payload.source_url || '').trim(),
    poster_url: payload.poster_url ? String(payload.poster_url).trim() : null,
    prize: payload.prize ? String(payload.prize).trim() : null,
    category: normalizeCategories(payload.category),
    submit_start: payload.submit_start || null,
    submit_end: payload.submit_end,
    reporter_memo: payload.reporter_memo ? String(payload.reporter_memo).trim() : null,
    status: 'pending_review',
    source_type: 'user_report',
    reported_by: user.id,
  };

  if (!row.title) throw new Error('제목을 입력하세요');
  if (!row.source_url) throw new Error('원문 URL을 입력하세요');
  if (!row.submit_end) throw new Error('마감일을 입력하세요');

  const { data, error } = await supabase.from('contests').insert(row).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('이미 등록된 URL의 공모전입니다');
    throw error;
  }
  return data;
}

// ─── 어드민 전용 ─────────────────────────────────────────────────────────────

export async function fetchPendingContests() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('contests')
    .select('*')
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}

/**
 * 작년 같은 시기 공모전 — 어드민이 "올해도 열렸는지" 한눈에 보고 사이트 클릭해 확인용.
 * 기본: 작년 오늘 ±90일 마감한 closed 공모전.
 */
export async function fetchPastContests({ daysWindow = 90 } = {}) {
  if (!supabase) return [];
  const today = new Date();
  const yearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const start = new Date(yearAgo); start.setDate(start.getDate() - daysWindow);
  const end = new Date(yearAgo); end.setDate(end.getDate() + daysWindow);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('contests')
    .select('*')
    .eq('status', 'closed')
    .gte('submit_end', startStr)
    .lte('submit_end', endStr)
    .order('submit_end', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

export async function fetchAllContests({ statusFilter = null, limit = 500 } = {}) {
  if (!supabase) return [];
  let q = supabase.from('contests').select('*').order('created_at', { ascending: false }).limit(limit);
  if (statusFilter) q = q.eq('status', statusFilter);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function approveContest(id) {
  if (!supabase) throw new Error('Supabase 미설정');
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('contests')
    .update({ status: 'active', approved_at: new Date().toISOString(), approved_by: user?.id || null })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  invalidateActiveCache();
  return data;
}

export async function rejectContest(id) {
  if (!supabase) throw new Error('Supabase 미설정');
  const { data, error } = await supabase
    .from('contests')
    .update({ status: 'rejected' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateContest(id, patch) {
  if (!supabase) throw new Error('Supabase 미설정');
  const normalized = { ...patch };
  if ('category' in normalized) normalized.category = normalizeCategories(normalized.category);
  const { data, error } = await supabase
    .from('contests')
    .update(normalized)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  invalidateActiveCache();
  return data;
}

export async function deleteContest(id) {
  if (!supabase) throw new Error('Supabase 미설정');
  const { error } = await supabase.from('contests').delete().eq('id', id);
  if (error) throw error;
  invalidateActiveCache();
}

export async function createContestManual(payload) {
  if (!supabase) throw new Error('Supabase 미설정');
  const { data: { user } } = await supabase.auth.getUser();
  // 마감일이 이미 지났으면 closed 로 바로 등록 — 활성 거치지 않고 "작년 이맘때" 섹션으로 직행.
  // (활성으로 들어가면 다음날 close_expired_contests cron 까지 사용자 보드에 잘못 표시됨)
  const today = new Date().toISOString().slice(0, 10);
  const isPast = payload.submit_end && payload.submit_end < today;
  const row = {
    title: String(payload.title || '').trim(),
    organizer: payload.organizer || null,
    source_url: String(payload.source_url || '').trim(),
    poster_url: payload.poster_url || null,
    prize: payload.prize || null,
    category: normalizeCategories(payload.category),
    submit_start: payload.submit_start || null,
    submit_end: payload.submit_end,
    status: isPast ? 'closed' : 'active',
    source_type: 'manual',
    approved_at: new Date().toISOString(),
    approved_by: user?.id || null,
  };
  if (!row.title || !row.source_url || !row.submit_end) {
    throw new Error('제목·원문URL·마감일은 필수입니다');
  }
  const { data, error } = await supabase.from('contests').insert(row).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('이미 등록된 URL입니다');
    throw error;
  }
  invalidateActiveCache();
  return data;
}

export function invalidateActiveCache() {
  _activeCache = null;
  _lastFetchedAt = 0;
  notify();
}
