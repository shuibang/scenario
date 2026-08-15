/**
 * 검토링크 공유용 인물 사진 재축소.
 *
 * 저장된 사진은 장변 320px인데, 링크 payload는 Supabase에 저장되므로 그대로 싣지 않는다.
 * 링크 생성 시점에 한 번 장변 160px로 다시 줄여 담는다 (뷰어에서 줄이지 않는다).
 *
 * 한 장이 실패해도 링크 생성 전체가 실패하면 안 된다 — 그 인물만 사진 없이 진행한다.
 */

import { estimateDataUrlBytes, fitWithin, hasPhoto } from './characterPhoto';

export const SHARE_MAX_EDGE = 160;
export const SHARE_QUALITY = 0.65;

// 사진이 있는 인물만 추린다. 체크박스 노출 여부 판단에도 쓴다.
export function charactersWithPhoto(characters) {
  return (characters || []).filter(hasPhoto);
}

export function hasAnySharablePhoto(characters) {
  return charactersWithPhoto(characters).length > 0;
}

// 재축소 결과를 캐릭터 배열에 다시 얹는다. 실패해 빠진 인물은 사진 없이 남는다.
export function mergeSharePhotos(characters, photoMap) {
  const map = photoMap || {};
  return (characters || []).map(character => {
    const photo = map[character?.id];
    return photo ? { ...character, photo } : character;
  });
}

// payload에 실릴 사진 총량 (bytes). 링크 생성 전 용량 가늠용.
export function totalSharePhotoBytes(photoMap) {
  return Object.values(photoMap || {})
    .reduce((sum, p) => sum + estimateDataUrlBytes(p?.dataUrl), 0);
}

// ── 브라우저 API 사용 ────────────────────────────────────────────────────────

async function decodeDataUrl(dataUrl) {
  if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      return await createImageBitmap(blob);
    } catch { /* 폴백으로 진행 */ }
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = dataUrl;
  });
}

async function shrinkOne(photo) {
  const src = await decodeDataUrl(photo.dataUrl);
  const sw = src.width || src.naturalWidth || 0;
  const sh = src.height || src.naturalHeight || 0;
  const { w, h } = fitWithin(sw, sh, SHARE_MAX_EDGE);
  if (!(w > 0) || !(h > 0)) throw new Error('bad size');

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  src.close?.();

  return { dataUrl: canvas.toDataURL('image/jpeg', SHARE_QUALITY), w, h };
}

/**
 * 사진 있는 인물들을 160px로 재축소한다.
 * @returns {{ photoMap: Record<string, {dataUrl,w,h}>, failed: string[], bytes: number }}
 */
export async function buildSharePhotos(characters) {
  const targets = charactersWithPhoto(characters);
  const photoMap = {};
  const failed = [];

  for (const character of targets) {
    try {
      photoMap[character.id] = await shrinkOne(character.photo);
    } catch (e) {
      // 이 인물만 사진 없이 간다. 링크 생성은 계속된다.
      console.warn('[sharePhoto] 재축소 실패 — 사진 없이 공유합니다:', character.id, e?.message);
      failed.push(character.id);
    }
  }

  return { photoMap, failed, bytes: totalSharePhotoBytes(photoMap) };
}
