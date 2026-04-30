import React from 'react';

const ROW1 = [
  { href: '/notice',    label: '공지사항' },
  { href: '/changelog', label: '업데이트 내역' },
  { href: '/help',      label: '사용 설명서' },
  { href: '/',          label: '홈으로' },
];

const ROW2 = [
  { href: '/about',   label: '서비스 소개' },
  { href: '/contact', label: '문의' },
  { href: '/privacy', label: '개인정보처리방침' },
  { href: '/terms',   label: '이용약관' },
];

const styles = `
.site-footer {
  padding: 40px 16px 32px;
  text-align: center;
  font-size: 12px;
  color: #888;
  background: transparent;
}
.site-footer__tagline {
  margin: 0 0 16px;
  font-size: 11px;
  color: #888;
}
.site-footer__row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0;
  margin-top: 12px;
}
.site-footer__row:first-of-type { margin-top: 0; }
.site-footer__link {
  color: #888;
  text-decoration: none;
  padding: 4px 10px;
  transition: color 0.15s ease;
  white-space: nowrap;
}
.site-footer__link:hover { color: #1B2A4E; }
.site-footer__sep {
  color: #BBB;
  user-select: none;
  pointer-events: none;
}
@media (max-width: 480px) {
  .site-footer { padding: 32px 12px 24px; }
  .site-footer__link { padding: 4px 8px; font-size: 12px; }
}
`;

function Row({ items }) {
  return (
    <div className="site-footer__row">
      {items.map((item, i) => (
        <React.Fragment key={item.href}>
          {i > 0 && <span className="site-footer__sep" aria-hidden="true">·</span>}
          <a className="site-footer__link" href={item.href}>{item.label}</a>
        </React.Fragment>
      ))}
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="site-footer">
      <style>{styles}</style>
      <p className="site-footer__tagline">
        대본 작업실 — 드라마 작가를 위한 무료 대본 편집기
      </p>
      <Row items={ROW1} />
      <Row items={ROW2} />
    </footer>
  );
}
