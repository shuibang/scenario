/**
 * weekly-newsletter - 주간 업데이트 뉴스레터 발송
 *
 * 공지사항(badge 있음): 전문 표시
 * 업데이트 내역(badge 없음): 제목 목록만, 클릭 시 notice 페이지로
 *
 * pg_cron 으로 매주 월요일 00:00 UTC (= 09:00 KST) 호출.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_KEY   = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_ADDRESS = 'no-reply@daejak.kr';
const APP_URL      = 'https://daejak.kr';
const NOTICE_URL   = 'https://daejak.kr/notice';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

type Item = { id: string; date: string; title: string; content: string; badge: string | null };

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function contentToHtml(content: string) {
  return content.split(/\n{2,}/).filter(p => p.length > 0)
    .map(p => `<p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.7;">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function buildEmailHtml(items: Item[], unsubToken: string) {
  const notices = items.filter(i => i.badge);
  const updates = items.filter(i => !i.badge);

  const noticesHtml = notices.length === 0 ? '' : `
    <div style="margin-bottom:28px;">
      <div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;">
        공지사항
      </div>
      ${notices.map(item => `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:20px 24px;margin-bottom:12px;">
        <div style="font-size:11px;color:#9ca3af;margin-bottom:6px;">${esc(item.date)}</div>
        <div style="font-size:15px;font-weight:600;color:#111827;margin-bottom:14px;">${esc(item.title)}</div>
        ${contentToHtml(item.content)}
      </div>`).join('')}
    </div>`;

  const updatesHtml = updates.length === 0 ? '' : `
    <div style="margin-bottom:28px;">
      <div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;">
        업데이트 내역
      </div>
      ${updates.map(item => `
      <a href="${NOTICE_URL}" style="display:block;padding:12px 16px;margin-bottom:8px;border-radius:8px;border:1px solid #e5e7eb;text-decoration:none;color:inherit;">
        <span style="font-size:11px;color:#9ca3af;margin-right:10px;">${esc(item.date)}</span>
        <span style="font-size:14px;color:#111827;">${esc(item.title)}</span>
      </a>`).join('')}
      <div style="margin-top:10px;text-align:right;">
        <a href="${NOTICE_URL}" style="font-size:12px;color:#6b7280;text-decoration:none;">전체 업데이트 보기 →</a>
      </div>
    </div>`;

  const unsubUrl = `${SUPABASE_URL}/functions/v1/unsubscribe?token=${unsubToken}`;

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
<tr><td align="center">
<table width="760" cellpadding="0" cellspacing="0" style="max-width:760px;width:100%;">
  <tr><td style="background:#111827;border-radius:12px 12px 0 0;padding:24px 32px;">
    <a href="${APP_URL}" style="text-decoration:none;font-size:20px;font-weight:700;color:#fff;">
      🎬 대본 작업실
    </a>
    <span style="float:right;font-size:12px;color:#9ca3af;line-height:30px;">주간 업데이트</span>
  </td></tr>
  <tr><td style="background:#fff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
    <p style="margin:0 0 28px;font-size:15px;color:#374151;">
      안녕하세요! 이번 주 업데이트 내용을 정리해 드려요.
    </p>
    ${noticesHtml}
    ${updatesHtml}
    <div style="text-align:center;margin-top:8px;">
      <a href="${APP_URL}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
        대본 작업실 바로가기 →
      </a>
    </div>
  </td></tr>
  <tr><td style="background:#f3f4f6;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;padding:20px 32px;text-align:center;font-size:12px;color:#9ca3af;">
    문의: <a href="mailto:daejak.official@gmail.com" style="color:#6b7280;">daejak.official@gmail.com</a>
    &nbsp;|&nbsp;
    <a href="${unsubUrl}" style="color:#9ca3af;">수신거부</a>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString().split('T')[0];

  const { data: items, error: itemsErr } = await supabase
    .from('newsletter_items')
    .select('id, date, title, content, badge')
    .gte('date', sinceStr)
    .order('date', { ascending: false });

  if (itemsErr) return new Response(itemsErr.message, { status: 500 });
  if (!items || items.length === 0) {
    return new Response(JSON.stringify({ skipped: true, reason: 'no items in past 7 days' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: subscribers, error: subErr } = await supabase
    .from('email_subscribers')
    .select('email, unsubscribe_token')
    .is('unsubscribed_at', null);

  if (subErr) return new Response(subErr.message, { status: 500 });
  if (!subscribers || subscribers.length === 0) {
    return new Response(JSON.stringify({ skipped: true, reason: 'no active subscribers' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const subject = `[대본 작업실] 주간 업데이트 (${items[0].date})`;

  const emails = subscribers.map(sub => ({
    from: FROM_ADDRESS,
    to: sub.email,
    subject,
    html: buildEmailHtml(items as Item[], sub.unsubscribe_token),
  }));

  const resendRes = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emails),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    return new Response(`Resend error: ${errText}`, { status: 500 });
  }

  await supabase.from('newsletter_send_logs').insert({
    subject,
    recipient_count: subscribers.length,
    item_ids: items.map(i => i.id),
  });

  return new Response(
    JSON.stringify({ sent: subscribers.length, items: items.length }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
