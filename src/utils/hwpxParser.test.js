import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  extractText,
  extractOutlineStyleIdsFromHeader,
  extractOutlineParaPrIdsFromHeader,
  parseHwpxFile,
} from './hwpxParser';

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

describe('extractOutlineStyleIdsFromHeader (자동 번호 매김 styleID 추출)', () => {
  it('engName="Outline 1" 스타일의 id를 추출 (양식 패턴)', () => {
    const header = `
      <hh:style id="0" type="PARA" name="바탕글" engName="Normal"/>
      <hh:style id="1" type="PARA" name="씬" engName="Outline 1" paraPrIDRef="9"/>
      <hh:style id="2" type="PARA" name="대사" engName="Body" paraPrIDRef="11"/>
      <hh:style id="3" type="PARA" name="지시문" engName="Outline 2" paraPrIDRef="10"/>
    `;
    expect(extractOutlineStyleIdsFromHeader(header)).toEqual(new Set(['1']));
  });

  it('Outline 1 다중 정의 — 모두 수집', () => {
    const header = `
      <hh:style id="1" engName="Outline 1"/>
      <hh:style id="5" engName="Outline 1"/>
    `;
    expect(extractOutlineStyleIdsFromHeader(header)).toEqual(new Set(['1', '5']));
  });

  it('Outline 1 없음 — 빈 Set', () => {
    const header = `
      <hh:style id="0" engName="Normal"/>
      <hh:style id="2" engName="Body"/>
    `;
    expect(extractOutlineStyleIdsFromHeader(header)).toEqual(new Set());
  });

  it('빈 header 텍스트 — 빈 Set', () => {
    expect(extractOutlineStyleIdsFromHeader('')).toEqual(new Set());
    expect(extractOutlineStyleIdsFromHeader(null)).toEqual(new Set());
  });

  it('Outline 2/3 등 다른 level은 매치 안 함', () => {
    const header = `
      <hh:style id="3" engName="Outline 2"/>
      <hh:style id="4" engName="Outline 3"/>
      <hh:style id="10" engName="Outline 10"/>
    `;
    expect(extractOutlineStyleIdsFromHeader(header)).toEqual(new Set());
  });

  it('non-self-closing 태그도 매치', () => {
    const header = `<hh:style id="7" engName="Outline 1"></hh:style>`;
    expect(extractOutlineStyleIdsFromHeader(header)).toEqual(new Set(['7']));
  });
});

describe('extractOutlineParaPrIdsFromHeader (paraPr 기반 OUTLINE id 추출)', () => {
  it('OUTLINE heading을 가진 paraPr id 1개를 수집', () => {
    const header = `
      <hh:paraProperties itemCnt="2">
        <hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="1" snapToGrid="1" suppressLineNumbers="0" checked="0">
          <hh:heading type="NONE" idRef="0" level="0"/>
        </hh:paraPr>
        <hh:paraPr id="3" tabPrIDRef="0" condense="0" fontLineHeight="1" snapToGrid="1" suppressLineNumbers="0" checked="0">
          <hh:heading type="OUTLINE" idRef="0" level="0"/>
        </hh:paraPr>
      </hh:paraProperties>
    `;
    expect(extractOutlineParaPrIdsFromHeader(header)).toEqual(new Set(['3']));
  });

  it('OUTLINE heading을 가진 paraPr id 2개(id=3, id=4)를 모두 수집', () => {
    const header = `
      <hh:paraProperties>
        <hh:paraPr id="3"><hh:heading type="OUTLINE" level="0"/></hh:paraPr>
        <hh:paraPr id="4"><hh:heading type="OUTLINE" level="1"/></hh:paraPr>
        <hh:paraPr id="5"><hh:heading type="NONE" level="0"/></hh:paraPr>
      </hh:paraProperties>
    `;
    expect(extractOutlineParaPrIdsFromHeader(header)).toEqual(new Set(['3', '4']));
  });

  it('OUTLINE heading 없는 헤더 — 빈 Set', () => {
    const header = `
      <hh:paraProperties>
        <hh:paraPr id="0"><hh:heading type="NONE"/></hh:paraPr>
        <hh:paraPr id="1"><hh:heading type="NONE"/></hh:paraPr>
      </hh:paraProperties>
    `;
    expect(extractOutlineParaPrIdsFromHeader(header)).toEqual(new Set());
  });

  it('paraProperties 섹션 자체가 없으면 빈 Set (회귀 없음)', () => {
    expect(extractOutlineParaPrIdsFromHeader('')).toEqual(new Set());
    expect(extractOutlineParaPrIdsFromHeader(null)).toEqual(new Set());
    expect(extractOutlineParaPrIdsFromHeader('<hh:other/>')).toEqual(new Set());
  });

  it('이웃 paraPr의 OUTLINE이 인접 paraPr로 누설되지 않음', () => {
    // id=0은 OUTLINE 없고 id=1만 OUTLINE — 단순 lazy match면 id=0까지 잘못 매치할 수 있는 함정
    const header = `
      <hh:paraProperties>
        <hh:paraPr id="0"><hh:heading type="NONE"/></hh:paraPr>
        <hh:paraPr id="1"><hh:heading type="OUTLINE"/></hh:paraPr>
      </hh:paraProperties>
    `;
    expect(extractOutlineParaPrIdsFromHeader(header)).toEqual(new Set(['1']));
  });
});

describe('parseHwpxFile 통합 — paraPrIDRef 기반 outline 인식', () => {
  // node 환경에서 DOMParser 미존재 → @xmldom/xmldom 주입 (mammoth가 끌고 와서 항상 노드모듈에 있음)
  async function withDOMParser(run) {
    const had = 'DOMParser' in globalThis;
    const prev = globalThis.DOMParser;
    const { DOMParser } = await import('@xmldom/xmldom');
    globalThis.DOMParser = DOMParser;
    try {
      return await run();
    } finally {
      if (had) globalThis.DOMParser = prev;
      else delete globalThis.DOMParser;
    }
  }

  function buildHwpxBuffer({ headerXml, sectionXml }) {
    const zip = new JSZip();
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0" encoding="UTF-8"?><ocf></ocf>`,
    );
    zip.file('Contents/header.xml', headerXml);
    zip.file('Contents/section0.xml', sectionXml);
    return zip.generateAsync({ type: 'arraybuffer' });
  }

  it('styleIDRef는 매치 안 되고 paraPrIDRef만 OUTLINE인 케이스도 카운터가 부착된다', async () => {
    // header: Outline 1 스타일 없음 / paraPr id=4만 OUTLINE
    const headerXml = `<?xml version="1.0" encoding="UTF-8"?>
      <hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">
        <hh:paraProperties itemCnt="2">
          <hh:paraPr id="0"><hh:heading type="NONE"/></hh:paraPr>
          <hh:paraPr id="4"><hh:heading type="OUTLINE" level="0"/></hh:paraPr>
        </hh:paraProperties>
        <hh:style id="0" engName="Normal"/>
        <hh:style id="2" engName="Body" paraPrIDRef="4"/>
      </hh:head>`;
    // section: 두 paragraph — 첫 번째는 paraPrIDRef="4" (outline), 두 번째는 일반
    const sectionXml = `<?xml version="1.0" encoding="UTF-8"?>
      <hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"
              xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
        <hp:p styleIDRef="2" paraPrIDRef="4">
          <hp:run><hp:t>장면 하나</hp:t></hp:run>
        </hp:p>
        <hp:p styleIDRef="0" paraPrIDRef="0">
          <hp:run><hp:t>일반 본문</hp:t></hp:run>
        </hp:p>
        <hp:p styleIDRef="2" paraPrIDRef="4">
          <hp:run><hp:t>장면 둘</hp:t></hp:run>
        </hp:p>
      </hs:sec>`;

    await withDOMParser(async () => {
      const buffer = await buildHwpxBuffer({ headerXml, sectionXml });
      const { paragraphs } = await parseHwpxFile(buffer);
      const texts = paragraphs.map(p => p.text);
      expect(texts).toEqual([
        '1. 장면 하나',
        '일반 본문',
        '2. 장면 둘',
      ]);
    });
  });
});
