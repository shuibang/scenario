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
