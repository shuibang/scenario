/**
 * scene_number 블록 데이터 빌더.
 *
 * 레거시 씬(구조화 필드 없음)은 원본 rawText를 content로 유지하고
 * 구조화 필드는 빈값 유지. 포맷 변경이나 재파싱으로 인한 원본 표기 손실 방지.
 *
 * 구조화 씬(location 또는 specialSituation 존재)은 기존 동작
 * (parseSceneContent + resolveSceneLabel)으로 처리.
 *
 * 전환 경로: 사용자가 SceneListPage에서 location 등을 명시 입력 시
 * 해당 씬은 "구조화 씬"으로 승격되어 이후 에디터 로드부터
 * 구조화 경로를 탐.
 *
 * Ref: data-loss investigation Phase 0, task 0-2
 */

import {
  parseSceneContent,
  resolveSceneLabel,
  SCENE_PREFIX_STRIP_RE,
} from './sceneResolver';

/**
 * @param {object} params
 * @param {object|null|undefined} params.prev   - 이전 렌더의 block 메타 (metaRef.current[id])
 * @param {string} params.rawText               - DOM에서 읽은 블록 텍스트 (label 제거된 상태)
 * @param {string} params.label                 - 예: 'S#3.'
 * @param {string} params.sceneId               - 블록이 소속된 scene id
 * @returns {{
 *   location: string,
 *   subLocation: string,
 *   timeOfDay: string,
 *   specialSituation: string,
 *   content: string,
 *   sceneId: string,
 * }}
 */
export function buildSceneNumberBlock({ prev, rawText, label, sceneId }) {
  const prevObj = prev || {};
  const hasStructured = !!(prevObj.location || prevObj.specialSituation);
  const safeRaw = rawText || '';
  const safeLabel = label || '';

  if (hasStructured) {
    // rawText 불변 = 사용자 편집 없음 → prev 구조화 필드 유지
    // (format 변경 후 doParse가 재파싱 시 하드코딩 파서가 custom 포맷을 잘못 파싱해
    //  구조화 필드를 뭉개는 현상 방지. loadBlocks의 origMap 복원과 의미적으로 동등)
    const prevRaw = prevObj.rawText ?? '';
    const currRaw = safeRaw ?? '';
    if (prevRaw === currRaw && prevRaw !== '') {
      const location         = prevObj.location         || '';
      const subLocation      = prevObj.subLocation      || '';
      const timeOfDay        = prevObj.timeOfDay        || '';
      const specialSituation = prevObj.specialSituation || '';
      const content = resolveSceneLabel({
        label: safeLabel,
        location, subLocation, timeOfDay, specialSituation,
      });
      return { location, subLocation, timeOfDay, specialSituation, content, sceneId };
    }

    // 구조화 씬: 기존 동작 (parseSceneContent → resolveSceneLabel)
    const parsed = parseSceneContent(safeRaw);
    const cleanContent = (parsed.location || parsed.specialSituation)
      ? undefined
      : safeRaw.replace(SCENE_PREFIX_STRIP_RE, '');
    const contentForResolve = cleanContent !== undefined
      ? {
          label: safeLabel,
          location: '', subLocation: '', timeOfDay: '', specialSituation: '',
          content: cleanContent,
        }
      : { label: safeLabel, ...parsed };
    const content = resolveSceneLabel(contentForResolve);
    return {
      location:         parsed.location || '',
      subLocation:      parsed.subLocation || '',
      timeOfDay:        parsed.timeOfDay || '',
      specialSituation: parsed.specialSituation || '',
      content,
      sceneId,
    };
  }

  // 레거시 씬: 구조화 필드 빈값 유지, 원본 rawText 보존
  const stripped = safeRaw.replace(SCENE_PREFIX_STRIP_RE, '').trim();
  const content = safeLabel
    ? (stripped ? `${safeLabel} ${stripped}` : safeLabel.trim())
    : stripped;
  return {
    location: '',
    subLocation: '',
    timeOfDay: '',
    specialSituation: '',
    content,
    sceneId,
  };
}
