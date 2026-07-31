import { describe, it, expect } from 'vitest';
import { sanitizeHashForAnalytics } from './usePageTracking';

describe('sanitizeHashForAnalytics', () => {
  it('#review=<uuid> → #review (토큰 제거)', () => {
    const uuid = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    const result = sanitizeHashForAnalytics(`#review=${uuid}`);
    expect(result).toBe('#review');
    expect(result).not.toContain(uuid);
  });

  it('#log=<uuid> → #log (토큰 제거)', () => {
    expect(sanitizeHashForAnalytics('#log=9c858901-8a57-4791-81fe-4c455b099bc9')).toBe('#log');
  });

  it('#delivery=<uuid> → #delivery (토큰 제거)', () => {
    expect(sanitizeHashForAnalytics('#delivery=b1946ac9-2f6a-4d17-8f5e-1a2b3c4d5e6f')).toBe('#delivery');
  });

  it('#sl=<base64> → #scene-list (본문 제거)', () => {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ scenes: ['S#1. 카페 (낮)'] }))));
    const result = sanitizeHashForAnalytics(`#sl=${encoded}`);
    expect(result).toBe('#scene-list');
    expect(result).not.toContain(encoded);
  });

  it('토큰 없는 일반 해시는 그대로 통과', () => {
    expect(sanitizeHashForAnalytics('#settings')).toBe('#settings');
    expect(sanitizeHashForAnalytics('#director')).toBe('#director');
  });

  it('빈 해시는 그대로 통과', () => {
    expect(sanitizeHashForAnalytics('')).toBe('');
  });

  it('안전장치: 매핑되지 않은 #foo=value 형태도 값은 제거', () => {
    expect(sanitizeHashForAnalytics('#foo=secret-value')).toBe('#foo');
  });
});
