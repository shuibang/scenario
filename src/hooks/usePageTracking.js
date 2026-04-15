import { useEffect } from 'react';

/**
 * usePageTracking — hash 변경 시 GA4 page_view 이벤트 전송
 *
 * 이 앱은 React Router 없이 window.location.hash 로 라우팅하므로
 * useLocation 대신 hashchange 이벤트를 직접 구독합니다.
 *
 * GA4 gtag가 로드되지 않은 환경(개발, 광고 차단 등)에서는 조용히 무시.
 */
function sendPageView(hash) {
  if (typeof window.gtag !== 'function') return;
  const pagePath = hash || '/';
  window.gtag('event', 'page_view', { page_path: pagePath });
}

export function usePageTracking() {
  useEffect(() => {
    // 최초 진입 시 현재 hash로 page_view 전송
    sendPageView(window.location.hash || '/');

    const handler = () => sendPageView(window.location.hash || '/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
}
