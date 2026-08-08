import { describe, expect, it } from 'vitest';
import {
  PAGE,
  TITLE_BLOCK_H,
  buildRelationshipPrintHtml,
  computePrintScale,
  escapeHtml,
  pageContentPx,
} from './relationshipPrintHtml';
import { CANVAS_H, NODE_H, NODE_H_PHOTO, NODE_W } from '../utils/relationshipLayout';

const DATA_URL = 'data:image/jpeg;base64,aGk=';

const node = (id, x, y, extra = {}) => ({
  id, x, y, h: NODE_H, anchorOffsetY: 0, name: id, photoDataUrl: null, roles: [], ...extra,
});

describe('computePrintScale', () => {
  it('A4 안에 들어가면 축소하지 않는다', () => {
    expect(computePrintScale(400, 300, 566, 800)).toBe(1);
  });

  it('폭이 넘치면 폭 기준으로 비례 축소', () => {
    expect(computePrintScale(1000, 300, 500, 800)).toBe(0.5);
  });

  it('높이가 더 빡빡하면 높이 기준', () => {
    expect(computePrintScale(400, 800, 800, 400)).toBe(0.5);
  });

  it('확대는 하지 않는다 (1 초과 없음)', () => {
    expect(computePrintScale(100, 100, 5000, 5000)).toBe(1);
  });

  it('비정상 입력은 1로 폴백', () => {
    expect(computePrintScale(0, 300, 500, 500)).toBe(1);
    expect(computePrintScale(NaN, NaN, 500, 500)).toBe(1);
  });
});

describe('pageContentPx', () => {
  it('A4에서 기존 인쇄 여백을 뺀 콘텐츠 크기', () => {
    const { w, h } = pageContentPx();
    expect(Math.round(w)).toBe(Math.round((PAGE.w - PAGE.left - PAGE.right) * (96 / 25.4))); // 150mm ≈ 567px
    expect(Math.round(h)).toBe(Math.round((PAGE.h - PAGE.top - PAGE.bottom) * (96 / 25.4))); // 232mm ≈ 877px
  });
});

describe('escapeHtml', () => {
  it('HTML 특수문자를 이스케이프한다', () => {
    expect(escapeHtml('<script>"x"&\'y\'</script>'))
      .toBe('&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;');
    expect(escapeHtml(null)).toBe('');
  });
});

describe('buildRelationshipPrintHtml', () => {
  const base = {
    title: '작품 — 인물관계도',
    width: 700,
    nodes: [node('a', 200, 100), node('b', 500, 300)],
    edges: [{ id: 'e1', fromId: 'a', toId: 'b', label: '연인' }],
  };

  it('외부 리소스를 참조하지 않는 자체 완결 문서', () => {
    const html = buildRelationshipPrintHtml(base);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('@page{size:A4');
    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toMatch(/<script\b/);
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toContain('var(--');  // 앱 CSS 변수는 독립 문서에 없다
  });

  it('제목을 이스케이프해 넣는다', () => {
    const html = buildRelationshipPrintHtml({ ...base, title: '<b>제목</b>' });
    expect(html).toContain('&lt;b&gt;제목&lt;/b&gt;');
    expect(html).not.toContain('<b>제목</b>');
  });

  it('화면 좌표를 그대로 반영한다 (재배치하지 않음)', () => {
    const html = buildRelationshipPrintHtml(base);
    // 카드 좌상단 = 중심 − 카드 절반
    expect(html).toContain(`left:${200 - NODE_W / 2}px;top:${100 - NODE_H / 2}px`);
    expect(html).toContain(`left:${500 - NODE_W / 2}px;top:${300 - NODE_H / 2}px`);
  });

  it('사진 있는 카드는 data URL을 그대로 싣고, 없는 카드는 img가 없다', () => {
    const html = buildRelationshipPrintHtml({
      ...base,
      nodes: [
        node('a', 200, 100),
        node('b', 500, 300, { h: NODE_H_PHOTO, anchorOffsetY: 51, photoDataUrl: DATA_URL }),
      ],
    });
    expect(html).toContain(DATA_URL);
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain(`top:${300 - NODE_H_PHOTO / 2}px`); // 사진 카드는 더 높다
  });

  it('관계선·화살촉·라벨을 모두 그린다', () => {
    const html = buildRelationshipPrintHtml(base);
    expect(html).toContain('<line ');
    expect(html).toContain('marker-end="url(#rel-arrow)"');
    expect(html).toContain('<marker');
    expect(html).toContain('>연인</text>');
  });

  it('라벨 없는 관계선은 선만 그린다', () => {
    const html = buildRelationshipPrintHtml({
      ...base,
      edges: [{ id: 'e1', fromId: 'a', toId: 'b', label: '' }],
    });
    expect(html).toContain('<line ');
    expect(html).not.toContain('<text ');
  });

  it('좌표가 없는 노드를 가리키는 관계선은 건너뛴다', () => {
    const html = buildRelationshipPrintHtml({
      ...base,
      edges: [{ id: 'e1', fromId: 'a', toId: '없는놈', label: '연인' }],
    });
    expect(html).not.toContain('<line ');
  });

  it('캔버스가 A4보다 넓으면 전체를 축소한다', () => {
    const wide = buildRelationshipPrintHtml({ ...base, width: 1400 });
    const expected = computePrintScale(1400, CANVAS_H, pageContentPx().w, pageContentPx().h - TITLE_BLOCK_H);
    expect(expected).toBeLessThan(1);
    expect(wide).toContain(`transform:scale(${expected})`);
  });

  it('노드가 없어도 깨지지 않는다', () => {
    const html = buildRelationshipPrintHtml({ title: 't', width: 700, nodes: [], edges: [] });
    expect(html).toContain('<svg');
    expect(html).not.toContain('<line ');
  });
});
