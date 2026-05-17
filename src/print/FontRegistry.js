/**
 * FontRegistry — single source of truth for font metadata.
 *
 * Font source types:
 *   bundled — shipped with the app (/public/fonts/), embeddable in PDF
 *   system  — depends on user OS/browser, NOT embeddable in PDF
 *
 * pdfFiles has 4 variant slots: normal, bold, italic, boldItalic
 *   null = this variant is intentionally not provided
 *   string = path under /public/fonts/ (may or may not exist at runtime)
 *
 * Runtime availability is checked once via HEAD requests and cached.
 */

// ─── Font PDF support status constants ────────────────────────────────────────
export const FONT_STATUS = {
  FULL:        'full',        // normal + bold available in PDF
  PARTIAL:     'partial',     // normal available; italic/boldItalic missing
  UNAVAILABLE: 'unavailable', // normal file missing — cannot embed
  SYSTEM:      'system',      // system font — never embeddable
};

// ─── Font catalog ──────────────────────────────────────────────────────────────
export const FONTS = [
  // ── Bundled: 함초롬바탕 ─────────────────────────────────────────────────────
  // italic/boldItalic 파일 미제공 → null
  {
    id:          'hcr-batang',
    displayName: '함초롬바탕',
    sourceType:  'bundled',
    cssFamily:   '함초롬바탕',
    pdfFiles: {
      normal:     '/fonts/HCRBatang.ttf',
      bold:       '/fonts/HCRBatang-Bold.ttf',
      italic:     null,
      boldItalic: null,
    },
    docxFontName: '함초롬바탕',
    cssFallback:  "'HCR Batang', 'Noto Serif KR', serif",
  },

  // ── Bundled: Noto Serif KR ──────────────────────────────────────────────────
  // italic/boldItalic TTF files not present in /public/fonts/ → null
  {
    id:          'noto-serif-kr',
    displayName: 'Noto Serif KR',
    sourceType:  'bundled',
    cssFamily:   'Noto Serif KR',
    pdfFiles: {
      normal:     '/fonts/NotoSerifKR-Regular.ttf',
      bold:       '/fonts/NotoSerifKR-Bold.ttf',
      italic:     null,
      boldItalic: null,
    },
    docxFontName: 'Noto Serif KR',
    cssFallback:  "'Noto Serif', serif",
  },

  // ── Bundled: Noto Sans KR ───────────────────────────────────────────────────
  // Static TTF files are now available — use these for PDF instead of VF.
  // italic/boldItalic not available → null (PDF △ only for italic styles).
  {
    id:          'noto-sans-kr',
    displayName: 'Noto Sans KR',
    sourceType:  'bundled',
    cssFamily:   'Noto Sans KR',
    // pdfVfOnly removed — static TTF provides real regular + bold support
    pdfFiles: {
      normal:     '/fonts/NotoSansKR-Regular.ttf',
      bold:       '/fonts/NotoSansKR-Bold.ttf',
      italic:     null,
      boldItalic: null,
    },
    docxFontName: 'Noto Sans KR',
    cssFallback:  "'Noto Sans', sans-serif",
  },

  // ── Bundled: 맑은 고딕 ─────────────────────────────────────────────────────
  // Microsoft 저작권 폰트. TTF 파일을 빌드 산출물에서 제거함(2026-05-13).
  // 화면 렌더링은 사용자 OS에 설치된 'Malgun Gothic'을 그대로 사용(CSS fallback).
  // PDF 임베드는 라이선스상 차단 → Noto Serif KR로 폴백.
  {
    id:          'malgun-gothic',
    displayName: '맑은 고딕',
    sourceType:  'bundled',
    pdfBlocked:  true,
    cssFamily:   'Malgun Gothic',
    pdfFiles: {
      normal:     null,
      bold:       null,
      italic:     null,
      boldItalic: null,
    },
    docxFontName:  '맑은 고딕',
    cssFallback:   "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
    pdfFallbackId: 'noto-serif-kr',
  },

  // ── System fonts ─────────────────────────────────────────────────────────────
  {
    id:            'nanum-myeongjo',
    displayName:   '나눔명조',
    sourceType:    'system',
    cssFamily:     '나눔명조',
    pdfFiles:      null,
    docxFontName:  '나눔명조',
    cssFallback:   "'Noto Serif KR', serif",
    pdfFallbackId: 'hcr-batang',
  },
  {
    // Apple SD Gothic Neo — macOS/iOS 전용 시스템 폰트. 파일 임베드 라이선스 위반 소지.
    // PDF 폴백 대상: Noto Serif KR (라이선스 안전, SIL OFL).
    id:            'apple-sd',
    displayName:   'Apple SD Gothic Neo',
    sourceType:    'system',
    cssFamily:     'Apple SD Gothic Neo',
    pdfFiles:      null,
    docxFontName:  'Apple SD Gothic Neo',
    cssFallback:   "'Malgun Gothic', 'Noto Sans KR', sans-serif",
    pdfFallbackId: 'noto-serif-kr',
  },
];

export const DEFAULT_FONT_ID     = 'hcr-batang';
export const FALLBACK_BUNDLED_ID = 'hcr-batang';

// ─── Lookup helpers ────────────────────────────────────────────────────────────
export function getFontById(id) {
  return FONTS.find(f => f.id === id) ?? FONTS.find(f => f.id === DEFAULT_FONT_ID);
}

// 호환성: 기존 저장 데이터에 '함초롱바탕'으로 들어간 값을 새 표기 '함초롬바탕'으로 매핑.
const CSS_FAMILY_ALIASES = {
  '함초롱바탕': '함초롬바탕',
};

export function getFontByCssFamily(cssFamily) {
  if (!cssFamily) return getFontById(DEFAULT_FONT_ID);
  const normalized = CSS_FAMILY_ALIASES[cssFamily] ?? cssFamily;
  return (
    FONTS.find(f => f.cssFamily === normalized) ??
    FONTS.find(f => f.displayName === normalized) ??
    getFontById(DEFAULT_FONT_ID)
  );
}

// ─── Runtime availability check ───────────────────────────────────────────────
/**
 * AvailabilityResult = {
 *   byFont: { [fontId]: { normal, bold, italic, boldItalic } → bool },
 *   missing: string[],            // fontIds whose 'normal' file is absent
 *   partialStyles: { [fontId]: string[] },  // variant names that are absent
 * }
 */

async function probeFile(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

let _availabilityPromise = null;

/** Check all bundled font files via HEAD requests. Cached per session. */
export function checkFontsAvailability() {
  if (_availabilityPromise) return _availabilityPromise;

  _availabilityPromise = (async () => {
    const byFont       = {};
    const missing      = [];
    const partialStyles = {};

    // pdfBlocked 폰트는 의도적으로 임베드 차단되므로 HEAD 프로브 생략 — 불필요한 404 방지.
    for (const font of FONTS.filter(f => f.sourceType === 'bundled' && !f.pdfBlocked)) {
      const checks      = {};
      const missedStyles = [];

      for (const [style, path] of Object.entries(font.pdfFiles)) {
        if (!path) {
          checks[style] = false;
          missedStyles.push(style);
        } else {
          const ok = await probeFile(path);
          checks[style] = ok;
          if (!ok) missedStyles.push(style);
        }
      }

      byFont[font.id] = checks;
      if (!checks.normal) missing.push(font.id);
      if (missedStyles.length > 0) partialStyles[font.id] = missedStyles;
    }

    return { byFont, missing, partialStyles };
  })();

  return _availabilityPromise;
}

// ─── Status helpers ────────────────────────────────────────────────────────────
/**
 * Return true if this font cannot legally/technically be embedded in PDF.
 * Covers both system fonts (no file) and license-blocked bundled fonts.
 */
export function isFontPdfRestricted(font) {
  return !!font && (font.sourceType === 'system' || font.pdfBlocked === true);
}

/** Return FONT_STATUS constant for a given fontId + availability result. */
export function getFontPdfStatus(fontId, availability) {
  const font = getFontById(fontId);
  // pdfBlocked는 시스템 폰트와 동일하게 "PDF 임베드 불가"로 취급 → SYSTEM 상태로 통일.
  if (isFontPdfRestricted(font)) return FONT_STATUS.SYSTEM;
  if (!availability) return font.pdfVfOnly ? FONT_STATUS.PARTIAL : FONT_STATUS.FULL; // loading

  const checks = availability.byFont?.[fontId] ?? {};
  if (checks.normal === false) return FONT_STATUS.UNAVAILABLE;

  // VF-only fonts without a distinct bold file → PARTIAL
  if (font.pdfVfOnly) return FONT_STATUS.PARTIAL;

  // Determine which non-italic styles are missing (bold is the only critical one)
  const missing = (availability.partialStyles?.[fontId] ?? []);
  if (missing.includes('bold')) return FONT_STATUS.UNAVAILABLE;

  // italic / boldItalic missing alone is a minor gap — regular + bold present → FULL
  // (Korean drama scripts rarely use italic; it does not block main usage)
  return FONT_STATUS.FULL;
}

/** Human-readable short label for use in dropdown options. */
export function getFontStatusLabel(fontId, availability) {
  const status = getFontPdfStatus(fontId, availability);
  switch (status) {
    case FONT_STATUS.FULL:        return 'PDF ✓';
    case FONT_STATUS.PARTIAL:     return 'PDF △';
    case FONT_STATUS.UNAVAILABLE: return 'PDF ✗';
    case FONT_STATUS.SYSTEM:      return '화면 전용';
    default:                       return '';
  }
}

// ─── Dropdown tooltip (user-facing) ───────────────────────────────────────────
const PDF_RESTRICTED_TOOLTIP = '이 폰트는 PDF 출력 시 지원되지 않을 수 있습니다.';

/**
 * Returns the tooltip text for a font in the family-select dropdown.
 * - system 또는 pdfBlocked 폰트 → PDF 출력 제한 안내.
 * - 그 외 → undefined (툴팁 미부착).
 */
export function getFontPdfTooltip(font) {
  if (!font) return undefined;
  return isFontPdfRestricted(font) ? PDF_RESTRICTED_TOOLTIP : undefined;
}

// ─── Warning messages (user-facing) ───────────────────────────────────────────
const STYLE_LABELS = { bold: '굵게', italic: '기울임', boldItalic: '굵은 기울임' };

/**
 * getFontWarnings(stylePreset, availability) → string[]
 * Returns warnings for the currently selected font.
 * Empty array = no warnings.
 */
export function getFontWarnings(stylePreset, availability) {
  const family = stylePreset?.fontFamily || '함초롬바탕';
  const font   = getFontByCssFamily(family);
  const warnings = [];

  // ── System font 또는 pdfBlocked → 항상 PDF 폴백 경고
  if (isFontPdfRestricted(font)) {
    const fallback = getFontById(font.pdfFallbackId ?? FALLBACK_BUNDLED_ID);
    const reason = font.pdfBlocked
      ? '라이선스상 PDF 임베드가 제한된 글꼴로'
      : '시스템 글꼴로 PDF에 포함할 수 없으므로';
    warnings.push(
      `'${font.displayName}'은(는) ${reason} ` +
      `PDF에서는 '${fallback.displayName}'으로 출력됩니다.`
    );
    return warnings;
  }

  // ── Bundled font: check file availability
  if (!availability) return warnings; // still loading

  const checks = availability.byFont?.[font.id];
  if (!checks) return warnings;

  if (!checks.normal) {
    const fallback = getFontById(FALLBACK_BUNDLED_ID);
    warnings.push(
      `'${font.displayName}' PDF 파일이 없습니다 (${font.pdfFiles.normal}). ` +
      `PDF에서는 '${fallback.displayName}'으로 출력됩니다.`
    );
    return warnings; // no point reporting style gaps if normal is missing
  }

  // Minor gaps (italic/boldItalic only)
  for (const [style, label] of Object.entries(STYLE_LABELS)) {
    const path = font.pdfFiles[style];
    if (!path) {
      warnings.push(`'${font.displayName}' ${label} 파일이 없어 PDF에서 합성 처리됩니다.`);
    } else if (checks[style] === false) {
      warnings.push(`'${font.displayName}' ${label} 파일을 찾을 수 없습니다 (${path}).`);
    }
  }

  return warnings;
}

// ─── Effective PDF font name (for display) ────────────────────────────────────
/**
 * Returns the font name that will actually appear in the PDF for a given preset.
 * Differs from preset.fontFamily when system font or unavailable bundled font.
 */
export function getEffectivePdfFontName(stylePreset, availability) {
  const family = stylePreset?.fontFamily || '함초롬바탕';
  const font   = getFontByCssFamily(family);

  if (isFontPdfRestricted(font)) {
    return getFontById(font.pdfFallbackId ?? FALLBACK_BUNDLED_ID).displayName;
  }

  if (availability?.byFont?.[font.id]?.normal === false) {
    return getFontById(FALLBACK_BUNDLED_ID).displayName;
  }

  return font.displayName;
}

// ─── Main resolver ─────────────────────────────────────────────────────────────
/**
 * resolveFont(stylePreset, target) → ResolvedFont
 *
 * 'editor'|'preview' → { cssStack: string }
 * 'pdf'              → { pdfFamily: string, pdfFiles: object, usedFallback?: true }
 * 'docx'             → { fontName: string, fallbackFontName: string|null }
 */
export function resolveFont(stylePreset, target) {
  const family = stylePreset?.fontFamily || '함초롬바탕';
  const font   = getFontByCssFamily(family);

  if (target === 'pdf') {
    // bundled + 라이선스 안전 → 그대로 임베드
    if (!isFontPdfRestricted(font)) {
      return { pdfFamily: font.cssFamily, pdfFiles: font.pdfFiles };
    }
    // system 또는 pdfBlocked → 폴백
    const fallback = getFontById(font.pdfFallbackId ?? FALLBACK_BUNDLED_ID);
    const reason   = font.pdfBlocked ? '라이선스 제한' : '시스템 글꼴';
    console.warn(
      `[FontRegistry] PDF: ${reason} "${font.displayName}" →`,
      `"${fallback.displayName}" 대체 사용`
    );
    return {
      pdfFamily:           fallback.cssFamily,
      pdfFiles:            fallback.pdfFiles,
      usedFallback:        true,
      fallbackDisplayName: fallback.displayName,
    };
  }

  if (target === 'docx') {
    // DOCX는 사용자 PC의 폰트로 렌더 → 시스템 폰트는 폴백 폰트명을 함께 전달.
    // pdfBlocked는 DOCX와 무관 (DOCX는 임베드하지 않음) → 폴백 미적용.
    const fallback = font.sourceType === 'system'
      ? getFontById(font.pdfFallbackId ?? FALLBACK_BUNDLED_ID)
      : null;
    return {
      fontName:         font.docxFontName,
      fallbackFontName: fallback?.docxFontName ?? null,
    };
  }

  // editor / preview
  return { cssStack: `'${font.cssFamily}', ${font.cssFallback}` };
}
