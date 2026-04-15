/**
 * reviewShare — 검토 링크 저장/불러오기 (Supabase review_links 테이블)
 */
import { supabase } from '../store/supabaseClient';

function genId() {
  return crypto.randomUUID(); // 128비트 UUID — 추측 공격 방지
}

// 페이로드 최대 크기 (5 MB) — DB 폭탄 공격 방지
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

/**
 * 검토 payload를 Supabase에 저장하고 짧은 ID를 반환합니다.
 * @param {object} payload
 * @returns {Promise<string>} id
 */
export async function saveReviewPayload(payload) {
  if (!supabase) throw new Error('Supabase 환경변수가 설정되지 않았습니다.');
  // 검토 링크 생성은 인증된 사용자만 가능 — 비인증 시 Supabase 스팸/남용 방지
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('검토 링크 생성은 로그인 후 이용할 수 있습니다.');
  // 페이로드 크기 검사 — DB 폭탄 방지 (시나리오 1)
  if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) {
    throw new Error('대본 데이터가 너무 큽니다 (최대 5MB). 에피소드 선택 범위를 줄여주세요.');
  }
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
  if (!supabase) throw new Error('Supabase 환경변수가 설정되지 않았습니다.');
  const { data, error } = await supabase
    .from('review_links')
    .select('payload, expires_at')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  // 만료 링크 우회 방지 — 클라이언트 이중 검증 (시나리오 2)
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    throw new Error('EXPIRED');
  }
  return data.payload;
}

/** URL 해시값이 UUID(Supabase 저장)인지 판단 */
export function isShortReviewId(val) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(val);
}

/**
 * 작업기록 payload를 Supabase에 저장하고 UUID를 반환합니다.
 * 인증 불필요 — 작업기록 공유는 로그인 없이도 가능 (RLS: insert 허용)
 * @param {object} payload
 * @returns {Promise<string>} id
 */
export async function saveLogPayload(payload) {
  if (!supabase) throw new Error('Supabase 환경변수가 설정되지 않았습니다.');
  // 페이로드 크기 검사 — 비인증 삽입이므로 DB 폭탄 방지 특히 중요 (시나리오 1)
  if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) {
    throw new Error('작업기록 데이터가 너무 큽니다 (최대 5MB).');
  }
  const id = genId();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30일
  const { error } = await supabase.from('review_links').insert({ id, payload, expires_at: expiresAt });
  if (error) throw new Error(error.message);
  return id;
}

/**
 * UUID로 작업기록 payload를 불러옵니다.
 * @param {string} id
 * @returns {Promise<object>} payload
 */
export async function loadLogPayload(id) {
  if (!supabase) throw new Error('Supabase 환경변수가 설정되지 않았습니다.');
  const { data, error } = await supabase
    .from('review_links')
    .select('payload, expires_at')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  // 만료 링크 우회 방지 — 클라이언트 이중 검증 (시나리오 2)
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    throw new Error('EXPIRED');
  }
  return data.payload;
}
