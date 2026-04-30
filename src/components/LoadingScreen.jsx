import React from 'react';

const styles = `
@keyframes ls-float {
  0%, 100% { transform: translateY(-4px); }
  50%      { transform: translateY(4px); }
}
.ls-root {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: #FFFFFF;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 24px;
  box-sizing: border-box;
}
.ls-logo {
  width: 100%;
  max-width: 200px;
  height: auto;
  display: block;
  animation: ls-float 2s ease-in-out infinite;
  will-change: transform;
}
.ls-text {
  margin: 0;
  font-size: 13px;
  color: #888888;
  letter-spacing: 0.02em;
  font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif;
}
@media (max-width: 600px) {
  .ls-logo { max-width: 60vw; }
  .ls-text { font-size: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .ls-logo { animation: none; }
}
`;

export default function LoadingScreen({ message = '불러오는 중...' }) {
  return (
    <div className="ls-root" role="status" aria-live="polite">
      <style>{styles}</style>
      <img src="/logo.svg" alt="대본 작업실" className="ls-logo" />
      <p className="ls-text">{message}</p>
    </div>
  );
}
