import { describe, expect, it } from 'vitest';
import {
  CANVAS_H,
  NODE_W,
  autoPositions,
  clampPos,
  isValidPos,
  mergePositions,
  samePositions,
} from './relationshipLayout';

const W = 700;
const chars = (...ids) => ids.map(id => ({ id }));

describe('isValidPos', () => {
  it('숫자 좌표만 유효로 본다', () => {
    expect(isValidPos({ x: 0, y: 0 })).toBe(true);
    expect(isValidPos(null)).toBe(false);
    expect(isValidPos(undefined)).toBe(false);
    expect(isValidPos({ x: 1 })).toBe(false);
    expect(isValidPos({ x: NaN, y: 2 })).toBe(false);
    expect(isValidPos({ x: '10', y: '20' })).toBe(false);
  });
});

describe('mergePositions', () => {
  it('전부 없음 — 모든 캐릭터가 자동배치로 폴백한다', () => {
    const list = chars('a', 'b', 'c');
    const got = mergePositions(list, W);
    expect(Object.keys(got).sort()).toEqual(['a', 'b', 'c']);
    expect(got).toEqual(autoPositions(list, W));
  });

  it('전부 있음 — 자동배치가 저장값을 덮어쓰지 않는다', () => {
    const list = [
      { id: 'a', relPos: { x: 120, y: 100 } },
      { id: 'b', relPos: { x: 300, y: 250 } },
    ];
    const got = mergePositions(list, W);
    expect(got.a).toEqual({ x: 120, y: 100 });
    expect(got.b).toEqual({ x: 300, y: 250 });
    expect(got).not.toEqual(autoPositions(list, W));
  });

  it('일부만 있음 — 저장된 것은 유지, 없는 것만 자동배치', () => {
    const list = [{ id: 'a', relPos: { x: 120, y: 100 } }, { id: 'b' }];
    const auto = autoPositions(list, W);
    const got = mergePositions(list, W);
    expect(got.a).toEqual({ x: 120, y: 100 });
    expect(got.b).toEqual(auto.b);
  });

  it('relPos 없는 캐릭터는 화면에 떠 있던 좌표(prev)를 유지한다', () => {
    const list = [{ id: 'a' }, { id: 'b' }];
    const prev = { a: { x: 55, y: 60 } };
    const got = mergePositions(list, W, prev);
    expect(got.a).toEqual({ x: 55, y: 60 });
    expect(got.b).toEqual(autoPositions(list, W).b);
  });

  it('저장값은 prev보다 우선한다 (드래그 커밋 후 확정)', () => {
    const list = [{ id: 'a', relPos: { x: 200, y: 200 } }];
    const got = mergePositions(list, W, { a: { x: 10, y: 10 } });
    expect(got.a).toEqual({ x: 200, y: 200 });
  });

  it('깨진 relPos는 기존 데이터처럼 자동배치로 폴백한다', () => {
    const list = [{ id: 'a', relPos: null }, { id: 'b', relPos: { x: 'x', y: 1 } }];
    const auto = autoPositions(list, W);
    const got = mergePositions(list, W);
    expect(got.a).toEqual(auto.a);
    expect(got.b).toEqual(auto.b);
  });

  it('새 캐릭터가 추가돼도 기존 카드 위치는 그대로다', () => {
    const before = [{ id: 'a', relPos: { x: 120, y: 100 } }, { id: 'b' }];
    const first = mergePositions(before, W);
    const after = [...before, { id: 'c' }];
    const got = mergePositions(after, W, first);
    expect(got.a).toEqual(first.a);
    expect(got.b).toEqual(first.b);
    expect(got.c).toBeDefined();
  });

  it('삭제된 캐릭터의 좌표는 남지 않는다', () => {
    const got = mergePositions(chars('a'), W, { a: { x: 1, y: 2 }, gone: { x: 3, y: 4 } });
    expect(got.gone).toBeUndefined();
  });

  it('좁은 화면에서는 캔버스 안으로 제한해 표시한다', () => {
    const got = mergePositions([{ id: 'a', relPos: { x: 900, y: 9999 } }], 300);
    expect(got.a.x).toBe(300 - NODE_W / 2);
    expect(got.a.y).toBeLessThanOrEqual(CANVAS_H);
  });

  it('빈 목록은 빈 객체', () => {
    expect(mergePositions([], W)).toEqual({});
  });
});

describe('clampPos', () => {
  it('폭을 아직 못 잰 시점에는 x를 접지 않는다', () => {
    expect(clampPos({ x: 400, y: 100 }, 0)).toEqual({ x: 400, y: 100 });
  });
});

describe('samePositions', () => {
  it('값이 같으면 true, 다르면 false', () => {
    expect(samePositions({ a: { x: 1, y: 2 } }, { a: { x: 1, y: 2 } })).toBe(true);
    expect(samePositions({ a: { x: 1, y: 2 } }, { a: { x: 1, y: 3 } })).toBe(false);
    expect(samePositions({ a: { x: 1, y: 2 } }, {})).toBe(false);
    expect(samePositions({}, { a: { x: 1, y: 2 } })).toBe(false);
  });
});
