import { describe, expect, it } from 'vitest';
import {
  SHARE_MAX_EDGE,
  charactersWithPhoto,
  hasAnySharablePhoto,
  mergeSharePhotos,
  totalSharePhotoBytes,
} from './sharePhoto';
import { fitWithin } from './characterPhoto';

const PHOTO = { dataUrl: 'data:image/jpeg;base64,aGk=', w: 226, h: 320 };
const SMALL = { dataUrl: 'data:image/jpeg;base64,YWJjZA==', w: 113, h: 160 };

describe('charactersWithPhoto / hasAnySharablePhoto', () => {
  it('사진 있는 인물만 고른다', () => {
    const chars = [
      { id: 'a', photo: PHOTO },
      { id: 'b' },
      { id: 'c', photo: null },
      { id: 'd', photo: { dataUrl: 'https://example.com/x.jpg' } }, // data URL 아님
    ];
    expect(charactersWithPhoto(chars).map(c => c.id)).toEqual(['a']);
  });

  it('사진이 하나도 없으면 false — 체크박스 노출 판단용', () => {
    expect(hasAnySharablePhoto([{ id: 'a' }, { id: 'b', photo: null }])).toBe(false);
    expect(hasAnySharablePhoto([])).toBe(false);
    expect(hasAnySharablePhoto(null)).toBe(false);
    expect(hasAnySharablePhoto([{ id: 'a', photo: PHOTO }])).toBe(true);
  });
});

describe('mergeSharePhotos', () => {
  it('재축소본이 있는 인물에만 photo를 얹는다', () => {
    const chars = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    const out = mergeSharePhotos(chars, { a: SMALL });
    expect(out[0].photo).toEqual(SMALL);
    expect(out[1]).not.toHaveProperty('photo');
  });

  it('재축소에 실패한 인물은 사진 없이 남는다 (링크 생성은 계속)', () => {
    const out = mergeSharePhotos([{ id: 'a' }, { id: 'b' }], { a: SMALL }); // b 실패
    expect(out.find(c => c.id === 'b')).not.toHaveProperty('photo');
    expect(out).toHaveLength(2);
  });

  it('빈 맵이면 아무것도 얹지 않는다', () => {
    const out = mergeSharePhotos([{ id: 'a', name: 'A' }], {});
    expect(out[0]).not.toHaveProperty('photo');
  });

  it('원본 배열을 변형하지 않는다', () => {
    const chars = [{ id: 'a' }];
    mergeSharePhotos(chars, { a: SMALL });
    expect(chars[0]).not.toHaveProperty('photo');
  });
});

describe('totalSharePhotoBytes', () => {
  it('재축소본 총량을 합산한다', () => {
    expect(totalSharePhotoBytes({})).toBe(0);
    expect(totalSharePhotoBytes(null)).toBe(0);
    expect(totalSharePhotoBytes({ a: SMALL, b: SMALL })).toBeGreaterThan(0);
  });
});

describe('공유 규격', () => {
  it('장변 160px로 줄인다 (저장본 320px의 절반)', () => {
    expect(SHARE_MAX_EDGE).toBe(160);
    expect(fitWithin(226, 320, SHARE_MAX_EDGE)).toEqual({ w: 113, h: 160 });
    expect(fitWithin(320, 240, SHARE_MAX_EDGE)).toEqual({ w: 160, h: 120 });
  });
});
