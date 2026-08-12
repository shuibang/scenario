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
});
