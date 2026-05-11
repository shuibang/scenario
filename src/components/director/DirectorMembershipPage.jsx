import { QRCodeSVG } from 'qrcode.react';

const KAKAO_PAY_URL = 'https://qr.kakaopay.com/Ej8gwMmym';

export default function DirectorMembershipPage({ onBack, D }) {
  const mobile = window.innerWidth < 768;
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: D.bg, color: D.text }}>
      <header style={{
        height: 'clamp(44px, 12vw, 52px)', flexShrink: 0,
        display: 'flex', alignItems: 'center',
        paddingLeft: 'max(12px, env(safe-area-inset-left, 12px))',
        paddingRight: 'max(14px, env(safe-area-inset-right, 14px))',
        gap: 10, borderBottom: `1px solid ${D.border}`, background: D.sidebar,
      }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: D.text3, fontSize: 18, cursor: 'pointer', padding: '4px 6px', lineHeight: 1, WebkitTapHighlightColor: 'transparent' }}
        >←</button>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: D.text, letterSpacing: '-0.01em' }}>멤버십</h2>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 36 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>⭐</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: D.text }}>멤버십</div>
          <div style={{ fontSize: 12, color: D.text3, lineHeight: 1.7 }}>멤버십 기능은 준비 중입니다.</div>
        </div>

        <div style={{
          width: '100%', maxWidth: 360,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          background: D.panel, border: `1px solid ${D.border}`, borderRadius: 10,
          padding: '28px 32px 24px',
        }}>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: D.text3, textAlign: 'center' }}>
            드라마 작가 지망생 개발자 혼자 만들고 있어요.<br />
            커피 한 잔 값의 응원이 큰 힘이 됩니다. ☕
          </div>
          {mobile ? (
            <a href={KAKAO_PAY_URL} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'block', width: '100%', textAlign: 'center',
                padding: '14px 0', borderRadius: 8,
                fontSize: 15, fontWeight: 700,
                background: '#FEE500', color: '#3C1E1E', textDecoration: 'none',
              }}>
              개발자 응원하기 💛
            </a>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ padding: 12, borderRadius: 8, background: '#fff' }}>
                <QRCodeSVG value={KAKAO_PAY_URL} size={140} />
              </div>
              <div style={{ fontSize: 11, color: D.text3 }}>카카오페이 앱으로 QR 스캔</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
