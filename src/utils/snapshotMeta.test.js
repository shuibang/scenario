import { describe, expect, it } from 'vitest';
import {
  computeSnapshotMeta,
  formatBytes,
  formatChars,
  formatSnapshotMetaLine,
} from './snapshotMeta';

describe('computeSnapshotMeta', () => {
  it('빈 payload → 모든 카운트 0', () => {
    const r = computeSnapshotMeta({});
    expect(r).toEqual({ projectCount: 0, sceneCount: 0, charCount: 0, sizeBytes: expect.any(Number) });
    expect(r.sizeBytes).toBeGreaterThanOrEqual(2); // "{}"
  });

  it('null/undefined → 모든 카운트 0', () => {
    expect(computeSnapshotMeta(null)).toMatchObject({ projectCount: 0, sceneCount: 0, charCount: 0 });
    expect(computeSnapshotMeta(undefined)).toMatchObject({ projectCount: 0, sceneCount: 0, charCount: 0 });
  });

  it('projectCount 카운트', () => {
    expect(computeSnapshotMeta({ projects: [{ id: 'a' }, { id: 'b' }] }).projectCount).toBe(2);
  });

  it('sceneCount = scriptBlocks 의 scene_number 만 카운트', () => {
    const payload = {
      scriptBlocks: [
        { id: '1', type: 'scene_number', content: 'S#1.' },
        { id: '2', type: 'action',       content: '문 열림' },
        { id: '3', type: 'scene_number', content: 'S#2.' },
        { id: '4', type: 'dialogue',     content: '안녕' },
      ],
    };
    expect(computeSnapshotMeta(payload).sceneCount).toBe(2);
  });

  it('charCount = 모든 블록 content 합 (HTML 태그 제외, 줄바꿈 포함)', () => {
    const payload = {
      scriptBlocks: [
        { id: '1', type: 'action', content: '안녕하세요' },     // 5
        { id: '2', type: 'dialogue', content: '<b>굵게</b>' },   // 2 (b 태그 제거)
        { id: '3', type: 'action', content: 'a\nb' },           // 3 (\n 포함)
      ],
    };
    expect(computeSnapshotMeta(payload).charCount).toBe(5 + 2 + 3);
  });

  it('sizeBytes UTF-8 — 한글 한 글자 = 3바이트', () => {
    const r = computeSnapshotMeta({ scriptBlocks: [{ id: 'x', content: '가' }] });
    // JSON 스트링 안의 "가"는 UTF-8로 3바이트 + 따옴표/필드 등
    // 정확한 값보다 "한글이 ASCII보다 더 무겁게 측정되는지" 확인
    const ascii = computeSnapshotMeta({ scriptBlocks: [{ id: 'x', content: 'a' }] });
    expect(r.sizeBytes).toBeGreaterThan(ascii.sizeBytes);
  });

  it('jsonStr 인자가 주어지면 그대로 사용 (재계산 안 함)', () => {
    const meta = computeSnapshotMeta({}, 'aaaa'); // 4 ASCII bytes
    expect(meta.sizeBytes).toBe(4);
  });

  it('null 항목 섞여 있어도 안전', () => {
    const payload = {
      scriptBlocks: [null, { id: 'a', type: 'scene_number' }, undefined, { id: 'b', type: 'action', content: '안녕' }],
    };
    expect(computeSnapshotMeta(payload).sceneCount).toBe(1);
    expect(computeSnapshotMeta(payload).charCount).toBe(2);
  });
});

describe('formatChars', () => {
  it('숫자 → 천 단위 콤마 + "자"', () => {
    expect(formatChars(0)).toBe('0자');
    expect(formatChars(1234)).toBe('1,234자');
    expect(formatChars(1234567)).toBe('1,234,567자');
  });

  it('숫자 아니면 null', () => {
    expect(formatChars(undefined)).toBeNull();
    expect(formatChars(null)).toBeNull();
    expect(formatChars(NaN)).toBeNull();
    expect(formatChars('123')).toBeNull();
  });
});

describe('formatBytes', () => {
  it('1024 미만 → B', () => {
    expect(formatBytes(0)).toBe('0B');
    expect(formatBytes(512)).toBe('512B');
  });

  it('1024 ~ 1MB → KB (소수점 1자리)', () => {
    expect(formatBytes(1024)).toBe('1.0KB');
    expect(formatBytes(2048)).toBe('2.0KB');
    expect(formatBytes(1500)).toBe('1.5KB');
  });

  it('1MB 이상 → MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0MB');
  });

  it('숫자 아니면 null', () => {
    expect(formatBytes(undefined)).toBeNull();
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(NaN)).toBeNull();
  });
});

describe('formatSnapshotMetaLine', () => {
  it('전체 필드 → "작품 N개 · 씬 N · N자 · NKB"', () => {
    const line = formatSnapshotMetaLine({ projectCount: 3, sceneCount: 42, charCount: 15234, sizeBytes: 87654 });
    expect(line).toBe('작품 3개 · 씬 42 · 15,234자 · 85.6KB');
  });

  it('레거시 호환 — projectCount만 있는 옛 스냅샷', () => {
    const line = formatSnapshotMetaLine({ projectCount: 2 });
    expect(line).toBe('작품 2개');
  });

  it('charCount/sizeBytes 누락 시 그 부분만 생략', () => {
    expect(formatSnapshotMetaLine({ projectCount: 1, sceneCount: 5 })).toBe('작품 1개 · 씬 5');
  });

  it('null/undefined → 빈 문자열', () => {
    expect(formatSnapshotMetaLine(null)).toBe('');
    expect(formatSnapshotMetaLine(undefined)).toBe('');
  });
});
