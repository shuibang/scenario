import { describe, expect, it } from 'vitest';
import {
  CANVAS_H,
  NODE_H,
  NODE_H_PHOTO,
  NODE_W,
  PHOTO_GAP,
  PHOTO_H,
  autoPositions,
  clampPos,
  isValidPos,
  mergePositions,
  nameAnchorOffsetY,
  nodeHeight,
  samePositions,
} from './relationshipLayout';

const W = 700;
const chars = (...ids) => ids.map(id => ({ id }));
const PHOTO = { dataUrl: 'data:image/jpeg;base64,aGk=', w: 80, h: 100 };
const withPhoto = (id, relPos) => ({ id, photo: PHOTO, ...(relPos ? { relPos } : {}) });

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

  it('사진 유무가 섞이면 각자 맞는 높이로 clamp된다', () => {
    const list = [
      { id: 'plain', relPos: { x: 300, y: 9999 } },
      withPhoto('photo', { x: 300, y: 9999 }),
    ];
    const got = mergePositions(list, W);
    expect(got.plain.y).toBe(CANVAS_H - NODE_H / 2);        // 451
    expect(got.photo.y).toBe(CANVAS_H - NODE_H_PHOTO / 2);  // 416.5
  });

  it('사진 없는 캐릭터의 병합 결과는 변경 전과 동일하다 (회귀 방지)', () => {
    const list = [
      { id: 'a', relPos: { x: 120, y: 100 } },   // 범위 안 — 손대지 않음
      { id: 'b', relPos: { x: 9999, y: 9999 } }, // 경계로 clamp
      { id: 'c' },                                // 자동배치
    ];
    const got = mergePositions(list, W);
    expect(got.a).toEqual({ x: 120, y: 100 });
    expect(got.b).toEqual({ x: 645, y: 451 });
    expect(got.c).toEqual(autoPositions(list, W).c);
  });
});

describe('autoPositions — 사진 카드 반경', () => {
  it('사진이 없으면 기존 반경(180)을 그대로 쓴다', () => {
    const list = chars('a', 'b', 'c', 'd');
    const top = list.map(c => autoPositions(list, W)[c.id]).reduce((m, p) => Math.min(m, p.y), Infinity);
    expect(CANVAS_H / 2 - top).toBe(180);
  });

  it('사진이 하나라도 있으면 큰 높이 기준으로 반경을 줄인다', () => {
    const list = [{ id: 'a' }, withPhoto('b')];
    const pos = autoPositions(list, W);
    const top = Math.min(pos.a.y, pos.b.y);
    expect(CANVAS_H / 2 - top).toBe(CANVAS_H / 2 - NODE_H_PHOTO / 2 - 8); // 168.5
  });

  it('사진 카드가 캔버스를 벗어나지 않는다', () => {
    const list = [withPhoto('a'), withPhoto('b'), withPhoto('c'), withPhoto('d')];
    Object.values(autoPositions(list, W)).forEach(p => {
      expect(p.y - NODE_H_PHOTO / 2).toBeGreaterThanOrEqual(0);
      expect(p.y + NODE_H_PHOTO / 2).toBeLessThanOrEqual(CANVAS_H);
    });
  });
});

describe('clampPos', () => {
  it('폭을 아직 못 잰 시점에는 x를 접지 않는다', () => {
    expect(clampPos({ x: 400, y: 100 }, 0)).toEqual({ x: 400, y: 100 });
  });

  // ── 회귀 방지: 사진 없는 카드의 clamp는 높이 인자 도입 전과 완전히 동일해야 한다.
  // 변경 전 상수(NODE_W=110, NODE_H=58, CANVAS_H=480)로 계산한 기대값을 하드코딩한다.
  describe('사진 없는 카드 (회귀 방지)', () => {
    const cases = [
      { pos: { x: 0, y: 0 },        expected: { x: 55, y: 29 } },
      { pos: { x: 9999, y: 9999 },  expected: { x: 645, y: 451 } },   // W-55, CANVAS_H-29
      { pos: { x: 300, y: 240 },    expected: { x: 300, y: 240 } },   // 범위 안 — 그대로
      { pos: { x: 55, y: 29 },      expected: { x: 55, y: 29 } },     // 경계값
      { pos: { x: 645, y: 451 },    expected: { x: 645, y: 451 } },
      { pos: { x: -100, y: 500 },   expected: { x: 55, y: 451 } },
    ];

    it('h 인자를 생략하면 변경 전과 같은 결과', () => {
      cases.forEach(({ pos, expected }) => {
        expect(clampPos(pos, W)).toEqual(expected);
      });
    });

    it('h에 NODE_H를 명시해도 동일 (기본값 = NODE_H 증명)', () => {
      cases.forEach(({ pos, expected }) => {
        expect(clampPos(pos, W, NODE_H)).toEqual(expected);
      });
    });
  });

  it('사진 카드는 더 큰 높이로 좁게 clamp된다', () => {
    const half = NODE_H_PHOTO / 2; // 63.5
    expect(clampPos({ x: 300, y: 0 }, W, NODE_H_PHOTO).y).toBe(half);
    expect(clampPos({ x: 300, y: 9999 }, W, NODE_H_PHOTO).y).toBe(CANVAS_H - half);
    // 사진 없는 카드보다 상하로 좁다
    expect(clampPos({ x: 300, y: 0 }, W, NODE_H_PHOTO).y).toBeGreaterThan(clampPos({ x: 300, y: 0 }, W).y);
  });

  it('x 범위는 사진 유무와 무관하다 (NODE_W 불변)', () => {
    expect(clampPos({ x: 9999, y: 240 }, W, NODE_H_PHOTO).x).toBe(W - NODE_W / 2);
    expect(clampPos({ x: -1, y: 240 }, W, NODE_H_PHOTO).x).toBe(NODE_W / 2);
  });
});

describe('nodeHeight / nameAnchorOffsetY', () => {
  it('카드 높이는 두 종류뿐', () => {
    expect(nodeHeight({ id: 'a' })).toBe(NODE_H);
    expect(nodeHeight({ id: 'a', photo: null })).toBe(NODE_H);
    expect(nodeHeight(withPhoto('a'))).toBe(NODE_H_PHOTO);
  });

  it('사진 없는 카드의 앵커는 카드 중심 — 선 계산이 변경 전과 동일하다', () => {
    expect(nameAnchorOffsetY({ id: 'a' })).toBe(0);
    expect(nameAnchorOffsetY({ id: 'a', photo: { dataUrl: '' } })).toBe(0);
  });

  it('사진 카드의 앵커는 사진 아래 이름 블록 중심', () => {
    expect(nameAnchorOffsetY(withPhoto('a'))).toBe((PHOTO_H + PHOTO_GAP) / 2);
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
