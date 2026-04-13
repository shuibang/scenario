import { useState, useEffect } from 'react';
import { supabase, extractUserData } from '../../store/supabaseClient';
import DirectorLogin from './DirectorLogin';
import DirectorDashboard from './DirectorDashboard';

// ─── 연출 작업실 루트 ─────────────────────────────────────────────────────────
// authUser: 대본 작업실에서 이미 로그인된 유저 정보 (있으면 바로 대시보드 진입)
export default function DirectorApp({ authUser }) {
  const [session, setSession] = useState(undefined); // undefined = 로딩 중

  useEffect(() => {
    if (!supabase) { setSession(null); return; }

    // 이미 로그인된 세션 확인 (대본 작업실과 공유)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data?.session ?? null);
    }).catch(() => setSession(null));

    // 로그인/로그아웃 실시간 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleBack = () => { window.location.hash = ''; };

  // 대본 작업실에서 이미 로그인된 경우 → 세션 로딩 전이라도 바로 대시보드
  // (authUser가 있으면 Supabase 세션도 살아있음이 보장됨)
  if (authUser && session === undefined) {
    const fallbackSession = { user: { id: authUser.id, email: authUser.email, user_metadata: { full_name: authUser.name, avatar_url: authUser.picture } } };
    return <DirectorDashboard session={fallbackSession} onBack={handleBack} />;
  }

  // 세션 로딩 중
  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-bg)' }}>
        <span style={{ color: 'var(--c-text5)', fontSize: 13 }}>불러오는 중…</span>
      </div>
    );
  }

  const DEV_SESSION = { user: { id: 'dev', email: 'dev@test.com', user_metadata: { full_name: '개발자', avatar_url: '' } } };

  return session
    ? <DirectorDashboard session={session} onBack={handleBack} />
    : <DirectorLogin onBack={handleBack} onDevBypass={() => setSession(DEV_SESSION)} />;
}
