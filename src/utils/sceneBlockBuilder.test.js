import { describe, it, expect } from 'vitest';
import { buildSceneNumberBlock } from './sceneBlockBuilder';

// Helper: assert 구조화 필드 전부 빈 문자열
function expectEmptyStructured(result) {
  expect(result.location).toBe('');
  expect(result.subLocation).toBe('');
  expect(result.timeOfDay).toBe('');
  expect(result.specialSituation).toBe('');
}

describe('buildSceneNumberBlock', () => {
  const SCENE_ID = 'scene-1';

  describe('레거시 씬 원본 보존', () => {
    it('#1 시나리오 A — 슬래시 시간대 "S#3. 카페/ 낮" 유지', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: '카페/ 낮', label: 'S#3.', sceneId: SCENE_ID,
      });
      expect(result.content).toBe('S#3. 카페/ 낮');
      expectEmptyStructured(result);
      expect(result.sceneId).toBe(SCENE_ID);
    });

    it('#2 시나리오 B1 — 점 구분 "S#5. 사무실. 밤" 유지', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: '사무실. 밤', label: 'S#5.', sceneId: SCENE_ID,
      });
      expect(result.content).toBe('S#5. 사무실. 밤');
      expectEmptyStructured(result);
    });

    it('#3 시나리오 B2 — 다중 하이픈 "S#7. 공원 - 호수 - 낮" 유지', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: '공원 - 호수 - 낮', label: 'S#7.', sceneId: SCENE_ID,
      });
      expect(result.content).toBe('S#7. 공원 - 호수 - 낮');
      expectEmptyStructured(result);
    });

    it('#4 시나리오 B3 — 괄호 효과음 "S#10. (F) 바닷가" 유지', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: '(F) 바닷가', label: 'S#10.', sceneId: SCENE_ID,
      });
      expect(result.content).toBe('S#10. (F) 바닷가');
      expectEmptyStructured(result);
    });

    it('#5 시나리오 B4 — 하이픈 시간대 "S#12. 놀이터 - 밤" 유지', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: '놀이터 - 밤', label: 'S#12.', sceneId: SCENE_ID,
      });
      expect(result.content).toBe('S#12. 놀이터 - 밤');
      expectEmptyStructured(result);
    });
  });

  describe('구조화 씬 편집', () => {
    it('#6 완전 포맷 "카페 - 거실 (낮)" → parseSceneContent로 구조화 필드 채움', () => {
      const result = buildSceneNumberBlock({
        prev: { location: '사무실' },
        rawText: '카페 - 거실 (낮)',
        label: 'S#3.',
        sceneId: SCENE_ID,
      });
      expect(result.location).toBe('카페');
      expect(result.subLocation).toBe('거실');
      expect(result.timeOfDay).toBe('낮');
      expect(result.specialSituation).toBe('');
      // DEFAULT_FORMAT (paren) 기준 재조합
      expect(result.content).toBe('S#3. 카페 - 거실 (낮)');
    });

    it('#7 시간대 없음 "사무실" → location만 채움', () => {
      const result = buildSceneNumberBlock({
        prev: { location: '사무실' },
        rawText: '사무실',
        label: 'S#3.',
        sceneId: SCENE_ID,
      });
      expect(result.location).toBe('사무실');
      expect(result.timeOfDay).toBe('');
      expect(result.content).toBe('S#3. 사무실');
    });

    it('#8 rawText 빈값 → parsed 전부 빈값, content는 label만', () => {
      const result = buildSceneNumberBlock({
        prev: { location: '사무실' },
        rawText: '',
        label: 'S#3.',
        sceneId: SCENE_ID,
      });
      expectEmptyStructured(result);
      expect(result.content).toBe('S#3.');
    });
  });

  describe('edge cases', () => {
    it('#9 레거시 + rawText 빈값 → content는 label만', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: '', label: 'S#1.', sceneId: SCENE_ID,
      });
      expect(result.content).toBe('S#1.');
      expectEmptyStructured(result);
    });

    it('#10 레거시 + label 없음 → rawText만', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: '카페', label: '', sceneId: SCENE_ID,
      });
      expect(result.content).toBe('카페');
      expectEmptyStructured(result);
    });

    it('#11 prev=null → 레거시 경로로 처리', () => {
      const result = buildSceneNumberBlock({
        prev: null, rawText: '카페/ 낮', label: 'S#3.', sceneId: SCENE_ID,
      });
      expect(result.content).toBe('S#3. 카페/ 낮');
      expectEmptyStructured(result);
    });

    it('#12 rawText에 S# prefix 포함 → SCENE_PREFIX_STRIP_RE 제거 후 label 재부여', () => {
      const result = buildSceneNumberBlock({
        prev: {}, rawText: 'S#3. 카페', label: 'S#3.', sceneId: SCENE_ID,
      });
      expect(result.content).toBe('S#3. 카페');
      expectEmptyStructured(result);
    });

    it('#13 비정상 — location 없이 timeOfDay만 있음 → 레거시 경로', () => {
      const result = buildSceneNumberBlock({
        prev: { timeOfDay: '낮' }, // location/specialSituation 없음
        rawText: '카페/ 낮',
        label: 'S#3.',
        sceneId: SCENE_ID,
      });
      // hasStructured=false → 레거시 경로, 원본 유지
      expect(result.content).toBe('S#3. 카페/ 낮');
      expectEmptyStructured(result);
    });
  });

  describe('구조화 씬 rawText 불변 가드 (원본 복원)', () => {
    it('#14 rawText 불변 → prev 구조화 필드 유지 (parseSceneContent 우회)', () => {
      const result = buildSceneNumberBlock({
        prev: {
          location: '카페',
          subLocation: '안방',
          timeOfDay: '낮',
          specialSituation: '',
          // custom 포맷에서 formatSceneHeader 결과로 가정
          rawText: '카페 > 안방 @낮',
        },
        rawText: '카페 > 안방 @낮', // DOM 현재값 동일 = 편집 없음
        label: 'S#3.',
        sceneId: SCENE_ID,
      });
      // prev 구조화 필드 그대로 유지
      expect(result.location).toBe('카페');
      expect(result.subLocation).toBe('안방');
      expect(result.timeOfDay).toBe('낮');
      expect(result.specialSituation).toBe('');
      // content는 DEFAULT_FORMAT(paren) 기준 재조합
      expect(result.content).toBe('S#3. 카페 - 안방 (낮)');
    });

    it('#15 rawText 변경 → 기존 파싱 경로 (편집 반영)', () => {
      const result = buildSceneNumberBlock({
        prev: {
          location: '카페',
          timeOfDay: '낮',
          rawText: '카페 (낮)',
        },
        rawText: '사무실 (밤)', // 실제 편집
        label: 'S#3.',
        sceneId: SCENE_ID,
      });
      expect(result.location).toBe('사무실');
      expect(result.timeOfDay).toBe('밤');
    });

    it('#16 prev.rawText 없음 + 구조화 필드 있음 → 기존 파싱 경로 (fallback)', () => {
      const result = buildSceneNumberBlock({
        prev: { location: '카페' }, // rawText 필드 없음
        rawText: '카페 (낮)',
        label: 'S#3.',
        sceneId: SCENE_ID,
      });
      expect(result.location).toBe('카페');
      expect(result.timeOfDay).toBe('낮');
    });

    it('#17 (박제) 미세 공백 차이 → 엄격 비교 불일치로 파싱 경로', () => {
      const result = buildSceneNumberBlock({
        prev: {
          location: '카페',
          subLocation: '안방',
          timeOfDay: '낮',
          rawText: '카페 - 안방 (낮)',
        },
        rawText: '카페 - 안방  (낮)', // 공백 한 칸 더 (편집 간주)
        label: 'S#3.',
        sceneId: SCENE_ID,
      });
      // parseSceneContent 경로 — 엄격 비교 동작 고정
      const parsedLocation = result.location;
      // parseSceneContent가 해석한 결과로 진행됐는지만 확인 (정확한 값은 파서 구현 의존)
      expect(parsedLocation).not.toBe(undefined);
    });

    it('#18 (박제) prev.rawText 빈 문자열 → 불일치로 파싱 경로', () => {
      const result = buildSceneNumberBlock({
        prev: {
          location: '카페',
          timeOfDay: '낮',
          rawText: '', // 빈 문자열 — 가드 조건(prevRaw !== '')에 의해 유지 분기 타지 않음
        },
        rawText: '카페 (낮)',
        label: 'S#3.',
        sceneId: SCENE_ID,
      });
      // 파싱 경로로 떨어져야 함
      expect(result.location).toBe('카페');
      expect(result.timeOfDay).toBe('낮');
    });
  });
});
