/**
 * 대본 텍스트 → 씬 목록 + 스토리보드 패널 변환
 */

// ── 씬 패턴 감지 ────────────────────────────────────────────────────────────────

const SCENE_RE      = /^(?:[Ss]cene\s*#?|[Ss]#|씬\s*|#)\s*(\d+)\s*(?:[.。·,，\-–—\/]\s*)?(.*)/;
const NUM_ONLY_RE   = /^(\d+)[.。]\s+(\S.*)/;
const INT_EXT_RE    = /^(INT|EXT|I\/E|E\/I)[.\s]\s*(.*)/i;

function parseSceneLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let m = trimmed.match(SCENE_RE);
  if (m) {
    const { location, timeOfDay } = splitLocationTime((m[2] || '').trim());
    return { sceneNo: m[1], raw: trimmed, location, timeOfDay };
  }
  m = trimmed.match(NUM_ONLY_RE);
  if (m) {
    const { location, timeOfDay } = splitLocationTime((m[2] || '').trim());
    return { sceneNo: m[1], raw: trimmed, location, timeOfDay };
  }
  m = trimmed.match(INT_EXT_RE);
  if (m) {
    const { location, timeOfDay } = splitLocationTime((m[2] || '').trim());
    return { sceneNo: null, raw: trimmed, location: `${m[1].toUpperCase()}. ${location}`.trim(), timeOfDay };
  }
  return null;
}

function splitLocationTime(text) {
  if (!text) return { location: '', timeOfDay: '' };
  const parenMatch = text.match(/^(.*?)\s*[\(（]([^)）]+)[\)）]\s*$/);
  if (parenMatch) return { location: parenMatch[1].trim(), timeOfDay: parenMatch[2].trim() };
  const sepMatch = text.match(/^(.*?)\s*[,，\/\-]\s*(.+)$/);
  if (sepMatch) return { location: sepMatch[1].trim(), timeOfDay: sepMatch[2].trim() };
  return { location: text.trim(), timeOfDay: '' };
}

// 대사 줄 판별: "인물명: 대사" 또는 "인물명  대사"(인물명이 짧고 한글/영문만)
const DIALOGUE_RE = /^([가-힣A-Za-z][가-힣A-Za-z\s]{0,14})\s*[:\：]\s*(.+)/;
// 괄호체 (지문 속 연기 지시)
const PAREN_RE    = /^[\(（].+[\)）]$/;

/**
 * 씬 헤더 사이의 내용 줄들을 지문·대사·괄호체로 분류
 */
function parseContentLines(lines) {
  const actionParts   = [];
  const dialogueParts = [];

  let pendingChar = '';
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    const dm = t.match(DIALOGUE_RE);
    if (dm) {
      pendingChar = dm[1].trim();
      dialogueParts.push(`${pendingChar}: ${dm[2].trim()}`);
      continue;
    }
    if (PAREN_RE.test(t)) {
      // 괄호체 → 직전 대사에 붙이거나 지문에 추가
      if (dialogueParts.length > 0) {
        dialogueParts[dialogueParts.length - 1] += ` ${t}`;
      } else {
        actionParts.push(t);
      }
      pendingChar = '';
      continue;
    }
    // 그 외 → 지문
    pendingChar = '';
    actionParts.push(t);
  }

  return {
    action:   actionParts.join('\n'),
    dialogue: dialogueParts.join('\n'),
  };
}

/**
 * 전체 텍스트 파싱:
 * - 씬 헤더 감지
 * - 헤더 사이 내용 → 지문/대사 분류
 * @returns {Array<{ sceneNo, raw, location, timeOfDay, contentLines }>}
 */
export function parseFullScript(text) {
  const lines   = text.split(/\r?\n/);
  const scenes  = [];
  let current   = null;
  let content   = [];
  let autoNum   = 0;

  const flush = () => {
    if (!current) return;
    current.contentLines = content;
    scenes.push(current);
    content = [];
  };

  for (const line of lines) {
    const parsed = parseSceneLine(line);
    if (parsed) {
      flush();
      if (parsed.sceneNo === null) {
        autoNum++;
        parsed.sceneNo = String(autoNum);
      } else {
        autoNum = parseInt(parsed.sceneNo, 10);
      }
      current = parsed;
    } else if (current) {
      content.push(line);
    }
  }
  flush();
  return scenes;
}

// detectScenes는 씬 헤더만 반환 (미리보기용)
export function detectScenes(text) {
  return parseFullScript(text).map(s => ({ ...s, contentLines: undefined }));
}

// ── 패널 빌드 ─────────────────────────────────────────────────────────────────

export function buildPanelsFromScenes(scenes) {
  return scenes.map((scene, idx) => {
    const cutNo   = String(idx + 1);
    const heading = [scene.location, scene.timeOfDay].filter(Boolean).join(' / ')
                  || scene.raw || `씬 ${scene.sceneNo}`;

    const { action, dialogue } = parseContentLines(scene.contentLines || []);

    return {
      id:             `sb_${Date.now()}_${cutNo}_${Math.random().toString(36).slice(2, 6)}`,
      shotSize:       'MS',
      cameraMove:     'Static',
      transition:     'Cut',
      dialogue,
      action,
      duration:       '3',
      sceneNo:        scene.sceneNo,
      cutNo,
      drawingData:    null,
      _sceneHeading:  heading,
      annotatedBlocks: [],
    };
  });
}
