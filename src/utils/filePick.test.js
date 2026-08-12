import { describe, expect, it } from 'vitest';
import {
  PICK_CANCELED,
  PICK_LOST,
  PICK_SELECTED,
  classifyFilePick,
} from './filePick';

describe('classifyFilePick', () => {
  it('파일이 오면 선택 성공', () => {
    expect(classifyFilePick({ changeFired: true, hasFile: true })).toBe(PICK_SELECTED);
  });

  it('cancel 이벤트는 사용자 취소', () => {
    expect(classifyFilePick({ cancelFired: true })).toBe(PICK_CANCELED);
  });

  it('change가 왔는데 파일이 없으면 취소로 본다', () => {
    expect(classifyFilePick({ changeFired: true, hasFile: false })).toBe(PICK_CANCELED);
  });

  it('아무 이벤트도 없이 다이얼로그가 닫히면 유실', () => {
    expect(classifyFilePick({})).toBe(PICK_LOST);
    expect(classifyFilePick()).toBe(PICK_LOST);
  });

  it('파일이 있으면 cancel 이벤트보다 우선한다', () => {
    // Safari에서 change와 cancel이 함께 오는 경우 대비
    expect(classifyFilePick({ changeFired: true, cancelFired: true, hasFile: true })).toBe(PICK_SELECTED);
  });

  it('취소와 유실을 구분한다 — 취소는 오류로 보고하지 않기 위한 핵심 구분', () => {
    expect(classifyFilePick({ cancelFired: true })).not.toBe(PICK_LOST);
    expect(classifyFilePick({ changeFired: false, cancelFired: false })).not.toBe(PICK_CANCELED);
  });

  // ── 늦게 도착한 선택도 살린다. 유실 의심을 알린 뒤 change가 와도 결과는 '선택 성공'이라야
  // 사용자가 고른 파일이 버려지지 않는다(오탐 비용 > 미탐 비용).
  it('유실을 알린 뒤 늦게 파일이 와도 선택 성공으로 분류한다', () => {
    expect(classifyFilePick({ changeFired: true, hasFile: true })).toBe(PICK_SELECTED);
  });

  it('포커스만 돌아온 상태(이벤트 없음)는 성공/취소로 오인하지 않는다', () => {
    const r = classifyFilePick({ changeFired: false, cancelFired: false, hasFile: false });
    expect(r).not.toBe(PICK_SELECTED);
    expect(r).not.toBe(PICK_CANCELED);
    expect(r).toBe(PICK_LOST);
  });

  it('cancel 뒤 파일이 없으면 취소 — 취소 경로도 반드시 종료된다', () => {
    expect(classifyFilePick({ cancelFired: true, hasFile: false })).toBe(PICK_CANCELED);
    expect(classifyFilePick({ changeFired: true, cancelFired: true, hasFile: false })).toBe(PICK_CANCELED);
  });
});
