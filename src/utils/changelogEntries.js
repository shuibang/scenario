/**
 * changelog.html → 뉴스레터 항목 파싱 (scripts/syncAnnouncements.js 전용).
 *
 * 주석 형식이 두 가지다.
 *   버전형: <!-- v50~51 (2026-05-28) — ... -->   (2026-05-28 이전 39건)
 *   날짜형: <!-- 2026-08-15 — ... -->            (그 이후)
 * 원래 정규식이 버전형만 인식해서 6월 이후 항목이 조용히 누락되고 있었다.
 *
 * id 규칙 — 한 번 정해진 id는 절대 바뀌면 안 된다.
 * newsletter_send_logs의 item_ids와 upsert의 onConflict 기준이라,
 * id가 바뀌면 이미 발송한 항목이 새 항목으로 잡혀 재발송된다.
 *   버전형: cl-v50-51   (기존 그대로. '~'만 '-'로 치환)
 *   날짜형: cl-2026-08-15  (표시 날짜 기준)
 */

// 주석의 버전/날짜 마커 → 항목 블록의 날짜·제목까지 한 번에 잡는다.
const ENTRY_RE = new RegExp(
  '<!--\\s*(?:(v[\\d~]+)|(\\d{4}-\\d{2}-\\d{2}))[^\\n]*\\n' +
  '\\s*<div class="cl-entry[\\s\\S]*?' +
  '<div class="cl-date">([\\d-]+)</div>\\s*' +
  '<div class="cl-title">([\\s\\S]*?)</div>',
  'g',
);

export function parseChangelogEntries(html) {
  const rows = [];
  const re = new RegExp(ENTRY_RE.source, 'g'); // 호출마다 lastIndex 초기화
  let match;

  while ((match = re.exec(String(html ?? ''))) !== null) {
    const [, version, commentDate, date, rawTitle] = match;
    const id = version
      ? `cl-${version.replace(/~/g, '-')}`   // 기존 id 불변
      : `cl-${(date || commentDate).trim()}`;
    rows.push({
      id,
      date: date.trim(),
      title: rawTitle.trim().replace(/\s+/g, ' '),
      content: '',
      badge: null,
      format: version ? 'version' : 'date',   // 리포트용 (DB 컬럼 아님)
    });
  }

  return rows;
}

// upsert에 넣을 형태 — 리포트용 format 필드는 뺀다.
export function toNewsletterRows(entries) {
  return entries.map(({ format, ...row }) => row); // eslint-disable-line no-unused-vars
}
