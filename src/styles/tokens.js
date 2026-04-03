// ─── Shared style tokens ──────────────────────────────────────────────────────
// Single source of truth for styles used across multiple components

export const mobileTbtnStyle = {
  flexShrink: 0,
  fontSize: 'clamp(10px, 2.8vw, 13px)',
  color: 'var(--c-text4)',
  padding: '4px 10px',
  border: '1px solid var(--c-border3)',
  borderRadius: 6,
  background: 'transparent',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
};

// Common input field style shared across BiographyPage, CharacterPanel, SynopsisEditor, etc.
export const commonInputStyle = {
  background: 'var(--c-input)',
  color: 'var(--c-text)',
  border: '1px solid var(--c-border3)',
  borderRadius: '0.375rem',
  outline: 'none',
  width: '100%',
  padding: '0.4rem 0.6rem',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
};

// Top bar button style (desktop header row 1 & row 2)
export const topBarBtnStyle = {
  padding: '3px 10px',
  borderRadius: 4,
  fontSize: 11,
  background: 'transparent',
  border: '1px solid var(--c-border3)',
  color: 'var(--c-text4)',
  cursor: 'pointer',
};
