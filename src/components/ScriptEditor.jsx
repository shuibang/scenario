import React, {
  useState, useEffect, useRef, useCallback, useMemo,
  forwardRef, useImperativeHandle,
} from 'react';
import { useApp } from '../store/AppContext';
import { genId, now } from '../store/db';
import { resolveSceneLabel, parseSceneContent } from '../utils/sceneResolver';
import { resolveFont } from '../print/FontRegistry';

// ─── Constants ────────────────────────────────────────────────────────────────
const CHAR_SUGGEST_KEY = 'drama_charSuggestInAction';

// ─── syncLabels ───────────────────────────────────────────────────────────────
function syncLabels(blocks) {
  let seq = 0;
  return blocks.map(b => {
    if (b.type === 'scene_number') { seq++; return { ...b, label: `S#${seq}.` }; }
    return b;
  });
}

// ─── HTML escape ──────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Blocks → innerHTML ──────────────────────────────────────────────────────
// For scene_number: strip the "S#n." prefix — label shown via CSS ::before
function blockDisplayContent(b) {
  if (b.type !== 'scene_number') return b.content || '';
  return (b.content || '').replace(/^S#\d+\.?\s*/, '');
}

function blocksToHtml(blocks) {
  return blocks.map(b => {
    const id = esc(b.id);
    const dc = esc(blockDisplayContent(b));
    switch (b.type) {
      case 'scene_number': {
        const label = esc(b.label || '');
        const sceneId = esc(b.sceneId || '');
        return `<div data-block-id="${id}" data-block-type="scene_number" data-label="${label}" data-scene-id="${sceneId}" class="ce-block ce-scene">${dc}</div>`;
      }
      case 'dialogue': {
        const cn = esc(b.characterName || b.charName || '');
        const ci = esc(b.characterId || '');
        return `<div data-block-id="${id}" data-block-type="dialogue" data-char-name="${cn}" data-char-id="${ci}" class="ce-block ce-dialogue"><span contenteditable="false" class="ce-char-badge">${cn || '&nbsp;'}</span><span class="ce-speech">${dc}</span></div>`;
      }
      default:
        return `<div data-block-id="${id}" data-block-type="${b.type}" class="ce-block ce-${b.type}">${dc}</div>`;
    }
  }).join('');
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────
function findBlockEl(node, surface) {
  let el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== surface) {
    if (el.dataset?.blockId) return el;
    el = el.parentElement;
  }
  return null;
}

function blockText(el) {
  if (!el) return '';
  if (el.dataset.blockType === 'dialogue') {
    const s = el.querySelector('.ce-speech');
    return s ? s.innerText.replace(/\n$/, '') : '';
  }
  return el.innerText.replace(/\n$/, '');
}

function setBlockText(el, text) {
  if (!el) return;
  if (el.dataset.blockType === 'dialogue') {
    const s = el.querySelector('.ce-speech');
    if (s) { s.innerText = text; return; }
  }
  el.innerText = text;
}

function caretOff(range, blockEl) {
  if (!range || !blockEl) return 0;
  const type = blockEl.dataset.blockType;
  const target = type === 'dialogue' ? (blockEl.querySelector('.ce-speech') || blockEl) : blockEl;
  if (!target.contains(range.startContainer) && target !== range.startContainer) return 0;
  try {
    const r = document.createRange();
    r.selectNodeContents(target);
    r.setEnd(range.startContainer, range.startOffset);
    return r.toString().length;
  } catch { return 0; }
}

function prevBlockEl(surface, el) {
  const all = [...surface.querySelectorAll('[data-block-id]')];
  const i = all.indexOf(el);
  return i > 0 ? all[i - 1] : null;
}

function nextBlockEl(surface, el) {
  const all = [...surface.querySelectorAll('[data-block-id]')];
  const i = all.indexOf(el);
  return i >= 0 && i < all.length - 1 ? all[i + 1] : null;
}

function setCaret(blockEl, offset) {
  if (!blockEl) return;
  const type = blockEl.dataset.blockType;
  const target = type === 'dialogue' ? (blockEl.querySelector('.ce-speech') || blockEl) : blockEl;
  try {
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    let rem = offset;
    let node;
    while ((node = walker.nextNode())) {
      if (rem <= node.length) {
        const r = document.createRange();
        r.setStart(node, rem); r.collapse(true);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(r);
        return;
      }
      rem -= node.length;
    }
    const r = document.createRange();
    r.selectNodeContents(target); r.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(r);
  } catch (_) {}
}

function insertBlockAfterEl(surface, refEl, type, text, charMeta = {}, epId, projId) {
  const id = genId();
  const div = document.createElement('div');
  div.dataset.blockId = id;
  div.dataset.blockType = type;
  div.className = `ce-block ce-${type}`;
  if (type === 'scene_number') {
    div.dataset.label = '';
    div.dataset.sceneId = genId();
    div.innerText = text;
  } else if (type === 'dialogue') {
    div.dataset.charName = charMeta.charName || '';
    div.dataset.charId = charMeta.charId || '';
    const badge = document.createElement('span');
    badge.contentEditable = 'false'; badge.className = 'ce-char-badge';
    badge.textContent = charMeta.charName || '';
    const speech = document.createElement('span');
    speech.className = 'ce-speech'; speech.textContent = text;
    div.append(badge, speech);
  } else {
    div.innerText = text;
  }
  if (refEl?.parentNode === surface) surface.insertBefore(div, refEl.nextSibling);
  else surface.appendChild(div);
  setCaret(div, 0);
  return div;
}

function changeBlockTypeEl(blockEl, newType) {
  const text = blockText(blockEl);
  const old = blockEl.dataset.blockType;
  blockEl.dataset.blockType = newType;
  blockEl.className = `ce-block ce-${newType}`;
  // Strip existing S# prefix when converting to scene_number to avoid double-labeling
  const displayText = newType === 'scene_number' ? text.replace(/^S#\d+\.?\s*/i, '') : text;
  if (newType === 'dialogue') {
    blockEl.innerHTML = `<span contenteditable="false" class="ce-char-badge">&nbsp;</span><span class="ce-speech">${esc(displayText)}</span>`;
    blockEl.dataset.charName = ''; blockEl.dataset.charId = '';
  } else if (old === 'dialogue') {
    delete blockEl.dataset.charName; delete blockEl.dataset.charId;
    blockEl.textContent = displayText;
  } else {
    blockEl.textContent = displayText;
  }
  if (newType === 'scene_number') {
    if (!blockEl.dataset.label) blockEl.dataset.label = '';
    if (!blockEl.dataset.sceneId) blockEl.dataset.sceneId = genId();
  }
}

function parseSurface(surface, metaRef, epId, projId) {
  const divs = [...surface.querySelectorAll('[data-block-id]')];
  const result = divs.map(div => {
    const id = div.dataset.blockId;
    const type = div.dataset.blockType;
    const prev = metaRef.current[id] || {};
    const rawText = blockText(div);
    const base = {
      id, type,
      episodeId: prev.episodeId || epId,
      projectId: prev.projectId || projId,
      label: prev.label || div.dataset.label || '',
      createdAt: prev.createdAt || now(),
      updatedAt: rawText !== prev.rawText ? now() : (prev.updatedAt || now()),
      rawText, // internal cache for change detection
      sceneRefs: prev.sceneRefs || [],
    };
    if (type === 'scene_number') {
      const parsed = parseSceneContent(rawText);
      const label = prev.label || div.dataset.label || '';
      const content = resolveSceneLabel({ label, ...parsed });
      return { ...base, ...parsed, content, sceneId: div.dataset.sceneId || prev.sceneId || genId() };
    }
    if (type === 'dialogue') {
      return {
        ...base,
        content: rawText,
        characterName: div.dataset.charName || prev.characterName || '',
        characterId: div.dataset.charId || prev.characterId || undefined,
        charName: div.dataset.charName || prev.charName || '',
      };
    }
    return { ...base, content: rawText };
  });
  const synced = syncLabels(result);
  // Update data-label on DOM
  synced.forEach(b => {
    if (b.type !== 'scene_number') return;
    const div = surface.querySelector(`[data-block-id="${b.id}"]`);
    if (div && div.dataset.label !== b.label) div.dataset.label = b.label;
  });
  return synced;
}

// ─── CharSuggestionPanel ──────────────────────────────────────────────────────
function CharSuggestionPanel({ charName, onConfirm, onDismiss, onDisable }) {
  return (
    <div
      className="absolute left-0 mt-1 rounded shadow-lg z-40 text-xs flex flex-col gap-0"
      style={{ background: 'var(--c-tag)', border: '1px solid var(--c-border4)', top: '100%', minWidth: '220px' }}
    >
      <div className="px-3 pt-2 pb-1 font-medium" style={{ color: 'var(--c-text2)' }}>
        등장인물 <span style={{ color: 'var(--c-accent)' }}>{charName}</span>
      </div>
      <div className="px-3 pb-1" style={{ color: 'var(--c-text6)', fontSize: '10px' }}>
        Enter: 등장인물로 확인 &nbsp;·&nbsp; Esc: 일반 지문으로 유지
      </div>
      <div className="px-3 pb-2 flex justify-between items-center">
        <button
          onMouseDown={e => { e.preventDefault(); onConfirm(); }}
          className="text-xs px-2 py-0.5 rounded"
          style={{ background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >확인</button>
        <button
          onMouseDown={e => { e.preventDefault(); onDisable(); }}
          className="text-xs"
          style={{ background: 'none', border: 'none', color: 'var(--c-text6)', cursor: 'pointer' }}
        >이 기능 끄기</button>
      </div>
    </div>
  );
}

// ─── CharDropdown ─────────────────────────────────────────────────────────────
function CharDropdown({ query, chars, onSelect }) {
  const filtered = useMemo(
    () => (query
      ? chars.filter(c => (c.name || '').includes(query) || (c.givenName || '').includes(query))
      : chars
    ).slice(0, 10),
    [chars, query],
  );
  if (!filtered.length) return null;
  return (
    <div
      className="absolute top-full left-0 mt-1 rounded shadow-xl z-50 min-w-[140px] overflow-hidden"
      style={{ background: 'var(--c-tag)', border: '1px solid var(--c-border4)' }}
    >
      {filtered.map(c => (
        <div
          key={c.id}
          onMouseDown={e => { e.preventDefault(); onSelect(c); }}
          className="px-3 py-1.5 text-sm cursor-pointer flex items-baseline gap-2"
          style={{ color: 'var(--c-text)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-active)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span>{c.givenName || c.name}</span>
          {c.surname && c.givenName && (
            <span className="text-[10px]" style={{ color: 'var(--c-text6)' }}>{c.surname}{c.givenName}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── SceneRefDropdown ─────────────────────────────────────────────────────────
function SceneRefDropdown({ query, scenes, onSelect, onClose }) {
  const getDisplayText = (s) => s.content || resolveSceneLabel({ ...s, label: '' }) || s.label;
  const filtered = scenes.filter(s => {
    if (!query) return true;
    const display = getDisplayText(s);
    return display.includes(query) || (s.label || '').includes(query);
  }).slice(0, 8);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="absolute top-full left-0 mt-1 rounded shadow-xl z-50 min-w-[220px] overflow-hidden"
      style={{ background: 'var(--c-tag)', border: '1px solid var(--c-border4)' }}
    >
      {filtered.length === 0 ? (
        <div className="px-3 py-2 text-xs" style={{ color: 'var(--c-text6)' }}>씬 없음</div>
      ) : filtered.map(s => {
        const display = getDisplayText(s);
        return (
          <div
            key={s.id}
            onMouseDown={e => { e.preventDefault(); onSelect(s, display); }}
            className="px-3 py-1.5 text-xs cursor-pointer"
            style={{ color: 'var(--c-text2)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-active)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {display || <span style={{ color: 'var(--c-text6)', fontStyle: 'italic' }}>{s.label} (미입력)</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── CharPickerOverlay ────────────────────────────────────────────────────────
function CharPickerOverlay({ anchor, projectChars, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 30); }, []);
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const filtered = (query
    ? projectChars.filter(c => (c.name || '').includes(query) || (c.givenName || '').includes(query))
    : projectChars
  ).slice(0, 10);

  return (
    <div
      className="fixed z-[100] rounded shadow-xl overflow-hidden"
      style={{
        top: anchor.top, left: anchor.left,
        background: 'var(--c-tag)', border: '1px solid var(--c-border4)',
        minWidth: '180px',
      }}
    >
      <div className="px-2 py-1.5" style={{ borderBottom: '1px solid var(--c-border)' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              if (filtered.length > 0) onSelect(filtered[0]);
              else if (query.trim()) onSelect({ id: undefined, name: query.trim(), givenName: query.trim() });
            }
          }}
          placeholder="인물명 검색"
          className="w-full text-sm px-1 outline-none bg-transparent"
          style={{ color: 'var(--c-text)', caretColor: 'var(--c-accent)' }}
          spellCheck={false}
        />
      </div>
      <div className="max-h-48 overflow-y-auto">
        {filtered.map(c => (
          <div
            key={c.id || c.name}
            onMouseDown={e => { e.preventDefault(); onSelect(c); }}
            className="px-3 py-1.5 text-sm cursor-pointer"
            style={{ color: 'var(--c-text)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-active)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {c.givenName || c.name}
            {c.surname && c.givenName && <span className="ml-2 text-[10px]" style={{ color: 'var(--c-text6)' }}>{c.surname}{c.givenName}</span>}
          </div>
        ))}
        {filtered.length === 0 && query.trim() && (
          <div
            onMouseDown={e => { e.preventDefault(); onSelect({ id: undefined, name: query.trim(), givenName: query.trim() }); }}
            className="px-3 py-1.5 text-sm cursor-pointer"
            style={{ color: 'var(--c-accent2)' }}
          >"{query}" 그대로 사용</div>
        )}
        {projectChars.length === 0 && !query && (
          <div className="px-3 py-2 text-xs" style={{ color: 'var(--c-text6)' }}>등록된 인물 없음</div>
        )}
      </div>
    </div>
  );
}

// ─── EditorSurface ────────────────────────────────────────────────────────────
// Single contentEditable surface for ALL block types.
// This is the core of the selection fix: one CE = native cross-block drag selection.
const EditorSurface = forwardRef(function EditorSurface({
  episodeId,
  initialBlocks,
  onBlocksChange,
  onBadgeClick,
  onCharSuggest,   // (blockId, charName) | null → for CharSuggestionPanel
  dialogueGap,
  fontFamily,
  fontSize,
  lineHeight,
  activeEpisodeId,
  activeProjectId,
  onPaste,
}, ref) {
  const surfaceRef = useRef(null);
  const metaRef = useRef({});
  const composingRef = useRef(false);
  const epIdRef = useRef(activeEpisodeId);
  const projIdRef = useRef(activeProjectId);
  epIdRef.current = activeEpisodeId;
  projIdRef.current = activeProjectId;

  const syncMeta = useCallback((blocks) => {
    const m = {};
    blocks.forEach(b => { m[b.id] = b; });
    metaRef.current = m;
  }, []);

  // ── Initialize DOM on episode change ONLY ──────────────────────────────────
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    syncMeta(initialBlocks);
    el.innerHTML = blocksToHtml(initialBlocks);
    const first = el.querySelector('[data-block-id]');
    if (first) setCaret(first, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId]);

  // ── Sync external block changes to non-focused DOM elements ───────────────
  // (e.g. sceneRef auto-update, external block type change)
  useEffect(() => {
    syncMeta(initialBlocks);
    const el = surfaceRef.current;
    if (!el) return;
    const focused = document.activeElement;
    initialBlocks.forEach(b => {
      const div = el.querySelector(`[data-block-id="${b.id}"]`);
      if (!div) return;
      if (div === focused || div.contains(focused)) return; // skip active block
      // Sync content
      const expected = blockDisplayContent(b);
      if (blockText(div) !== expected) setBlockText(div, expected);
      // Sync char name for dialogue
      if (b.type === 'dialogue') {
        const cn = b.characterName || b.charName || '';
        if (div.dataset.charName !== cn) {
          div.dataset.charName = cn;
          div.dataset.charId = b.characterId || '';
          const badge = div.querySelector('.ce-char-badge');
          if (badge) badge.textContent = cn || '\u00a0';
        }
      }
    });
  }, [initialBlocks]);

  // ── Core parse: DOM → blocks ──────────────────────────────────────────────
  const doParse = useCallback(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const blocks = parseSurface(el, metaRef, epIdRef.current, projIdRef.current);
    syncMeta(blocks);
    onBlocksChange(blocks);
  }, [onBlocksChange, syncMeta]);

  // ── Imperative API for parent ──────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    applyBlockType(type) {
      const el = surfaceRef.current;
      if (!el) return false;
      const sel = window.getSelection();
      if (!sel?.rangeCount) return false;
      const blockEl = findBlockEl(sel.getRangeAt(0).startContainer, el);
      if (!blockEl) return false;
      // Always change the current block's type (toolbar intent: change the focused block)
      changeBlockTypeEl(blockEl, type);
      if (type === 'dialogue') onBadgeClick?.(blockEl.dataset.blockId, blockEl);
      doParse();
      return true;
    },
    scrollToScene(sceneId) {
      const el = surfaceRef.current;
      if (!el || !sceneId) return;
      const div = el.querySelector(`[data-scene-id="${sceneId}"]`);
      if (div) div.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    updateBlockChar(blockId, charId, charName) {
      const el = surfaceRef.current;
      if (!el) return;
      const div = el.querySelector(`[data-block-id="${blockId}"]`);
      if (!div) return;
      div.dataset.charName = charName;
      div.dataset.charId = charId || '';
      const badge = div.querySelector('.ce-char-badge');
      if (badge) badge.textContent = charName || '\u00a0';
      doParse();
      // Re-focus speech
      const speech = div.querySelector('.ce-speech');
      if (speech) setTimeout(() => setCaret(div, 0), 30);
    },
    focus() {
      const el = surfaceRef.current;
      if (!el) return;
      const first = el.querySelector('[data-block-id]');
      if (first) { first.focus(); setCaret(first, 0); }
    },
    focusEnd() {
      const el = surfaceRef.current;
      if (!el) return;
      const all = [...el.querySelectorAll('[data-block-id]')];
      const last = all[all.length - 1];
      if (last) { last.focus(); setCaret(last, blockText(last).length); }
      else el.focus();
    },
  }), [doParse, onBadgeClick]);

  // ── Input handler ─────────────────────────────────────────────────────────
  const handleInput = useCallback(() => {
    if (composingRef.current) return;
    doParse();

    // CharSuggestion: check if current action block content looks like a character name
    const sel = window.getSelection();
    const el = surfaceRef.current;
    if (!sel?.rangeCount || !el) return;
    const blockEl = findBlockEl(sel.getRangeAt(0).startContainer, el);
    if (blockEl?.dataset.blockType === 'action') {
      onCharSuggest?.(blockEl.dataset.blockId, blockText(blockEl));
    } else {
      onCharSuggest?.(null, null);
    }
  }, [doParse, onCharSuggest]);

  // ── KeyDown handler ───────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    // Allow Ctrl/Meta shortcuts through IME composition (e.g. Ctrl+1/2/3, Ctrl+Z)
    if (!ctrl && (composingRef.current || e.nativeEvent?.isComposing)) return;
    const sel = window.getSelection();
    const el = surfaceRef.current;
    if (!sel?.rangeCount || !el) return;
    const range = sel.getRangeAt(0);
    const blockEl = findBlockEl(range.startContainer, el);
    if (!blockEl) return;
    const type = blockEl.dataset.blockType;

    // ── Ctrl+1/2/3: block type shortcuts
    const typeMap = { '1': 'scene_number', '2': 'action', '3': 'dialogue' };
    if (ctrl && e.key === '4') {
      e.preventDefault();
      // 등장체크 shortcut — handled by parent, surface just prevents default
      return;
    }
    if (ctrl && typeMap[e.key]) {
      e.preventDefault();
      const newType = typeMap[e.key];
      // Always change the current block's type (Ctrl+1/2/3: direct type assignment)
      changeBlockTypeEl(blockEl, newType);
      if (newType === 'dialogue') onBadgeClick?.(blockEl.dataset.blockId, blockEl);
      doParse();
      return;
    }

    // ── Enter: split block at caret
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Clear any cross-block selection first
      if (!sel.isCollapsed) {
        document.execCommand('delete');
        // Re-query after delete
        const sel2 = window.getSelection();
        if (!sel2?.rangeCount) return;
        const range2 = sel2.getRangeAt(0);
        const blockEl2 = findBlockEl(range2.startContainer, el);
        if (!blockEl2) return;
        const offset2 = caretOff(range2, blockEl2);
        const text2 = blockText(blockEl2);
        setBlockText(blockEl2, text2.slice(0, offset2));
        const nextType2 = blockEl2.dataset.blockType === 'scene_number' ? 'action' : blockEl2.dataset.blockType;
        const newEl2 = insertBlockAfterEl(el, blockEl2, nextType2, text2.slice(offset2));
        if (nextType2 === 'dialogue') onBadgeClick?.(newEl2.dataset.blockId, newEl2);
        doParse();
        return;
      }
      const offset = caretOff(range, blockEl);
      const text = blockText(blockEl);
      setBlockText(blockEl, text.slice(0, offset));
      const nextType = type === 'scene_number' ? 'action' : type;
      const newEl = insertBlockAfterEl(el, blockEl, nextType, text.slice(offset));
      if (nextType === 'dialogue') {
        const bid = newEl.dataset.blockId;
        requestAnimationFrame(() => onBadgeClick?.(bid, newEl));
      }
      onCharSuggest?.(null, null);
      doParse();
      return;
    }

    // ── Backspace at start of block: merge with previous
    if (e.key === 'Backspace' && sel.isCollapsed) {
      const offset = caretOff(range, blockEl);
      if (offset === 0) {
        e.preventDefault();
        const prev = prevBlockEl(el, blockEl);
        if (!prev) return;
        const prevText = blockText(prev);
        const curText = blockText(blockEl);
        setBlockText(prev, prevText + curText);
        blockEl.remove();
        setCaret(prev, prevText.length);
        doParse();
        return;
      }
    }

    // ── Delete at end of block: merge with next
    if (e.key === 'Delete' && sel.isCollapsed) {
      const text = blockText(blockEl);
      const offset = caretOff(range, blockEl);
      if (offset >= text.length) {
        e.preventDefault();
        const next = nextBlockEl(el, blockEl);
        if (!next) return;
        const curText = blockText(blockEl);
        const nextText = blockText(next);
        setBlockText(blockEl, curText + nextText);
        next.remove();
        setCaret(blockEl, curText.length);
        doParse();
        return;
      }
    }
  }, [doParse, onBadgeClick, onCharSuggest]);

  // ── Click: badge click for char name editing
  const handleClick = useCallback((e) => {
    if (e.target.classList.contains('ce-char-badge') || e.target.closest('.ce-char-badge')) {
      const badgeEl = e.target.closest('.ce-char-badge') || e.target;
      e.preventDefault();
      const blockEl = findBlockEl(badgeEl, surfaceRef.current);
      if (blockEl) onBadgeClick?.(blockEl.dataset.blockId, blockEl);
    }
  }, [onBadgeClick]);

  return (
    <div
      ref={surfaceRef}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-editor-surface
      style={{
        fontFamily,
        fontSize,
        lineHeight,
        outline: 'none',
        '--dialogue-gap': dialogueGap || '7em',
        minHeight: '100%',
        caretColor: 'var(--c-accent)',
      }}
      className="ce-surface"
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={() => { composingRef.current = false; doParse(); }}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      onPaste={onPaste}
    />
  );
});

// ─── ScriptEditor (main) ──────────────────────────────────────────────────────
export default function ScriptEditor({ scrollToSceneId, onScrollHandled }) {
  const { state, dispatch } = useApp();
  const {
    activeEpisodeId, activeProjectId, scriptBlocks,
    scenes, characters, saveStatus, saveErrorMsg, initialized, stylePreset,
  } = state;

  const [blocks, setBlocks] = useState([]);
  const saveTimer = useRef(null);
  const lastSavedBlocks = useRef(null);
  const surfaceApiRef = useRef(null);
  // Refs for unmount-flush and episode-switch flush (always up-to-date)
  const blocksRef = useRef([]);
  const activeEpisodeIdRef = useRef(null);
  const scenesRef = useRef([]);
  const prevEpisodeIdRef = useRef(null);
  const [charPickerState, setCharPickerState] = useState(null); // { blockId, top, left }
  const [charSuggestState, setCharSuggestState] = useState(null); // { blockId, blockEl, charName }
  const [suggestEnabled, setSuggestEnabled] = useState(() => localStorage.getItem(CHAR_SUGGEST_KEY) !== 'off');
  const [pendingBlockType, setPendingBlockType] = useState(null); // for mobile / no-focus toolbar clicks
  const [charCheckPicker, setCharCheckPicker] = useState(null); // { sceneId, top, left }
  const charCheckBtnRef = useRef(null);

  // Keep refs in sync every render so unmount-flush sees latest values
  blocksRef.current = blocks;
  activeEpisodeIdRef.current = activeEpisodeId;
  scenesRef.current = scenes;

  const episode = state.episodes.find(e => e.id === activeEpisodeId);
  const projectChars = useMemo(
    () => characters.filter(c => c.projectId === activeProjectId),
    [characters, activeProjectId],
  );
  const dialogueGap = stylePreset?.dialogueGap || '7em';
  const episodeScenes = useMemo(
    () => scenes.filter(s => s.episodeId === activeEpisodeId).sort((a, b) => a.sceneSeq - b.sceneSeq),
    [scenes, activeEpisodeId],
  );

  // ── Load blocks when episode changes
  useEffect(() => {
    if (!activeEpisodeId || !initialized) return;

    // Flush unsaved data for the PREVIOUS episode before switching
    // (handles the case where ScriptEditor stays mounted across episode switches)
    const prevEpId = prevEpisodeIdRef.current;
    if (prevEpId && prevEpId !== activeEpisodeId) {
      const prevBlocks = blocksRef.current;
      const prevSerialized = JSON.stringify(prevBlocks);
      if (prevBlocks.length > 0 && prevSerialized !== lastSavedBlocks.current) {
        clearTimeout(saveTimer.current);
        dispatch({ type: 'SET_BLOCKS', episodeId: prevEpId, payload: prevBlocks });
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
      }
    }
    prevEpisodeIdRef.current = activeEpisodeId;

    const epBlocks = scriptBlocks.filter(b => b.episodeId === activeEpisodeId);
    const loaded = epBlocks.length > 0
      ? epBlocks
      : [{ id: genId(), episodeId: activeEpisodeId, projectId: activeProjectId,
           type: 'action', content: '', label: '', createdAt: now(), updatedAt: now() }];
    setBlocks(loaded);
    lastSavedBlocks.current = JSON.stringify(loaded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEpisodeId, initialized]);

  // ── Debounced save + scene sync
  useEffect(() => {
    if (!activeEpisodeId || !blocks.length) return;
    const serialized = JSON.stringify(blocks);
    if (serialized === lastSavedBlocks.current) return;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const sceneBlocks = blocks.filter(b => b.type === 'scene_number');
      const updatedScenes = sceneBlocks.map((b, idx) => {
        const existing = scenes.find(s => s.id === b.sceneId);
        return {
          id: b.sceneId || genId(),
          episodeId: activeEpisodeId, projectId: activeProjectId,
          sceneSeq: idx + 1, label: `S#${idx + 1}.`,
          status: existing?.status || 'draft',
          tags: existing?.tags || [], characters: existing?.characters || [],
          characterIds: existing?.characterIds || [],
          content: b.content,
          // Preserve structured metadata set via RightPanel / SceneListPage
          location:          existing?.location          ?? '',
          subLocation:       existing?.subLocation       ?? '',
          timeOfDay:         existing?.timeOfDay         ?? '',
          specialSituation:  existing?.specialSituation  ?? '',
          sourceTreatmentItemId: existing?.sourceTreatmentItemId ?? null,
          sceneListContent:  existing?.sceneListContent  ?? '',
          createdAt: existing?.createdAt || now(), updatedAt: now(),
        };
      });
      dispatch({ type: 'SET_BLOCKS', episodeId: activeEpisodeId, payload: blocks });
      dispatch({ type: 'SYNC_SCENES', episodeId: activeEpisodeId, payload: updatedScenes });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
      lastSavedBlocks.current = serialized;
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [blocks, activeEpisodeId]);

  // ── Unmount flush: prevent data loss when user navigates away before debounce fires
  useEffect(() => {
    return () => {
      const epId = activeEpisodeIdRef.current;
      const currentBlocks = blocksRef.current;
      if (!epId || !currentBlocks.length) return;
      const serialized = JSON.stringify(currentBlocks);
      if (serialized === lastSavedBlocks.current) return;
      clearTimeout(saveTimer.current);
      const currentScenes = scenesRef.current;
      const sceneBlocks = currentBlocks.filter(b => b.type === 'scene_number');
      const updatedScenes = sceneBlocks.map((b, idx) => {
        const existing = currentScenes.find(s => s.id === b.sceneId);
        return {
          id: b.sceneId || genId(),
          episodeId: epId, projectId: b.projectId,
          sceneSeq: idx + 1, label: `S#${idx + 1}.`,
          status: existing?.status || 'draft',
          tags: existing?.tags || [], characters: existing?.characters || [],
          characterIds: existing?.characterIds || [],
          content: b.content,
          location: existing?.location ?? '', subLocation: existing?.subLocation ?? '',
          timeOfDay: existing?.timeOfDay ?? '', specialSituation: existing?.specialSituation ?? '',
          sourceTreatmentItemId: existing?.sourceTreatmentItemId ?? null,
          sceneListContent: existing?.sceneListContent ?? '',
          createdAt: existing?.createdAt || now(), updatedAt: now(),
        };
      });
      dispatch({ type: 'SET_BLOCKS', episodeId: epId, payload: currentBlocks });
      dispatch({ type: 'SYNC_SCENES', episodeId: epId, payload: updatedScenes });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
      lastSavedBlocks.current = serialized;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Scroll to scene
  useEffect(() => {
    if (!scrollToSceneId) return;
    surfaceApiRef.current?.scrollToScene(scrollToSceneId);
    onScrollHandled?.();
  }, [scrollToSceneId]);

  // ── sceneRefs auto-update
  useEffect(() => {
    if (!blocks.length) return;
    let anyChanged = false;
    const updated = blocks.map(b => {
      if (!b.sceneRefs?.length) return b;
      let content = b.content;
      let blockChanged = false;
      const newRefs = b.sceneRefs.map(ref => {
        const scene = scenes.find(s => s.id === ref.sceneId);
        if (!scene) return ref;
        const newText = scene.content || resolveSceneLabel({ ...scene, label: '' }) || scene.label;
        if (newText !== ref.displayText && ref.displayText && content.includes(ref.displayText)) {
          content = content.split(ref.displayText).join(newText);
          blockChanged = true;
          return { ...ref, displayText: newText };
        }
        return ref;
      });
      if (!blockChanged) return b;
      anyChanged = true;
      return { ...b, content, sceneRefs: newRefs };
    });
    if (anyChanged) setBlocks(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes]);

  // ── Broken scene refs
  const brokenSceneRefs = useMemo(() => {
    const broken = [];
    blocks.forEach(b => {
      (b.sceneRefs || []).forEach(ref => {
        if (!scenes.find(s => s.id === ref.sceneId))
          broken.push({ blockId: b.id, refSceneId: ref.sceneId, displayText: ref.displayText });
      });
    });
    return broken;
  }, [blocks, scenes]);
  const [reconnectTarget, setReconnectTarget] = useState(null);
  const [reconnectIdx, setReconnectIdx] = useState(0);

  // ── handleUpdate (for reconnect panel)
  const handleUpdate = useCallback((id, updates) => {
    setBlocks(prev => {
      const next = prev.map(b => b.id === id ? { ...b, ...updates, updatedAt: now() } : b);
      return updates.type === 'scene_number' || prev.find(b => b.id === id)?.type === 'scene_number'
        ? syncLabels(next) : next;
    });
  }, []);

  // ── Badge click: show char picker
  const handleBadgeClick = useCallback((blockId, blockEl) => {
    const rect = blockEl.getBoundingClientRect();
    setCharPickerState({ blockId, top: rect.bottom + 4, left: rect.left });
  }, []);

  // ── CharSuggest: action block content looks like a char name
  const handleCharSuggest = useCallback((blockId, content) => {
    if (!suggestEnabled || !blockId) { setCharSuggestState(null); return; }
    const trimmed = (content || '').trim();
    if (!trimmed) { setCharSuggestState(null); return; }
    const match = projectChars.find(c =>
      [c.name, c.givenName].filter(Boolean).some(n => n.startsWith(trimmed))
    );
    if (match) {
      const el = surfaceApiRef.current ? document.querySelector(`[data-block-id="${blockId}"]`) : null;
      setCharSuggestState({ blockId, charName: match.givenName || match.name, charObj: match, blockEl: el });
    } else {
      setCharSuggestState(null);
    }
  }, [suggestEnabled, projectChars]);

  // ── applyBlockType (toolbar): returns false when no editor focus → set pending
  const applyBlockType = useCallback((type) => {
    const applied = surfaceApiRef.current?.applyBlockType(type);
    if (applied === false) {
      // Toggle: clicking same type again clears the pending state
      setPendingBlockType(prev => prev === type ? null : type);
    } else if (applied === true) {
      setPendingBlockType(null);
    }
  }, []);

  // ── getCurrentSceneId: find the scene_number block's sceneId before the cursor ─
  const getCurrentSceneId = useCallback(() => {
    const surface = document.querySelector('[data-editor-surface]');
    if (!surface) return null;
    const all = [...surface.querySelectorAll('[data-block-id]')];
    let startEl = null;
    const sel = window.getSelection();
    if (sel?.rangeCount) startEl = findBlockEl(sel.getRangeAt(0).startContainer, surface);
    if (!startEl) startEl = all[all.length - 1];
    if (!startEl) return null;
    const idx = all.indexOf(startEl);
    for (let i = idx; i >= 0; i--) {
      if (all[i].dataset.blockType === 'scene_number') return all[i].dataset.sceneId || null;
    }
    return null;
  }, []);

  // ── 등장체크: open char picker, add selected character to current scene's characterIds ─
  const handleCharCheck = useCallback(() => {
    const sceneId = getCurrentSceneId();
    const rect = charCheckBtnRef.current?.getBoundingClientRect();
    setCharCheckPicker({ sceneId, top: rect ? rect.bottom + 4 : 60, left: rect ? rect.left : 0 });
  }, [getCurrentSceneId]);

  const handleCharCheckSelect = useCallback((char) => {
    if (char?.id && charCheckPicker?.sceneId) {
      const scene = episodeScenes.find(s => s.id === charCheckPicker.sceneId);
      if (scene) {
        const existing = scene.characterIds || [];
        if (!existing.includes(char.id)) {
          dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, characterIds: [...existing, char.id], updatedAt: now() } });
        }
      }
    }
    setCharCheckPicker(null);
  }, [charCheckPicker, episodeScenes, dispatch]);

  // ── CharSuggestion: intercept Enter (confirm) / Esc (dismiss) ─────────────
  useEffect(() => {
    if (!charSuggestState) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setCharSuggestState(null);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const { blockId, charObj } = charSuggestState;
        const surface = document.querySelector('[data-editor-surface]');
        if (surface) {
          const div = surface.querySelector(`[data-block-id="${blockId}"]`);
          if (div) {
            div.dataset.blockType = 'dialogue';
            div.className = 'ce-block ce-dialogue';
            div.dataset.charName = charObj.givenName || charObj.name;
            div.dataset.charId = charObj.id || '';
            div.innerHTML = `<span contenteditable="false" class="ce-char-badge">${esc(charObj.givenName || charObj.name)}</span><span class="ce-speech"></span>`;
            setCaret(div, 0);
          }
        }
        setCharSuggestState(null);
        setBlocks(prev => syncLabels(prev.map(b =>
          b.id === blockId
            ? { ...b, type: 'dialogue', content: '', characterId: charObj.id, characterName: charObj.name, charName: charObj.givenName || charObj.name }
            : b
        )));
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [charSuggestState]);

  // ── Inject character tags as data-attr on scene_number DOM blocks ──────────
  useEffect(() => {
    const surface = document.querySelector('[data-editor-surface]');
    if (!surface) return;
    blocks.filter(b => b.type === 'scene_number').forEach(b => {
      const div = surface.querySelector(`[data-scene-id="${b.sceneId}"]`);
      if (!div) return;
      const scene = episodeScenes.find(s => s.id === b.sceneId);
      if (!scene?.characterIds?.length) {
        div.removeAttribute('data-char-tags');
        return;
      }
      const names = scene.characterIds
        .map(id => {
          const c = projectChars.find(ch => ch.id === id);
          return c ? (c.givenName || c.name || '') : '';
        })
        .filter(Boolean)
        .join(' · ');
      if (names) div.dataset.charTags = names;
      else div.removeAttribute('data-char-tags');
    });
  }, [blocks, episodeScenes, projectChars]);

  // ── Paste: detect structured content
  const handleEditorPaste = useCallback((e) => {
    const text = e.clipboardData?.getData('text/plain') || '';
    if (!text.includes('\n')) return;
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length <= 1) return;

    const SCENE_RE = /^(S#\d+\.?|s#\d+|씬\s*\d+|scene\s*\d+)/i;
    const DIAG_TAB_RE = /^([^\t\n]+)\t(.+)$/;
    const DIAG_SPACE_RE = /^(\S+)\s{3,}(.+)$/;
    const charNameSet = new Set(projectChars.flatMap(c => [c.name, c.givenName].filter(Boolean)));
    const anyScene = lines.some(l => SCENE_RE.test(l.trim()));
    const anyDialogue = lines.some(l => {
      const s = l.trim();
      const m = s.match(DIAG_TAB_RE) || s.match(DIAG_SPACE_RE);
      return m && charNameSet.has(m[1].trim());
    });
    if (!anyScene && !anyDialogue) return;
    e.preventDefault();

    const newBlocks = lines.map(line => {
      const stripped = line.trim();
      if (!stripped) return null;
      if (SCENE_RE.test(stripped)) {
        return { id: genId(), episodeId: activeEpisodeId, projectId: activeProjectId,
          type: 'scene_number', content: stripped.replace(SCENE_RE, '').trim(), label: '', sceneId: genId(), createdAt: now(), updatedAt: now() };
      }
      const dm = stripped.match(DIAG_TAB_RE) || stripped.match(DIAG_SPACE_RE);
      if (dm && charNameSet.has(dm[1].trim())) {
        const charName = dm[1].trim();
        const char = projectChars.find(c => c.name === charName || c.givenName === charName);
        return { id: genId(), episodeId: activeEpisodeId, projectId: activeProjectId,
          type: 'dialogue', content: dm[2].trim(), label: '', characterId: char?.id, characterName: char?.name || charName, createdAt: now(), updatedAt: now() };
      }
      return { id: genId(), episodeId: activeEpisodeId, projectId: activeProjectId,
        type: 'action', content: stripped, label: '', createdAt: now(), updatedAt: now() };
    }).filter(Boolean);

    if (!newBlocks.length) return;
    setBlocks(prev => syncLabels([...prev, ...newBlocks]));
  }, [blocks, activeEpisodeId, activeProjectId, projectChars]);

  const editorFontSize = stylePreset?.fontSize ? `${stylePreset.fontSize}pt` : '11pt';
  const editorLineHeight = stylePreset?.lineHeight ?? 1.6;
  const { cssStack: editorFontFamily } = resolveFont(stylePreset, 'editor');

  const BLOCK_TYPE_BTNS = [
    { type: 'scene_number', label: 'S#', title: '씬번호 (Ctrl+1)' },
    { type: 'action',       label: '지문', title: '지문 (Ctrl+2)' },
    { type: 'dialogue',     label: '대사', title: '대사 (Ctrl+3)' },
  ];

  if (!activeEpisodeId) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--c-text5)', background: 'var(--c-bg)' }}>
        좌측에서 회차를 선택하세요
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--c-bg)' }}>
      {/* Toolbar */}
      <div className="px-6 py-2 flex items-center gap-2 text-xs shrink-0" style={{ borderBottom: '1px solid var(--c-border2)' }}>
        <span style={{ color: 'var(--c-text3)' }}>{episode?.number}회 {episode?.title || ''}</span>
        <span style={{ color: 'var(--c-text5)' }}>
          {blocks.filter(b => b.type === 'scene_number').length}개 씬
          · {blocks.filter(b => b.type === 'dialogue').length}개 대사
        </span>
        <div data-tour-id="scene-block-btns" className="flex gap-1 ml-2">
          {BLOCK_TYPE_BTNS.map(({ type, label, title }) => {
            const isPending = pendingBlockType === type;
            return (
              <button
                key={type}
                title={isPending ? `${title} — 본문을 클릭하면 적용됩니다` : title}
                onMouseDown={e => { e.preventDefault(); applyBlockType(type); }}
                className="px-2 py-0.5 rounded text-xs"
                style={{
                  color: isPending ? '#fff' : 'var(--c-text3)',
                  border: `1px solid ${isPending ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                  background: isPending ? 'var(--c-accent)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.1s, color 0.1s, border-color 0.1s',
                }}
                onMouseEnter={e => { if (!isPending) { e.currentTarget.style.background = 'var(--c-hover)'; e.currentTarget.style.color = 'var(--c-accent)'; } }}
                onMouseLeave={e => { if (!isPending) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--c-text3)'; } }}
              >{label}</button>
            );
          })}
          <button
            ref={charCheckBtnRef}
            title="등장체크 — 현재 씬 등장인물 추가 (Ctrl+4)"
            onMouseDown={e => { e.preventDefault(); handleCharCheck(); }}
            className="px-2 py-0.5 rounded text-xs ml-1"
            style={{ color: 'var(--c-text3)', border: '1px solid var(--c-border3)', background: 'transparent', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; e.currentTarget.style.color = 'var(--c-accent2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--c-text3)'; }}
          >등장체크</button>
        </div>
        <span className="ml-auto flex items-center gap-2">
          {brokenSceneRefs.length > 0 && (
            <button
              onClick={() => { setReconnectIdx(0); setReconnectTarget(brokenSceneRefs[0]); }}
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', cursor: 'pointer' }}
            >⚠ S# 참조 {brokenSceneRefs.length}개 끊김</button>
          )}
          {saveStatus === 'saving'
            ? <span style={{ color: 'var(--c-text6)' }}>저장 중…</span>
            : saveStatus === 'error'
            ? <span className="text-red-400 cursor-pointer" title={saveErrorMsg || '저장 실패'}
                onClick={() => dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' })}>
                ⚠ 저장 실패 {saveErrorMsg ? '(클릭으로 닫기)' : ''}
              </span>
            : <span style={{ color: 'var(--c-border3)' }}>● 저장됨</span>
          }
        </span>
      </div>

      {/* Reconnect panel */}
      {reconnectTarget && (
        <div className="px-6 py-3 shrink-0 flex items-start gap-3 relative" style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium mb-1" style={{ color: '#92400e' }}>
              씬 참조 재연결 — <span style={{ fontStyle: 'italic' }}>"{reconnectTarget.displayText || '(표시 없음)'}"</span> 연결이 끊겼습니다.
            </div>
            <div className="text-[11px] mb-2" style={{ color: '#b45309' }}>아래에서 씬을 다시 선택하거나, 일반 텍스트로 전환하세요.</div>
            <div className="relative inline-block">
              <SceneRefDropdown
                query=""
                scenes={episodeScenes}
                onSelect={(scene, displayText) => {
                  const block = blocks.find(b => b.id === reconnectTarget.blockId);
                  if (block) {
                    const oldText = reconnectTarget.displayText || '';
                    const newContent = oldText && block.content.includes(oldText)
                      ? block.content.split(oldText).join(displayText) : block.content;
                    const newRefs = (block.sceneRefs || []).filter(r => r.sceneId !== reconnectTarget.refSceneId)
                      .concat([{ sceneId: scene.id, displayText }]);
                    handleUpdate(block.id, { content: newContent, sceneRefs: newRefs });
                  }
                  const nextIdx = reconnectIdx + 1;
                  if (nextIdx < brokenSceneRefs.length) { setReconnectIdx(nextIdx); setReconnectTarget(brokenSceneRefs[nextIdx]); }
                  else { setReconnectTarget(null); setReconnectIdx(0); }
                }}
                onClose={() => setReconnectTarget(null)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <button
              onClick={() => {
                const block = blocks.find(b => b.id === reconnectTarget.blockId);
                if (block) handleUpdate(block.id, { sceneRefs: (block.sceneRefs || []).filter(r => r.sceneId !== reconnectTarget.refSceneId) });
                const nextIdx = reconnectIdx + 1;
                if (nextIdx < brokenSceneRefs.length) { setReconnectIdx(nextIdx); setReconnectTarget(brokenSceneRefs[nextIdx]); }
                else { setReconnectTarget(null); setReconnectIdx(0); }
              }}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'transparent', border: '1px solid #fde68a', color: '#92400e', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >일반 텍스트로</button>
            <button
              onClick={() => { setReconnectTarget(null); setReconnectIdx(0); }}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'transparent', border: '1px solid var(--c-border3)', color: 'var(--c-text5)', cursor: 'pointer' }}
            >닫기</button>
          </div>
        </div>
      )}

      {/* Editor */}
      <div
        className="flex-1 overflow-y-auto relative"
        onClick={(e) => {
          const inSurface = !!e.target.closest('[data-editor-surface]');
          if (inSurface) {
            // User clicked inside the editor — apply pending block type if any
            if (pendingBlockType) {
              const pt = pendingBlockType;
              setPendingBlockType(null);
              requestAnimationFrame(() => surfaceApiRef.current?.applyBlockType(pt));
            }
            return;
          }
          // Click in the scroll wrapper below the surface — move cursor to end
          surfaceApiRef.current?.focusEnd();
          if (pendingBlockType) {
            const pt = pendingBlockType;
            setPendingBlockType(null);
            requestAnimationFrame(() => surfaceApiRef.current?.applyBlockType(pt));
          }
        }}
      >
        <div
          className="max-w-2xl mx-auto py-8 px-16"
          style={{ fontFamily: editorFontFamily, fontSize: editorFontSize, lineHeight: editorLineHeight }}
        >
          <EditorSurface
            ref={surfaceApiRef}
            episodeId={activeEpisodeId}
            initialBlocks={blocks}
            onBlocksChange={setBlocks}
            onBadgeClick={handleBadgeClick}
            onCharSuggest={handleCharSuggest}
            dialogueGap={dialogueGap}
            fontFamily={editorFontFamily}
            fontSize={editorFontSize}
            lineHeight={editorLineHeight}
            activeEpisodeId={activeEpisodeId}
            activeProjectId={activeProjectId}
            onPaste={handleEditorPaste}
          />
          <div className="h-48" />
        </div>

        {/* CharSuggestionPanel */}
        {charSuggestState && suggestEnabled && (() => {
          const el = charSuggestState.blockEl;
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return (
            <div style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, zIndex: 50 }}>
              <CharSuggestionPanel
                charName={charSuggestState.charName}
                onConfirm={() => {
                  const { blockId, charObj } = charSuggestState;
                  const surface = document.querySelector('[data-editor-surface]');
                  if (!surface) return;
                  const div = surface.querySelector(`[data-block-id="${blockId}"]`);
                  if (div) {
                    div.dataset.blockType = 'dialogue';
                    div.className = 'ce-block ce-dialogue';
                    div.dataset.charName = charObj.givenName || charObj.name;
                    div.dataset.charId = charObj.id || '';
                    div.innerHTML = `<span contenteditable="false" class="ce-char-badge">${esc(charObj.givenName || charObj.name)}</span><span class="ce-speech"></span>`;
                    setCaret(div, 0);
                  }
                  setCharSuggestState(null);
                  setBlocks(prev => syncLabels(prev.map(b =>
                    b.id === blockId
                      ? { ...b, type: 'dialogue', content: '', characterId: charObj.id, characterName: charObj.name, charName: charObj.givenName || charObj.name }
                      : b
                  )));
                }}
                onDismiss={() => setCharSuggestState(null)}
                onDisable={() => {
                  localStorage.setItem(CHAR_SUGGEST_KEY, 'off');
                  setSuggestEnabled(false);
                  setCharSuggestState(null);
                }}
              />
            </div>
          );
        })()}
      </div>

      {/* Char Picker Overlay */}
      {charPickerState && (
        <CharPickerOverlay
          anchor={{ top: charPickerState.top, left: charPickerState.left }}
          projectChars={projectChars}
          onSelect={(char) => {
            surfaceApiRef.current?.updateBlockChar(
              charPickerState.blockId,
              char.id || '',
              char.givenName || char.name || ''
            );
            setCharPickerState(null);
          }}
          onClose={() => setCharPickerState(null)}
        />
      )}

      {/* 등장체크 Char Picker */}
      {charCheckPicker && (
        <CharPickerOverlay
          anchor={{ top: charCheckPicker.top, left: charCheckPicker.left }}
          projectChars={projectChars}
          onSelect={handleCharCheckSelect}
          onClose={() => setCharCheckPicker(null)}
        />
      )}

      {/* Shortcuts hint */}
      <div className="px-6 py-2 flex gap-4 text-[11px] shrink-0" style={{ borderTop: '1px solid var(--c-border)', color: 'var(--c-dim)' }}>
        <span>Ctrl+1 씬번호</span>
        <span>Ctrl+2 지문</span>
        <span>Ctrl+3 대사</span>
        <span>Enter 다음 블록</span>
        <span>Shift+Enter 줄바꿈</span>
        <span>Backspace (빈 블록) 삭제</span>
      </div>
    </div>
  );
}
