import { describe, it, expect } from 'vitest';
import { computeSizeGuard } from './sizeGuard';

describe('computeSizeGuard', () => {
  it('prev=null (첫 저장) → 가드 스킵', () => {
    expect(computeSizeGuard(null, { scriptBlocks: 100, scenes: 10 })).toBeNull();
  });

  it('scriptBlocks 120→30 (75% 감소) → scriptBlocks 트리거', () => {
    const result = computeSizeGuard(
      { scriptBlocks: 120, scenes: 15 },
      { scriptBlocks: 30,  scenes: 15 },
    );
    expect(result).not.toBeNull();
    expect(result.scriptBlocks).toEqual({ prev: 120, next: 30, dropRatio: 0.75 });
    expect(result.scenes).toBeNull();
  });

  it('scenes 15→5 (67% 감소) → 70% 미만이라 트리거 안 함', () => {
    const result = computeSizeGuard(
      { scriptBlocks: 100, scenes: 15 },
      { scriptBlocks: 100, scenes: 5 },
    );
    expect(result).toBeNull();
  });

  it('scriptBlocks 8→2 (75% 감소) but prev<10 (절대값 바닥) → 가드 스킵', () => {
    const result = computeSizeGuard(
      { scriptBlocks: 8,   scenes: 100 },
      { scriptBlocks: 2,   scenes: 100 },
    );
    expect(result).toBeNull();
  });

  it('scenes만 85% 감소 → scenes 트리거 (scriptBlocks 변화 없음)', () => {
    const result = computeSizeGuard(
      { scriptBlocks: 100, scenes: 20 },
      { scriptBlocks: 100, scenes: 3 },
    );
    expect(result).not.toBeNull();
    expect(result.scriptBlocks).toBeNull();
    expect(result.scenes).toEqual({ prev: 20, next: 3, dropRatio: 0.85 });
  });

  it('증가 케이스 (100→120) → 트리거 안 함', () => {
    expect(computeSizeGuard(
      { scriptBlocks: 100, scenes: 10 },
      { scriptBlocks: 120, scenes: 15 },
    )).toBeNull();
  });
});
