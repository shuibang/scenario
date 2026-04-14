/**
 * 외부 파일(DOCX / HWPX / PDF)에서 텍스트를 추출하고
 * 씬 헤더 패턴을 감지해 스토리보드 패널 배열로 변환합니다.
 */

// ── 텍스트 추출 ────────────────────────────────────────────────────────────────

/** DOCX → 텍스트 (mammoth) */
export async function extractTextFromDocx(file) {
  const mammoth = (await import('mammoth')).default ?? (await import('mammoth'));
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || '';
}

/** HWPX → 텍스트 (JSZip + XML 파싱) */
export async function extractTextFromHwpx(file) {
  const JSZip = (await import('jszip')).default;
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // HWPX 구조: Contents/section*.xml 에 단락 데이터가 있음
  const sectionFiles = Object.keys(zip.files).filter(
    name => /^Contents\/[Ss]ection\d*\.xml$/i.test(name)
  );
  if (sectionFiles.length === 0) {
    throw new Error('HWPX 파일 구조를 인식할 수 없습니다. 파일이 손상됐거나 지원하지 않는 형식입니다.');
  }

  const lines = [];
  for (const fname of sectionFiles.sort()) {
    const xml = await zip.files[fname].async('string');
    // <hp:t> 태그 안의 텍스트 추출
    const matches = xml.matchAll(/<hp:t[^>]*>([^<]*)<\/hp:t>/g);
    const paraTexts = [];
    for (const m of matches) {
      paraTexts.push(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'));
    }
    // <hp:p> 단락 단위로 줄바꿈 (단락 끝 위치를 xml에서 찾아 구분)
    // 간단하게: </hp:p> 기준으로 분리
    const paras = xml.split('</hp:p>');
    for (const para of paras) {
      const ts = [...para.matchAll(/<hp:t[^>]*>([^<]*)<\/hp:t>/g)].map(m =>
        m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      );
      const line = ts.join('').trim();
      if (line) lines.push(line);
    }
  }
  return lines.join('\n');
}

/** PDF → 텍스트 (pdfjs-dist) */
export async function extractTextFromPdf(file) {
  const pdfjsLib = await import('pdfjs-dist');
  // 워커 경로 설정 (CDN 사용해 번들 크기 절약)
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    pageTexts.push(pageText);
  }
  const fullText = pageTexts.join('\n');

  // 텍스트가 거의 없으면 스캔본일 가능성
  const wordCount = fullText.replace(/\s+/g, ' ').trim().split(' ').length;
  if (wordCount < 20) {
    throw new Error('SCAN_ONLY');
  }
  return fullText;
}

// ── 씬 패턴 감지 ────────────────────────────────────────────────────────────────

/**
 * 지원 패턴 (공백/탭 허용):
 *   S#1.  S#1/  S#1-  S#1 장소  S#1. 장소, 시간
 *   씬1.  씬 1.  씬1/  scene 1.
 *   INT.  EXT.  (영문 대본)
 */
const SCENE_PATTERNS = [
  // S#숫자 계열
  /^[Ss]#\s*(\d+)\s*[./\-\s,]\s*(.*)/,
  /^[Ss]#\s*(\d+)\s*$/,
  // 씬 숫자 계열
  /^씬\s*(\d+)\s*[./\-\s,]\s*(.*)/,
  /^씬\s*(\d+)\s*$/,
  // scene 숫자
  /^[Ss][Cc][Ee][Nn][Ee]\s*(\d+)\s*[./\-\s,]\s*(.*)/,
  // INT./EXT. (영문 대본)
  /^(INT|EXT|I\/E|E\/I)[\.\s]\s*(.*)/i,
];

/**
 * 한 줄에서 씬 정보를 파싱
 * @returns {{ sceneNo: string, raw: string, location: string, timeOfDay: string } | null}
 */
function parseSceneLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // S#N / 씬N 계열
  for (const pat of SCENE_PATTERNS.slice(0, 5)) {
    const m = trimmed.match(pat);
    if (m) {
      const num  = m[1];
      const rest = (m[2] || '').trim();
      const { location, timeOfDay } = splitLocationTime(rest);
      return { sceneNo: num, raw: trimmed, location, timeOfDay };
    }
  }

  // INT./EXT. 계열 → 씬번호는 순번 할당 (null)
  const intExt = trimmed.match(SCENE_PATTERNS[5]);
  if (intExt) {
    const intExt2 = intExt[1].toUpperCase();
    const rest = (intExt[2] || '').trim();
    const { location, timeOfDay } = splitLocationTime(rest);
    return { sceneNo: null, raw: trimmed, location: `${intExt2}. ${location}`.trim(), timeOfDay };
  }

  return null;
}

/**
 * "장소, 시간" / "장소 / 시간" / "장소 (시간)" / "장소 - 시간" 분리
 */
function splitLocationTime(text) {
  if (!text) return { location: '', timeOfDay: '' };

  // 괄호 안을 시간대로
  const parenMatch = text.match(/^(.*?)\s*[\(（]([^)）]+)[\)）]\s*$/);
  if (parenMatch) return { location: parenMatch[1].trim(), timeOfDay: parenMatch[2].trim() };

  // 슬래시, 콤마, 하이픈 기준 분리 (첫 번째 구분자)
  const sepMatch = text.match(/^(.*?)\s*[,，\/\-]\s*(.+)$/);
  if (sepMatch) return { location: sepMatch[1].trim(), timeOfDay: sepMatch[2].trim() };

  return { location: text.trim(), timeOfDay: '' };
}

/**
 * 전체 텍스트에서 씬 목록 추출
 * @param {string} text
 * @returns {Array<{ sceneNo: string|null, raw: string, location: string, timeOfDay: string }>}
 */
export function detectScenes(text) {
  const lines = text.split(/\r?\n/);
  const scenes = [];
  let autoNum = 0;

  for (const line of lines) {
    const parsed = parseSceneLine(line);
    if (parsed) {
      if (parsed.sceneNo === null) {
        autoNum++;
        parsed.sceneNo = String(autoNum);
      } else {
        autoNum = parseInt(parsed.sceneNo, 10);
      }
      scenes.push(parsed);
    }
  }
  return scenes;
}

// ── 패널 빌드 ────────────────────────────────────────────────────────────────

/**
 * 감지된 씬 배열 → 스토리보드 패널 배열
 * DirectorDashboard의 parseScriptBlocksForDirector 출력과 동일한 구조
 */
export function buildPanelsFromScenes(scenes) {
  return scenes.map((scene, idx) => {
    const cutNo = String(idx + 1);
    const heading = [
      scene.location,
      scene.timeOfDay,
    ].filter(Boolean).join(' / ') || scene.raw || `씬 ${scene.sceneNo}`;

    // 장소/시간 정보를 action 텍스트로 미리 채워줌
    const actionLines = [];
    if (scene.location) actionLines.push(`장소: ${scene.location}`);
    if (scene.timeOfDay) actionLines.push(`시간: ${scene.timeOfDay}`);

    return {
      id:           `sb_${Date.now()}_${cutNo}_${Math.random().toString(36).slice(2, 6)}`,
      shotSize:     'MS',
      cameraMove:   'Static',
      transition:   'Cut',
      dialogue:     '',
      action:       actionLines.join('\n'),
      duration:     '3',
      sceneNo:      scene.sceneNo,
      cutNo,
      drawingData:  null,
      _sceneHeading: heading,
      annotatedBlocks: [],
    };
  });
}

// ── 파일 확장자 헬퍼 ──────────────────────────────────────────────────────────

export function getFileExt(filename) {
  return (filename || '').split('.').pop().toLowerCase();
}

export function isSupportedExt(ext) {
  return ['docx', 'hwpx', 'pdf'].includes(ext);
}
