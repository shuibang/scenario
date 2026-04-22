export default function DirectorMembershipPage({ onBack, D }) {
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

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>⭐</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: D.text }}>멤버십</div>
          <div style={{ fontSize: 12, color: D.text3, lineHeight: 1.7 }}>멤버십 기능은 준비 중입니다.</div>
        </div>
      </div>
    </div>
  );
}
