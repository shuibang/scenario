/**
 * scene_number 블록 데이터 빌더.
 *
 * 항상 parseWithFormat(body, fmt)으로 씬 헤더를 파싱한다.
 * location 또는 specialSituation이 있으면 resolveSceneLabel로 content 재조합.
 * 없으면 원본 rawText 기반 content를 유지하고 구조화 필드는 빈값으로 반환.
 */

import {
  resolveSceneLabel,
  SCENE_PREFIX_STRIP_RE,
} from './sceneResolver';
import {
  parseWithFormat,
  getSceneFormat,
} from './sceneFormat';

/**
 * @param {object} params
 * @param {object|null|undefined} params.prev   - 미사용 (API 호환 유지)
 * @param {string} params.rawText               - DOM에서 읽은 블록 텍스트 (label 제거 전 원본)
 * @param {string} params.label                 - 예: 'S#3.'
 * @param {string} params.sceneId               - 블록이 소속된 scene id
 * @param {object} [params.fmt]                 - 씬 헤더 포맷 (미지정 시 getSceneFormat())
 * @returns {{ location, subLocation, timeOfDay, specialSituation, content, sceneId }}
 */
export function buildSceneNumberBlock({ prev, rawText, label, sceneId, fmt }) {
  const safeRaw   = rawText || '';
  const safeLabel = label  || '';
  const useFmt    = fmt ?? getSceneFormat();

  // 씬번호 prefix ("S#3. " 등) 제거
  const body = safeRaw.replace(SCENE_PREFIX_STRIP_RE, '').trim();

  // 포맷 기반 파싱
  const parsed = parseWithFormat(body, useFmt);

  // location, specialSituation 모두 없으면 원본 content 유지
  if (!parsed.location && !parsed.specialSituation) {
    const content = safeLabel
      ? (body ? `${safeLabel} ${body}` : safeLabel.trim())
      : body;
    return {
      location:         '',
      subLocation:      '',
      timeOfDay:        '',
      specialSituation: '',
      content,
      sceneId,
    };
  }

  // 구조화 필드로 content 재조합
  const content = resolveSceneLabel({
    label:            safeLabel,
    location:         parsed.location         || '',
    subLocation:      parsed.subLocation      || '',
    timeOfDay:        parsed.timeOfDay        || '',
    specialSituation: parsed.specialSituation || '',
  });

  return {
    location:         parsed.location         || '',
    subLocation:      parsed.subLocation      || '',
    timeOfDay:        parsed.timeOfDay        || '',
    specialSituation: parsed.specialSituation || '',
    content,
    sceneId,
  };
}
