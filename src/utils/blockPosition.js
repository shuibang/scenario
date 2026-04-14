/**
 * blockPosition.js
 * 스크립트 블록 배열에서 특정 block_id가 속한 씬 레이블을 반환하는 공유 유틸.
 * DirectorDeliveryView, DirectorNotesPage 양쪽에서 사용.
 */

const SCENE_TYPES = new Set(['scene', 'scene_number', 'scene_heading', 'slug']);
const SCENE_PREFIX_RE = /^(?:(?:Scene\s*#|S#|씬\s*|#)\d+|\d+)[-.,/]?\s*/i;

/**
 * blockId에 해당하는 블록이 속한 씬의 표시용 레이블을 반환.
 * - 구조화 필드(location/subLocation/timeOfDay/specialSituation) 우선
 * - 없으면 content에서 씬번호 prefix를 제거하고 label과 결합
 * @param {string} blockId
 * @param {Array}  scriptBlocks - appState.scriptBlocks
 * @returns {string}
 */
export function getBlockPosition(blockId, scriptBlocks) {
  if (!blockId || !Array.isArray(scriptBlocks)) return '';
  const idx = scriptBlocks.findIndex(b => b?.id === blockId);
  if (idx === -1) return '';
  for (let i = idx; i >= 0; i--) {
    const b = scriptBlocks[i];
    if (!b) continue;
    if (!SCENE_TYPES.has((b.type || '').toLowerCase())) continue;
    const label = (b.label || '').trim();
    if (b.location) {
      const loc  = b.location.trim();
      const sub  = b.subLocation      ? ` - ${b.subLocation}`          : '';
      const time = b.timeOfDay        ? ` (${b.timeOfDay})`            : '';
      const sp   = b.specialSituation ? `${b.specialSituation}) `      : '';
      return `${label} ${sp}${loc}${sub}${time}`.trim();
    }
    const raw = (b.content || '').replace(/<[^>]+>/g, '').trim()
                  .replace(SCENE_PREFIX_RE, '');
    return raw ? `${label} ${raw}`.trim() : label;
  }
  return '';
}

/**
 * DirectorScriptViewer 내 특정 블록 요소로 부드럽게 스크롤.
 * @param {string} blockId
 */
export function scrollToBlock(blockId) {
  const el = document.getElementById(`dsv-${blockId}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
