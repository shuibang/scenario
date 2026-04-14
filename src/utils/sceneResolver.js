/**
 * sceneResolver.js
 *
 * Single source of truth for scene header display.
 * All views (editor label, outline, preview, print, DOCX, HWPX) MUST use this.
 *
 * Scene object expected fields:
 *   label            — "S#n." (auto-assigned by syncLabels)
 *   specialSituation — string | '' (e.g. "회상", "꿈")
 *   location         — string (e.g. "바닷가")
 *   subLocation      — string | '' (e.g. "방파제")
 *   timeOfDay        — string (e.g. "낮", "밤", "D->N")
 *   content          — legacy: raw string when no structured fields
 *
 * Output format:
 *   S#n. [특수상황)] 장소[ - 세부장소] [(시간대)]
 *   Examples:
 *     S#1. 바닷가 (낮)
 *     S#1. 회상) 바닷가 (낮)
 *     S#1. 바닷가 - 방파제 (낮)
 *     S#1. 회상) 바닷가 - 방파제 (낮)
 *
 * Recognized input formats (flexible parsing via parseSceneContent):
 *   S#1. 카페 내부, 낮
 *   S#1/ 카페 내부/ 낮
 *   S#1 - 카페 내부 - 낮
 *   S#1. 카페 내부 (낮)
 *   S#1. 회상) 카페 내부 - 세부장소 (낮)
 *   S#1, 회상) 카페 내부, 낮~밤
 *   S#1. 카페 내부 - 세부장소, D->N
 */

/**
 * 씬번호 prefix + 번호 + 구분자 제거용 정규식.
 * S#n / 씬n / Scene #n / #n 네 가지 형식 모두 인식 (소급 호환 포함).
 */
export const SCENE_PREFIX_STRIP_RE =
  /^(?:Scene\s*#|S#|씬\s*|#)\d+[-.,/]?\s*/i;

/** 시간대 선택지 (드롭다운·파싱 공용) */
export const TIME_OF_DAY_OPTIONS = ['낮', '밤', '아침', '오전', '오후', '저녁', '새벽', '점심', 'D', 'N'];

/**
 * Resolve a scene's display label.
 * @param {object} scene - scene or script block (must have label)
 * @returns {string}
 */
export function resolveSceneLabel(scene) {
  if (!scene) return '';

  const label  = scene.label || '';

  // Structured fields take priority
  const loc    = scene.location?.trim()         || '';
  const subLoc = scene.subLocation?.trim()      || '';
  const time   = scene.timeOfDay?.trim()        || '';
  const sp     = scene.specialSituation?.trim() || '';

  if (loc || sp) {
    const timePart = time   ? ` (${time})`         : '';
    const spPart   = sp     ? `${sp}) `             : '';
    const locFull  = subLoc ? `${loc} - ${subLoc}` : loc;
    return `${label} ${spPart}${locFull}${timePart}`.trim();
  }

  // Fallback to legacy content string (content에서 label prefix 제거 후 합침)
  const content = (scene.content?.trim() || '').replace(SCENE_PREFIX_STRIP_RE, '');
  if (content) return `${label} ${content}`.trim();

  return label;
}

// 시간대 키워드 및 패턴 (parseSceneContent 전용 내부 상수)
const _TKW = TIME_OF_DAY_OPTIONS.join('|');
// "장소[구분자]시간대" 형태에서 끝부분의 시간대 표현을 추출
// 시간대: 단일(낮) 또는 연결(낮~밤, D->N)
const _TIME_SUFFIX_RE = new RegExp(
  `[-.,/]\\s*((?:${_TKW})(?:\\s*(?:~|->)\\s*(?:${_TKW}))?)[\\s)]*$`
);

/**
 * Parse a legacy content string into structured fields.
 *
 * Supported separators: . / , -
 * Supported time-of-day: 낮|밤|아침|오전|오후|저녁|새벽|점심|D|N (단일 또는 ~·-> 연결)
 *
 * Examples:
 *   "카페 내부, 낮"           → location="카페 내부", timeOfDay="낮"
 *   "카페 내부/ 낮"           → location="카페 내부", timeOfDay="낮"
 *   "카페 내부 - 낮"          → location="카페 내부", timeOfDay="낮"
 *   "카페 내부 (낮)"          → location="카페 내부", timeOfDay="낮"
 *   "회상) 카페 - 세부, 낮~밤" → specialSituation="회상", location="카페", subLocation="세부", timeOfDay="낮~밤"
 *   "카페 - 세부, D->N"       → location="카페", subLocation="세부", timeOfDay="D->N"
 *
 * Returns { specialSituation, location, subLocation, timeOfDay }
 */
export function parseSceneContent(content) {
  if (!content) return { specialSituation: '', location: '', subLocation: '', timeOfDay: '' };

  let rest = content.trim();
  let specialSituation = '';
  let timeOfDay = '';
  let subLocation = '';

  // 1. 특수상황 추출: "특수상황) ..."
  // [^()] : 괄호 미포함 → "바닷가 (낮)" 같은 표기를 특수상황으로 오파싱 방지
  const spMatch = rest.match(/^([^()]+)\)\s*(.*)$/);
  if (spMatch) {
    specialSituation = spMatch[1].trim();
    rest = spMatch[2].trim();
  }

  // 2. 시간대 추출
  // a. 괄호 "(시간대)" 우선
  const parenOpen  = rest.indexOf('(');
  const parenClose = rest.lastIndexOf(')');
  if (parenOpen !== -1 && parenClose > parenOpen) {
    timeOfDay = rest.slice(parenOpen + 1, parenClose).trim();
    rest      = rest.slice(0, parenOpen).trim();
  } else {
    // b. 끝부분 "구분자 시간대" 패턴 (낮, D->N 등)
    const timeSuffix = _TIME_SUFFIX_RE.exec(rest);
    if (timeSuffix) {
      timeOfDay = timeSuffix[1].trim();
      rest = rest.slice(0, timeSuffix.index).trim();
    }
  }

  // 3. 세부장소 추출: 남은 텍스트의 첫 번째 구분자 이후
  const subSepMatch = /[-.,/]\s*(.+)$/.exec(rest);
  if (subSepMatch) {
    subLocation = subSepMatch[1].trim();
    rest = rest.slice(0, subSepMatch.index).trim();
  }

  return { specialSituation, location: rest, subLocation, timeOfDay };
}
