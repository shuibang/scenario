import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORIENTATION,
  PAGE,
  TITLE_BLOCK_H,
  buildRelationshipPrintHtml,
  computePrintLayout,
  computePrintScale,
  escapeHtml,
  normalizeOrientation,
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

describe('pageContentPx', () => {
  it('세로: A4에서 기존 인쇄 여백을 뺀 콘텐츠 크기', () => {
    const { w, h } = pageContentPx('portrait');
    expect(Math.round(w)).toBe(Math.round((PAGE.w - PAGE.left - PAGE.right) * (96 / 25.4))); // 150mm ≈ 567px
    expect(Math.round(h)).toBe(Math.round((PAGE.h - PAGE.top - PAGE.bottom) * (96 / 25.4))); // 232mm ≈ 877px
  });

  it('가로: 폭·높이가 뒤바뀐다', () => {
    const { w, h } = pageContentPx('landscape');
    expect(Math.round(w)).toBe(Math.round((PAGE.h - PAGE.left - PAGE.right) * (96 / 25.4))); // 237mm ≈ 896px
    expect(Math.round(h)).toBe(Math.round((PAGE.w - PAGE.top - PAGE.bottom) * (96 / 25.4))); // 145mm ≈ 548px
  });

  it('가로가 세로보다 넓고 낮다', () => {
    const l = pageContentPx('landscape');
    const p = pageContentPx('portrait');
    expect(l.w).toBeGreaterThan(p.w);
    expect(l.h).toBeLessThan(p.h);
  });
});

describe('computePrintLayout', () => {
  it('방향별로 축소 비율이 달라진다 (가로가 덜 줄어든다)', () => {
    const l = computePrintLayout(1200, 'landscape');
    const p = computePrintLayout(1200, 'portrait');
    expect(l.scale).toBeGreaterThan(p.scale);
  });

  it('남는 세로 여백을 위아래로 균등 분배한다', () => {
    const { scale, offsetY, available } = computePrintLayout(700, 'landscape');
    expect(offsetY).toBeCloseTo((available - CANVAS_H * scale) / 2, 6);
    // 위 여백 + 관계도 + 아래 여백 = 사용 가능한 높이
    expect(offsetY * 2 + CANVAS_H * scale).toBeCloseTo(available, 6);
  });

  it('꽉 차면 오프셋은 0 (음수로 밀지 않는다)', () => {
    const { scale, offsetY, available } = computePrintLayout(5000, 'portrait');
    expect(CANVAS_H * scale).toBeLessThanOrEqual(available + 1e-9);
    expect(offsetY).toBeGreaterThanOrEqual(0);
  });

  it('두 방향 모두 페이지를 벗어나지 않는다', () => {
    ['landscape', 'portrait'].forEach(o => {
      [400, 700, 1400, 3000].forEach(w => {
        const { scale, offsetY, content, available } = computePrintLayout(w, o);
        expect(w * scale).toBeLessThanOrEqual(content.w + 1e-9);
        expect(offsetY + CANVAS_H * scale).toBeLessThanOrEqual(available + 1e-9);
      });
    });
  });

  it('방향 미지정은 가로와 동일', () => {
    expect(computePrintLayout(700)).toEqual(computePrintLayout(700, 'landscape'));
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
    const wide = buildRelationshipPrintHtml({ ...base, width: 1400, orientation: 'portrait' });
    const content = pageContentPx('portrait');
    const expected = computePrintScale(1400, CANVAS_H, content.w, content.h - TITLE_BLOCK_H);
    expect(expected).toBeLessThan(1);
    expect(wide).toContain(`transform:scale(${expected})`);
  });

  it('@page size가 방향을 반영한다', () => {
    expect(buildRelationshipPrintHtml({ ...base, orientation: 'landscape' })).toContain('@page{size:A4 landscape');
    expect(buildRelationshipPrintHtml({ ...base, orientation: 'portrait' })).toContain('@page{size:A4 portrait');
  });

  it('방향을 안 주면 가로로 출력한다 (기존 작품 폴백)', () => {
    expect(buildRelationshipPrintHtml(base)).toContain('@page{size:A4 landscape');
    expect(buildRelationshipPrintHtml({ ...base, orientation: 'xxx' })).toContain('@page{size:A4 landscape');
  });

  it('세로 가운데 정렬 오프셋을 margin-top으로 넣는다', () => {
    ['landscape', 'portrait'].forEach(o => {
      const html = buildRelationshipPrintHtml({ ...base, orientation: o });
      expect(html).toContain(`margin-top:${computePrintLayout(base.width, o).offsetY}px`);
    });
  });

  it('방향이 카드 좌표를 바꾸지 않는다 (화면 배치 유지)', () => {
    const l = buildRelationshipPrintHtml({ ...base, orientation: 'landscape' });
    const p = buildRelationshipPrintHtml({ ...base, orientation: 'portrait' });
    const card = `left:${200 - NODE_W / 2}px;top:${100 - NODE_H / 2}px`;
    expect(l).toContain(card);
    expect(p).toContain(card);
  });

  it('노드가 없어도 깨지지 않는다', () => {
    const html = buildRelationshipPrintHtml({ title: 't', width: 700, nodes: [], edges: [] });
    expect(html).toContain('<svg');
    expect(html).not.toContain('<line ');
  });
});
