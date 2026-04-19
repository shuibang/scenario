/**
 * 평문 텍스트 → scriptBlocks 배열
 * handleEditorPaste의 파싱 로직과 완전히 동일.
 * paste와 HWPX/DOCX 가져오기 모두 이 함수를 사용해 파싱 품질 일관성 확보.
 */
import { buildSceneLabel } from './scenePrefix';
import { genId, now } from '../store/db';

const SCENE_RE = /^(S#\d+\.?|s#\d+\.?|씬\s*\d+\.?|\d+씬\.?|#\d+\.?|\d+\.\s)/i;
const PAREN_RE = /^\s*\(.*\)\s*$/;

function detectDialogue(line, charNameSet) {
  const s = line.trim();
  const tabM = s.match(/^([^\t]+)\t(.+)$/);
  if (tabM) return { name: tabM[1].trim(), text: tabM[2].trim() };
  const colonM = s.match(/^([가-힣A-Za-z·\s]{1,8})\s*[：:]\s*(.+)$/);
  if (colonM) return { name: colonM[1].trim(), text: colonM[2].trim() };
  for (const name of charNameSet) {
    if (s.startsWith(name) && s.length > name.length) {
      const after = s.slice(name.length);
      if (/^\s{2,}/.test(after)) return { name, text: after.trim() };
    }
  }
  return null;
}

/**
 * @param {string} text - 파싱할 평문 (handleEditorPaste와 동일한 입력 포맷)
 * @param {{ episodeId: string, projectId: string, characters?: Array }} ctx
 * @returns {Array} scriptBlocks — label 포함 (scene_number 블록에 S#n. 할당)
 */
export function parseScriptText(text, { episodeId, projectId, characters = [] }) {
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.filter(l => l.trim());
  if (!nonEmpty.length) return [];

  const charNameSet = new Set(
    characters.flatMap(c =>
      [c.name, c.givenName, c.surname ? c.surname + c.givenName : null].filter(Boolean)
    )
  );

  const makeBase = (sceneId) => ({
    id: genId(), episodeId, projectId,
    label: '', sceneId: sceneId || genId(), createdAt: now(), updatedAt: now(),
  });

  let currentSceneId = genId();
  let sceneSeq = 0;

  return nonEmpty.map(line => {
    const s = line.trim();
    if (!s) return null;

    if (SCENE_RE.test(s)) {
      currentSceneId = genId();
      sceneSeq++;
      const content = s.replace(SCENE_RE, '').trim();
      return {
        ...makeBase(currentSceneId),
        type: 'scene_number',
        content,
        label: buildSceneLabel(sceneSeq), // syncLabels 역할 — CSS ::before 표시용
      };
    }

    if (PAREN_RE.test(s)) {
      return {
        ...makeBase(currentSceneId),
        type: 'parenthetical',
        content: s.replace(/^\s*\(|\)\s*$/g, '').trim(),
      };
    }

    const diag = detectDialogue(line, charNameSet);
    if (diag) {
      const char = characters.find(c =>
        [c.name, c.givenName, c.surname ? c.surname + c.givenName : null]
          .filter(Boolean).includes(diag.name)
      );
      return {
        ...makeBase(currentSceneId),
        type: 'dialogue',
        content:       diag.text,
        characterId:   char?.id || '',
        characterName: char?.givenName || char?.name || diag.name,
        charName:      char?.givenName || char?.name || diag.name,
      };
    }

    return { ...makeBase(currentSceneId), type: 'action', content: s };
  }).filter(Boolean);
}
