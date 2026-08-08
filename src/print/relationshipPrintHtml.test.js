import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORIENTATION,
  PAGE,
  buildRelationshipPrintHtml,
  escapeHtml,
  estimateTextWidth,
  normalizeOrientation,
  truncateToWidth,
} from './relationshipPrintHtml';
import { CANVAS_H, NODE_H, NODE_H_PHOTO, NODE_W } from '../utils/relationshipLayout';

const DATA_URL = 'data:image/jpeg;base64,aGk=';

const node = (id, x, y, extra = {}) => ({
  id, x, y, h: NODE_H, anchorOffsetY: 0, name: id, photoDataUrl: null, roles: [], ...extra,
});

describe('normalizeOrientation', () => {
  it('기본값은 가로 — 필드 없는 기존 작품 폴백', () => {
    expect(DEFAULT_ORIENTATION).toBe('landscape');
    expect(normalizeOrientation(undefined)).toBe('landscape');
    expect(normalizeOrientation(null)).toBe('landscape');
    expect(normalizeOrientation('')).toBe('landscape');
    expect(normalizeOrientation('가로')).toBe('landscape'); // 알 수 없는 값도 폴백
  });

  it('세로는 세로로', () => {
    expect(normalizeOrientation('portrait')).toBe('portrait');
  });
});

describe('estimateTextWidth / truncateToWidth', () => {
  it('한글은 약 1em, 영문은 약 0.55em으로 근사한다', () => {
    expect(estimateTextWidth('가나', 10)).toBeCloseTo(20, 6);
    expect(estimateTextWidth('ab', 10)).toBeCloseTo(11, 6);
    expect(estimateTextWidth('', 10)).toBe(0);
    expect(estimateTextWidth(null, 10)).toBe(0);
  });

  it('폭 안에 들어가면 그대로 둔다', () => {
    expect(truncateToWidth('홍길동', 100, 11)).toBe('홍길동');
  });

  it('넘치면 말줄임을 붙이고 폭 안에 맞춘다', () => {
    const out = truncateToWidth('아주아주긴이름입니다', 44, 11);
    expect(out.endsWith('…')).toBe(true);
    expect(estimateTextWidth(out, 11)).toBeLessThanOrEqual(44);
  });

  it('한 글자도 못 넣으면 말줄임만', () => {
    expect(truncateToWidth('홍길동', 1, 11)).toBe('…');
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
    // 카드 좌상단 = 중심 − 카드 절반. viewBox 좌표계라 화면 좌표가 그대로 들어간다.
    expect(html).toContain(`<rect x="${200 - NODE_W / 2}" y="${100 - NODE_H / 2}" width="${NODE_W}" height="${NODE_H}"`);
    expect(html).toContain(`<rect x="${500 - NODE_W / 2}" y="${300 - NODE_H / 2}" width="${NODE_W}" height="${NODE_H}"`);
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
    expect(html.match(/<image /g)).toHaveLength(1);
    expect(html).toContain('preserveAspectRatio="xMidYMid slice"'); // object-fit: cover
    expect(html).toContain(`y="${300 - NODE_H_PHOTO / 2}" width="${NODE_W}" height="${NODE_H_PHOTO}"`);
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
    expect(html).not.toContain('>연인</text>');
    expect(html).not.toContain('rx="3"'); // 라벨 배경 박스도 없다 (카드 이름 텍스트와 구분)
  });

  it('좌표가 없는 노드를 가리키는 관계선은 건너뛴다', () => {
    const html = buildRelationshipPrintHtml({
      ...base,
      edges: [{ id: 'e1', fromId: 'a', toId: '없는놈', label: '연인' }],
    });
    expect(html).not.toContain('<line ');
  });

  // ── 인쇄 팝업에서 방향을 바꿔도 관계도가 사라지지 않아야 한다.
  // 방향 의존 px를 심으면 페이지 박스만 회전하고 값은 그대로여서 밖으로 밀려난다.
  it('축소·정렬을 고정 px로 심지 않는다 (페이지 상대 배치)', () => {
    [700, 1400, 3000].forEach(width => {
      ['landscape', 'portrait', undefined].forEach(orientation => {
        const html = buildRelationshipPrintHtml({ ...base, width, orientation });
        expect(html).not.toContain('transform:scale(');
        expect(html).not.toContain('margin-top:');
        expect(html).not.toMatch(/height:\s*\d+(\.\d+)?px/);
        // 축소·가운데 정렬은 viewBox + meet가 페이지 박스 기준으로 처리한다
        expect(html).toContain(`viewBox="0 0 ${width} ${CANVAS_H}"`);
        expect(html).toContain('preserveAspectRatio="xMidYMid meet"');
        expect(html).toContain('svg.diagram{width:100%;height:100%');
        expect(html).toContain('html,body{height:100%');
      });
    });
  });

  it('본문이 페이지 높이를 기준으로 배치된다', () => {
    const html = buildRelationshipPrintHtml(base);
    expect(html).toContain('body{display:flex;flex-direction:column;overflow:hidden}');
    expect(html).toContain('.stage{flex:1 1 auto;min-height:0;display:flex}');
  });

  it('@page size가 방향을 반영한다', () => {
    expect(buildRelationshipPrintHtml({ ...base, orientation: 'landscape' })).toContain('@page{size:A4 landscape');
    expect(buildRelationshipPrintHtml({ ...base, orientation: 'portrait' })).toContain('@page{size:A4 portrait');
  });

  it('방향을 안 주면 가로로 출력한다 (기존 작품 폴백)', () => {
    expect(buildRelationshipPrintHtml(base)).toContain('@page{size:A4 landscape');
    expect(buildRelationshipPrintHtml({ ...base, orientation: 'xxx' })).toContain('@page{size:A4 landscape');
  });

  it('방향은 @page size에만 반영되고 본문은 동일하다', () => {
    const l = buildRelationshipPrintHtml({ ...base, orientation: 'landscape' });
    const p = buildRelationshipPrintHtml({ ...base, orientation: 'portrait' });
    const body = html => html.slice(html.indexOf('<body>'));
    expect(body(l)).toBe(body(p)); // 본문에 방향 의존 값이 없다
  });

  it('여백은 기존 인쇄 설정과 동일하다', () => {
    expect(buildRelationshipPrintHtml(base))
      .toContain(`margin:${PAGE.top}mm ${PAGE.right}mm ${PAGE.bottom}mm ${PAGE.left}mm`);
  });

  it('역할 칩도 SVG로 그린다', () => {
    const html = buildRelationshipPrintHtml({
      ...base,
      nodes: [node('a', 200, 100, { roles: [{ label: '주인공', color: '#c33' }] })],
    });
    expect(html).toContain('>주인공</text>');
    expect(html).toContain('stroke="#c33"');
  });

  it('긴 이름은 카드 폭에 맞춰 말줄임', () => {
    const html = buildRelationshipPrintHtml({
      ...base,
      nodes: [node('a', 200, 100, { name: '아주아주아주긴인물이름' })],
    });
    expect(html).toContain('…</text>');
  });

  it('노드가 없어도 깨지지 않는다', () => {
    const html = buildRelationshipPrintHtml({ title: 't', width: 700, nodes: [], edges: [] });
    expect(html).toContain('<svg');
    expect(html).not.toContain('<line ');
  });
});
