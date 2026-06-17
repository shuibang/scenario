import { describe, it, expect } from 'vitest';
import { buildSceneNumberBlock } from './sceneBlockBuilder';
import { DEFAULT_FORMAT } from './sceneFormat';

// 구조화 필드 전부 빈 문자열 assert
function expectEmptyStructured(result) {
  expect(result.location).toBe('');
  expect(result.subLocation).toBe('');
  expect(result.timeOfDay).toBe('');
  expect(result.specialSituation).toBe('');
}

describe('buildSceneNumberBlock', () => {
  const SCENE_ID = 'scene-1';

  // ─── 포맷 미매칭 씬 원본 보존 ─────────────────────────────────────────────
  // DEFAULT_FORMAT(paren, locSep=' - ')에서 인식 안 되는 구분자·형식은
  // 전체가 location으로 흡수되거나 locSep 기준으로만 분리됨.
  describe('포맷 미매칭 씬 원본 보존', () => {
    it('#1 슬래시 시간대 "카페/ 낮" — paren 포맷에서 location으로 파싱, content 유지', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: '카페/ 낮', label: 'S#3.', sceneId: SCENE_ID, fmt: DEFAULT_FORMAT,
      });
      expect(result.location).toBe('카페/ 낮');
      expect(result.subLocation).toBe('');
      expect(result.timeOfDay).toBe('');
      expect(result.specialSituation).toBe('');
      expect(result.content).toBe('S#3. 카페/ 낮');
      expect(result.sceneId).toBe(SCENE_ID);
    });

    it('#2 점 구분 "사무실. 밤" — location으로 파싱, content 유지', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: '사무실. 밤', label: 'S#5.', sceneId: SCENE_ID, fmt: DEFAULT_FORMAT,
      });
      expect(result.location).toBe('사무실. 밤');
      expect(result.subLocation).toBe('');
      expect(result.timeOfDay).toBe('');
      expect(result.specialSituation).toBe('');
      expect(result.content).toBe('S#5. 사무실. 밤');
    });

    it('#3 다중 하이픈 "공원 - 호수 - 낮" — 첫 " - " 기준 분리: location=공원, sub=호수 - 낮', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: '공원 - 호수 - 낮', label: 'S#7.', sceneId: SCENE_ID, fmt: DEFAULT_FORMAT,
      });
      expect(result.location).toBe('공원');
      expect(result.subLocation).toBe('호수 - 낮');
      expect(result.timeOfDay).toBe('');
      expect(result.specialSituation).toBe('');
      expect(result.content).toBe('S#7. 공원 - 호수 - 낮');
    });

    it('#4 괄호 접두 "(F) 바닷가" — (F)가 paren 시간대로 파싱되어 location 소실 → preserve 경로', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: '(F) 바닷가', label: 'S#10.', sceneId: SCENE_ID, fmt: DEFAULT_FORMAT,
      });
      expect(result.content).toBe('S#10. (F) 바닷가');
      expectEmptyStructured(result);
    });

    it('#5 하이픈 시간대 "놀이터 - 밤" — locSep 기준: location=놀이터, sub=밤', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: '놀이터 - 밤', label: 'S#12.', sceneId: SCENE_ID, fmt: DEFAULT_FORMAT,
      });
      expect(result.location).toBe('놀이터');
      expect(result.subLocation).toBe('밤');
      expect(result.timeOfDay).toBe('');
      expect(result.specialSituation).toBe('');
      expect(result.content).toBe('S#12. 놀이터 - 밤');
    });
  });

  // ─── 구조화 씬 편집 ────────────────────────────────────────────────────────
  describe('구조화 씬 편집', () => {
    it('#6 완전 포맷 "카페 - 거실 (낮)" → parseWithFormat으로 구조화 필드 채움', () => {
      const result = buildSceneNumberBlock({
        prev: { location: '사무실' },
        rawText: '카페 - 거실 (낮)',
        label: 'S#3.',
        sceneId: SCENE_ID,
        fmt: DEFAULT_FORMAT,
      });
      expect(result.location).toBe('카페');
      expect(result.subLocation).toBe('거실');
      expect(result.timeOfDay).toBe('낮');
      expect(result.specialSituation).toBe('');
      expect(result.content).toBe('S#3. 카페 - 거실 (낮)');
    });

    it('#7 시간대 없음 "사무실" → location만 채움', () => {
      const result = buildSceneNumberBlock({
        prev: { location: '사무실' },
        rawText: '사무실',
        label: 'S#3.',
        sceneId: SCENE_ID,
        fmt: DEFAULT_FORMAT,
      });
      expect(result.location).toBe('사무실');
      expect(result.timeOfDay).toBe('');
      expect(result.content).toBe('S#3. 사무실');
    });

    it('#8 rawText 빈값 → 구조화 필드 전부 빈값, content는 label만', () => {
      const result = buildSceneNumberBlock({
        prev: { location: '사무실' },
        rawText: '',
        label: 'S#3.',
        sceneId: SCENE_ID,
        fmt: DEFAULT_FORMAT,
      });
      expectEmptyStructured(result);
      expect(result.content).toBe('S#3.');
    });
  });

  // ─── edge cases ───────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('#9 rawText 빈값 + label → content는 label만', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: '', label: 'S#1.', sceneId: SCENE_ID, fmt: DEFAULT_FORMAT,
      });
      expect(result.content).toBe('S#1.');
      expectEmptyStructured(result);
    });

    it('#10 label 없음 + rawText만 → location 파싱, content=rawText', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: '카페', label: '', sceneId: SCENE_ID, fmt: DEFAULT_FORMAT,
      });
      expect(result.location).toBe('카페');
      expect(result.subLocation).toBe('');
      expect(result.timeOfDay).toBe('');
      expect(result.content).toBe('카페');
    });

    it('#11 prev=null → 정상 파싱', () => {
      const result = buildSceneNumberBlock({
        prev: null, rawText: '카페/ 낮', label: 'S#3.', sceneId: SCENE_ID, fmt: DEFAULT_FORMAT,
      });
      expect(result.location).toBe('카페/ 낮');
      expect(result.subLocation).toBe('');
      expect(result.timeOfDay).toBe('');
      expect(result.content).toBe('S#3. 카페/ 낮');
    });

    it('#12 rawText에 S# prefix 포함 → SCENE_PREFIX_STRIP_RE 제거 후 body="카페"로 파싱', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: 'S#3. 카페', label: 'S#3.', sceneId: SCENE_ID, fmt: DEFAULT_FORMAT,
      });
      expect(result.location).toBe('카페');
      expect(result.content).toBe('S#3. 카페');
    });

    it('#13 prev에 timeOfDay만 있는 경우 → rawText 기준으로 파싱 (prev 무관)', () => {
      const result = buildSceneNumberBlock({
        prev: { timeOfDay: '낮' },
        rawText: '카페/ 낮',
        label: 'S#3.',
        sceneId: SCENE_ID,
        fmt: DEFAULT_FORMAT,
      });
      expect(result.location).toBe('카페/ 낮');
      expect(result.subLocation).toBe('');
      expect(result.timeOfDay).toBe('');
      expect(result.content).toBe('S#3. 카페/ 낮');
    });
  });

  // ─── fmt 파라미터 주입 ─────────────────────────────────────────────────────
  describe('fmt 파라미터 주입', () => {
    it('#14 커스텀 포맷 parseWithFormat으로 정상 파싱', () => {
      const customFmt = {
        ...DEFAULT_FORMAT,
        locSep: ' > ',
        timeFmt: 'custom',
        customTimeOpen: '@',
        customTimeClose: '',
      };
      const result = buildSceneNumberBlock({
        prev: {},
        rawText: '카페 > 안방 @낮',
        label: 'S#3.',
        sceneId: SCENE_ID,
        fmt: customFmt,
      });
      expect(result.location).toBe('카페');
      expect(result.subLocation).toBe('안방');
      expect(result.timeOfDay).toBe('낮');
      expect(result.specialSituation).toBe('');
      // resolveSceneLabel은 테스트 환경에서 DEFAULT_FORMAT(paren) 사용
      expect(result.content).toBe('S#3. 카페 - 안방 (낮)');
    });
  });
});
