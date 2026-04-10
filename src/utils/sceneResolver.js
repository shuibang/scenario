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

  // 괄호 안 전체 → 시간대 (낮-밤, 낮/밤 등 포함)
  // '-' 는 괄호 이전 텍스트에서만 장소/세부장소 구분자로 사용
  const parenOpen  = rest.indexOf('(');
  const parenClose = rest.lastIndexOf(')');
  if (parenOpen !== -1 && parenClose > parenOpen) {
    timeOfDay = rest.slice(parenOpen + 1, parenClose).trim();
    rest      = rest.slice(0, parenOpen).trim();
  }
  const dashIdx = rest.indexOf('-');
  if (dashIdx !== -1) {
    subLocation = rest.slice(dashIdx + 1).trim();
    rest        = rest.slice(0, dashIdx).trim();
  }

  return { specialSituation, location: rest, subLocation, timeOfDay };
}
