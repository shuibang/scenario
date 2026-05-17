import React from 'react';

/**
 * WatermarkOverlay — 화면(HTML/DOM) 워터마크.
 *
 * 검토 링크 뷰어처럼 콘텐츠 위에 반투명 텍스트를 깔아 캡처/유출 시 노출되도록.
 *
 * Props:
 *   text     — 워터마크 문구 (없으면 안 그림)
 *   variant  — 'tiled' (반복 타일) | 'diagonal' (큰 대각선 한 줄). 기본 'tiled'.
 *   opacity  — 0..1 (기본 0.10) — 본문 가독성과 시각 인지 사이 균형
 *   color    — CSS color (기본 var(--c-text))
 *   fontSize — px (tiled 기준; diagonal은 자동 큼). 기본 14
 *   angle    — 텍스트 회전 각(deg). 기본 -30
 *
 * 사용:
 *   <div style={{ position: 'relative' }}>
 *     <Content />
 *     <WatermarkOverlay text={recipient} />
 *   </div>
 */
export default function WatermarkOverlay({
  text,
  variant = 'tiled',
  opacity = 0.10,
  color = 'currentColor',
  fontSize = 14,
  angle = -30,
}) {
  if (!text || !text.trim()) return null;
  const safeText = String(text).trim();

  if (variant === 'diagonal') {
    return (
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          zIndex: 50,
        }}
      >
        <span style={{
          fontSize: 'clamp(40px, 9vw, 96px)',
          fontWeight: 700, color, opacity,
          transform: `rotate(${angle}deg)`,
          whiteSpace: 'nowrap',
          userSelect: 'none',
          letterSpacing: '0.05em',
        }}>
          {safeText}
        </span>
      </div>
    );
  }

  // 기본: tiled — 격자 형태로 반복 (스크린샷 추적성 ↑)
  // SVG pattern 으로 깔면 CSS 조작·줌에도 안정적이고 print/PDF 출력에는 안 들어감
  const cellW = Math.max(140, safeText.length * fontSize * 0.75);
  const cellH = Math.max(80, fontSize * 5);
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${cellH}">
      <text x="50%" y="50%"
            text-anchor="middle" dominant-baseline="middle"
            transform="rotate(${angle} ${cellW / 2} ${cellH / 2})"
            font-size="${fontSize}"
            font-family="-apple-system, system-ui, 'Noto Sans KR', sans-serif"
            font-weight="600"
            fill="${color === 'currentColor' ? '#000000' : color}"
            opacity="${opacity}">
        ${escape(safeText)}
      </text>
    </svg>
  `;
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none',
        backgroundImage: `url("${dataUrl}")`,
        backgroundRepeat: 'repeat',
        zIndex: 50,
      }}
    />
  );
}
