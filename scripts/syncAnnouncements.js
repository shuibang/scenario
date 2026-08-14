/**
 * Sync announcement sources into Supabase `newsletter_items`
 * and generate a local preview HTML file.
 *
 * Run:
 *   node scripts/syncAnnouncements.js
 *   node scripts/syncAnnouncements.js --dry-run   // DB 쓰기 없이 파싱 결과만 출력
 *
 * Env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_SERVICE_KEY        // legacy alias
 *   (--dry-run 은 환경변수 없이도 실행된다)
 */
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseChangelogEntries, toNewsletterRows } from '../src/utils/changelogEntries.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const NOTICE_URL = 'https://daejak.kr/notice';
const CHANGELOG_URL = 'https://daejak.kr/changelog';

function loadEnv() {
  try {
    const env = readFileSync(path.resolve(ROOT, '.env'), 'utf8');
    for (const line of env.split('\n')) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
    }
  } catch {
    // Ignore missing .env in CI.
  }
}

loadEnv();

const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).');
  process.exit(1);
}

const supabase = DRY_RUN ? null : createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const dataFileUrl = pathToFileURL(path.resolve(ROOT, 'src/data/announcements.js')).href;
const { announcements } = await import(dataFileUrl);

const announcementRows = announcements.map(({ id, date, title, content, badge }) => ({
  id,
  date,
  title,
  content,
  badge: badge ?? null,
}));

const changelogEntries = parseChangelogEntries(
  readFileSync(path.resolve(ROOT, 'public/changelog.html'), 'utf8'),
);
const changelogRows = toNewsletterRows(changelogEntries);
const versionCount = changelogEntries.filter(e => e.format === 'version').length;
const dateCount = changelogEntries.filter(e => e.format === 'date').length;
console.log(`changelog parsed: ${changelogRows.length} (version=${versionCount}, date=${dateCount})`);

const rows = [...announcementRows, ...changelogRows];

if (DRY_RUN) {
  console.log(`\n[dry-run] DB에 쓰지 않습니다. upsert 대상 ${rows.length}건`);
  console.log(`  공지사항 ${announcementRows.length} / 업데이트 내역 ${changelogRows.length}`);
  console.log('\n[dry-run] 업데이트 내역 id 목록 (최신순)');
  for (const e of changelogEntries) {
    console.log(`  ${e.format === 'date' ? '날짜' : '버전'}  ${e.id.padEnd(18)} ${e.date}  ${e.title}`);
  }
  console.log('\n[dry-run] 공지사항 id 목록');
  for (const r of announcementRows) console.log(`  ${String(r.id).padEnd(18)} ${r.date}  ${r.title}`);
  process.exit(0);
}

const { error } = await supabase
  .from('newsletter_items')
  .upsert(rows, { onConflict: 'id', ignoreDuplicates: false });

if (error) {
  console.error('newsletter_items upsert failed:', error.message);
  process.exit(1);
}

console.log(`newsletter_items upserted: notices=${announcementRows.length}, changelog=${changelogRows.length}`);

const since = new Date();
since.setDate(since.getDate() - 7);
const sinceStr = since.toISOString().split('T')[0];
const recent = rows.filter(row => row.date >= sinceStr);
const notices = recent.filter(row => row.badge);
const updates = recent.filter(row => !row.badge);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function contentToHtml(content) {
  return String(content ?? '')
    .split(/\n{2,}/)
    .filter(Boolean)
    .map(paragraph => (
      `<p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.7;">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`
    ))
    .join('');
}

const noticesHtml = notices.length === 0 ? '' : `
  <div style="margin-bottom:28px;">
    <div style="font-size:13px;font-weight:700;color:#6b7280;letter-spacing:.05em;margin-bottom:12px;">공지사항</div>
    ${notices.map(item => `
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:20px 24px;margin-bottom:12px;">
      <div style="font-size:11px;color:#9ca3af;margin-bottom:4px;">${escapeHtml(item.date)}</div>
      <div style="font-size:15px;font-weight:600;color:#111827;margin-bottom:12px;">${escapeHtml(item.title)}</div>
      ${contentToHtml(item.content)}
    </div>`).join('')}
  </div>`;

const updatesHtml = updates.length === 0 ? '' : `
  <div style="margin-bottom:28px;">
    <div style="font-size:13px;font-weight:700;color:#6b7280;letter-spacing:.05em;margin-bottom:12px;">업데이트 내역</div>
    ${updates.map(item => `
    <a href="${CHANGELOG_URL}" style="display:block;padding:12px 16px;margin-bottom:8px;border-radius:8px;border:1px solid #e5e7eb;text-decoration:none;">
      <span style="font-size:11px;color:#9ca3af;margin-right:8px;">${escapeHtml(item.date)}</span>
      <span style="font-size:14px;color:#111827;">${escapeHtml(item.title)}</span>
    </a>`).join('')}
    <div style="margin-top:8px;text-align:right;">
      <a href="${NOTICE_URL}" style="font-size:12px;color:#6b7280;">전체 업데이트 보기 →</a>
    </div>
  </div>`;

const previewHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>뉴스레터 미리보기 - 대본 작업실</title>
</head>
<body style="margin:0;padding:32px 16px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:24px;font-size:13px;color:#856404;max-width:760px;margin-left:auto;margin-right:auto;">
  로컬 미리보기 모드이며 실제 발송은 일어나지 않습니다. 생성: ${new Date().toLocaleString('ko-KR')}
</div>
<div style="max-width:760px;margin:0 auto;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="background:#111827;border-radius:12px 12px 0 0;padding:24px 32px;">
      <a href="https://daejak.kr" style="text-decoration:none;font-size:20px;font-weight:700;color:#fff;">대본 작업실</a>
      <span style="float:right;font-size:12px;color:#9ca3af;line-height:28px;">주간 업데이트</span>
    </td></tr>
    <tr><td style="background:#fff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
      <p style="margin:0 0 28px;font-size:15px;color:#374151;">안녕하세요. 이번 주 업데이트 내용을 정리해 드려요.</p>
      ${noticesHtml}
      ${updatesHtml}
      <div style="text-align:center;">
        <a href="https://daejak.kr" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">대본 작업실 바로가기 →</a>
      </div>
    </td></tr>
    <tr><td style="background:#f3f4f6;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;padding:20px 32px;text-align:center;font-size:12px;color:#9ca3af;">
      문의: <a href="mailto:daejak.official@gmail.com" style="color:#6b7280;">daejak.official@gmail.com</a>
      &nbsp;|&nbsp;
      <a href="#" style="color:#9ca3af;">수신거부</a>
    </td></tr>
  </table>
</div>
</body>
</html>`;

const outFile = path.resolve(ROOT, 'public/newsletter-preview.html');
writeFileSync(outFile, previewHtml, 'utf8');
console.log('Generated public/newsletter-preview.html');
