import { describe, expect, it } from 'vitest';
import {
  FEATURES,
  anonymousUsageResult,
  currentPeriod,
  isSubscriptionActive,
  normalizeUsageResult,
} from './membership';

const NOW = Date.parse('2026-08-16T12:00:00Z');

describe('isSubscriptionActive', () => {
  it('만료일이 미래면 유료', () => {
    expect(isSubscriptionActive({ expires_at: '2026-09-01T00:00:00Z' }, NOW)).toBe(true);
  });

  it('만료일이 과거면 무료', () => {
    expect(isSubscriptionActive({ expires_at: '2026-08-01T00:00:00Z' }, NOW)).toBe(false);
  });

  it('구독 행이 없으면 무료', () => {
    expect(isSubscriptionActive(null, NOW)).toBe(false);
    expect(isSubscriptionActive(undefined, NOW)).toBe(false);
    expect(isSubscriptionActive({}, NOW)).toBe(false);
  });

  it('만료일이 깨져 있으면 무료로 닫는다', () => {
    expect(isSubscriptionActive({ expires_at: 'not-a-date' }, NOW)).toBe(false);
    expect(isSubscriptionActive({ expires_at: null }, NOW)).toBe(false);
  });

  // 획득 경로는 판정에 쓰지 않는다 — 쿠폰이든 결제든 같은 코드로 판정해야
  // 경로가 늘어도 앱이 바뀌지 않는다.
  it('source는 판정에 영향을 주지 않는다', () => {
    const future = '2026-09-01T00:00:00Z';
    ['wadiz_coupon', 'toss', 'unknown', null, undefined].forEach(source => {
      expect(isSubscriptionActive({ expires_at: future, source }, NOW)).toBe(true);
    });
  });

  it('만료 시각 자체는 만료로 본다 (경계)', () => {
    expect(isSubscriptionActive({ expires_at: new Date(NOW).toISOString() }, NOW)).toBe(false);
    expect(isSubscriptionActive({ expires_at: new Date(NOW + 1).toISOString() }, NOW)).toBe(true);
  });
});

describe('currentPeriod', () => {
  it('YYYY-MM 형태', () => {
    expect(currentPeriod(new Date('2026-08-16T12:00:00Z'))).toBe('2026-08');
  });

  // 서버 RPC도 Asia/Seoul 기준이라 클라이언트가 같은 값을 계산해야 한다.
  it('한국 시간 기준으로 월이 넘어간다', () => {
    // UTC 2026-08-31 15:00 = KST 2026-09-01 00:00
    expect(currentPeriod(new Date('2026-08-31T15:00:00Z'))).toBe('2026-09');
    expect(currentPeriod(new Date('2026-08-31T14:59:59Z'))).toBe('2026-08');
  });

  it('연말 경계', () => {
    expect(currentPeriod(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01');
  });
});

describe('normalizeUsageResult', () => {
  it('무료 사용자의 허용 응답', () => {
    const r = normalizeUsageResult({ allowed: true, remaining: 2, is_premium: false, used: 1, period: '2026-08' });
    expect(r).toEqual({ allowed: true, remaining: 2, isPremium: false, used: 1, period: '2026-08', reason: null });
  });

  it('유료는 remaining이 null (무제한)', () => {
    const r = normalizeUsageResult({ allowed: true, remaining: null, is_premium: true, used: 0 });
    expect(r.isPremium).toBe(true);
    expect(r.remaining).toBeNull();
  });

  it('한도 소진', () => {
    const r = normalizeUsageResult({ allowed: false, remaining: 0, is_premium: false, used: 3, reason: 'LIMIT_REACHED' });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('LIMIT_REACHED');
  });

  // 판정 실패를 허용으로 열어주면 한도가 무의미해진다.
  it('응답이 없거나 깨져 있으면 사용 불가로 닫는다', () => {
    [null, undefined, 'x', 123].forEach(raw => {
      const r = normalizeUsageResult(raw);
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('INVALID_RESPONSE');
    });
  });

  it('allowed가 명시적 true가 아니면 허용하지 않는다', () => {
    expect(normalizeUsageResult({ allowed: 'true' }).allowed).toBe(false);
    expect(normalizeUsageResult({ allowed: 1 }).allowed).toBe(false);
    expect(normalizeUsageResult({}).allowed).toBe(false);
  });
});

describe('anonymousUsageResult', () => {
  it('로그인하지 않으면 항상 무료·사용 불가', () => {
    const r = anonymousUsageResult();
    expect(r.allowed).toBe(false);
    expect(r.isPremium).toBe(false);
    expect(r.reason).toBe('AUTH_REQUIRED');
  });
});

describe('FEATURES', () => {
  it('기능 키가 서버에 넘길 문자열과 일치한다', () => {
    expect(FEATURES.AI_FEEDBACK).toBe('ai_feedback');
  });
});
