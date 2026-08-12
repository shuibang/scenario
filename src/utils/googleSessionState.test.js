import { describe, expect, it } from 'vitest';
import {
  GOOGLE_NO,
  GOOGLE_UNKNOWN,
  GOOGLE_YES,
  classifyGoogleSession,
  shouldShowDriveRetry,
  shouldShowDriveTab,
} from './googleSessionState';

const googleSession = { user: { app_metadata: { provider: 'google' } } };

describe('classifyGoogleSession', () => {
  it('구글 세션이면 google', () => {
    expect(classifyGoogleSession({ session: googleSession })).toBe(GOOGLE_YES);
  });

  it('provider_token만 있어도 google (provider 메타 없는 경우)', () => {
    expect(classifyGoogleSession({ session: { provider_token: 'ya29.x' } })).toBe(GOOGLE_YES);
  });

  it('세션이 없으면 not-google', () => {
    expect(classifyGoogleSession({ session: null })).toBe(GOOGLE_NO);
  });

  it('다른 provider면 not-google', () => {
    expect(classifyGoogleSession({ session: { user: { app_metadata: { provider: 'email' } } } })).toBe(GOOGLE_NO);
  });

  // ── 핵심: 판정 실패를 "구글 사용자 아님"으로 접으면 Drive 탭이 이유 없이 사라진다.
  it('타임아웃은 not-google이 아니라 unknown', () => {
    const r = classifyGoogleSession({ timedOut: true });
    expect(r).toBe(GOOGLE_UNKNOWN);
    expect(r).not.toBe(GOOGLE_NO);
  });

  it('오류도 unknown', () => {
    expect(classifyGoogleSession({ failed: true })).toBe(GOOGLE_UNKNOWN);
  });

  it('빈 입력은 안전하게 처리한다', () => {
    expect(classifyGoogleSession()).toBe(GOOGLE_NO);
    expect(classifyGoogleSession({})).toBe(GOOGLE_NO);
  });
});

describe('shouldShowDriveTab / shouldShowDriveRetry', () => {
  it('구글 사용자에게만 Drive 탭', () => {
    expect(shouldShowDriveTab(GOOGLE_YES)).toBe(true);
    expect(shouldShowDriveTab(GOOGLE_NO)).toBe(false);
    expect(shouldShowDriveTab(GOOGLE_UNKNOWN)).toBe(false);
  });

  it('재시도 UI는 판정 실패일 때만 — 구글 사용자가 아닌 사람에게는 안 보인다', () => {
    expect(shouldShowDriveRetry(GOOGLE_UNKNOWN)).toBe(true);
    expect(shouldShowDriveRetry(GOOGLE_NO)).toBe(false);
    expect(shouldShowDriveRetry(GOOGLE_YES)).toBe(false);
  });

  it('탭과 재시도 UI가 동시에 뜨지 않는다', () => {
    [GOOGLE_YES, GOOGLE_NO, GOOGLE_UNKNOWN].forEach(s => {
      expect(shouldShowDriveTab(s) && shouldShowDriveRetry(s)).toBe(false);
    });
  });
});
