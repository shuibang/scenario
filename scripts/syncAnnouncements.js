/**
 * src/data/announcements.js → Supabase newsletter_items 테이블 upsert
 *                           → public/newsletter-preview.html 생성
 *
 * 실행: node scripts/syncAnnouncements.js
 * 환경변수 (루트 .env 또는 shell에서 직접 설정):
 *   SUPABASE_URL              — Supabase 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role 키 (RLS 우회 필요)
 */
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..');

function loadEnv() {
  try {
    const env = readFileSync(path.resolve(ROOT, '.env'), 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch { /* .env 없으면 무시 */ }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수를 설정해주세요.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const DATA_FILE = pathToFileURL(path.resolve(ROOT, 'src/data/announcements.js')).href;
const { announcements } = await import(DATA_FILE);

// badge 필드 포함
const rows = announcements.map(({ id, date, title, content, badge }) => ({
  id, date, title, content, badge: badge ?? null,
}));

const { error } = await supabase
  .from('newsletter_items')
  .upsert(rows, { onConflict: 'id', ignoreDuplicates: false });

if (error) {
  console.error('upsert 실패:', error.message);
  process.exit(1);
}

console.log(`newsletter_items upsert 완료 — ${rows.length}개 처리`);

// ─── 미리보기 HTML 생성 ────────────────────────────────────────────────────────
const NOTICE_URL = 'https://daejak.kr/notice';
const since = new Date();
since.setDate(since.getDate() - 7);
const sinceStr = since.toISOString().split('T')[0];
const recent = rows.filter(r => r.date >= sinceStr);
const notices = recent.filter(r => r.badge);
const updates = recent.filter(r => !r.badge);

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function contentToHtml(content) {
  return String(content ?? '').split(/\n{2,}/).filter(p => p.length > 0)
    .map(p => `<p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.7;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
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
<title>뉴스레터 미리보기 — 대본 작업실</title>
</head>
<body style="margin:0;padding:32px 16px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:24px;font-size:13px;color:#856404;max-width:760px;margin-left:auto;margin-right:auto;">
  ⚠️ 미리보기 모드 — 실제 발송되지 않습니다. 생성: ${new Date().toLocaleString('ko-KR')}
</div>
<div style="max-width:760px;margin:0 auto;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="background:#111827;border-radius:12px 12px 0 0;padding:24px 32px;">
      <a href="https://daejak.kr" style="text-decoration:none;font-size:20px;font-weight:700;color:#fff;">🎬 대본 작업실</a>
      <span style="float:right;font-size:12px;color:#9ca3af;line-height:28px;">주간 업데이트</span>
    </td></tr>
    <tr><td style="background:#fff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
      <p style="margin:0 0 28px;font-size:15px;color:#374151;">안녕하세요! 이번 주 업데이트 내용을 정리해 드려요.</p>
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

const OUT = path.resolve(ROOT, 'public/newsletter-preview.html');
writeFileSync(OUT, previewHtml, 'utf8');
console.log(`미리보기 HTML 생성 완료 → public/newsletter-preview.html`);
