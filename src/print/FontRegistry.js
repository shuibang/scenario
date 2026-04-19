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
  // ── Bundled: 함초롱바탕 ─────────────────────────────────────────────────────
  // italic/boldItalic 파일 미제공 → null
  {
    id:          'hcr-batang',
    displayName: '함초롱바탕',
    sourceType:  'bundled',
    cssFamily:   '함초롱바탕',
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
  // italic/boldItalic 파일 미제공 → null
  {
    id:          'malgun-gothic',
    displayName: '맑은 고딕',
    sourceType:  'bundled',
    cssFamily:   'Malgun Gothic',
    pdfFiles: {
      normal:     '/fonts/malgun.ttf',
      bold:       '/fonts/malgunbd.ttf',
      italic:     null,
      boldItalic: null,
    },
    docxFontName: '맑은 고딕',
    cssFallback:  "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
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
    id:            'apple-sd',
    displayName:   'Apple SD Gothic Neo',
    sourceType:    'system',
    cssFamily:     'Apple SD Gothic Neo',
    pdfFiles:      null,
    docxFontName:  'Apple SD Gothic Neo',
    cssFallback:   "'Malgun Gothic', 'Noto Sans KR', sans-serif",
    pdfFallbackId: 'noto-sans-kr',
  },
];

export const DEFAULT_FONT_ID     = 'hcr-batang';
export const FALLBACK_BUNDLED_ID = 'hcr-batang';

// ─── Lookup helpers ────────────────────────────────────────────────────────────
export function getFontById(id) {
  return FONTS.find(f => f.id === id) ?? FONTS.find(f => f.id === DEFAULT_FONT_ID);
}

export function getFontByCssFamily(cssFamily) {
  if (!cssFamily) return getFontById(DEFAULT_FONT_ID);
  return (
    FONTS.find(f => f.cssFamily === cssFamily) ??
    FONTS.find(f => f.displayName === cssFamily) ??
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

    for (const font of FONTS.filter(f => f.sourceType === 'bundled')) {
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
/** Return FONT_STATUS constant for a given fontId + availability result. */
export function getFontPdfStatus(fontId, availability) {
  const font = getFontById(fontId);
  if (font.sourceType === 'system') return FONT_STATUS.SYSTEM;
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

// ─── Warning messages (user-facing) ───────────────────────────────────────────
const STYLE_LABELS = { bold: '굵게', italic: '기울임', boldItalic: '굵은 기울임' };

/**
 * getFontWarnings(stylePreset, availability) → string[]
 * Returns warnings for the currently selected font.
 * Empty array = no warnings.
 */
export function getFontWarnings(stylePreset, availability) {
  const family = stylePreset?.fontFamily || '함초롱바탕';
  const font   = getFontByCssFamily(family);
  const warnings = [];

  // ── System font → always warn about PDF fallback
  if (font.sourceType === 'system') {
    const fallback = getFontById(font.pdfFallbackId ?? FALLBACK_BUNDLED_ID);
    warnings.push(
      `'${font.displayName}'은 시스템 글꼴로 PDF에 포함할 수 없습니다. ` +
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
  const family = stylePreset?.fontFamily || '함초롱바탕';
  const font   = getFontByCssFamily(family);

  if (font.sourceType === 'system') {
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
  const family = stylePreset?.fontFamily || '함초롱바탕';
  const font   = getFontByCssFamily(family);

  if (target === 'pdf') {
    if (font.sourceType === 'bundled') {
      return { pdfFamily: font.cssFamily, pdfFiles: font.pdfFiles };
    }
    const fallback = getFontById(font.pdfFallbackId ?? FALLBACK_BUNDLED_ID);
    console.warn(
      `[FontRegistry] PDF: 시스템 글꼴 "${font.displayName}" →`,
      `"${fallback.displayName}" 대체 사용`
    );
    return { pdfFamily: fallback.cssFamily, pdfFiles: fallback.pdfFiles, usedFallback: true };
  }

  if (target === 'docx') {
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
