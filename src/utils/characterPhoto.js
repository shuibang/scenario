/**
 * 인물 사진(캐스팅 참고용) 축소 유틸.
 *
 * 저장 방식: 업로드 시 클라이언트에서 축소 → data URL로 캐릭터 레코드에 인라인 저장.
 * characters는 projectSerializer가 통째로 직렬화(passthrough)하므로 Drive/.djs에 자동 포함된다.
 *
 * 자동저장이 300ms 디바운스로 프로젝트 전체를 매번 다시 쓰기 때문에, 용량 상한을
 * 반드시 강제한다 — 사진 1장이 커지면 그 비용이 저장할 때마다 반복된다.
 */

// 축소 규격
export const MAX_EDGE = 320;          // 장변 320px
export const QUALITY_START = 0.7;
export const QUALITY_MIN = 0.4;
export const QUALITY_STEP = 0.1;
export const TARGET_BYTES = 80 * 1024;      // 축소 결과 상한 (인물당)
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024; // 원본 파일 상한

export class PhotoError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PhotoError';
    this.code = code;
  }
}

const MESSAGES = {
  'not-image': '이미지 파일만 첨부할 수 있습니다.',
  'too-large': `파일이 너무 큽니다. ${Math.round(MAX_SOURCE_BYTES / 1024 / 1024)}MB 이하 이미지를 선택해 주세요.`,
  'decode-failed': '이 형식은 지원하지 않습니다. JPG/PNG로 변환해 주세요.',
  'too-heavy': '이미지를 충분히 줄이지 못했습니다. 다른 사진을 사용해 주세요.',
};

export function photoErrorMessage(code) {
  return MESSAGES[code] || '사진을 처리하지 못했습니다.';
}

// ── 순수 함수 ────────────────────────────────────────────────────────────────

// 입력 검증 — 디코딩 전에 걸러낼 수 있는 것만.
export function validateSourceFile(file) {
  if (!file) return { ok: false, code: 'not-image' };
  if (!String(file.type || '').startsWith('image/')) return { ok: false, code: 'not-image' };
  if (Number(file.size) > MAX_SOURCE_BYTES) return { ok: false, code: 'too-large' };
  return { ok: true };
}

// 장변을 maxEdge로 맞춘 치수 (확대는 하지 않음).
export function fitWithin(w, h, maxEdge = MAX_EDGE) {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 };
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { w: Math.round(w), h: Math.round(h) };
  const ratio = maxEdge / longest;
  return { w: Math.max(1, Math.round(w * ratio)), h: Math.max(1, Math.round(h * ratio)) };
}

// data URL의 실제 바이트 수 추정 (base64 → 원본 바이트).
export function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return 0;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const b64 = dataUrl.slice(comma + 1);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export function isWithinTarget(dataUrl, target = TARGET_BYTES) {
  return estimateDataUrlBytes(dataUrl) <= target;
}

// 재인코딩 품질 단계 (0.7 → 0.4).
export function qualitySteps(start = QUALITY_START, min = QUALITY_MIN, step = QUALITY_STEP) {
  const steps = [];
  for (let q = start; q >= min - 1e-9; q -= step) steps.push(Math.round(q * 100) / 100);
  return steps;
}

// 사진 유무 판정 — photo는 항상 옵셔널이다. 없으면 기존 UI 그대로 동작해야 한다.
export function hasPhoto(char) {
  const p = char?.photo;
  return !!p && typeof p.dataUrl === 'string' && p.dataUrl.startsWith('data:image/');
}

// ── 디코딩/인코딩 (브라우저 API 사용) ─────────────────────────────────────────

// EXIF 회전 처리: 폰 세로 사진이 눕는 문제 때문에 from-image 경로를 우선한다.
async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // 옵션 미지원 브라우저 — 옵션 없이 한 번 더
      try {
        return await createImageBitmap(file);
      } catch { /* 폴백으로 진행 */ }
    }
  }
  // 폴백: HTMLImageElement (최신 브라우저는 EXIF를 기본 적용한다)
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new PhotoError('decode-failed', MESSAGES['decode-failed']));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sourceSize(src) {
  return { w: src.width || src.naturalWidth || 0, h: src.height || src.naturalHeight || 0 };
}

/**
 * File → { dataUrl, w, h }. 원본은 보관하지 않는다 (축소본만).
 * 실패 시 PhotoError(code)를 던진다 — 호출부에서 photoErrorMessage(code)로 안내.
 */
export async function buildCharacterPhoto(file) {
  const check = validateSourceFile(file);
  if (!check.ok) throw new PhotoError(check.code, MESSAGES[check.code]);

  let src;
  try {
    src = await decodeImage(file);
  } catch (e) {
    if (e instanceof PhotoError) throw e;
    throw new PhotoError('decode-failed', MESSAGES['decode-failed']);
  }

  const { w: sw, h: sh } = sourceSize(src);
  const { w, h } = fitWithin(sw, sh);
  if (!(w > 0) || !(h > 0)) throw new PhotoError('decode-failed', MESSAGES['decode-failed']);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('decode-failed', MESSAGES['decode-failed']);
  // JPEG는 알파가 없다 — 투명 PNG가 검게 나오지 않도록 흰 배경을 깐다.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  src.close?.();

  for (const q of qualitySteps()) {
    const dataUrl = canvas.toDataURL('image/jpeg', q);
    if (isWithinTarget(dataUrl)) return { dataUrl, w, h };
  }
  throw new PhotoError('too-heavy', MESSAGES['too-heavy']);
}
