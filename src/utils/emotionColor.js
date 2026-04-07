/**
 * getChipStyle(color, intensity)
 * intensity 1~5에 따라 감정 chip 배경/글씨/테두리 스타일 반환
 *
 * intensity 1: 흰 배경 + 감정색 글씨 + 감정색 테두리
 * intensity 2: 아주 연한 배경(15%) + 감정색 글씨
 * intensity 3: 연한 배경(30%) + 감정색 글씨
 * intensity 4: 중간 배경(65%) + 흰 글씨
 * intensity 5: 원색 배경 + 흰 글씨
 *
 * 예외:
 *   노랑(#FFD600): 글씨 항상 #5D4037
 *   회색(#9E9E9E): 글씨 항상 #212121
 */

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return { r, g, b };
}

function getTextColor(color, onDark) {
  if (color === '#FFD600') return '#5D4037';
  if (color === '#9E9E9E') return '#212121';
  return onDark ? '#FFFFFF' : color;
}

export function getChipStyle(color, intensity) {
  const { r, g, b } = hexToRgb(color);

  switch (intensity) {
    case 1:
      return {
        background: '#FFFFFF',
        color: getTextColor(color, false),
        border: `1.5px solid ${color}`,
      };
    case 2:
      return {
        background: `rgba(${r}, ${g}, ${b}, 0.15)`,
        color: getTextColor(color, false),
        border: 'none',
      };
    case 3:
      return {
        background: `rgba(${r}, ${g}, ${b}, 0.30)`,
        color: getTextColor(color, false),
        border: 'none',
      };
    case 4:
      return {
        background: `rgba(${r}, ${g}, ${b}, 0.65)`,
        color: getTextColor(color, true),
        border: 'none',
      };
    case 5:
    default:
      return {
        background: color,
        color: getTextColor(color, true),
        border: 'none',
      };
  }
}

/**
 * EmotionChip 인라인 스타일 반환 (chip 공통 형태)
 * { background, color, border, borderRadius, padding, fontSize, ... }
 */
export function getChipInlineStyle(color, intensity) {
  const base = getChipStyle(color, intensity);
  return {
    ...base,
    borderRadius: '4px',
    padding: '0 4px',
    fontSize: '10px',
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
    lineHeight: '1.4',
  };
}
