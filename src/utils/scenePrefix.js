/**
 * 씬번호 형식 설정
 * - localStorage['drama_scene_prefix'] 에 저장
 * - 로그인 유저는 Supabase user_metadata에도 저장 (다기기 공유)
 */

export const SCENE_PREFIX_OPTIONS = [
  { value: 'S#',       label: 'S# (기본값, 현장 표준)', example: 'S#1.' },
  { value: '씬 ',      label: '씬  (한국어 표기)',       example: '씬1.'  },
  { value: 'Scene #',  label: 'Scene # (영어 표기)',     example: 'Scene #1.' },
  { value: '#',        label: '# (기호만)',              example: '#1.'   },
];

const LS_KEY = 'drama_scene_prefix';
const DEFAULT = 'S#';

/** 현재 설정된 prefix 반환 */
export function getScenePrefix() {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v && SCENE_PREFIX_OPTIONS.some(o => o.value === v)) return v;
  } catch {}
  return DEFAULT;
}

/**
 * prefix 저장
 * @param {string} value - SCENE_PREFIX_OPTIONS 중 하나
 * @param {object|null} supabase - 로그인 시 메타 저장용 (없으면 localStorage만)
 */
export async function setScenePrefix(value, supabase = null) {
  try { localStorage.setItem(LS_KEY, value); } catch {}
  if (supabase) {
    try {
      await supabase.auth.updateUser({ data: { scene_prefix: value } });
    } catch {}
  }
}

/**
 * 로그인 시 Supabase user_metadata에서 prefix를 읽어 localStorage에 동기화
 * @param {object} userMetadata - session.user.user_metadata
 */
export function syncPrefixFromMetadata(userMetadata) {
  const v = userMetadata?.scene_prefix;
  if (v && SCENE_PREFIX_OPTIONS.some(o => o.value === v)) {
    try { localStorage.setItem(LS_KEY, v); } catch {}
  }
}

/**
 * 씬번호 label 생성
 * @param {number} seq - 씬 순번 (1-based)
 * @returns {string} 예: 'S#1.' / '씬1.' / 'Scene #1.' / '#1.'
 */
export function buildSceneLabel(seq) {
  const prefix = getScenePrefix();
  if (prefix === '씬 ')     return `씬${seq}.`;
  if (prefix === 'Scene #') return `Scene #${seq}.`;
  if (prefix === '#')       return `#${seq}.`;
  return `S#${seq}.`; // 기본값 S#
}
