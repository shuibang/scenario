// 쿠팡 파트너스 Open API HMAC-SHA256 인증 헬퍼.
// Secret Key가 노출되면 안 되므로 반드시 서버사이드(Vercel Serverless)에서만 사용.
import crypto from 'node:crypto';

const COUPANG_API_HOST = 'https://api-gateway.coupang.com';

function buildSignedDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yy = pad(now.getUTCFullYear() % 100);
  const mm = pad(now.getUTCMonth() + 1);
  const dd = pad(now.getUTCDate());
  const HH = pad(now.getUTCHours());
  const MM = pad(now.getUTCMinutes());
  const SS = pad(now.getUTCSeconds());
  return `${yy}${mm}${dd}T${HH}${MM}${SS}Z`;
}

function buildAuthHeader({ method, path, query, accessKey, secretKey, signedDate }) {
  const message = signedDate + method.toUpperCase() + path + (query || '');
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${signedDate}, signature=${signature}`;
}

export async function coupangFetch({ method = 'GET', path, query = '', timeoutMs = 4000 } = {}) {
  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;
  if (!accessKey || !secretKey) {
    return { ok: false, status: 503, error: 'COUPANG_KEYS_NOT_SET' };
  }

  const signedDate = buildSignedDate();
  const auth = buildAuthHeader({ method, path, query, accessKey, secretKey, signedDate });
  const url = `${COUPANG_API_HOST}${path}${query ? `?${query}` : ''}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json;charset=UTF-8',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `COUPANG_API_${res.status}` };
    }
    const data = await res.json();
    return { ok: true, status: 200, data };
  } catch (e) {
    const reason = e?.name === 'AbortError' ? 'COUPANG_TIMEOUT' : 'COUPANG_FETCH_FAILED';
    return { ok: false, status: 504, error: reason };
  } finally {
    clearTimeout(t);
  }
}
