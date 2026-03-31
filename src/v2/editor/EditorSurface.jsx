/**
 * v2 EditorSurface
 * ─────────────────────────────────────────────────────────────
 * Single contentEditable div. React NEVER writes innerHTML while editing.
 * DOM is the source of truth during editing.
 * blocksRef (via onCommit) is updated synchronously on every input.
 *
 * Design principles:
 * 1. No external sync effect — no props that overwrite DOM during editing.
 * 2. `resetWith(blocks)` is the only React→DOM path (episode switch only).
 * 3. All toolbar commands go through `applyBlockType` / `updateBlockChar` (direct DOM manipulation).
 * 4. onCommit(blocks, selInfo) is called after every DOM change via rAF.
 */
import React, { forwardRef, useImperativeHandle, useRef, useCallback, useEffect } from 'react';
import { blocksToHTML, renderBlock } from './BlockRenderer.js';
import {
  parseDOM, findBlockEl, getCaretOffset, setCaret,
  blockTextFromEl, setBlockTextOnEl, prevBlockEl, nextBlockEl,
} from './DomParser.js';
import { genId, now } from '../store/StoreContext.jsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/**
 * Change a block element's type directly in the DOM (no re-render).
 * Preserves text content.
 */
function changeBlockTypeInDOM(el, newType, charName = '', charId = '') {
  if (!el) return;
  const oldType = el.dataset.v2Type;
  if (oldType === newType && newType !== 'dialogue') return;

  const text = blockTextFromEl(el);
  el.dataset.v2Type = newType;
  el.className = `v2b v2b-${newType}`;
  el.removeAttribute('data-v2-char-name');
  el.removeAttribute('data-v2-char-id');
  el.removeAttribute('data-v2-label');
  el.removeAttribute('data-v2-scene-id');

  if (newType === 'dialogue') {
    el.dataset.v2CharName = charName;
    el.dataset.v2CharId   = charId;
    el.innerHTML = `<span contenteditable="false" class="v2b-badge">${esc(charName) || '\u00a0'}</span><span data-v2-speech class="v2b-speech">${esc(text)}</span>`;
  } else if (newType === 'scene_number') {
    el.removeAttribute('data-v2-char-name');
    el.removeAttribute('data-v2-char-id');
    el.textContent = text;
  } else {
    el.textContent = text;
  }
}

/**
 * Create and insert a new block element after `afterEl`.
 */
function insertBlockAfter(surface, afterEl, type, text = '', meta = {}) {
  const id = genId();
  const el = document.createElement('div');
  el.dataset.v2Id   = id;
  el.dataset.v2Type = type;
  el.className      = `v2b v2b-${type}`;

  if (type === 'scene_number') {
    el.dataset.v2SceneId = meta.sceneId || genId();
    el.dataset.v2Label   = '';  // will be set by parseDOM sync labels
    el.textContent = text;
  } else if (type === 'dialogue') {
    el.dataset.v2CharName = meta.charName || '';
    el.dataset.v2CharId   = meta.charId   || '';
    el.innerHTML = `<span contenteditable="false" class="v2b-badge">${esc(meta.charName) || '\u00a0'}</span><span data-v2-speech class="v2b-speech">${esc(text)}</span>`;
  } else {
    el.textContent = text;
  }

  if (afterEl && afterEl.parentNode === surface) {
    afterEl.insertAdjacentElement('afterend', el);
  } else {
    surface.appendChild(el);
  }
  return el;
}

// ─── EditorSurface ────────────────────────────────────────────────────────────
const EditorSurface = forwardRef(function EditorSurface({
  episodeId,
  activeProjectId,
  onCommit,       // (blocks, selInfo) — called after every change
  onBadgeClick,   // (blockId, el) — user clicked dialogue char badge
  onCharSuggest,  // (blockId, charName) | null
  style,          // CSS vars + font
}, ref) {
  const surfaceRef    = useRef(null);
  const metaRef       = useRef({});    // { [blockId]: partial Block }
  const composingRef  = useRef(false); // IME composition in progress
  const epIdRef       = useRef(episodeId);
  const projIdRef     = useRef(activeProjectId);
  const commitRafRef  = useRef(null);

  epIdRef.current   = episodeId;
  projIdRef.current = activeProjectId;

  // ── Meta map sync helper ───────────────────────────────────────────────────
  const syncMeta = useCallback((blocks) => {
    const m = {};
    blocks.forEach(b => { m[b.id] = b; });
    metaRef.current = m;
  }, []);

  // ── Parse DOM → blocks → call onCommit ────────────────────────────────────
  // This is the ONE path for DOM → state. Called on every change.
  const doParse = useCallback(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const blocks = parseDOM(el, metaRef.current, epIdRef.current, projIdRef.current);
    syncMeta(blocks);
    // Batch via rAF so multiple synchronous DOM changes don't cause multiple commits
    cancelAnimationFrame(commitRafRef.current);
    commitRafRef.current = requestAnimationFrame(() => {
      const sel = window.getSelection();
      const focused = document.activeElement;
      const blockEl = sel?.rangeCount
        ? findBlockEl(sel.getRangeAt(0).startContainer, surfaceRef.current)
        : null;
      const selInfo = blockEl ? {
        blockId:   blockEl.dataset.v2Id,
        blockType: blockEl.dataset.v2Type,
      } : null;
      onCommit?.(blocks, selInfo);
    });
  }, [onCommit, syncMeta]);

  // ── Initialize DOM when episode changes ───────────────────────────────────
  // This is the ONLY place React writes to the DOM surface.
  // After this, the DOM is owned by the user's editing.
  useEffect(() => {
    // This effect fires on mount and when episodeId changes.
    // We don't re-render here — resetWith() is the public API for that.
    // But on initial mount we need the DOM set up.
    const el = surfaceRef.current;
    if (!el || el.innerHTML) return; // Already has content (from resetWith call)
    // If empty surface on mount, show a placeholder action block
    const placeholder = document.createElement('div');
    placeholder.dataset.v2Id   = genId();
    placeholder.dataset.v2Type = 'action';
    placeholder.className      = 'v2b v2b-action';
    placeholder.textContent    = '';
    el.appendChild(placeholder);
    doParse();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Imperative API ─────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({

    /** Replace DOM with a new set of blocks (episode switch, initial load) */
    resetWith(blocks) {
      const el = surfaceRef.current;
      if (!el) return;
      syncMeta(blocks);
      el.innerHTML = blocksToHTML(blocks);
      // Focus first block
      const first = el.querySelector('[data-v2-id]');
      if (first) setCaret(first, 0);
      doParse();
    },

    /** Change the type of the currently focused block */
    applyBlockType(type) {
      const el  = surfaceRef.current;
      if (!el) return false;
      const sel = window.getSelection();
      if (!sel?.rangeCount) return false;
      const blockEl = findBlockEl(sel.getRangeAt(0).startContainer, el);
      if (!blockEl) return false;

      const wasDialogue = blockEl.dataset.v2Type === 'dialogue';
      changeBlockTypeInDOM(blockEl, type);
      doParse();

      if (type === 'dialogue') {
        onBadgeClick?.(blockEl.dataset.v2Id, blockEl);
      } else if (wasDialogue) {
        // Restore caret to text
        setCaret(blockEl, blockTextFromEl(blockEl).length);
      }
      return true;
    },

    /** Update the character on a dialogue block */
    updateBlockChar(blockId, charId, charName) {
      const el = surfaceRef.current;
      if (!el) return;
      const div = el.querySelector(`[data-v2-id="${blockId}"]`);
      if (!div || div.dataset.v2Type !== 'dialogue') return;
      div.dataset.v2CharName = charName;
      div.dataset.v2CharId   = charId || '';
      const badge = div.querySelector('.v2b-badge');
      if (badge) badge.textContent = charName || '\u00a0';
      doParse();
      // Move caret to speech
      const speech = div.querySelector('[data-v2-speech]');
      if (speech) setTimeout(() => setCaret(div, 0), 20);
    },

    /** Scroll to a scene_number block by sceneId */
    scrollToScene(sceneId) {
      const el = surfaceRef.current;
      if (!el || !sceneId) return;
      const div = el.querySelector(`[data-v2-scene-id="${sceneId}"]`);
      if (div) div.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    /** Focus the last block */
    focusEnd() {
      const el = surfaceRef.current;
      if (!el) return;
      const all = [...el.querySelectorAll('[data-v2-id]')];
      const last = all[all.length - 1];
      if (last) { last.focus(); setCaret(last, blockTextFromEl(last).length); }
      else el.focus();
    },

    /** Return current blocks without committing (used by EditorCore for flush) */
    getCurrentBlocks() {
      const el = surfaceRef.current;
      if (!el) return [];
      return parseDOM(el, metaRef.current, epIdRef.current, projIdRef.current);
    },

    /** Inject character-tag data attribute on scene blocks (for CSS display) */
    setSceneCharTags(sceneId, tagString) {
      const el = surfaceRef.current;
      if (!el) return;
      const div = el.querySelector(`[data-v2-scene-id="${sceneId}"]`);
      if (!div) return;
      if (tagString) div.dataset.v2CharTags = tagString;
      else div.removeAttribute('data-v2-char-tags');
    },
  }), [doParse, onBadgeClick, syncMeta]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (composingRef.current) return;

    const el  = surfaceRef.current;
    const sel = window.getSelection();
    if (!sel?.rangeCount || !el) return;
    const range   = sel.getRangeAt(0);
    const blockEl = findBlockEl(range.startContainer, el);
    if (!blockEl) return;

    const type   = blockEl.dataset.v2Type;
    const ctrl   = e.ctrlKey || e.metaKey;

    // ── Block type shortcuts ────────────────────────────────────────────────
    const typeMap = { '1': 'scene_number', '2': 'action', '3': 'dialogue' };
    if (ctrl && typeMap[e.key]) {
      e.preventDefault();
      const newType = typeMap[e.key];
      changeBlockTypeInDOM(blockEl, newType);
      if (newType === 'dialogue') onBadgeClick?.(blockEl.dataset.v2Id, blockEl);
      doParse();
      return;
    }

    // ── Enter: split block or start next ───────────────────────────────────
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (composingRef.current) return;

      const offset  = getCaretOffset(range, blockEl);
      const text    = blockTextFromEl(blockEl);
      const before  = text.slice(0, offset);
      const after   = text.slice(offset);

      setBlockTextOnEl(blockEl, before);

      // Determine next block type
      let nextType = 'action';
      if (type === 'scene_number') nextType = 'action';
      else if (type === 'dialogue') nextType = 'dialogue';
      else if (type === 'action')   nextType = 'action';

      const newEl = insertBlockAfter(el, blockEl, nextType, after, {
        charName: type === 'dialogue' ? blockEl.dataset.v2CharName : '',
        charId:   type === 'dialogue' ? blockEl.dataset.v2CharId   : '',
        sceneId:  nextType === 'scene_number' ? genId() : '',
      });

      setCaret(newEl, 0);

      if (nextType === 'dialogue') {
        onBadgeClick?.(newEl.dataset.v2Id, newEl);
      }
      onCharSuggest?.(null, null);
      doParse();
      return;
    }

    // ── Backspace at start: merge with previous ────────────────────────────
    if (e.key === 'Backspace' && sel.isCollapsed) {
      if (getCaretOffset(range, blockEl) === 0) {
        e.preventDefault();
        const prev = prevBlockEl(el, blockEl);
        if (!prev) return;
        const prevText = blockTextFromEl(prev);
        const curText  = blockTextFromEl(blockEl);
        setBlockTextOnEl(prev, prevText + curText);
        blockEl.remove();
        setCaret(prev, prevText.length);
        doParse();
        return;
      }
    }

    // ── Delete at end: merge with next ─────────────────────────────────────
    if (e.key === 'Delete' && sel.isCollapsed) {
      const text   = blockTextFromEl(blockEl);
      const offset = getCaretOffset(range, blockEl);
      if (offset >= text.length) {
        e.preventDefault();
        const next = nextBlockEl(el, blockEl);
        if (!next) return;
        const nextText = blockTextFromEl(next);
        setBlockTextOnEl(blockEl, text + nextText);
        next.remove();
        setCaret(blockEl, text.length);
        doParse();
        return;
      }
    }
  }, [doParse, onBadgeClick, onCharSuggest]);

  // ── Input (typing) ────────────────────────────────────────────────────────
  const handleInput = useCallback((e) => {
    if (composingRef.current) return;
    doParse();

    // Character suggestion: if an action block looks like a char name
    if (onCharSuggest) {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const blockEl = findBlockEl(sel.getRangeAt(0).startContainer, surfaceRef.current);
      if (blockEl?.dataset.v2Type === 'action') {
        onCharSuggest(blockEl.dataset.v2Id, blockTextFromEl(blockEl));
      } else {
        onCharSuggest(null, null);
      }
    }
  }, [doParse, onCharSuggest]);

  // ── Click: badge click ─────────────────────────────────────────────────────
  const handleClick = useCallback((e) => {
    const badge = e.target.closest('.v2b-badge');
    if (badge) {
      e.preventDefault();
      const blockEl = findBlockEl(badge, surfaceRef.current);
      if (blockEl) onBadgeClick?.(blockEl.dataset.v2Id, blockEl);
    }
  }, [onBadgeClick]);

  // ── Paste ─────────────────────────────────────────────────────────────────
  const handlePaste = useCallback((e) => {
    // Prevent HTML paste — only accept plain text
    const text = e.clipboardData?.getData('text/plain');
    if (!text) return;
    e.preventDefault();

    const el  = surfaceRef.current;
    const sel = window.getSelection();
    if (!sel?.rangeCount || !el) return;

    const range   = sel.getRangeAt(0);
    const blockEl = findBlockEl(range.startContainer, el);
    if (!blockEl) return;

    // Simple paste: insert at caret (no multi-line structure detection here)
    // Multi-line paste is handled by EditorCore if needed
    const offset = getCaretOffset(range, blockEl);
    const text0  = blockTextFromEl(blockEl);
    setBlockTextOnEl(blockEl, text0.slice(0, offset) + text + text0.slice(offset));
    setCaret(blockEl, offset + text.length);
    doParse();
  }, [doParse]);

  return (
    <div
      ref={surfaceRef}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-v2-surface
      style={{
        outline: 'none',
        minHeight: '100%',
        caretColor: 'var(--c-accent)',
        ...style,
      }}
      className="v2-surface"
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={() => { composingRef.current = false; doParse(); }}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      onPaste={handlePaste}
    />
  );
});

export default EditorSurface;
