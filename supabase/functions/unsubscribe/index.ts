/**
 * unsubscribe — 뉴스레터 수신거부 처리
 *
 * GET /functions/v1/unsubscribe?token=<unsubscribe_token>
 * → email_subscribers.unsubscribed_at 업데이트 → 완료 HTML 반환
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

function htmlPage(title: string, message: string) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f9fafb; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .box { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
           padding: 40px 48px; text-align: center; max-width: 420px; }
    h1 { margin: 0 0 12px; font-size: 20px; color: #111827; }
    p  { margin: 0 0 24px; font-size: 14px; color: #6b7280; line-height: 1.6; }
    a  { display: inline-block; background: #111827; color: #fff; text-decoration: none;
         padding: 10px 24px; border-radius: 8px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://daejak.kr">대본 작업실로 돌아가기</a>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response(htmlPage('잘못된 링크', '유효하지 않은 수신거부 링크입니다.'), {
      status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const { data, error } = await supabase
    .from('email_subscribers')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)
    .is('unsubscribed_at', null)
    .select('email')
    .maybeSingle();

  if (error) {
    return new Response(htmlPage('오류 발생', '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'), {
      status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (!data) {
    // 이미 수신거부됐거나 토큰 불일치
    return new Response(htmlPage('이미 처리됨', '이미 수신거부 처리된 이메일이거나 유효하지 않은 링크입니다.'), {
      status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return new Response(htmlPage('수신거부 완료', '뉴스레터 수신이 해제되었습니다.<br>언제든 다시 구독하실 수 있습니다.'), {
    status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
