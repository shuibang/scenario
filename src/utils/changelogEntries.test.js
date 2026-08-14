import { describe, expect, it } from 'vitest';
import { parseChangelogEntries, toNewsletterRows } from './changelogEntries';

const entry = (comment, date, title) => `
    <!-- ${comment} -->
    <div class="cl-entry">
      <div class="cl-dot"></div>
      <div class="cl-card">
        <details>
          <summary>
            <div class="cl-meta">
              <div class="cl-date">${date}</div>
              <div class="cl-title">${title}</div>
            </div>
          </summary>
        </details>
      </div>
    </div>
`;

describe('parseChangelogEntries', () => {
  it('버전 형식만 있을 때', () => {
    const rows = parseChangelogEntries(entry('v50~51 (2026-05-28) 파일 미저장 경고', '2026-05-28', '📝 제목'));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('cl-v50-51');
    expect(rows[0].date).toBe('2026-05-28');
    expect(rows[0].title).toBe('📝 제목');
  });

  it('날짜 형식만 있을 때 — 예전에는 통째로 누락되던 경우', () => {
    const rows = parseChangelogEntries(entry('2026-08-15 인물 사진', '2026-08-15', '📷 인물 사진'));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('cl-2026-08-15');
    expect(rows[0].format).toBe('date');
  });

  it('두 형식이 섞여 있으면 둘 다 파싱한다', () => {
    const html = entry('2026-08-15 최신', '2026-08-15', '📷 최신')
      + entry('2026-06-29 메모 탭', '2026-06-29', '🗒️ 메모')
      + entry('v50~51 (2026-05-28) 예전', '2026-05-28', '📝 예전');
    const rows = parseChangelogEntries(html);
    expect(rows.map(r => r.id)).toEqual(['cl-2026-08-15', 'cl-2026-06-29', 'cl-v50-51']);
    expect(rows.filter(r => r.format === 'date')).toHaveLength(2);
    expect(rows.filter(r => r.format === 'version')).toHaveLength(1);
  });

  // ── id는 절대 바뀌면 안 된다. 바뀌면 이미 발송한 항목이 재발송된다.
  it('버전 형식 id는 기존 규칙 그대로다 (재발송 방지)', () => {
    const cases = [
      ['v50~51 (2026-05-28) x', 'cl-v50-51'],
      ['v47~49 (2026-05-27) x', 'cl-v47-49'],
      ['v9 (2026-04-08) x',     'cl-v9'],
    ];
    cases.forEach(([comment, expected]) => {
      const rows = parseChangelogEntries(entry(comment, '2026-05-28', 't'));
      expect(rows[0].id).toBe(expected);
    });
  });

  it('같은 입력을 두 번 파싱해도 결과가 동일하다 (정규식 lastIndex 오염 없음)', () => {
    const html = entry('2026-08-15 a', '2026-08-15', 'A') + entry('v9 (2026-04-08) b', '2026-04-08', 'B');
    expect(parseChangelogEntries(html)).toEqual(parseChangelogEntries(html));
    expect(parseChangelogEntries(html)).toHaveLength(2);
  });

  it('날짜 id는 표시 날짜(cl-date) 기준이다', () => {
    // 주석은 기간 표기(2026-06-08~09)여도 id는 표시 날짜 하나로 고정
    const rows = parseChangelogEntries(entry('2026-06-08~09 안드로이드 베타', '2026-06-08', '📱 베타'));
    expect(rows[0].id).toBe('cl-2026-06-08');
  });

  it('제목의 줄바꿈·연속 공백은 한 칸으로 정리한다', () => {
    const rows = parseChangelogEntries(entry('2026-08-15 x', '2026-08-15', '📷 인물 사진\n   · 📍 위치'));
    expect(rows[0].title).toBe('📷 인물 사진 · 📍 위치');
  });

  it('빈 입력·항목 없음은 빈 배열', () => {
    expect(parseChangelogEntries('')).toEqual([]);
    expect(parseChangelogEntries(null)).toEqual([]);
    expect(parseChangelogEntries('<div>관계없는 내용</div>')).toEqual([]);
  });
});

describe('toNewsletterRows', () => {
  it('DB 컬럼이 아닌 format 필드를 제거한다', () => {
    const rows = toNewsletterRows(parseChangelogEntries(entry('2026-08-15 x', '2026-08-15', 'A')));
    expect(Object.keys(rows[0]).sort()).toEqual(['badge', 'content', 'date', 'id', 'title']);
    expect(rows[0].content).toBe('');
    expect(rows[0].badge).toBeNull();
  });
});
