import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_FORMAT,
  FORMAT_KEY,
  composeSceneHeader,
  formatSceneHeader,
  getSceneFormat,
  isCustomLocSep,
  parseSceneHeaderFlexibly,
  parseWithFormat,
  rebuildSceneContent,
  setSceneFormat,
  splitScenePrefix,
} from './sceneFormat';

class LocalStorageMock {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(String(key)) ? this.store.get(String(key)) : null;
  }

  setItem(key, value) {
    this.store.set(String(key), String(value));
  }

  removeItem(key) {
    this.store.delete(String(key));
  }

  clear() {
    this.store.clear();
  }
}

function createMockWindow() {
  const target = new EventTarget();
  return {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
}

let eventListener = null;

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new LocalStorageMock(),
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, 'window', {
    value: createMockWindow(),
    configurable: true,
    writable: true,
  });

  localStorage.clear();
  eventListener = null;
});

afterEach(() => {
  if (eventListener) {
    window.removeEventListener('scene_format_changed', eventListener);
    eventListener = null;
  }
});

describe('sceneFormat [현재 동작]', () => {
  // 저장/조회 포맷의 기본 폴백과 부분 병합 동작을 박제한다.
  describe('getSceneFormat', () => {
    it('저장값 없으면 DEFAULT_FORMAT 반환', () => {
      expect(getSceneFormat()).toEqual(DEFAULT_FORMAT);
    });

    it('부분 저장값은 DEFAULT_FORMAT과 병합됨', () => {
      localStorage.setItem(
        FORMAT_KEY,
        JSON.stringify({ locSep: '/', customTimeOpen: '@' })
      );

      expect(getSceneFormat()).toEqual({
        ...DEFAULT_FORMAT,
        locSep: '/',
        customTimeOpen: '@',
      });
    });

    it('JSON 파싱 실패 시 DEFAULT_FORMAT 폴백', () => {
      localStorage.setItem(FORMAT_KEY, '{broken-json');

      expect(getSceneFormat()).toEqual(DEFAULT_FORMAT);
    });
  });

  // 저장 성공 시 저장소 기록과 전역 이벤트 발생을 박제한다.
  describe('setSceneFormat', () => {
    it('저장 후 scene_format_changed 이벤트 발생', () => {
      let fired = 0;
      eventListener = () => { fired += 1; };
      window.addEventListener('scene_format_changed', eventListener);

      const nextFormat = { locSep: ' / ', timeFmt: 'slash', customTimeOpen: '@', customTimeClose: '' };
      setSceneFormat(nextFormat);

      expect(localStorage.getItem(FORMAT_KEY)).toBe(JSON.stringify(nextFormat));
      expect(fired).toBe(1);
    });
  });

  // 장소 구분자 프리셋 비교가 정확 일치 비교임을 박제한다.
  describe('isCustomLocSep', () => {
    it('프리셋 일치 시 false', () => {
      expect(isCustomLocSep(' - ')).toBe(false);
      expect(isCustomLocSep(' / ')).toBe(false);
      expect(isCustomLocSep('/')).toBe(false);
    });

    it('프리셋 불일치 시 true', () => {
      expect(isCustomLocSep(' > ')).toBe(true);
    });

    it('(의도됨) null/undefined/빈값은 true 반환', () => {
      expect(isCustomLocSep(null)).toBe(true);
      expect(isCustomLocSep(undefined)).toBe(true);
      expect(isCustomLocSep('')).toBe(true);
    });
  });

  // 씬 prefix 분리가 선행 공백 없이 시작할 때만 동작함을 박제한다.
  describe('splitScenePrefix', () => {
    it('표준 prefix(S#1., INT. 등) 분리', () => {
      expect(splitScenePrefix('S#1. 거실 - 안방 (낮)')).toEqual({
        prefix: 'S#1.',
        body: '거실 - 안방 (낮)',
      });

      expect(splitScenePrefix('INT. 거실 / 부엌 낮')).toEqual({
        prefix: 'INT.',
        body: '거실 / 부엌 낮',
      });
    });

    it('prefix 없으면 prefix=\'\', body=원문', () => {
      expect(splitScenePrefix('거실 - 안방 (낮)')).toEqual({
        prefix: '',
        body: '거실 - 안방 (낮)',
      });
    });

    it('빈 입력은 둘 다 빈 문자열', () => {
      expect(splitScenePrefix('')).toEqual({ prefix: '', body: '' });
      expect(splitScenePrefix(null)).toEqual({ prefix: '', body: '' });
    });
  });

  // 현재 포맷 정보를 알고 있을 때의 엄격/유연 파싱 규칙을 박제한다.
  describe('parseWithFormat', () => {
    it('TOD_KEYWORDS 시간대 인식', () => {
      expect(
        parseWithFormat('거실 - 안방 /낮', { ...DEFAULT_FORMAT, timeFmt: 'slash' })
      ).toEqual({
        specialSituation: '',
        location: '거실',
        subLocation: '안방',
        timeOfDay: '낮',
      });
    });

    it('custom 장소 구분자 해석', () => {
      expect(
        parseWithFormat('거실 > 안방 (밤)', { ...DEFAULT_FORMAT, locSep: ' > ' })
      ).toEqual({
        specialSituation: '',
        location: '거실',
        subLocation: '안방',
        timeOfDay: '밤',
      });
    });

    it('custom 시간 구분자(@ 등) 해석', () => {
      expect(
        parseWithFormat('거실 - 안방@낮', {
          ...DEFAULT_FORMAT,
          timeFmt: 'custom',
          customTimeOpen: '@',
          customTimeClose: '',
        })
      ).toEqual({
        specialSituation: '',
        location: '거실',
        subLocation: '안방',
        timeOfDay: '낮',
      });
    });

    it('빈 입력은 모든 필드 빈 문자열', () => {
      expect(parseWithFormat('')).toEqual({
        specialSituation: '',
        location: '',
        subLocation: '',
        timeOfDay: '',
      });
    });

    it('특수상황 패턴 분리', () => {
      expect(
        parseWithFormat('회상) 거실 - 안방 (낮)', DEFAULT_FORMAT)
      ).toEqual({
        specialSituation: '회상',
        location: '거실',
        subLocation: '안방',
        timeOfDay: '낮',
      });
    });

    it('(의도됨) paren 모드는 괄호 안이면 키워드 무관 시간대로 읽음', () => {
      expect(
        parseWithFormat('거실 - 안방 (해질녘)', DEFAULT_FORMAT)
      ).toEqual({
        specialSituation: '',
        location: '거실',
        subLocation: '안방',
        timeOfDay: '해질녘',
      });
    });
  });

  // 포맷 정보 없이도 읽어내는 유연 파서의 현재 규칙을 박제한다.
  describe('parseSceneHeaderFlexibly', () => {
    it('표준 형태 파싱', () => {
      expect(parseSceneHeaderFlexibly('S#1. 거실 - 안방 (낮)')).toEqual({
        prefix: 'S#1.',
        specialSituation: '',
        location: '거실',
        subLocation: '안방',
        timeOfDay: '낮',
      });
    });

    it('INT./EXT. prefix 인식', () => {
      expect(parseSceneHeaderFlexibly('INT. 거실 / 부엌 밤')).toEqual({
        prefix: 'INT.',
        specialSituation: '',
        location: '거실',
        subLocation: '부엌',
        timeOfDay: '밤',
      });
    });

    it('(현재 동작) 슬래시 + 비키워드도 시간대로 읽는다', () => {
      expect(parseSceneHeaderFlexibly('거실/verylong')).toEqual({
        prefix: '',
        specialSituation: '',
        location: '거실',
        subLocation: '',
        timeOfDay: 'verylong',
      });
    });
  });

  // 구조화 필드를 canonical 씬 헤더 문자열로 조합하는 규칙을 박제한다.
  describe('formatSceneHeader', () => {
    it('location, subLocation, timeOfDay 모두 trim', () => {
      expect(
        formatSceneHeader({
          location: '  거실  ',
          subLocation: '  안방  ',
          timeOfDay: '  낮  ',
          specialSituation: '  회상  ',
        }, DEFAULT_FORMAT)
      ).toBe('회상) 거실 - 안방 (낮)');
    });

    it('location/specialSituation 모두 없으면 빈 문자열', () => {
      expect(
        formatSceneHeader({
          location: '',
          subLocation: '안방',
          timeOfDay: '낮',
          specialSituation: '',
        }, DEFAULT_FORMAT)
      ).toBe('');
    });

    it('subLocation 없으면 locSep 생략', () => {
      expect(
        formatSceneHeader({
          location: '거실',
          subLocation: '',
          timeOfDay: '낮',
          specialSituation: '',
        }, DEFAULT_FORMAT)
      ).toBe('거실 (낮)');
    });
  });

  // label 결합은 composeSceneHeader가 맡고 prefix 개념과는 별개임을 박제한다.
  describe('composeSceneHeader', () => {
    it('block.label 있으면 label + body 결합', () => {
      expect(
        composeSceneHeader({
          label: 'S#1.',
          location: ' 거실 ',
          subLocation: ' 안방 ',
          timeOfDay: ' 낮 ',
          specialSituation: '',
        }, DEFAULT_FORMAT)
      ).toBe('S#1. 거실 - 안방 (낮)');
    });
  });

  // 유연 파싱 후 새 포맷으로 본문만 재조합하는 현재 계약을 박제한다.
  describe('rebuildSceneContent', () => {
    it('(현재 동작) oldFmt 인자는 결과에 영향을 주지 않는다', () => {
      const input = 'S#1. 거실 - 안방 (낮)';
      const nextFormat = { ...DEFAULT_FORMAT, locSep: ' / ', timeFmt: 'slash' };

      const resultA = rebuildSceneContent(input, DEFAULT_FORMAT, nextFormat);
      const resultB = rebuildSceneContent(input, { locSep: ' > ', timeFmt: 'custom', customTimeOpen: '@', customTimeClose: '' }, nextFormat);

      expect(resultA).toBe('S#1. 거실 / 안방/낮');
      expect(resultB).toBe('S#1. 거실 / 안방/낮');
      expect(resultA).toBe(resultB);
    });

    it('prefix 보존하고 본문만 재조합', () => {
      expect(
        rebuildSceneContent('INT. 거실 - 안방 (낮)', DEFAULT_FORMAT, { ...DEFAULT_FORMAT, locSep: ' / ', timeFmt: 'slash' })
      ).toBe('INT. 거실 / 안방/낮');
    });

    it('빈 입력은 원값 반환', () => {
      expect(rebuildSceneContent('', DEFAULT_FORMAT, DEFAULT_FORMAT)).toBe('');
      expect(rebuildSceneContent(null, DEFAULT_FORMAT, DEFAULT_FORMAT)).toBe(null);
    });
  });

  // 표면 문자열 보존보다 의미 정규화/내부 역할 분리를 우선하는 현재 설계를 박제한다.
  describe('의도된 동작 박제', () => {
    it('(의도됨) 다중 공백은 canonical 형태로 정규화됨', () => {
      expect(
        rebuildSceneContent('S#1.   거실   -   안방   (낮)', DEFAULT_FORMAT, DEFAULT_FORMAT)
      ).toBe('S#1. 거실 - 안방 (낮)');
    });

    it('(의도됨) 장소 구분자는 공백 포함 정확 매칭 필요', () => {
      expect(parseSceneHeaderFlexibly('거실-안방')).toEqual({
        prefix: '',
        specialSituation: '',
        location: '거실-안방',
        subLocation: '',
        timeOfDay: '',
      });
    });

    it('(의도됨) 두 파서는 prefix 처리에서 차이남', () => {
      expect(parseWithFormat('S#1. 거실 - 안방 (낮)', DEFAULT_FORMAT)).toEqual({
        specialSituation: '',
        location: 'S#1. 거실',
        subLocation: '안방',
        timeOfDay: '낮',
      });

      expect(parseSceneHeaderFlexibly('S#1. 거실 - 안방 (낮)')).toEqual({
        prefix: 'S#1.',
        specialSituation: '',
        location: '거실',
        subLocation: '안방',
        timeOfDay: '낮',
      });
    });

    it('(의도됨) parseSceneHeaderFlexibly.prefix는 rebuildSceneContent 내부 전용', () => {
      const parsed = parseSceneHeaderFlexibly('S#1. 거실 - 안방 (낮)');

      expect(composeSceneHeader(parsed, DEFAULT_FORMAT)).toBe('거실 - 안방 (낮)');
      expect(rebuildSceneContent('S#1. 거실 - 안방 (낮)', DEFAULT_FORMAT, DEFAULT_FORMAT)).toBe('S#1. 거실 - 안방 (낮)');
    });
  });

  describe('splitScenePrefix [#1 선행 공백 허용]', () => {
    it('선행 공백이 있어도 prefix 인식', () => {
      expect(splitScenePrefix('  S#1. 거실')).toEqual({
        prefix: 'S#1.',
        body: '거실',
      });
    });

    it('선행 탭이 있어도 prefix 인식', () => {
      expect(splitScenePrefix('\t S#1. 거실')).toEqual({
        prefix: 'S#1.',
        body: '거실',
      });
    });

    it('선행 공백 + INT. prefix도 인식', () => {
      expect(splitScenePrefix('   INT. 거실')).toEqual({
        prefix: 'INT.',
        body: '거실',
      });
    });

    it('선행 공백만 있고 prefix 없으면 기존처럼 빈 prefix', () => {
      expect(splitScenePrefix('   ')).toEqual({
        prefix: '',
        body: '',
      });
    });
  });

  describe('splitScenePrefix [#2 본문 안 회상 표기 거부]', () => {
    const REJECT_CASES = [
      ['앞에 한글',     '그녀는 회상했다. S#3. 카페'],
      ['앞에 괄호',     '(회상 - S#3. 카페)'],
      ['앞에 화살표',   '→ S#3. 카페'],
      ['앞에 따옴표',   '"S#3. 카페"'],
      ['앞에 마침표',   '.S#3. 카페'],
      ['앞에 쉼표',     ',S#3. 카페'],
      ['앞에 개행 (공백·탭만 허용 정책)', '\nS#3. 카페'],
      ['앞에 영문',     'aS#3. 카페'],
    ];

    REJECT_CASES.forEach(([label, input]) => {
      it(label, () => {
        expect(splitScenePrefix(input)).toEqual({
          prefix: '',
          body: input.trim(),
        });
      });
    });
  });

  describe('splitScenePrefix [#3 마침표 선택적 + 한국어 변형 + 본문 오인식 방지]', () => {
    it('S#1 (마침표 없음) 인식', () => {
      expect(splitScenePrefix('S#1 카페')).toEqual({ prefix: 'S#1', body: '카페' });
    });

    it('Scene #1 (마침표 없음) 인식', () => {
      expect(splitScenePrefix('Scene #1 cafe')).toEqual({ prefix: 'Scene #1', body: 'cafe' });
    });

    it('씬 1 (공백 + 마침표 없음) 인식', () => {
      expect(splitScenePrefix('씬 1 카페')).toEqual({ prefix: '씬 1', body: '카페' });
    });

    it('씬 1. (공백 + 마침표) 인식', () => {
      expect(splitScenePrefix('씬 1. 카페')).toEqual({ prefix: '씬 1.', body: '카페' });
    });

    it('1씬. (한국식 변형) 인식', () => {
      expect(splitScenePrefix('1씬. 카페')).toEqual({ prefix: '1씬.', body: '카페' });
    });

    it('1씬 (마침표 없음) 인식', () => {
      expect(splitScenePrefix('1씬 카페')).toEqual({ prefix: '1씬', body: '카페' });
    });

    it('#5 (마침표 없음) 인식', () => {
      expect(splitScenePrefix('#5 카페')).toEqual({ prefix: '#5', body: '카페' });
    });

    it('5. 시작 (공백 있음) — 헤더 매치', () => {
      expect(splitScenePrefix('5. 시작')).toEqual({ prefix: '5.', body: '시작' });
    });

    it('5.시작 (공백 없음) — 본문 오인식 방지', () => {
      expect(splitScenePrefix('5.시작')).toEqual({ prefix: '', body: '5.시작' });
    });
  });

  // TODO: describe('[목표 동작 - 미구현]', () => { ... })
});
