import { describe, expect, it } from 'vitest';
import {
  PULL_FAILED,
  PULL_NO_REMOTE,
  PULL_OK,
  classifyIdeasPull,
  shouldMarkDirtyOnPull,
} from './ideasPull';

describe('classifyIdeasPull', () => {
  it('원격 배열을 받으면 ok', () => {
    expect(classifyIdeasPull({ ok: true, ideas: [] })).toBe(PULL_OK);
    expect(classifyIdeasPull({ ok: true, ideas: [{ id: 'a' }] })).toBe(PULL_OK);
  });

  it('조회는 됐지만 원격에 파일이 없으면 no-remote (신규 사용자)', () => {
    expect(classifyIdeasPull({ ok: true, ideas: null })).toBe(PULL_NO_REMOTE);
  });

  it('조회 실패는 failed', () => {
    expect(classifyIdeasPull({ ok: false, reason: 'offline' })).toBe(PULL_FAILED);
    expect(classifyIdeasPull({ ok: false, reason: 'unauthed' })).toBe(PULL_FAILED);
    expect(classifyIdeasPull({ ok: false, reason: 'failed' })).toBe(PULL_FAILED);
  });

  it('비정상 입력은 안전하게 failed로 본다 (없음으로 오인하지 않는다)', () => {
    expect(classifyIdeasPull(null)).toBe(PULL_FAILED);
    expect(classifyIdeasPull(undefined)).toBe(PULL_FAILED);
    expect(classifyIdeasPull({})).toBe(PULL_FAILED);
    expect(classifyIdeasPull([])).toBe(PULL_FAILED);
  });
});

// ── 이번 수정의 핵심.
// 실패인데 dirty를 켜면 다음 push가 원격을 덮어써 다른 기기의 아이디어가 사라진다.
describe('shouldMarkDirtyOnPull', () => {
  it('조회 실패에서는 절대 dirty를 켜지 않는다', () => {
    expect(shouldMarkDirtyOnPull(PULL_FAILED)).toBe(false);
  });

  it('원격에 파일이 없을 때만 dirty를 켠다 (기존 첫 동기화 동작 유지)', () => {
    expect(shouldMarkDirtyOnPull(PULL_NO_REMOTE)).toBe(true);
  });

  it('정상 pull에서는 여기서 켜지 않는다 (머지 후 비교 로직이 판단)', () => {
    expect(shouldMarkDirtyOnPull(PULL_OK)).toBe(false);
  });

  it('실패 결과들이 하나도 dirty를 켜지 않는다', () => {
    [
      { ok: false, reason: 'offline' },
      { ok: false, reason: 'unauthed' },
      { ok: false, reason: 'failed' },
      null,
      undefined,
      {},
    ].forEach(result => {
      expect(shouldMarkDirtyOnPull(classifyIdeasPull(result))).toBe(false);
    });
  });

  it('원격 없음만 dirty를 켠다 — 회귀 방지', () => {
    expect(shouldMarkDirtyOnPull(classifyIdeasPull({ ok: true, ideas: null }))).toBe(true);
  });
});
