import { useState, useEffect } from 'react';
import { supabase } from '../../store/supabaseClient';
import DirectorLogin from './DirectorLogin';
import DirectorDashboard from './DirectorDashboard';

// ─── 연출 작업실 루트 ─────────────────────────────────────────────────────────
// 로그인 상태에 따라 DirectorLogin 또는 DirectorDashboard를 렌더
export default function DirectorApp() {
  const [session, setSession] = useState(undefined); // undefined = 로딩 중

  useEffect(() => {
    if (!supabase) { setSession(null); return; }

    // 초기 세션 확인
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

  // 로딩 중
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
