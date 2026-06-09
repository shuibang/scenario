import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { isWebView } from './AdBanner';

const IS_DEV = import.meta.env.DEV;
const SESSION_KEY   = 'admob_app_open_shown';
const ADMOB_PUB     = 'ca-app-pub-5479563960989185';
const APP_OPEN_SLOT = '6143295570';
const AUTO_CLOSE_MS = 5000;

export default function AdMobAppOpenAd() {
  const { state } = useApp();
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);

  // 광고 표시 여부 결정 — StrictMode 이중실행 대비: sessionStorage 가드는 유지하되
  // 타이머는 아래 별도 effect에서 처리
  useEffect(() => {
    if (state.isPro) return;

    // 데스크톱 제외: WebView가 아닌 개발 환경에서도 모바일 너비일 때만 표시
    if (!isWebView()) {
      if (!IS_DEV || window.innerWidth >= 768) return;
    }

    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');

    setOpen(true);

    if (!IS_DEV) {
      requestAnimationFrame(() => {
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 자동 닫기 타이머 — open 상태에 의존해 별도 관리.
  // StrictMode에서 위 effect가 두 번 실행되더라도 이 effect는
  // open=true가 확정된 시점에 타이머를 올바르게 재등록함.
  useEffect(() => {
    if (!open) return;
    timerRef.current = setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
    return () => clearTimeout(timerRef.current);
  }, [open]);

  if (!open) return null;

  const close = () => {
    clearTimeout(timerRef.current);
    setOpen(false);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9990,
        background: '#000',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'flex-end',
        padding: '14px 16px', flexShrink: 0,
      }}>
        <button
          onClick={close}
          style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            borderRadius: 6, padding: '6px 18px', fontSize: 13, cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          닫기
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {IS_DEV ? (
          <div style={{
            background: '#0f2044', border: '1px dashed #3b82f6',
            borderRadius: 10, padding: '32px 28px', textAlign: 'center', color: '#93c5fd',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>AdMob App Open Ad</div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>{ADMOB_PUB}/{APP_OPEN_SLOT}</div>
            <div style={{ fontSize: 10, opacity: 0.5, marginTop: 6 }}>
              세션당 1회 · {AUTO_CLOSE_MS / 1000}초 후 자동 닫기
            </div>
          </div>
        ) : (
          <ins
            className="adsbygoogle"
            style={{ display: 'block', width: 320, height: 480 }}
            data-ad-client={ADMOB_PUB}
            data-ad-slot={APP_OPEN_SLOT}
            data-ad-format="interstitial"
          />
        )}
      </div>
    </div>
  );
}
