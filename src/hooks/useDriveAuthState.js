import { useEffect, useState } from 'react';
import { isTokenValid } from '../store/googleDrive';

/**
 * Drive 토큰 유효성을 React state로 노출.
 * - setAccessToken/clearAccessToken은 'drive:auth-changed' 이벤트로 즉시 반영
 * - 자연 만료(시간 경과)는 10초 폴링으로 따라잡음
 *
 * 반환:
 *   valid:   현재 토큰 유효 여부
 *   settled: 끊김 표시를 띄울 자격이 있는가
 *     - true: 한 번이라도 valid였거나, 부팅 후 GRACE_MS 경과
 *     - false: 부팅 직후 "아직 토큰 도착 전" 윈도우 — 이 구간엔 끊김 배지 숨김
 *   부팅 시 authUser는 localStorage에서 즉시 복원되지만 setAccessToken은
 *   Supabase 세션 복원이 끝나야 호출됨 → 그 사이 잠깐 끊김 배지가 잘못 떴던 버그 해결.
 */
const GRACE_MS = 5000;

export function useDriveAuthState() {
  const [valid, setValid]     = useState(() => isTokenValid());
  const [settled, setSettled] = useState(() => isTokenValid());

  useEffect(() => {
    const refresh = () => {
      const next = isTokenValid();
      setValid(prev => (prev === next ? prev : next));
      if (next) setSettled(true);
    };
    window.addEventListener('drive:auth-changed', refresh);
    const id = setInterval(refresh, 10_000);
    // 그레이스 타이머: 5s 안에 토큰 도착 안 하면 그제야 진짜 끊김으로 간주.
    const settleTimer = setTimeout(() => setSettled(true), GRACE_MS);
    return () => {
      window.removeEventListener('drive:auth-changed', refresh);
      clearInterval(id);
      clearTimeout(settleTimer);
    };
  }, []);

  return { valid, settled };
}
