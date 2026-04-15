import { useState } from 'react';
import { guardedSignInWithGoogle } from '../../utils/guardedSignIn';

// ─── 감독 로그인 화면 ─────────────────────────────────────────────────────────
export default function DirectorLogin({ onBack, onGuest }) {
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    guardedSignInWithGoogle();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', display: 'flex', flexDirection: 'column' }}>

      {/* 헤더 */}
      <header style={{ height: 52, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12, borderBottom: '1px solid var(--c-border)', background: 'var(--c-header)' }}>
        <button onClick={onBack} style={{ fontSize: 12, color: 'var(--c-text4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← 돌아가기</button>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--c-text)', marginLeft: 4 }}>연출 작업실</span>
      </header>

      {/* 로그인 카드 */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 16, padding: '40px 32px', width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'center' }}>

          <div>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎬</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-text)', marginBottom: 6 }}>연출 작업실 로그인</div>
            <div style={{ fontSize: 13, color: 'var(--c-text4)', lineHeight: 1.6 }}>
              작가에게 공유 링크를 받은 후<br />본인 구글 계정으로 로그인하세요.
            </div>
          </div>

          <button
            onClick={handleGoogle}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '12px 20px', borderRadius: 8, border: '1px solid var(--c-border3)',
              background: 'var(--c-card)', color: 'var(--c-text)', fontSize: 14, fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, width: '100%',
            }}
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" style={{ width: 18, height: 18 }} />
            {loading ? '이동 중…' : 'Google로 로그인'}
          </button>

          <p style={{ fontSize: 11, color: 'var(--c-text6)', margin: 0 }}>
            어떤 구글 계정이든 사용할 수 있습니다.
          </p>

          <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 16, marginTop: 4 }}>
            <button
              onClick={onGuest}
              style={{
                width: '100%', padding: '10px', borderRadius: 6,
                border: '1px solid var(--c-border)', background: 'transparent',
                color: 'var(--c-text4)', fontSize: 13, cursor: 'pointer',
              }}
            >
              둘러보기
            </button>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--c-text6)', lineHeight: 1.5 }}>
              로그인 없이 인터페이스를 체험할 수 있어요.<br />대본 불러오기·저장은 지원되지 않습니다.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
