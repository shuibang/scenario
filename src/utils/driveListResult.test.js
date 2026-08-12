import { describe, expect, it } from 'vitest';
import {
  LIST_FAILED,
  LIST_OFFLINE,
  LIST_UNAUTHED,
  classifyListFailure,
  driveListMessage,
  shouldReportListFailure,
} from './driveListResult';

describe('classifyListFailure', () => {
  it('오프라인이면 무엇이 던져졌든 offline', () => {
    expect(classifyListFailure(new Error('Failed to fetch'), { offline: true })).toBe(LIST_OFFLINE);
    expect(classifyListFailure({ driveStatus: 401 }, { offline: true })).toBe(LIST_OFFLINE);
  });

  it('401은 unauthed', () => {
    expect(classifyListFailure({ driveStatus: 401 }, { offline: false })).toBe(LIST_UNAUTHED);
  });

  it('그 외는 failed', () => {
    expect(classifyListFailure(new Error('boom'), { offline: false })).toBe(LIST_FAILED);
    expect(classifyListFailure({ driveStatus: 500 }, { offline: false })).toBe(LIST_FAILED);
    expect(classifyListFailure(undefined, { offline: false })).toBe(LIST_FAILED);
  });
});

describe('driveListMessage', () => {
  it('사유별로 다른 안내를 준다', () => {
    expect(driveListMessage(LIST_OFFLINE)).toContain('인터넷');
    expect(driveListMessage(LIST_UNAUTHED)).toContain('연결');
    expect(driveListMessage(LIST_FAILED)).toBeTruthy();
    expect(driveListMessage(undefined)).toBeTruthy(); // 사유 미상도 문구가 나온다
  });

  // ── 핵심: 어떤 실패 문구도 "백업이 없다"로 읽히면 안 된다.
  it('실패 문구가 "저장된 파일이 없어요"로 읽히지 않는다', () => {
    [LIST_OFFLINE, LIST_UNAUTHED, LIST_FAILED, undefined].forEach(r => {
      expect(driveListMessage(r)).not.toContain('없어요');
    });
    expect(driveListMessage(LIST_FAILED)).toContain('사라진 것은 아닙니다');
  });
});

describe('shouldReportListFailure', () => {
  it('오프라인·토큰만료는 보고하지 않는다 (노이즈)', () => {
    expect(shouldReportListFailure(LIST_OFFLINE)).toBe(false);
    expect(shouldReportListFailure(LIST_UNAUTHED)).toBe(false);
  });

  it('원인 미상 실패만 보고한다', () => {
    expect(shouldReportListFailure(LIST_FAILED)).toBe(true);
  });
});
