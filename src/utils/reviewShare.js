/**
 * reviewShare — 검토 링크 저장/불러오기 (Supabase review_links 테이블)
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

function genId() {
  return Math.random().toString(36).slice(2, 10); // 8자리 영숫자
}

/**
 * 검토 payload를 Supabase에 저장하고 짧은 ID를 반환합니다.
 * @param {object} payload
 * @returns {Promise<string>} id
 */
export async function saveReviewPayload(payload) {
  const id = genId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7일
  const { error } = await supabase.from('review_links').insert({ id, payload, expires_at: expiresAt });
  if (error) throw new Error(error.message);
  return id;
}

/**
 * ID로 검토 payload를 불러옵니다.
 * @param {string} id
 * @returns {Promise<object>} payload
 */
export async function loadReviewPayload(id) {
  const { data, error } = await supabase
    .from('review_links')
    .select('payload')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data.payload;
}

/** URL 해시값이 짧은 ID(Supabase 저장)인지 판단 */
export function isShortReviewId(val) {
  return /^[a-z0-9]{8}$/.test(val);
}
