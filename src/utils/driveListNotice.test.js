import { describe, expect, it } from 'vitest';
import { shouldShowDriveListNotice } from './driveListNotice';
import {
  LIST_FAILED,
  LIST_OFFLINE,
  LIST_UNAUTHED,
  driveListMessage,
  shouldReportListFailure,
} from './driveListResult';

describe('shouldShowDriveListNotice', () => {
  it('성공이면 알리지 않는다', () => {
    expect(shouldShowDriveListNotice({ ok: true, files: [] })).toBe(false);
    expect(shouldShowDriveListNotice({ ok: true, files: [{ id: 'a' }] })).toBe(false);
  });

  it('오프라인·원인 미상 실패는 로그인 여부와 무관하게 알린다', () => {
    [LIST_OFFLINE, LIST_FAILED].forEach(reason => {
      expect(shouldShowDriveListNotice({ ok: false, reason }, { loggedIn: true })).toBe(true);
      expect(shouldShowDriveListNotice({ ok: false, reason }, { loggedIn: false })).toBe(true);
    });
  });

  // Drive를 한 번도 연결하지 않은 사용자에게 "연결 만료" 안내는 사실과 다르다.
  it('토큰 없음은 로그인한 사용자에게만 알린다', () => {
    expect(shouldShowDriveListNotice({ ok: false, reason: LIST_UNAUTHED }, { loggedIn: true })).toBe(true);
    expect(shouldShowDriveListNotice({ ok: false, reason: LIST_UNAUTHED }, { loggedIn: false })).toBe(false);
  });

  it('기본값(로그인 정보 없음)은 알리지 않는 쪽으로 안전하게 처리한다', () => {
    expect(shouldShowDriveListNotice({ ok: false, reason: LIST_UNAUTHED })).toBe(false);
  });

  it('비정상 입력은 알리지 않는다', () => {
    expect(shouldShowDriveListNotice(null)).toBe(false);
    expect(shouldShowDriveListNotice(undefined)).toBe(false);
  });
});

// ── listAllBackupFiles 선례와 같은 규칙을 쓰는지 확인 (재사용 검증)
describe('driveListResult 재사용', () => {
  it('실패 사유별 문구가 "백업 없음"으로 읽히지 않는다', () => {
    [LIST_OFFLINE, LIST_UNAUTHED, LIST_FAILED].forEach(reason => {
      expect(driveListMessage(reason)).not.toContain('없어요');
      expect(driveListMessage(reason)).not.toContain('없습니다.');
    });
  });

  it('보고 정책은 선례와 동일 — 원인 미상만 보고한다', () => {
    expect(shouldReportListFailure(LIST_FAILED)).toBe(true);
    expect(shouldReportListFailure(LIST_OFFLINE)).toBe(false);
    expect(shouldReportListFailure(LIST_UNAUTHED)).toBe(false);
  });
});
