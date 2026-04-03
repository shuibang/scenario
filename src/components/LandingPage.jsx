import React, { useState } from 'react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// ─── 비교표 데이터 ─────────────────────────────────────────────────────────────
const COMPARE_ROWS = [
  { label: '가격',           vals: ['무료',  '$249(~35만원)', '$49(~7만원)', '연 ~$72',  '연 $69~99'] },
  { label: '한국어 포맷',    vals: ['✅', '❌', '❌', '❌', '❌'] },
  { label: 'HWPX 내보내기', vals: ['✅', '❌', '❌', '❌', '❌'] },
  { label: '씬번호 실시간 연동', vals: ['✅', '❌', '△', '❌', '❌'] },
  { label: '로그인 없이 사용', vals: ['✅', '❌', '❌', '❌', '❌'] },
  { label: '모바일 편집',    vals: ['✅', '❌', '❌', '✅', '△ (iOS만)'] },
  { label: '시놉시스 통합편집', vals: ['✅', '△', '❌', '❌', '❌'] },
  { label: '인물 관리 패널', vals: ['✅', '❌', '△', '❌', '△'] },
];
const COMPARE_HEADERS = ['', '대본 작업실', 'Final Draft', 'Scrivener', 'WriterDuet', 'Arc Studio'];

// ─── 주요 기능 ─────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: '🔗',
    title: '회상 씬 번호 자동 연동',
    desc: '지문에서 "3씬에서 봤던 그 기억처럼—" 이렇게 씬을 참조할 때, 씬 순서가 바뀌면 그 번호도 실시간으로 자동으로 따라 바뀝니다. Final Draft도, Scrivener도 지원하지 않는 기능입니다.',
  },
  {
    icon: '✍️',
    title: '버튼 + 단축키로 바로 쓰기',
    desc: '씬 헤딩, 지문, 대사, 씬 연결 — Ctrl+1/2/3으로 바로 전환됩니다. 태그 문법을 외울 필요 없고, 영어 표기도 단축키로 입력할 수 있어요.',
  },
  {
    icon: '🇰🇷',
    title: '한국 대본 포맷 특화',
    desc: '공모전 당선 서식·드라마 대본집 기준의 "인물(여백)대사" 형식을 구현했습니다. PDF, DOCX, HWPX 내보내기를 지원합니다.',
  },
  {
    icon: '📱',
    title: '모바일·태블릿 완벽 지원',
    desc: '아이패드, 폰에서도 편집 가능합니다. 구글 로그인만 하면 구글 드라이브에 자동저장됩니다. 언제, 어디서나, 어떤 기기에서든 이어서 쓰세요.',
  },
  {
    icon: '🔒',
    title: 'AI 없음 — 단순 편집기',
    desc: '내 이야기가 어딘가에 쌓이는 찜찜함 없이, 온전히 내 것으로만 남아있어요. 편집 기능에만 집중했습니다.',
  },
  {
    icon: '📦',
    title: '표지·시놉시스·구조 통합',
    desc: '표지, 시놉시스, 인물 관리, 씬리스트, 트리트먼트, 구조 점검까지 — 하나의 작업실에서 대본 작업의 전 과정을 관리하세요.',
  },
];

export default function LandingPage({ onStart, onLogin }) {
  const [loginOpen, setLoginOpen] = useState(false);

  const handleLogin = (userData) => {
    onLogin?.(userData);
    setLoginOpen(false);
    onStart?.();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--c-bg)',
      color: 'var(--c-text)',
      fontFamily: 'inherit',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>

      {/* ── 헤더 ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--c-header)',
        borderBottom: '1px solid var(--c-border)',
        padding: '0 24px',
        height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--c-accent)', letterSpacing: '0.05em' }}>
          대본 작업실
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setLoginOpen(true)} style={headerBtnStyle}>
            로그인
          </button>
          <button onClick={onStart} style={{ ...headerBtnStyle, background: 'var(--c-accent)', color: '#fff', border: 'none' }}>
            바로 시작하기
          </button>
        </div>
      </header>

      {/* ── 히어로 ── */}
      <section style={{ padding: '72px 24px 56px', textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'inline-block', background: 'var(--c-accent)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 12px', borderRadius: 20, marginBottom: 20, letterSpacing: '0.05em' }}>
          무료 베타 공개 중
        </div>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.25, marginBottom: 16, color: 'var(--c-text)' }}>
          드라마 대본,<br />이제 제대로 쓰세요
        </h1>
        <p style={{ fontSize: 'clamp(15px, 2.5vw, 18px)', color: 'var(--c-text4)', lineHeight: 1.7, marginBottom: 36, maxWidth: 560, margin: '0 auto 36px' }}>
          한국 드라마 작가를 위해 직접 만든 전문 대본 편집기.<br />
          설치 없이, 로그인 없이, 완전 무료로 지금 바로 시작하세요.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={onStart} style={heroPrimaryBtn}>
            로그인 없이 시작하기 →
          </button>
          <button onClick={() => setLoginOpen(true)} style={heroSecondaryBtn}>
            구글 로그인 (자동저장)
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--c-text6)', marginTop: 14 }}>
          로그인 없이 사용 시 저장은 직접 해주세요
        </p>
      </section>

      {/* ── 실제 화면 ── */}
      <section style={{ padding: '0 24px 72px', maxWidth: 1100, margin: '0 auto' }}>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--c-text6)', marginBottom: 28, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          실제 서비스 화면
        </p>
        {/* 데스크톱 + 모바일 배치 */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 0 }}>

          {/* 데스크톱 브라우저 프레임 */}
          <div style={{
            flex: '0 0 auto',
            width: 'min(780px, 85vw)',
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
            border: '1px solid var(--c-border)',
            background: '#1a1a2e',
          }}>
            {/* 브라우저 탑바 */}
            <div style={{
              height: 28,
              background: 'var(--c-header)',
              borderBottom: '1px solid var(--c-border)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              gap: 6,
              flexShrink: 0,
            }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57', display: 'inline-block' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e', display: 'inline-block' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840', display: 'inline-block' }} />
              <div style={{
                flex: 1,
                marginLeft: 12,
                height: 16,
                background: 'var(--c-input)',
                borderRadius: 4,
                maxWidth: 280,
              }} />
            </div>
            {/* 스크린샷 */}
            <img
              src="/screenshots/desktop.png"
              alt="대본 작업실 데스크톱 화면 — 표지 편집기"
              style={{ width: '100%', display: 'block' }}
              loading="lazy"
            />
          </div>

          {/* 모바일 폰 프레임 */}
          <div style={{
            flex: '0 0 auto',
            width: 'clamp(120px, 14vw, 180px)',
            marginLeft: 'clamp(-60px, -7vw, -90px)',
            marginTop: 'clamp(30px, 5vw, 60px)',
            borderRadius: 24,
            overflow: 'hidden',
            boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
            border: '1px solid var(--c-border)',
            background: '#111',
            position: 'relative',
            zIndex: 2,
          }}>
            {/* 폰 상단 노치 */}
            <div style={{
              height: 18,
              background: '#111',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{ width: 48, height: 8, background: '#222', borderRadius: 4 }} />
            </div>
            {/* 스크린샷 */}
            <img
              src="/screenshots/mobile.png"
              alt="대본 작업실 모바일 화면"
              style={{ width: '100%', display: 'block' }}
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* ── 만든 이유 ── */}
      <section style={{ background: 'var(--c-card)', borderTop: '1px solid var(--c-border)', borderBottom: '1px solid var(--c-border)', padding: '48px 24px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: 'var(--c-text2)' }}>
            대본 쓰다 불편해서 직접 만들었어요
          </h2>
          <p style={storyP}>
            안녕하세요, 드라마 작가 지망생이자 개발자입니다.
          </p>
          <p style={storyP}>
            대본을 쓰면서 늘 불편했던 것들이 있었어요. 수정할 때마다 지문 속 씬 번호가 밀리진 않았는지 하나하나 고치고 확인하고…
            Final Draft는 너무 비싸고, Scrivener는 태그 문법을 배워야 하고, 따로 구입해야 하는 아이패드 버전에선 아예 적용도 안 되고.
          </p>
          <p style={storyP}>
            그래서 직접 만들었어요. 현재 베타 버전입니다. 버그나 불편한 점 피드백 주시면 빠르게 반영할게요!
          </p>
        </div>
      </section>

      {/* ── 주요 기능 ── */}
      <section style={{ padding: '64px 24px', maxWidth: 1080, margin: '0 auto' }}>
        <h2 style={sectionH2}>주요 기능</h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
          marginTop: 32,
        }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={featureCard}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{f.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--c-text)' }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--c-text4)', lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 기타 기능 ── */}
      <section style={{ background: 'var(--c-card)', borderTop: '1px solid var(--c-border)', borderBottom: '1px solid var(--c-border)', padding: '40px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ ...sectionH2, textAlign: 'left', fontSize: 16, marginBottom: 16 }}>그 외 기능</h2>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              '로그인·설치 없이 브라우저에서 바로 사용 (단, 저장은 직접 해주세요)',
              '다크모드 지원 (현재 기기 설정과 자동 연동)',
              '검토 링크 공유 기능 (읽기 전용)',
              '협업·공유 기능 예정 (베타버전 미지원)',
            ].map((item) => (
              <li key={item} style={{ fontSize: 13, color: 'var(--c-text3)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--c-accent)', flexShrink: 0, marginTop: 1 }}>•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 비교표 ── */}
      <section style={{ padding: '64px 24px', maxWidth: 1080, margin: '0 auto', overflowX: 'auto' }}>
        <h2 style={sectionH2}>타 프로그램 비교</h2>
        <div style={{ overflowX: 'auto', marginTop: 32, borderRadius: 10, border: '1px solid var(--c-border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
            <thead>
              <tr style={{ background: 'var(--c-card)' }}>
                {COMPARE_HEADERS.map((h, i) => (
                  <th key={i} style={{
                    padding: '12px 16px',
                    textAlign: i === 0 ? 'left' : 'center',
                    fontWeight: 600,
                    color: i === 1 ? 'var(--c-accent)' : 'var(--c-text3)',
                    borderBottom: '1px solid var(--c-border)',
                    fontSize: i === 0 ? 12 : 13,
                    whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'var(--c-card)' }}>
                  <td style={{ padding: '11px 16px', color: 'var(--c-text3)', fontWeight: 500, fontSize: 12, borderBottom: '1px solid var(--c-border2)' }}>
                    {row.label}
                  </td>
                  {row.vals.map((v, vi) => (
                    <td key={vi} style={{
                      padding: '11px 16px',
                      textAlign: 'center',
                      borderBottom: '1px solid var(--c-border2)',
                      color: vi === 0
                        ? (v === '✅' ? '#22c55e' : v === '❌' ? 'var(--c-text6)' : v.startsWith('△') ? '#f59e0b' : 'var(--c-accent)')
                        : (v === '✅' ? '#22c55e' : v === '❌' ? 'var(--c-text6)' : v.startsWith('△') ? '#f59e0b' : 'var(--c-text3)'),
                      fontWeight: vi === 0 ? 600 : 400,
                      fontSize: 13,
                    }}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: 'var(--c-text6)', marginTop: 12, textAlign: 'center' }}>
          가격 기준: 2025년 기준, 환율 약 1,400원/USD 적용.
        </p>
      </section>

      {/* ── 가격 ── */}
      <section style={{ background: 'var(--c-card)', borderTop: '1px solid var(--c-border)', borderBottom: '1px solid var(--c-border)', padding: '64px 24px', textAlign: 'center' }}>
        <h2 style={sectionH2}>가격</h2>
        <div style={{ display: 'inline-block', marginTop: 28, padding: '36px 56px', background: 'var(--c-bg)', border: '2px solid var(--c-accent)', borderRadius: 16 }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--c-accent)', lineHeight: 1 }}>무료</div>
          <div style={{ fontSize: 13, color: 'var(--c-text4)', marginTop: 12, lineHeight: 1.8 }}>
            로그인도, 설치도, 결제도 없어요.<br />
            광고만 조금 달았어요.
          </div>
          <div style={{ marginTop: 20, padding: '10px 16px', background: 'var(--c-input)', borderRadius: 8, fontSize: 12, color: 'var(--c-text5)' }}>
            추후 광고 제거 + 추가 기능을 담은 유료 앱을 플레이스토어/앱스토어에 출시 예정
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '72px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 700, marginBottom: 16, color: 'var(--c-text)' }}>
          지금 바로 시작해보세요
        </h2>
        <p style={{ fontSize: 14, color: 'var(--c-text4)', marginBottom: 32 }}>
          설치 없이, 로그인 없이, 브라우저에서 바로 시작할 수 있어요.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={onStart} style={heroPrimaryBtn}>
            무료로 시작하기 →
          </button>
          <button onClick={() => setLoginOpen(true)} style={heroSecondaryBtn}>
            구글 로그인 (자동저장)
          </button>
        </div>
      </section>

      {/* ── 푸터 ── */}
      <footer style={{
        background: 'var(--c-header)',
        borderTop: '1px solid var(--c-border)',
        padding: '24px',
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--c-text6)',
      }}>
        <p style={{ margin: 0 }}>
          대본 작업실 — 드라마 작가를 위한 무료 대본 편집기
        </p>
        <p style={{ margin: '6px 0 0' }}>
          버그 제보 및 피드백은 서비스 내 QnA 또는 이메일로 알려주세요
        </p>
      </footer>

      {/* ── 로그인 모달 ── */}
      {loginOpen && (
        <LandingLoginModal onClose={() => setLoginOpen(false)} onLogin={handleLogin} />
      )}
    </div>
  );
}

// ─── 랜딩용 로그인 모달 ──────────────────────────────────────────────────────
function LandingLoginModal({ onClose, onLogin }) {
  const googleBtnRef = React.useRef(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        try {
          const payload = decodeJwt(response.credential);
          if (payload) {
            const userData = { name: payload.name, email: payload.email, picture: payload.picture };
            localStorage.setItem('drama_auth_user', JSON.stringify(userData));
            onLogin?.(userData);
          } else {
            setError('로그인 실패: 토큰 파싱 오류');
          }
        } catch { setError('로그인 오류가 발생했습니다'); }
      },
    });
    if (googleBtnRef.current) {
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', locale: 'ko', width: 280,
      });
    }
  }, [onClose, onLogin]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 16, padding: 32, width: 320, display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)', marginBottom: 6 }}>로그인 / 회원가입</div>
          <div style={{ fontSize: 12, color: 'var(--c-text5)' }}>로그인하면 구글 드라이브에 자동저장됩니다</div>
        </div>
        {GOOGLE_CLIENT_ID ? (
          <div style={{ display: 'flex', justifyContent: 'center' }}><div ref={googleBtnRef} /></div>
        ) : (
          <div style={{ fontSize: 12, textAlign: 'center', color: 'var(--c-text5)', padding: '8px 0' }}>로그인 기능을 준비 중입니다.</div>
        )}
        {error && <div style={{ fontSize: 12, textAlign: 'center', color: '#ef4444' }}>{error}</div>}
        <div style={{ fontSize: 10, textAlign: 'center', color: 'var(--c-text6)' }}>Kakao / Naver 로그인은 준비 중입니다</div>
        <button onClick={onClose} style={{ fontSize: 12, color: 'var(--c-text6)', background: 'none', border: 'none', cursor: 'pointer' }}>닫기</button>
      </div>
    </div>
  );
}

// ─── JWT 디코드 (LoginModal과 동일) ──────────────────────────────────────────
function decodeJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(base64))));
  } catch { return null; }
}

// ─── 스타일 상수 ─────────────────────────────────────────────────────────────
const headerBtnStyle = {
  padding: '6px 16px',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
  border: '1px solid var(--c-border3)',
  background: 'transparent',
  color: 'var(--c-text3)',
};

const heroPrimaryBtn = {
  padding: '14px 32px',
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
  background: 'var(--c-accent)',
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  letterSpacing: '0.02em',
};

const heroSecondaryBtn = {
  padding: '14px 32px',
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 500,
  background: 'transparent',
  color: 'var(--c-text2)',
  border: '1px solid var(--c-border3)',
  cursor: 'pointer',
};

const sectionH2 = {
  fontSize: 'clamp(18px, 3vw, 26px)',
  fontWeight: 700,
  textAlign: 'center',
  color: 'var(--c-text)',
  margin: 0,
};

const featureCard = {
  background: 'var(--c-card)',
  border: '1px solid var(--c-border)',
  borderRadius: 12,
  padding: '24px 22px',
};

const storyP = {
  fontSize: 14,
  color: 'var(--c-text4)',
  lineHeight: 1.85,
  marginBottom: 14,
  margin: '0 0 14px',
};
