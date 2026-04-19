// ─── Strip HTML tags (for plain-text display of rich content) ────────────────
export function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '');
}

// ─── Block-level alignment ─────────────────────────────────────────────────────
export function applyBlockAlignment(alignment) {
  const surface = document.querySelector('[data-editor-surface]');
  if (!surface) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  let blockEls;
  if (range.collapsed) {
    let node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    while (node && node !== surface) {
      if (node.dataset?.blockId) { blockEls = [node]; break; }
      node = node.parentElement;
    }
  } else {
    blockEls = [...surface.querySelectorAll('[data-block-id]')].filter(el => range.intersectsNode(el));
  }
  if (!blockEls?.length) return;
  blockEls.forEach(el => {
    el.dataset.alignment = alignment;
    el.style.textAlign = alignment;
  });
  surface.dispatchEvent(new Event('input', { bubbles: true }));
}

// ─── Inline text formatting utility ──────────────────────────────────────────
// Used by MenuBar (desktop) and MobileMenuBar
export function applyInlineFormat(tag) {
  const el = document.activeElement;
  if (!el) return;

  // contenteditable div → execCommand
  if (el.isContentEditable) {
    const cmd = { bold: 'bold', italic: 'italic', underline: 'underline' }[tag];
    if (cmd) document.execCommand(cmd, false, null);
    return;
  }

  // textarea / input → markdown markers
  if (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') return;
  const s = el.selectionStart ?? 0;
  const e = el.selectionEnd ?? 0;
  const val = el.value;
  const sel = val.substring(s, e);
  const markers = { bold: '**', italic: '*', underline: '__' };
  const m = markers[tag];
  if (!m) return;
  const replacement = `${m}${sel}${m}`;
  const setter = Object.getOwnPropertyDescriptor(
    el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
    'value'
  )?.set;
  if (setter) {
    setter.call(el, val.substring(0, s) + replacement + val.substring(e));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.setSelectionRange(s + m.length, s + m.length + sel.length);
  }
}
