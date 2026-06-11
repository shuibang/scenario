import { useEffect } from 'react';

/**
 * usePageTracking — hash 변경 시 GA4 page_view 이벤트 전송
 *
 * 이 앱은 React Router 없이 window.location.hash 로 라우팅하므로
 * useLocation 대신 hashchange 이벤트를 직접 구독합니다.
 *
 * GA4 gtag가 로드되지 않은 환경(개발, 광고 차단 등)에서는 조용히 무시.
 */

const HASH_TITLES = {
  '#director': '연출 작업실 | 대본 작업실',
  '#survey': '설문 | 대본 작업실',
  '#ideas': '아이디어 노트 | 대본 작업실',
};

function titleForHash(hash) {
  if (!hash || hash === '/') return null;
  if (HASH_TITLES[hash]) return HASH_TITLES[hash];
  if (hash.startsWith('#review=')) return '피드백 보기 | 대본 작업실';
  if (hash.startsWith('#delivery=')) return '연출 전달 보기 | 대본 작업실';
  if (hash.startsWith('#log=')) return '작업 기록 | 대본 작업실';
  return null;
}

function sendPageView(hash) {
  const title = titleForHash(hash);
  if (title) document.title = title;
  if (typeof window.gtag !== 'function') return;
  const pagePath = hash || '/';
  window.gtag('event', 'page_view', {
    page_path: pagePath,
    page_title: document.title,
  });
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
