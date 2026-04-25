import { describe, expect, it } from 'vitest';
import { detectScriptBlockDuplicates } from './dedupBlocks';

describe('detectScriptBlockDuplicates', () => {
  it('중복 없으면 hasDuplicates=false', () => {
    const blocks = [
      { id: 'a', episodeId: 'ep1' },
      { id: 'b', episodeId: 'ep1' },
      { id: 'c', episodeId: 'ep2' },
    ];
    const r = detectScriptBlockDuplicates(blocks);
    expect(r.hasDuplicates).toBe(false);
    expect(r.duplicateKeys).toEqual([]);
    expect(r.totalDuplicates).toBe(0);
    expect(r.totalBlocks).toBe(3);
  });

  it('(episodeId, id) 1쌍 중복 → totalDuplicates=1', () => {
    const blocks = [
      { id: 'a', episodeId: 'ep1' },
      { id: 'a', episodeId: 'ep1' },
      { id: 'b', episodeId: 'ep1' },
    ];
    const r = detectScriptBlockDuplicates(blocks);
    expect(r.hasDuplicates).toBe(true);
    expect(r.duplicateKeys).toEqual([{ key: 'ep1:a', count: 2 }]);
    expect(r.totalDuplicates).toBe(1);
    expect(r.totalBlocks).toBe(3);
  });

  it('같은 키 3개 → totalDuplicates=2 (초과분만 카운트)', () => {
    const blocks = [
      { id: 'a', episodeId: 'ep1' },
      { id: 'a', episodeId: 'ep1' },
      { id: 'a', episodeId: 'ep1' },
    ];
    const r = detectScriptBlockDuplicates(blocks);
    expect(r.hasDuplicates).toBe(true);
    expect(r.duplicateKeys).toEqual([{ key: 'ep1:a', count: 3 }]);
    expect(r.totalDuplicates).toBe(2);
  });

  it('여러 다른 키 중복 → 각각 카운트', () => {
    const blocks = [
      { id: 'a', episodeId: 'ep1' },
      { id: 'a', episodeId: 'ep1' },
      { id: 'b', episodeId: 'ep2' },
      { id: 'b', episodeId: 'ep2' },
      { id: 'b', episodeId: 'ep2' },
    ];
    const r = detectScriptBlockDuplicates(blocks);
    expect(r.hasDuplicates).toBe(true);
    expect(r.duplicateKeys).toEqual(
      expect.arrayContaining([
        { key: 'ep1:a', count: 2 },
        { key: 'ep2:b', count: 3 },
      ]),
    );
    expect(r.totalDuplicates).toBe(3); // (2-1) + (3-1) = 3
  });

  it('id 없는 블록은 스킵 (중복 계산 제외)', () => {
    const blocks = [
      { id: 'a', episodeId: 'ep1' },
      { episodeId: 'ep1' },
      { id: '', episodeId: 'ep1' },
      { id: 'a', episodeId: 'ep1' },
    ];
    const r = detectScriptBlockDuplicates(blocks);
    expect(r.duplicateKeys).toEqual([{ key: 'ep1:a', count: 2 }]);
    expect(r.totalDuplicates).toBe(1);
    expect(r.totalBlocks).toBe(4); // totalBlocks는 원본 배열 길이 그대로
  });

  it('빈 배열 → hasDuplicates=false', () => {
    const r = detectScriptBlockDuplicates([]);
    expect(r).toEqual({
      hasDuplicates: false,
      duplicateKeys: [],
      totalDuplicates: 0,
      totalBlocks: 0,
    });
  });

  it('null/undefined/비배열 → 안전 처리', () => {
    const zero = { hasDuplicates: false, duplicateKeys: [], totalDuplicates: 0, totalBlocks: 0 };
    expect(detectScriptBlockDuplicates(null)).toEqual(zero);
    expect(detectScriptBlockDuplicates(undefined)).toEqual(zero);
    expect(detectScriptBlockDuplicates('not array')).toEqual(zero);
    expect(detectScriptBlockDuplicates({})).toEqual(zero);
  });

  it('같은 id 다른 episodeId는 중복 아님', () => {
    const blocks = [
      { id: 'a', episodeId: 'ep1' },
      { id: 'a', episodeId: 'ep2' },
    ];
    const r = detectScriptBlockDuplicates(blocks);
    expect(r.hasDuplicates).toBe(false);
  });

  it('입력 배열을 변경하지 않음 (read-only)', () => {
    const original = [
      { id: 'a', episodeId: 'ep1' },
      { id: 'a', episodeId: 'ep1' },
      { id: 'b', episodeId: 'ep2' },
    ];
    const snapshot = JSON.stringify(original);
    detectScriptBlockDuplicates(original);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(original).toHaveLength(3);
  });

  it('null 항목 섞여 있어도 안전', () => {
    const blocks = [
      { id: 'a', episodeId: 'ep1' },
      null,
      undefined,
      { id: 'a', episodeId: 'ep1' },
    ];
    const r = detectScriptBlockDuplicates(blocks);
    expect(r.hasDuplicates).toBe(true);
    expect(r.totalDuplicates).toBe(1);
  });
});
