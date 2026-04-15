/**
 * sceneFormat.js — 사용자 정의 씬 헤더 형식
 *
 * localStorage key: 'scene_header_format'
 * 형식 변경 시 'scene_format_changed' 이벤트 dispatch
 *
 * format 객체:
 *   locSep        — 장소↔세부장소 구분자 문자열 (preset or custom)
 *   timeFmt       — 시간대 표기 방식 ('paren' | 'slash' | 'space' | 'custom')
 *   customTimeSep — timeFmt==='custom' 일 때 사용할 접두 문자열
 */

export const FORMAT_KEY = 'scene_header_format';

export const LOC_SEP_PRESETS = [
  { value: ' - ', label: '하이픈',      example: '거실 - 안방' },
  { value: ' / ', label: '슬래시',      example: '거실 / 안방' },
  { value: '/',   label: '슬래시 붙임', example: '거실/안방'   },
];

export const TIME_FMT_PRESETS = [
  { value: 'paren', label: '괄호',   example: '(낮)' },
  { value: 'slash', label: '슬래시', example: '/낮'  },
  { value: 'space', label: '공백',   example: ' 낮 ' },
];

export const DEFAULT_FORMAT = { locSep: ' - ', timeFmt: 'paren', customTimeOpen: ' ', customTimeClose: '' };

export function getSceneFormat() {
  try {
    return { ...DEFAULT_FORMAT, ...JSON.parse(localStorage.getItem(FORMAT_KEY) || '{}') };
  } catch {
    return DEFAULT_FORMAT;
  }
}

export function setSceneFormat(fmt) {
  localStorage.setItem(FORMAT_KEY, JSON.stringify(fmt));
  window.dispatchEvent(new Event('scene_format_changed'));
}

/** locSep가 preset 중 하나인지 여부 */
export function isCustomLocSep(locSep) {
  return !LOC_SEP_PRESETS.some(p => p.value === locSep);
}

const TOD_KEYWORDS = ['낮', '밤', '아침', '오전', '오후', '저녁', '새벽', '점심', 'D', 'N'];

/** 씬 헤더 텍스트 → 구조화 필드 */
export function parseWithFormat(text, fmt = DEFAULT_FORMAT) {
  if (!text) return { specialSituation: '', location: '', subLocation: '', timeOfDay: '' };

  let rest = text.trim();
  let specialSituation = '';
  let timeOfDay = '';
  let subLocation = '';

  // 1. 특수상황: "회상) ..."
  const spMatch = rest.match(/^([^()]+)\)\s*(.*)$/);
  if (spMatch) {
    specialSituation = spMatch[1].trim();
    rest = spMatch[2].trim();
  }

  // 2. 시간대 추출
  if (fmt.timeFmt === 'paren') {
    const po = rest.indexOf('(');
    const pc = rest.lastIndexOf(')');
    if (po !== -1 && pc > po) {
      timeOfDay = rest.slice(po + 1, pc).trim();
      rest = rest.slice(0, po).trim();
    }
  } else if (fmt.timeFmt === 'slash') {
    const si = rest.lastIndexOf('/');
    if (si !== -1) {
      const candidate = rest.slice(si + 1).trim();
      if (TOD_KEYWORDS.includes(candidate) || candidate.length <= 6) {
        timeOfDay = candidate;
        rest = rest.slice(0, si).trim();
      }
    }
  } else if (fmt.timeFmt === 'custom') {
    const open  = fmt.customTimeOpen  ?? ' ';
    const close = fmt.customTimeClose ?? '';
    if (close) {
      // 닫힘 문자가 있으면: open...time...close 패턴
      const ci = rest.lastIndexOf(close);
      if (ci !== -1) {
        const oi = rest.lastIndexOf(open, ci);
        if (oi !== -1) {
          timeOfDay = rest.slice(oi + open.length, ci).trim();
          rest = rest.slice(0, oi).trim();
        }
      }
    } else {
      // 닫힘 없으면: open 뒤 텍스트가 시간대
      const oi = rest.lastIndexOf(open);
      if (oi !== -1) {
        const candidate = rest.slice(oi + open.length).trim();
        if (TOD_KEYWORDS.includes(candidate) || candidate.length <= 6) {
          timeOfDay = candidate;
          rest = rest.slice(0, oi).trim();
        }
      }
    }
  } else {
    // space: 끝에서부터 스캔 — 중간에 감싸진 경우도 감지 (공란+시간대+공란)
    const parts = rest.split(/\s+/);
    for (let i = parts.length - 1; i > 0; i--) {
      if (TOD_KEYWORDS.includes(parts[i])) {
        timeOfDay = parts[i];
        parts.splice(i, 1);
        rest = parts.join(' ').trim();
        break;
      }
    }
  }

  // 3. 세부장소: locSep 기준 분리
  const sep = fmt.locSep || '';
  const sepIdx = sep.trim() ? rest.indexOf(sep) : -1;
  if (sepIdx !== -1) {
    subLocation = rest.slice(sepIdx + sep.length).trim();
    rest = rest.slice(0, sepIdx).trim();
  }

  return { specialSituation, location: rest, subLocation, timeOfDay };
}

/** 구조화 필드 → 씬 헤더 텍스트 재조합 (label 제외) */
export function formatSceneHeader(scene, fmt = DEFAULT_FORMAT) {
  const loc = scene.location?.trim()         || '';
  const sub = scene.subLocation?.trim()      || '';
  const tod = scene.timeOfDay?.trim()        || '';
  const sp  = scene.specialSituation?.trim() || '';

  if (!loc && !sp) return '';

  const spPart  = sp  ? `${sp}) `                 : '';
  const locFull = sub ? `${loc}${fmt.locSep}${sub}` : loc;

  let timePart = '';
  if (tod) {
    if (fmt.timeFmt === 'paren')       timePart = ` (${tod})`;
    else if (fmt.timeFmt === 'slash')  timePart = `/${tod}`;
    else if (fmt.timeFmt === 'custom') timePart = `${fmt.customTimeOpen ?? ' '}${tod}${fmt.customTimeClose ?? ''}`;
    else                               timePart = ` ${tod} `; // 앞뒤 공란으로 감싸기
  }

  return `${spPart}${locFull}${timePart}`;
}

/** 미리보기 문자열 */
export function previewFormat(fmt) {
  return formatSceneHeader(
    { location: '거실', subLocation: '안방', timeOfDay: '낮', specialSituation: '' },
    fmt
  );
}
