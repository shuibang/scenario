import { useState, useEffect } from 'react';
import { supabase, extractUserData } from '../../store/supabaseClient';
import DirectorLogin from './DirectorLogin';
import DirectorDashboard from './DirectorDashboard';

// localStorage에서 Supabase 세션을 동기적으로 읽어 초기 상태로 사용
// → getSession() 응답을 기다리는 로딩 딜레이 제거
function getLocalSession() {
  try {
    const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    const stored = JSON.parse(localStorage.getItem(key));
    const s = stored?.currentSession ?? stored;
    if (!s?.access_token) return null;
    // 만료 확인 (expires_at는 Unix timestamp 초 단위)
    if (s.expires_at && s.expires_at * 1000 < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

// ─── 연출 작업실 루트 ─────────────────────────────────────────────────────────
// authUser: 대본 작업실에서 이미 로그인된 유저 정보 (있으면 바로 대시보드 진입)
export default function DirectorApp({ authUser }) {
  // localStorage 캐시로 초기값 설정 → 로딩 화면 없이 즉시 진입
  const [session, setSession] = useState(() => getLocalSession());

  useEffect(() => {
    if (!supabase) { setSession(null); return; }

    // 서버에서 세션 검증 및 갱신 (백그라운드)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data?.session ?? null);
    }).catch(() => setSession(null));

    // 로그인/로그아웃 실시간 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleBack = () => { window.location.hash = '#landing'; };

  const GUEST_SESSION = { user: { id: 'guest', email: '', user_metadata: { full_name: '둘러보기', avatar_url: '' } }, isGuest: true };

  return session
    ? <DirectorDashboard session={session} onBack={handleBack} isGuest={!!session.isGuest} />
    : <DirectorLogin onBack={handleBack} onGuest={() => setSession(GUEST_SESSION)} />;
}
