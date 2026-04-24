import { describe, it, expect } from 'vitest';
import { describeDriveError } from './driveError';

function mkErr(status, reason, message = `Test: ${status}`) {
  const e = new Error(message);
  e.driveStatus = status;
  e.driveReason = reason;
  return e;
}

describe('describeDriveError', () => {
  it('DRIVE_AUTH_REQUIRED 센티넬 → auth', () => {
    const r = describeDriveError(new Error('DRIVE_AUTH_REQUIRED'));
    expect(r.kind).toBe('auth');
    expect(r.userMsg).toMatch(/로그인/);
  });

  it('HTTP 401 → auth', () => {
    expect(describeDriveError(mkErr(401)).kind).toBe('auth');
  });

  it('HTTP 403 + storageQuotaExceeded → quota', () => {
    const r = describeDriveError(mkErr(403, 'storageQuotaExceeded'));
    expect(r.kind).toBe('quota');
    expect(r.userMsg).toMatch(/용량/);
  });

  it('HTTP 403 + insufficientPermissions → perm', () => {
    expect(describeDriveError(mkErr(403, 'insufficientPermissions')).kind).toBe('perm');
  });

  it('HTTP 403 + appNotAuthorizedToFile → perm', () => {
    expect(describeDriveError(mkErr(403, 'appNotAuthorizedToFile')).kind).toBe('perm');
  });

  it('HTTP 403 reason 없음 → perm (기타 403)', () => {
    const r = describeDriveError(mkErr(403));
    expect(r.kind).toBe('perm');
    expect(r.userMsg).toMatch(/권한/);
  });

  it('HTTP 429 → rate', () => {
    expect(describeDriveError(mkErr(429)).kind).toBe('rate');
  });

  it('HTTP 403 + userRateLimitExceeded → rate (403 권한보다 우선)', () => {
    expect(describeDriveError(mkErr(403, 'userRateLimitExceeded')).kind).toBe('rate');
  });

  it('HTTP 413 → size', () => {
    expect(describeDriveError(mkErr(413)).kind).toBe('size');
  });

  it('HTTP 500 → server', () => {
    expect(describeDriveError(mkErr(500)).kind).toBe('server');
  });

  it('HTTP 503 → server', () => {
    expect(describeDriveError(mkErr(503)).kind).toBe('server');
  });

  it('status 없음 (fetch 실패) → network', () => {
    const r = describeDriveError(new Error('Failed to fetch'));
    expect(r.kind).toBe('network');
    expect(r.userMsg).toMatch(/네트워크/);
  });

  it('null/undefined → unknown', () => {
    expect(describeDriveError(null).kind).toBe('unknown');
    expect(describeDriveError(undefined).kind).toBe('unknown');
  });

  it('알 수 없는 status → unknown', () => {
    expect(describeDriveError(mkErr(418)).kind).toBe('unknown');
  });
});
