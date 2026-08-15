import { describe, expect, it } from 'vitest';
import {
  failureResult,
  foundResult,
  isMissing,
  missingResult,
  unauthedResult,
} from './driveReadResult';
import { LIST_FAILED, LIST_OFFLINE, LIST_UNAUTHED } from './driveListResult';

describe('driveReadResult', () => {
  // 404·미발견은 정상 흐름이다. 이걸 실패로 처리하면 신규 사용자에게 매번 오류가 뜬다.
  it('404·미발견은 성공 + 데이터 없음', () => {
    const r = missingResult();
    expect(r.ok).toBe(true);
    expect(r.data).toBeNull();
    expect(isMissing(r)).toBe(true);
  });

  it('조회 성공은 데이터를 담아 돌려준다', () => {
    const r = foundResult({ ideas: [{ id: 'a' }] });
    expect(r.ok).toBe(true);
    expect(r.data.ideas).toHaveLength(1);
    expect(isMissing(r)).toBe(false);
  });

  it('네트워크 실패는 실패로 분류된다', () => {
    const r = failureResult(Object.assign(new Error('Failed to fetch'), {}));
    expect(r.ok).toBe(false);
    expect(r.data).toBeNull();
    expect([LIST_FAILED, LIST_OFFLINE]).toContain(r.reason);
    expect(isMissing(r)).toBe(false);
  });

  it('401은 인증 실패로 분류된다', () => {
    const err = Object.assign(new Error('Drive 파일 읽기 실패: 401'), { driveStatus: 401 });
    expect(failureResult(err).reason).toBe(LIST_UNAUTHED);
  });

  it('5xx는 원인 미상 실패', () => {
    const err = Object.assign(new Error('boom'), { driveStatus: 500 });
    expect(failureResult(err).reason).toBe(LIST_FAILED);
  });

  it('토큰이 없어 시도조차 못한 경우도 실패다', () => {
    const r = unauthedResult();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(LIST_UNAUTHED);
    expect(isMissing(r)).toBe(false);
  });

  it('실패는 "없음"으로 오인되지 않는다', () => {
    [failureResult(new Error('x')), unauthedResult()].forEach(r => {
      expect(isMissing(r)).toBe(false);
    });
  });
});
