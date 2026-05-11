// GET /api/coupang/products?slot=<slot>&limit=<n>
//
// 슬롯명을 받아 그 슬롯에 매핑된 키워드로 쿠팡 파트너스 상품 검색을 호출하고
// 표준화된 형태의 상품 배열을 반환한다.
//
// - 메모리 캐시 6시간 (서버리스 인스턴스 워밍 동안에만 유효)
// - Vercel Edge 캐시는 s-maxage로 1시간 + stale-while-revalidate 6시간
// - 키 미설정 시 503 + items=[]로 graceful fallback (UI는 빈 자리만 보임)
import { coupangFetch } from '../_lib/coupangAuth.js';
import { pickKeyword } from '../_lib/coupangSlotMap.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

const COUPANG_SEARCH_PATH = '/v2/providers/affiliate_open_api/apis/openapi/products/search';

function normalizeItem(p) {
  return {
    productId: p.productId ?? null,
    productName: p.productName ?? '',
    productPrice: typeof p.productPrice === 'number' ? p.productPrice : Number(p.productPrice) || 0,
    productImage: p.productImage ?? '',
    productUrl: p.productUrl ?? '',
    isRocket: Boolean(p.isRocket),
    isFreeShipping: Boolean(p.isFreeShipping),
    categoryName: p.categoryName ?? '',
  };
}

export default async function handler(req, res) {
  const slot = String(req.query.slot || '').slice(0, 64);
  const limitRaw = Number(req.query.limit);
  const limit = Math.max(1, Math.min(10, Number.isFinite(limitRaw) ? limitRaw : 3));

  if (!slot) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'slot_required', items: [] });
  }

  const keyword = pickKeyword(slot);
  const cacheKey = `${slot}|${keyword}|${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=21600');
    res.setHeader('X-Coupang-Cache', 'HIT');
    return res.status(200).json(cached.data);
  }

  const query = `keyword=${encodeURIComponent(keyword)}&limit=${limit}`;
  const result = await coupangFetch({ method: 'GET', path: COUPANG_SEARCH_PATH, query });

  if (!result.ok) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Coupang-Cache', 'MISS');
    return res.status(result.status === 503 ? 200 : 502).json({
      slot,
      keyword,
      error: result.error,
      items: [],
    });
  }

  const rawList = result.data?.data?.productData
    || result.data?.data
    || [];
  const items = Array.isArray(rawList) ? rawList.slice(0, limit).map(normalizeItem) : [];

  const payload = { slot, keyword, items };
  cache.set(cacheKey, { data: payload, expires: Date.now() + CACHE_TTL_MS });

  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=21600');
  res.setHeader('X-Coupang-Cache', 'MISS');
  return res.status(200).json(payload);
}
