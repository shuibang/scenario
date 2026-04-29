/**
 * 평문 텍스트 → scriptBlocks 배열
 * handleEditorPaste의 파싱 로직과 완전히 동일.
 * paste와 HWPX/DOCX 가져오기 모두 이 함수를 사용해 파싱 품질 일관성 확보.
 */
import { buildSceneLabel } from './scenePrefix';
import { splitScenePrefix } from './sceneFormat';
import { genId, now } from '../store/db';

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

  // 연속 빈 줄은 1개로 축약하고, 선/후행 빈 줄은 제거.
  // Why: 한컴에서 씬 헤딩↔본문 사이 빈 줄 1개는 의미 있는 시각 분리자. HWPX 파서가 빈 paragraph를
  //      여러 개 만들 수 있어 그대로 두면 줄간격이 과도해지므로 다중 빈 줄만 압축한다.
  const collapsed = [];
  let prevBlank = false;
  for (const line of lines) {
    const blank = !line.trim();
    if (blank && prevBlank) continue;
    collapsed.push(line);
    prevBlank = blank;
  }
  while (collapsed.length && !collapsed[0].trim()) collapsed.shift();
  while (collapsed.length && !collapsed[collapsed.length - 1].trim()) collapsed.pop();
  if (!collapsed.length) return [];

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

  return collapsed.map(line => {
    const s = line.trim();
    // 빈 줄은 빈 action 블록으로 보존 (paste 핸들러가 단락 사이에 넣는 것과 동일 형태)
    if (!s) return { ...makeBase(currentSceneId), type: 'action', content: '' };

    const { prefix, body } = splitScenePrefix(s);
    if (prefix) {
      currentSceneId = genId();
      sceneSeq++;
      return {
        ...makeBase(currentSceneId),
        type: 'scene_number',
        content: body,
        label: buildSceneLabel(sceneSeq),
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
  });
}
