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
 *   timeOfDay        — string (e.g. "낮", "밤")
 *   content          — legacy: raw string when no structured fields
 *
 * Output format:
 *   S#n. [특수상황)] 장소[ - 세부장소] [(시간대)]
 *   Examples:
 *     S#1. 바닷가 (낮)
 *     S#1. 회상) 바닷가 (낮)
 *     S#1. 바닷가 - 방파제 (낮)
 *     S#1. 회상) 바닷가 - 방파제 (낮)
 */

export const TIME_OF_DAY_OPTIONS = ['낮', '밤', '아침', '오전', '오후', '저녁', '새벽'];

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
  const content = (scene.content?.trim() || '').replace(/^S#\d+\.?\s*/, '');
  if (content) return `${label} ${content}`.trim();

  return label;
}

/**
 * Parse a legacy content string into structured fields.
 * Heuristic: "특수상황) 장소[ - 세부장소] [(시간대)]"
 * Returns { specialSituation, location, subLocation, timeOfDay }
 */
export function parseSceneContent(content) {
  if (!content) return { specialSituation: '', location: '', subLocation: '', timeOfDay: '' };

  let rest = content.trim();
  let specialSituation = '';
  let timeOfDay = '';
  let subLocation = '';

  // Extract special situation: "특수상황) ..."
  // [^()] : "(" 또는 ")" 미포함 → "바닷가 (낮)" 같은 일반 장소+시간 표기를 특수상황으로 오파싱 방지
  const spMatch = rest.match(/^([^()]+)\)\s*(.*)$/);
  if (spMatch) {
    specialSituation = spMatch[1].trim();
    rest = spMatch[2].trim();
  }

  // "-" 기준으로 장소/세부장소 분리, "(" 기준으로 시간대 분리
  // 형식: "장소[ - 세부장소] [(시간대)]"
  // 세부장소 = '-' 와 '(' 사이의 모든 텍스트
  const dashIdx = rest.indexOf('-');
  if (dashIdx !== -1) {
    const locationPart = rest.slice(0, dashIdx).trim();
    const afterDash    = rest.slice(dashIdx + 1).trim();
    const parenIdx     = afterDash.indexOf('(');
    if (parenIdx !== -1) {
      subLocation = afterDash.slice(0, parenIdx).trim();
      const closeIdx = afterDash.lastIndexOf(')');
      timeOfDay = closeIdx > parenIdx ? afterDash.slice(parenIdx + 1, closeIdx).trim() : '';
    } else {
      subLocation = afterDash;
    }
    rest = locationPart;
  } else {
    // '-' 없음: 장소 뒤 '(시간대)' 만 추출
    const parenIdx = rest.indexOf('(');
    if (parenIdx !== -1) {
      const closeIdx = rest.lastIndexOf(')');
      timeOfDay = closeIdx > parenIdx ? rest.slice(parenIdx + 1, closeIdx).trim() : '';
      rest = rest.slice(0, parenIdx).trim();
    }
  }

  return { specialSituation, location: rest, subLocation, timeOfDay };
}
