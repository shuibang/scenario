/**
 * blockStyles — 블록 타입별 서식 설정 기본값 및 변환 유틸
 *
 * 저장 키: stylePreset.blockStyles.{sceneNumber|action|dialogueCharName|dialogueSpeech}
 * indent는 탭 수 (0=없음, 1=1탭=8mm, 2=2탭=16mm). 불리언도 수용 (true→1, false→0).
 */

export const DEFAULT_BLOCK_STYLES = {
  sceneNumber:      { bold: true,  italic: false, underline: false, indent: 0 },
  action:           { bold: false, italic: false, underline: false, indent: 1 },
  dialogueCharName: { bold: true,  italic: false, underline: false },
  dialogueSpeech:   { bold: false, italic: false, underline: false },
};

function normalizeIndent(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number')  return Math.max(0, Math.min(2, Math.round(v)));
  return 0;
}

/**
 * 사용자 설정과 기본값 merge — 항상 완전한 객체 반환
 */
export function resolveBlockStyles(userStyles) {
  const u = userStyles || {};
  const sn  = { ...DEFAULT_BLOCK_STYLES.sceneNumber,      ...(u.sceneNumber      || {}) };
  const act = { ...DEFAULT_BLOCK_STYLES.action,            ...(u.action           || {}) };
  const chr = { ...DEFAULT_BLOCK_STYLES.dialogueCharName,  ...(u.dialogueCharName || {}) };
  const spk = { ...DEFAULT_BLOCK_STYLES.dialogueSpeech,    ...(u.dialogueSpeech   || {}) };
  return {
    sceneNumber:      { ...sn,  indent: normalizeIndent(sn.indent)  },
    action:           { ...act, indent: normalizeIndent(act.indent)  },
    dialogueCharName: chr,
    dialogueSpeech:   spk,
  };
}

// ─── 탭 → 각 출력 포맷 단위 변환 (1탭 = 8mm 기준) ─────────────────────────────
const MM_PER_TAB = 8;

export const tabsToMm      = (tabs) => (tabs || 0) * MM_PER_TAB;

// DOCX: convertMillimetersToTwip에 넘길 mm 값 그대로 반환 (라이브러리가 변환)
export const tabsToDocxMm  = tabsToMm;

// HWPX: 1/7200 inch 단위 (mmToHwp 기준)
export const tabsToHwpUnit = (tabs) => Math.round(tabsToMm(tabs) * (7200 / 25.4));
