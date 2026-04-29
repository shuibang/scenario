import { describe, it, expect } from 'vitest';
import { extractText } from './hwpxParser';

// fake DOM 노드 빌더 — vitest 환경이 'node'라 jsdom 없음, 최소 인터페이스만 흉내
const TEXT = (v) => ({ nodeType: 3, nodeValue: v });
const TAB  = () => ({ localName: 'tab', children: [], childNodes: [] });
const T    = (...kids) => ({
  localName: 't',
  // children: element 자식만 (텍스트 노드 제외) — DOM API 규약
  children:   kids.filter(k => k.nodeType !== 3),
  childNodes: kids,
});
const RUN  = (...kids) => ({ localName: 'run', children: kids, childNodes: kids });
const P    = (...kids) => ({ children: kids, childNodes: kids });

describe('extractText (HWPX <hp:p> → 평문)', () => {
  it('한컴 대사 양식 — t 안에 [텍스트, tab, tab, 텍스트] (인물명 + 탭 + 대사)', () => {
    const p = P(RUN(T(TEXT('등장인물 이름'), TAB(), TAB(), TEXT('여백후 대사쓰기 '))));
    expect(extractText(p)).toBe('등장인물 이름\t\t여백후 대사쓰기 ');
  });

  it('일반 텍스트 paragraph (tab 없음) — 회귀 없음', () => {
    const p = P(RUN(T(TEXT('지문스타일'))));
    expect(extractText(p)).toBe('지문스타일');
  });

  it('sibling tab — t 외부(run의 직접 자식)에 tab이 있는 케이스 (가설 3)', () => {
    const p = P(RUN(T(TEXT('이름')), TAB(), T(TEXT('대사'))));
    expect(extractText(p)).toBe('이름\t대사');
  });

  it('빈 run (run 안에 t 없음) → 빈 문자열', () => {
    const p = P(RUN());
    expect(extractText(p)).toBe('');
  });

  it('여러 t 요소 — 순서대로 연결', () => {
    const p = P(RUN(T(TEXT('첫번째 ')), T(TEXT('두번째'))));
    expect(extractText(p)).toBe('첫번째 두번째');
  });

  it('한컴 양식 헤더 paragraph — 탭 없는 단일 t', () => {
    const p = P(RUN(T(TEXT('장소 – 세부장소 (시간대)'))));
    expect(extractText(p)).toBe('장소 – 세부장소 (시간대)');
  });
});
