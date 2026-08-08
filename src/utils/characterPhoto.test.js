import { describe, expect, it } from 'vitest';
import {
  MAX_EDGE,
  MAX_SOURCE_BYTES,
  QUALITY_MIN,
  QUALITY_START,
  TARGET_BYTES,
  estimateDataUrlBytes,
  fitWithin,
  hasPhoto,
  isWithinTarget,
  photoErrorMessage,
  qualitySteps,
  validateSourceFile,
} from './characterPhoto';

const fakeFile = (type, size) => ({ type, size });

describe('validateSourceFile', () => {
  it('이미지가 아니면 거부', () => {
    expect(validateSourceFile(fakeFile('application/pdf', 1000)).code).toBe('not-image');
    expect(validateSourceFile(fakeFile('', 1000)).code).toBe('not-image');
    expect(validateSourceFile(null).code).toBe('not-image');
  });

  it('원본 상한 초과 시 거부', () => {
    expect(validateSourceFile(fakeFile('image/jpeg', MAX_SOURCE_BYTES + 1)).code).toBe('too-large');
    expect(validateSourceFile(fakeFile('image/jpeg', MAX_SOURCE_BYTES)).ok).toBe(true);
  });

  it('일반 이미지는 통과 (HEIC도 여기선 통과 — 디코딩 단계에서 걸린다)', () => {
    expect(validateSourceFile(fakeFile('image/jpeg', 1024)).ok).toBe(true);
    expect(validateSourceFile(fakeFile('image/png', 1024)).ok).toBe(true);
    expect(validateSourceFile(fakeFile('image/heic', 1024)).ok).toBe(true);
  });
});

describe('fitWithin', () => {
  it('장변을 320px로 맞추고 비율을 유지한다', () => {
    expect(fitWithin(4000, 3000)).toEqual({ w: 320, h: 240 });
    expect(fitWithin(3000, 4000)).toEqual({ w: 240, h: 320 });
    expect(fitWithin(1000, 1000)).toEqual({ w: MAX_EDGE, h: MAX_EDGE });
  });

  it('작은 이미지는 확대하지 않는다', () => {
    expect(fitWithin(100, 80)).toEqual({ w: 100, h: 80 });
    expect(fitWithin(320, 200)).toEqual({ w: 320, h: 200 });
  });

  it('비정상 치수는 0으로 떨어진다', () => {
    expect(fitWithin(0, 100)).toEqual({ w: 0, h: 0 });
    expect(fitWithin(NaN, NaN)).toEqual({ w: 0, h: 0 });
  });
});

describe('estimateDataUrlBytes / isWithinTarget', () => {
  it('base64 길이에서 실제 바이트를 추정한다', () => {
    // "hi" → aGk= (padding 1)
    expect(estimateDataUrlBytes('data:image/jpeg;base64,aGk=')).toBe(2);
    expect(estimateDataUrlBytes('data:image/jpeg;base64,YQ==')).toBe(1);
    expect(estimateDataUrlBytes('')).toBe(0);
    expect(estimateDataUrlBytes(null)).toBe(0);
  });

  it('목표 용량 판정', () => {
    const big = `data:image/jpeg;base64,${'A'.repeat(TARGET_BYTES * 2)}`;
    expect(isWithinTarget('data:image/jpeg;base64,aGk=')).toBe(true);
    expect(isWithinTarget(big)).toBe(false);
  });
});

describe('qualitySteps', () => {
  it('0.7에서 0.4까지 단계적으로 낮춘다', () => {
    const steps = qualitySteps();
    expect(steps[0]).toBe(QUALITY_START);
    expect(steps[steps.length - 1]).toBe(QUALITY_MIN);
    expect(steps).toEqual([...steps].sort((a, b) => b - a));
    expect(steps.every(q => q >= QUALITY_MIN && q <= QUALITY_START)).toBe(true);
  });
});

describe('hasPhoto', () => {
  it('사진 없는 기존 캐릭터는 false로 폴백한다', () => {
    expect(hasPhoto({ id: 'a' })).toBe(false);
    expect(hasPhoto({ id: 'a', photo: null })).toBe(false);
    expect(hasPhoto({ id: 'a', photo: {} })).toBe(false);
    expect(hasPhoto(null)).toBe(false);
    expect(hasPhoto(undefined)).toBe(false);
  });

  it('깨진 값도 false', () => {
    expect(hasPhoto({ photo: { dataUrl: '' } })).toBe(false);
    expect(hasPhoto({ photo: { dataUrl: 'https://example.com/a.jpg' } })).toBe(false);
    expect(hasPhoto({ photo: { dataUrl: 123 } })).toBe(false);
  });

  it('정상 data URL이면 true', () => {
    expect(hasPhoto({ photo: { dataUrl: 'data:image/jpeg;base64,aGk=', w: 320, h: 240 } })).toBe(true);
  });
});

describe('photoErrorMessage', () => {
  it('코드별 안내 문구를 준다', () => {
    expect(photoErrorMessage('decode-failed')).toContain('JPG/PNG');
    expect(photoErrorMessage('not-image')).toBeTruthy();
    expect(photoErrorMessage('too-large')).toBeTruthy();
    expect(photoErrorMessage('too-heavy')).toBeTruthy();
    expect(photoErrorMessage('알 수 없는 코드')).toBeTruthy();
  });
});
