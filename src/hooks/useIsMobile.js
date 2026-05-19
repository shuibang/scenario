import { useEffect, useState } from 'react';

/**
 * 뷰포트 폭 기반 모바일 감지 hook.
 * 카카오 애드핏 같이 PC/모바일 단위 분리 노출이 필수인 곳에서 사용.
 */
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < breakpoint
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}
