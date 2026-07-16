import React, { useEffect, useState } from 'react';
import { useApp } from '../store/AppContext';

const IS_DEV = import.meta.env.DEV;

const AD_ALLOWED_HOSTS = ['link.coupang.com', 'coupa.ng', 'www.coupang.com'];
function isSafeAdUrl(url) {
  try { return AD_ALLOWED_HOSTS.includes(new URL(url).hostname); } catch { return false; }
}

// 카카오 애드핏 스크립트 로더 (페이지당 1회만 삽입)
const KAKAO_SCRIPT_ID = 'kakao-adfit-loader';
function ensureKakaoScript() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KAKAO_SCRIPT_ID)) return;
  const s = document.createElement('script');
  s.id = KAKAO_SCRIPT_ID;
  s.async = true;
  s.src = 'https://t1.kakaocdn.net/kas/static/ba.min.js';
  document.head.appendChild(s);
}

// AppProvider 없이도 사용 가능한 순수 렌더 컴포넌트. isPro を prop で受け取る.
// SharedReviewView 처럼 AppProvider 바깥에서 렌더되는 경우에 사용.
export function KakaoAdBannerBase({ unitId, width, height, mobileHide = false, style = {}, className = '', isPro = false }) {
  useEffect(() => {
    if (IS_DEV || isPro) return;
    ensureKakaoScript();
  }, [isPro]);

  if (isPro) return null;

  const visibilityClass = mobileHide ? 'hidden md:block' : 'block';
  const boxStyle = { ...style, minHeight: height, maxHeight: height, boxSizing: 'border-box' };

  if (IS_DEV) {
    return (
      <div
        className={`${visibilityClass} shrink-0 ${className}`}
        style={{ ...boxStyle, background: 'rgba(124,58,237,0.15)', border: '1px dashed #7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <span style={{ fontSize: 10, color: '#5b21b6', fontWeight: 600 }}>KAKAO {unitId} {width}×{height}</span>
      </div>
    );
  }

  return (
    <div
      className={`${visibilityClass} shrink-0 ${className}`}
      style={{ ...boxStyle, display: 'flex', justifyContent: 'center', overflow: 'hidden' }}
    >
      <ins
        className="kakao_ad_area"
        style={{ display: 'none' }}
        data-ad-unit={unitId}
        data-ad-width={String(width)}
        data-ad-height={String(height)}
      />
    </div>
  );
}

// AppProvider 내부에서만 사용. useApp()으로 isPro를 읽어 KakaoAdBannerBase에 전달.
export function KakaoAdBanner(props) {
  const { state } = useApp();
  return <KakaoAdBannerBase {...props} isPro={state.isPro} />;
}

// 모바일 하단 고정 광고 — 카카오 애드핏
export function MobileBottomAd() {
  return <KakaoAdBanner unitId="DAN-0Eobamy6SYfeIpxd" width={320} height={100} mobileHide={false} />;
}

// 동일 슬롯·동일 6시간 윈도우 안에서는 fetch를 한 번만 하도록 모듈 캐시.
// (페이지 전환 후 다시 마운트되어도 네트워크 호출이 반복되지 않음)
const moduleCache = new Map(); // slot → { items, fetchedAt }
const MODULE_CACHE_TTL = 6 * 60 * 60 * 1000;

function getCached(slot) {
  const e = moduleCache.get(slot);
  if (!e) return null;
  if (Date.now() - e.fetchedAt > MODULE_CACHE_TTL) {
    moduleCache.delete(slot);
    return null;
  }
  return e.items;
}

function setCached(slot, items) {
  moduleCache.set(slot, { items, fetchedAt: Date.now() });
}

function formatPrice(n) {
  if (!n || !Number.isFinite(Number(n))) return '';
  return Number(n).toLocaleString() + '원';
}

export default function AdBanner({ slot, mobileHide = true, height = 56, style = {}, className = '' }) {
  const { state } = useApp();
  // 마운트 시점에 캐시 hit이면 곧바로 'ok'로 시작. slot은 인스턴스 수명 동안 변하지 않는다는 전제.
  const [items, setItems] = useState(() => getCached(slot));
  const [status, setStatus] = useState(() => (getCached(slot) ? 'ok' : 'idle'));

  useEffect(() => {
    if (state.isPro || IS_DEV || !slot) return undefined;
    if (getCached(slot)) return undefined;
    const ctrl = new AbortController();
    fetch(`/api/coupang/products?slot=${encodeURIComponent(slot)}&limit=1`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        const arr = Array.isArray(json?.items) ? json.items : [];
        if (arr.length === 0) {
          setStatus('empty');
          return;
        }
        setCached(slot, arr);
        setItems(arr);
        setStatus('ok');
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return;
        setStatus('error');
      });
    return () => ctrl.abort();
  }, [slot, state.isPro]);

  if (state.isPro) return null;

  const visibilityClass = mobileHide ? 'hidden md:block' : 'block';
  const baseBoxStyle = { ...style, minHeight: height, maxHeight: height, boxSizing: 'border-box' };

  // dev placeholder (기존 동일)
  if (IS_DEV) {
    return (
      <div
        className={`${visibilityClass} shrink-0 ${className}`}
        style={{
          ...baseBoxStyle,
          background: 'rgba(253,224,71,0.35)',
          border: '1px dashed #ca8a04',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 10, color: '#92400e', fontWeight: 600 }}>AD {slot}</span>
      </div>
    );
  }

  // 운영 환경: 로딩/실패/빈 응답 → 자리만 차지하는 옅은 placeholder
  // (키 미설정 또는 API 실패 시 동일 처리. 부모 레이아웃이 무너지지 않도록 height은 유지)
  if (status !== 'ok' || !items || items.length === 0) {
    return (
      <div
        className={`${visibilityClass} shrink-0 ${className}`}
        style={{
          ...baseBoxStyle,
          background: 'rgba(0,0,0,0.015)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          color: '#cbd5e1',
        }}
        aria-hidden="true"
      >
        <span>광고</span>
      </div>
    );
  }

  const p = items[0];
  const isCard = height >= 100;
  const adBadge = (
    <span
      style={{
        fontSize: 9,
        padding: '1px 4px',
        borderRadius: 3,
        background: 'rgba(0,0,0,0.55)',
        color: '#fff',
        fontWeight: 600,
        letterSpacing: '0.02em',
      }}
    >
      AD
    </span>
  );

  return (
    <a
      href={isSafeAdUrl(p.productUrl) ? p.productUrl : undefined}
      target="_blank"
      rel="noopener noreferrer sponsored nofollow"
      className={`${visibilityClass} shrink-0 overflow-hidden ${className}`}
      style={{
        ...baseBoxStyle,
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        overflow: 'hidden',
      }}
      title={p.productName}
      data-coupang-slot={slot}
    >
      {isCard ? (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div
            style={{
              position: 'relative',
              flex: 1,
              minHeight: 0,
              background: '#f9fafb',
              backgroundImage: `url("${p.productImage}")`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          >
            <div style={{ position: 'absolute', top: 4, right: 4 }}>{adBadge}</div>
          </div>
          <div style={{ padding: '4px 6px', fontSize: 10, lineHeight: 1.3 }}>
            <div
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: '#374151',
              }}
            >
              {p.productName}
            </div>
            <div style={{ color: '#dc2626', fontWeight: 700 }}>{formatPrice(p.productPrice)}</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', height: '100%', alignItems: 'center', gap: 8, padding: '0 8px' }}>
          {p.productImage ? (
            <img
              src={p.productImage}
              alt=""
              loading="lazy"
              style={{ height: '100%', width: 'auto', maxHeight: height, objectFit: 'contain', flexShrink: 0 }}
            />
          ) : null}
          <div style={{ flex: 1, minWidth: 0, fontSize: 11, lineHeight: 1.3 }}>
            <div
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: '#374151',
              }}
            >
              {p.productName}
            </div>
            <div style={{ color: '#dc2626', fontWeight: 700, fontSize: 11 }}>
              {formatPrice(p.productPrice)}
            </div>
          </div>
          {adBadge}
        </div>
      )}
    </a>
  );
}
