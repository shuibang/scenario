import { useEffect, useState } from 'react';
import { isDropboxTokenValid } from '../store/dropbox';

/**
 * Dropbox 토큰 유효성을 React state로 노출.
 * - dropbox.js의 setDropboxToken/clearDropboxToken은 'storage:auth-changed'와
 *   'drive:auth-changed' 이벤트를 모두 발행 → 양쪽 구독
 * - 자연 만료(시간 경과)는 10초 폴링으로 따라잡음
 * - Dropbox 토큰은 localStorage에서 동기적으로 복원 가능 → 초기값이 즉시 정확함
 */
const GRACE_MS = 2000;

export function useDropboxAuthState() {
  const [valid, setValid]     = useState(() => isDropboxTokenValid());
  const [settled, setSettled] = useState(() => isDropboxTokenValid());

  useEffect(() => {
    const refresh = () => {
      const next = isDropboxTokenValid();
      setValid(prev => (prev === next ? prev : next));
      if (next) setSettled(true);
    };
    window.addEventListener('storage:auth-changed', refresh);
    window.addEventListener('drive:auth-changed', refresh);
    const id          = setInterval(refresh, 10_000);
    const settleTimer = setTimeout(() => setSettled(true), GRACE_MS);
    return () => {
      window.removeEventListener('storage:auth-changed', refresh);
      window.removeEventListener('drive:auth-changed', refresh);
      clearInterval(id);
      clearTimeout(settleTimer);
    };
  }, []);

  return { valid, settled };
}
