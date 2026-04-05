import React, {
  useState, useEffect, useRef, useCallback, useMemo,
  forwardRef, useImperativeHandle,
} from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store/AppContext';
import { genId, now } from '../store/db';
import { resolveSceneLabel, parseSceneContent } from '../utils/sceneResolver';
import { resolveFont } from '../print/FontRegistry';
import { getLayoutMetrics } from '../print/LineTokenizer';

// ─── Constants ────────────────────────────────────────────────────────────────
const CHAR_SUGGEST_KEY = 'drama_charSuggestInAction';

const DEFAULT_SYMBOLS = ['(E)', '(F)', 'Flashback', 'Insert', 'Ins.', 'Subtitle)', 'S.T.', '(N)', 'N.A.'];

// ─── Symbol Picker ────────────────────────────────────────────────────────────
function SymbolPicker({ mobile = false, closeToken = 0, onOpen }) {
  const { state, dispatch } = useApp();
  // dropPos null = closed, { top?, bottom?, left } = open — 둘을 분리하지 않아 (0,0) 렌더 방지
  const [dropPos, setDropPos] = useState(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [editMode, setEditMode] = useState(false);
  const [newSym, setNewSym] = useState('');
  const ref = useRef(null);
  const btnRef = useRef(null);
  const dropRef = useRef(null);
  const customSymbols = state.stylePreset?.customSymbols || [];
  const allSymbols = [...DEFAULT_SYMBOLS, ...customSymbols];
  const open = dropPos !== null;

  // 버튼 rect를 받아 위/아래 중 공간이 넓은 쪽으로 드롭다운 위치 계산
  // visualViewport 기준 사용 — 모바일 키보드가 올라와 있을 때 window.innerHeight는 키보드 포함이라 부정확
  const calcDropPos = (rect) => {
    const dropW = 200;
    const dropH = 220;
    const left = Math.min(rect.left, Math.max(0, window.innerWidth - dropW));
    const vvTop = window.visualViewport?.offsetTop ?? 0;
    const vvH   = window.visualViewport?.height ?? window.innerHeight;
    const spaceBelow = (vvTop + vvH) - rect.bottom;
    const spaceAbove = rect.top - vvTop;
    if (spaceBelow >= dropH || spaceBelow >= spaceAbove) {
      return { top: rect.bottom + 4, left };
    }
    // 위로 열기 — top 기반으로 계산 (bottom 기반은 키보드에 가려질 수 있음)
    return { top: Math.max(vvTop + 4, rect.top - dropH - 4), left };
  };

  // 외부에서 닫기 요청 (closeToken 변경)
  useEffect(() => {
    if (closeToken > 0) setDropPos(null);
  }, [closeToken]);

  useEffect(() => {
    if (!open) { setActiveIdx(-1); return; }
    const handler = (e) => {
      const inBtn = ref.current?.contains(e.target);
      const inDrop = dropRef.current?.contains(e.target);
      if (!inBtn && !inDrop) setDropPos(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Ctrl+6 단축키로 열기
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'Digit6') {
        e.preventDefault();
        if (open) {
          setDropPos(null);
        } else {
          const rect = btnRef.current?.getBoundingClientRect();
          if (rect) setDropPos(calcDropPos(rect));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 방향키 / Enter / Escape 처리
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveIdx(i => (i + 1) % allSymbols.length);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveIdx(i => (i - 1 + allSymbols.length) % allSymbols.length);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => (i + 3) % allSymbols.length);   // 한 줄 아래 (약 3열 기준)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => (i - 3 + allSymbols.length) % allSymbols.length);
      } else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        insertSymbol(allSymbols[activeIdx]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setDropPos(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, activeIdx, allSymbols]);

  const addCustomSym = () => {
    const s = newSym.trim();
    if (!s) return;
    const cur = state.stylePreset?.customSymbols || [];
    if (!cur.includes(s)) {
      dispatch({ type: 'SET_STYLE_PRESET', payload: { customSymbols: [...cur, s] } });
    }
    setNewSym('');
  };

  const removeCustomSym = (sym) => {
    const cur = state.stylePreset?.customSymbols || [];
    dispatch({ type: 'SET_STYLE_PRESET', payload: { customSymbols: cur.filter(s => s !== sym) } });
  };

  const insertSymbol = (sym) => {
    setDropPos(null);
    const surface = document.querySelector('[data-editor-surface]');
    if (!surface) return;
    surface.focus();
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(sym));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    surface.dispatchEvent(new Event('input', { bubbles: true }));
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        onMouseDown={e => {
          e.preventDefault();
          if (open) {
            setDropPos(null);
          } else {
            const rect = e.currentTarget.getBoundingClientRect();
            setDropPos(calcDropPos(rect));
            onOpen?.();
          }
        }}
        style={mobile ? {
          flex: '0 0 auto', width: 44, fontSize: 12, padding: '5px 0',
          borderRadius: 6, textAlign: 'center',
          border: '1px solid var(--c-border3)', background: 'transparent',
          color: 'var(--c-text4)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        } : {
          flexShrink: 0, width: 40, textAlign: 'center',
          fontSize: 'clamp(10px, 2.8vw, 13px)',
          padding: '4px 0', borderRadius: 6,
          border: '1px solid var(--c-border3)', background: 'transparent',
          color: 'var(--c-text4)', cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
          transition: 'background 0.1s, color 0.1s, border-color 0.1s',
          marginLeft: 4,
        }}
      >기타</button>
      {open && createPortal(
        <div
          ref={dropRef}
          style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            zIndex: 9999,
            background: 'var(--c-tag)', border: '1px solid var(--c-border4)',
            borderRadius: '0.5rem', overflow: 'hidden',
            minWidth: '180px', maxWidth: '280px', boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          }}
        >
          <div style={{ padding: '4px 12px 6px', fontSize: 10, fontWeight: 600, color: 'var(--c-text5)', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>기타 삽입</span>
            <button
              onMouseDown={e => { e.preventDefault(); setEditMode(v => !v); }}
              style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, border: '1px solid var(--c-border3)', background: editMode ? 'var(--c-accent)' : 'transparent', color: editMode ? '#fff' : 'var(--c-text5)', cursor: 'pointer' }}
            >편집</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, maxHeight: 192, overflowY: 'auto' }}>
            {allSymbols.map((sym, i) => {
              const isCustom = !DEFAULT_SYMBOLS.includes(sym);
              return (
                <div
                  key={sym}
                  onMouseEnter={() => !editMode && setActiveIdx(i)}
                  onMouseLeave={() => setActiveIdx(-1)}
                  style={{
                    padding: '6px 12px', fontSize: 12, cursor: editMode ? 'default' : 'pointer', whiteSpace: 'nowrap',
                    color: activeIdx === i ? 'var(--c-text)' : 'var(--c-text2)',
                    background: activeIdx === i ? 'var(--c-active)' : 'transparent',
                    width: '50%', boxSizing: 'border-box',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <span onMouseDown={e => { if (!editMode) { e.preventDefault(); insertSymbol(sym); } }}>{sym}</span>
                  {editMode && isCustom && (
                    <button
                      onMouseDown={e => { e.preventDefault(); removeCustomSym(sym); }}
                      style={{ fontSize: 10, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                    >×</button>
                  )}
                </div>
              );
            })}
          </div>
          {editMode && (
            <div style={{ padding: '6px 8px', borderTop: '1px solid var(--c-border)', display: 'flex', gap: 4 }}>
              <input
                value={newSym}
                onChange={e => setNewSym(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSym(); } }}
                placeholder="추가할 단축어"
                style={{ flex: 1, fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--c-border3)', background: 'var(--c-input)', color: 'var(--c-text)', outline: 'none' }}
              />
              <button
                onMouseDown={e => { e.preventDefault(); addCustomSym(); }}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
              >추가</button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Page counter (status bar) ────────────────────────────────────────────────
function PageCounter({ blocks, stylePreset, scrollRef }) {
  const totalPages = useMemo(() => {
    if (!blocks.length) return 1;
    const m = getLayoutMetrics(stylePreset);
    const { charsPerLine, charsInSpeech, linesPerPage, fontSize, lineHeight } = m;
    const lineHpt = fontSize * lineHeight;
    let total = 0;
    let prevType = null;
    // ep_title 한 줄 (회차 제목) + blank
    total += ((fontSize + 2) * lineHeight + 14) / lineHpt + 1;
    for (const b of blocks) {
      if (prevType !== null && prevType !== b.type) total += 1; // 타입 변경 시 빈줄
      switch (b.type) {
        case 'scene_number':
          total += 1 + 12 / lineHpt;
          break;
        case 'action': {
          const len = stripHtml(b.content || '').length;
          const lines = Math.max(1, Math.ceil(len / (charsPerLine - 2)));
          total += lines * (1 + 1 / lineHpt);
          break;
        }
        case 'dialogue': {
          const len = stripHtml(b.content || '').length;
          const lines = Math.max(1, Math.ceil(len / charsInSpeech));
          total += lines * (1 + 1 / lineHpt);
          break;
        }
        default: {
          const len = stripHtml(b.content || '').length;
          const lines = Math.max(1, Math.ceil(len / charsPerLine));
          total += lines * (1 + 1 / lineHpt);
        }
      }
      prevType = b.type;
    }
    return Math.max(1, Math.ceil(total / linesPerPage));
  }, [blocks, stylePreset]);

  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return;
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const ratio = scrollHeight <= clientHeight ? 0 : scrollTop / (scrollHeight - clientHeight);
      setCurrentPage(Math.min(totalPages, Math.max(1, Math.round(ratio * (totalPages - 1)) + 1)));
    };
    el.addEventListener('scroll', update, { passive: true });
    update();
    return () => el.removeEventListener('scroll', update);
  }, [scrollRef, totalPages]);

  if (!totalPages) return null;
  return (
    <span className="text-[10px] tabular-nums" style={{ color: 'var(--c-text6)' }} title="현재 페이지 / 전체 페이지">
      {currentPage}/{totalPages}
    </span>
  );
}

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

// ─── Inline HTML helpers (B/I/U 서식 저장용) ─────────────────────────────────
function sanitizeInlineHtml(html) {
  if (!html) return '';
  return html
    .replace(/<strong(\s[^>]*)?>/gi, '<b>').replace(/<\/strong>/gi, '</b>')
    .replace(/<em(\s[^>]*)?>/gi, '<i>').replace(/<\/em>/gi, '</i>')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<(?!\/?(b|i|u)(\s[^>]*)?>)[^>]+>/gi, '')
    .replace(/\n$/, '');
}
function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '');
}
function blockHtml(el) {
  if (!el) return '';
  return sanitizeInlineHtml(el.innerHTML);
}
function setBlockHtml(el, html) {
  if (!el) return;
  el.innerHTML = html;
}

// ─── Blocks → innerHTML ──────────────────────────────────────────────────────
// For scene_number: strip the "S#n." prefix — label shown via CSS ::before
// For dialogue: strip charName prefix from content (old format had name embedded in content)
function blockDisplayContent(b) {
  if (b.type === 'scene_number') return (b.content || '').replace(/^S#\d+\.?\s*/, '');
  if (b.type === 'dialogue') {
    const name = b.characterName || b.charName || '';
    const content = b.content || '';
    if (name && content.startsWith(name)) return content.slice(name.length).trimStart();
    return content;
  }
  return b.content || '';
}

// Rebuild block inner HTML, reinserting scene-ref-chip spans in-place
function buildRichHtml(content, sceneRefs) {
  if (!sceneRefs?.length) return esc(content);
  let remaining = content;
  let result = '';
  for (const ref of sceneRefs) {
    if (!ref.displayText) continue;
    // displayText already includes parentheses e.g. "(S#3 거실)"
    const idx = remaining.indexOf(ref.displayText);
    if (idx < 0) continue;
    result += esc(remaining.slice(0, idx));
    result += `<span contenteditable="false" data-ref-scene-id="${esc(ref.sceneId)}" class="scene-ref-chip">${esc(ref.displayText)}</span>`;
    remaining = remaining.slice(idx + ref.displayText.length);
  }
  result += esc(remaining);
  return result;
}

function blocksToHtml(blocks) {
  return blocks.map(b => {
    const id = esc(b.id);
    const displayContent = blockDisplayContent(b);
    // action/dialogue 블록: HTML 서식 포함 가능 → esc 생략 (sanitizeInlineHtml로 이미 안전)
    const isRichBlock = (b.type === 'action' || b.type === 'dialogue') && !b.sceneRefs?.length;
    const dc = b.sceneRefs?.length ? buildRichHtml(displayContent, b.sceneRefs) : isRichBlock ? displayContent : esc(displayContent);
    switch (b.type) {
      case 'scene_number': {
        const label = esc(b.label || '');
        const sceneId = esc(b.sceneId || '');
        return `<div data-block-id="${id}" data-block-type="scene_number" data-label="${label}" data-scene-id="${sceneId}" class="ce-block ce-scene">${dc}</div>`;
      }
      case 'dialogue': {
        const cn = esc(b.characterName || b.charName || '');
        const ci = esc(b.characterId || '');
        return `<div data-block-id="${id}" data-block-type="dialogue" data-char-name="${cn}" data-char-id="${ci}" class="ce-block ce-dialogue">${dc}</div>`;
      }
      case 'scene_ref': {
        const refId = esc(b.refSceneId || '');
        return `<div data-block-id="${id}" data-block-type="scene_ref" data-ref-scene-id="${refId}" class="ce-block ce-scene_ref">${dc}</div>`;
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
  return el.innerText.replace(/\n$/, '');
}

function setBlockText(el, text) {
  if (!el) return;
  el.innerText = text;
}

function caretOff(range, blockEl) {
  if (!range || !blockEl) return 0;
  if (!blockEl.contains(range.startContainer) && blockEl !== range.startContainer) return 0;
  try {
    const r = document.createRange();
    r.selectNodeContents(blockEl);
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
    div.innerText = text;
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
    blockEl.innerText = displayText;
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
    // Extract inline scene-ref-chip spans from DOM
    const refSpans = [...div.querySelectorAll('span[data-ref-scene-id]')];
    const sceneRefs = refSpans.length > 0
      ? refSpans.map(s => ({ sceneId: s.dataset.refSceneId, displayText: s.textContent }))
      : (prev.sceneRefs || []);
    const base = {
      id, type,
      episodeId: prev.episodeId || epId,
      projectId: prev.projectId || projId,
      label: prev.label || div.dataset.label || '',
      createdAt: prev.createdAt || now(),
      updatedAt: rawText !== prev.rawText ? now() : (prev.updatedAt || now()),
      rawText, // internal cache for change detection
      sceneRefs,
    };
    if (type === 'scene_number') {
      // rawText는 DOM 표시용(라벨 제거된 값)이므로 parsed는 순수 내용
      const parsed = parseSceneContent(rawText);
      const label = prev.label || div.dataset.label || '';
      // content에 label prefix가 있으면 제거 후 resolveSceneLabel 호출
      const cleanContent = (parsed.location || parsed.specialSituation)
        ? undefined // structured → resolveSceneLabel이 알아서 조합
        : rawText.replace(/^S#\d+\.?\s*/, '');
      const contentForResolve = cleanContent !== undefined
        ? { label, location: '', subLocation: '', timeOfDay: '', specialSituation: '', content: cleanContent }
        : { label, ...parsed };
      const content = resolveSceneLabel(contentForResolve);
      return { ...base, ...parsed, content, sceneId: div.dataset.sceneId || prev.sceneId || genId() };
    }
    if (type === 'dialogue') {
      // sceneRefs 없는 dialogue는 HTML 서식 보존
      // ce-char-badge 가 있는 신규 블록의 경우 .ce-speech 만 읽어야 배지 텍스트가 content에 포함되지 않음
      const speechEl = div.querySelector('.ce-speech');
      const contentEl = speechEl || div;
      const content = sceneRefs.length ? rawText : blockHtml(contentEl);
      return {
        ...base,
        content,
        characterName: div.dataset.charName || prev.characterName || '',
        characterId: div.dataset.charId || prev.characterId || undefined,
        charName: div.dataset.charName || prev.charName || '',
      };
    }
    if (type === 'scene_ref') {
      return { ...base, content: rawText, refSceneId: div.dataset.refSceneId || prev.refSceneId || '' };
    }
    // action: sceneRefs 없으면 HTML 보존
    const content = (type === 'action' && !sceneRefs.length) ? blockHtml(div) : rawText;
    return { ...base, content };
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
function CharPickerOverlay({ anchor, projectChars, onSelect, onClose, onAddNew, mobile = false }) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const containerRef = useRef(null);
  // ref로 콜백 안정화 — inline arrow가 바뀌어도 effect 재실행 없음
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 30); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current(); };
    const onMouseDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    // setTimeout 0: 열리는 mousedown 이벤트가 끝난 뒤에 핸들러 등록
    const t = setTimeout(() => document.addEventListener('mousedown', onMouseDown), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, []); // 마운트 1회만 — onClose/onSelect는 ref로 접근

  const filtered = (query
    ? projectChars.filter(c => (c.name || '').includes(query) || (c.givenName || '').includes(query))
    : projectChars
  ).slice(0, 10);

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-char-item]');
    items[activeIdx]?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: 'fixed', zIndex: 9999, borderRadius: '0.5rem',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)', overflow: 'hidden',
        ...(mobile ? {
          bottom: 60, left: 8, right: 8,
          background: 'var(--c-tag)', border: '1px solid var(--c-border4)',
        } : {
          top: anchor.top, left: anchor.left,
          background: 'var(--c-tag)', border: '1px solid var(--c-border4)',
          minWidth: '180px',
        }),
      }}
    >
      <div className="px-2 py-1.5" style={{ borderBottom: '1px solid var(--c-border)' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setActiveIdx(-1); }}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIdx(i => Math.max(i - 1, -1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (activeIdx >= 0 && filtered[activeIdx]) {
                onSelect(filtered[activeIdx]);
              } else {
                onClose();
              }
            }
          }}
          placeholder="인물명 검색"
          className="w-full text-sm px-1 outline-none bg-transparent"
          style={{ color: 'var(--c-text)', caretColor: 'var(--c-accent)' }}
          spellCheck={false}
        />
      </div>
      <div ref={listRef} className="max-h-48 overflow-y-auto">
        {filtered.map((c, i) => (
          <div
            key={c.id || c.name}
            data-char-item
            onMouseDown={e => { e.preventDefault(); onSelect(c); }}
            onMouseEnter={() => setActiveIdx(i)}
            className="px-3 py-1.5 text-sm cursor-pointer"
            style={{ color: 'var(--c-text)', background: i === activeIdx ? 'var(--c-active)' : 'transparent' }}
          >
            {c.givenName || c.name}
            {c.surname && c.givenName && <span className="ml-2 text-[10px]" style={{ color: 'var(--c-text6)' }}>{c.surname}{c.givenName}</span>}
          </div>
        ))}
        {filtered.length === 0 && query.trim() && (
          <div className="flex items-center gap-1 px-2 py-1">
            <div
              onMouseDown={e => { e.preventDefault(); onSelect({ id: undefined, name: query.trim(), givenName: query.trim() }); }}
              className="flex-1 px-2 py-1 text-sm cursor-pointer rounded"
              style={{ color: 'var(--c-accent2)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-active)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >"{query}" 그대로 사용</div>
            {onAddNew && (
              <button
                onMouseDown={e => { e.preventDefault(); onAddNew(query.trim()); }}
                className="shrink-0 text-xs px-2 py-1 rounded"
                style={{ background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                title="인물 페이지에 자동 추가"
              >+ 인물 추가</button>
            )}
          </div>
        )}
        {projectChars.length === 0 && !query && (
          <div className="px-3 py-2 text-xs" style={{ color: 'var(--c-text6)' }}>등록된 인물 없음</div>
        )}
      </div>
    </div>,
    document.body
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
  onSelectionChange, // (blockType | null) → 툴바 하이라이트용
  dialogueGap,
  fontFamily,
  fontSize,
  lineHeight,
  activeEpisodeId,
  activeProjectId,
  onPaste,
  onUndo,          // () → 커스텀 Undo 핸들러
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

    // Detect episode switch: init effect may have rendered stale (previous episode)
    // blocks before setBlocks fired. If first DOM block ID doesn't match first
    // initialBlock ID, we need a full rebuild.
    const firstDomId = el.querySelector('[data-block-id]')?.dataset.blockId;
    const firstBlockId = initialBlocks[0]?.id;
    if (firstBlockId && firstDomId !== firstBlockId) {
      el.innerHTML = blocksToHtml(initialBlocks);
      const first = el.querySelector('[data-block-id]');
      if (first) setCaret(first, 0);
      return;
    }

    // activeElement는 contenteditable 루트(surface)를 반환하므로
    // selection range로 현재 커서가 있는 블록을 찾아야 함
    const sel = window.getSelection();
    let activeBlockEl = null;
    if (sel?.rangeCount) {
      activeBlockEl = findBlockEl(sel.getRangeAt(0).startContainer, el);
    }
    initialBlocks.forEach(b => {
      const div = el.querySelector(`[data-block-id="${b.id}"]`);
      if (!div) return;
      if (div === activeBlockEl) return; // skip block with cursor
      // Sync content — rich blocks: compare plain text to avoid overwriting formatting
      const expected = blockDisplayContent(b);
      const isRich = b.type === 'action' || b.type === 'dialogue';
      const expectedPlain = isRich ? stripHtml(expected) : expected;
      // dialogue: badge 구조인 경우 .ce-speech 기준으로 비교
      const compareEl = (b.type === 'dialogue' && div.querySelector('.ce-speech')) ? div.querySelector('.ce-speech') : div;
      if (blockText(compareEl) !== expectedPlain) {
        if (isRich) setBlockHtml(div, expected); else setBlockText(div, expected);
      }
      // Sync char name for dialogue
      if (b.type === 'dialogue') {
        const cn = b.characterName || b.charName || '';
        if (div.dataset.charName !== cn) {
          div.dataset.charName = cn;
          div.dataset.charId = b.characterId || '';
        }
      }
      // Sync scene label (data-label → CSS ::before 로 "S#n." 표시)
      if (b.type === 'scene_number' && b.label && div.dataset.label !== b.label) {
        div.dataset.label = b.label;
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
    // 현재 커서의 블록 타입을 선택 상태 콜백으로 전달
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      const blockEl = findBlockEl(sel.getRangeAt(0).startContainer, el);
      onSelectionChange?.(blockEl?.dataset.blockType || null);
    }
  }, [onBlocksChange, syncMeta, onSelectionChange]);

  // ── Imperative API for parent ──────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    applyBlockType(type) {
      const el = surfaceRef.current;
      if (!el) return false;

      // 선택 영역에서 블록 찾기
      const sel = window.getSelection();
      let blockEl = null;
      if (sel?.rangeCount) {
        blockEl = findBlockEl(sel.getRangeAt(0).startContainer, el);
      }

      // 선택 없으면 마지막 블록으로 fallback
      if (!blockEl) {
        const all = [...el.querySelectorAll('[data-block-id]')];
        blockEl = all[all.length - 1] || null;
      }

      // 블록이 아예 없으면 새로 생성
      if (!blockEl) {
        blockEl = insertBlockAfterEl(el, null, type, '');
        if (type === 'dialogue') onBadgeClick?.(blockEl.dataset.blockId, blockEl);
        doParse();
        return true;
      }

      changeBlockTypeEl(blockEl, type);
      if (type === 'dialogue') {
        onBadgeClick?.(blockEl.dataset.blockId, blockEl);
      } else {
        setCaret(blockEl, blockText(blockEl).length);
      }
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
      // 커서를 블록 시작으로
      try {
        const r = document.createRange();
        r.selectNodeContents(div);
        r.collapse(true);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(r);
      } catch (_) {}
      doParse();
    },
    focus() {
      const el = surfaceRef.current;
      if (!el) return;
      el.focus();
      const first = el.querySelector('[data-block-id]');
      if (first) setCaret(first, 0);
    },
    focusEnd() {
      const el = surfaceRef.current;
      if (!el) return;
      el.focus();
      const all = [...el.querySelectorAll('[data-block-id]')];
      const last = all[all.length - 1];
      if (last) setCaret(last, blockText(last).length);
    },
    loadBlocks(blocks) {
      const el = surfaceRef.current;
      if (!el) return;
      el.innerHTML = blocksToHtml(blocks);
      // sync meta & labels
      const synced = parseSurface(el, metaRef, epIdRef.current, projIdRef.current);
      syncMeta(synced);
      onBlocksChange(synced);
    },
    applyFormat(format) {
      // format: 'bold' | 'italic' | 'underline'
      document.execCommand('styleWithCSS', false, false);
      document.execCommand(format, false, null);
      doParse();
    },
  }), [doParse, onBadgeClick, syncMeta, onBlocksChange]);

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

    // Ctrl+Shift+1/2/3/4 는 window 레벨 핸들러에서 처리 (포커스 무관하게 동작)
    if (ctrl && e.shiftKey && ['Digit1','Digit2','Digit3','Digit4'].includes(e.code)) {
      e.preventDefault();
      return;
    }

    // ── Ctrl+Z: 커스텀 Undo (브라우저 기본 동작 대체)
    if (ctrl && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      onUndo?.();
      return;
    }

    // ── Ctrl+B/I/U: 인라인 서식 (action/dialogue 블록에서만)
    if (ctrl && !e.shiftKey && (e.key === 'b' || e.key === 'i' || e.key === 'u')) {
      if (type === 'action' || type === 'dialogue') {
        e.preventDefault();
        const cmdMap = { b: 'bold', i: 'italic', u: 'underline' };
        document.execCommand('styleWithCSS', false, false);
        document.execCommand(cmdMap[e.key], false, null);
        doParse();
      }
      return;
    }

    // ── Enter: split block at caret
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // ── Helper: HTML-aware split at current caret ──────────────────────────
      const splitRichBlock = (srcEl, srcRange) => {
        const rangeToEnd = document.createRange();
        try {
          rangeToEnd.setStart(srcRange.startContainer, srcRange.startOffset);
          rangeToEnd.setEnd(srcEl, srcEl.childNodes.length);
        } catch (_) { return null; }
        const frag = rangeToEnd.extractContents();
        const tmp = document.createElement('div');
        tmp.appendChild(frag);
        return sanitizeInlineHtml(tmp.innerHTML);
      };

      // Clear any cross-block selection first
      if (!sel.isCollapsed) {
        document.execCommand('delete');
        const sel2 = window.getSelection();
        if (!sel2?.rangeCount) return;
        const range2 = sel2.getRangeAt(0);
        const blockEl2 = findBlockEl(range2.startContainer, el);
        if (!blockEl2) return;
        const nextType2 = blockEl2.dataset.blockType === 'scene_number' ? 'action' : blockEl2.dataset.blockType;
        const isRich2 = blockEl2.dataset.blockType === 'action' || blockEl2.dataset.blockType === 'dialogue';
        if (isRich2) {
          const afterHtml2 = splitRichBlock(blockEl2, range2) ?? '';
          const newEl2 = insertBlockAfterEl(el, blockEl2, nextType2, '');
          setBlockHtml(newEl2, afterHtml2);
          setCaret(newEl2, 0);
          if (nextType2 === 'dialogue') onBadgeClick?.(newEl2.dataset.blockId, newEl2);
        } else {
          const offset2 = caretOff(range2, blockEl2);
          const text2 = blockText(blockEl2);
          setBlockText(blockEl2, text2.slice(0, offset2));
          const newEl2 = insertBlockAfterEl(el, blockEl2, nextType2, text2.slice(offset2));
          if (nextType2 === 'dialogue') onBadgeClick?.(newEl2.dataset.blockId, newEl2);
        }
        doParse();
        return;
      }

      const nextType = type === 'scene_number' ? 'action' : type;
      const isRich = type === 'action' || type === 'dialogue';
      if (isRich) {
        const afterHtml = splitRichBlock(blockEl, range) ?? '';
        const newEl = insertBlockAfterEl(el, blockEl, nextType, '');
        setBlockHtml(newEl, afterHtml);
        setCaret(newEl, 0);
        if (nextType === 'dialogue') {
          const bid = newEl.dataset.blockId;
          requestAnimationFrame(() => onBadgeClick?.(bid, newEl));
        }
      } else {
        const offset = caretOff(range, blockEl);
        const text = blockText(blockEl);
        setBlockText(blockEl, text.slice(0, offset));
        const newEl = insertBlockAfterEl(el, blockEl, nextType, text.slice(offset));
        if (nextType === 'dialogue') {
          const bid = newEl.dataset.blockId;
          requestAnimationFrame(() => onBadgeClick?.(bid, newEl));
        }
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
        const prevIsRich = prev.dataset.blockType === 'action' || prev.dataset.blockType === 'dialogue';
        const curIsRich  = type === 'action' || type === 'dialogue';
        if (prevIsRich || curIsRich) {
          const prevSpeech = prev.querySelector('.ce-speech') || prev;
          const curSpeech  = blockEl.querySelector('.ce-speech') || blockEl;
          const prevHtml = blockHtml(prevSpeech);
          const curHtml  = blockHtml(curSpeech);
          const caretPos = stripHtml(prevHtml).length;
          setBlockHtml(prev, prevHtml + curHtml);
          blockEl.remove();
          setCaret(prev, caretPos);
        } else {
          const prevText = blockText(prev);
          const curText  = blockText(blockEl);
          setBlockText(prev, prevText + curText);
          blockEl.remove();
          setCaret(prev, prevText.length);
        }
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
        const isRich = type === 'action' || type === 'dialogue'
          || next.dataset.blockType === 'action' || next.dataset.blockType === 'dialogue';
        if (isRich) {
          const curSpeech  = blockEl.querySelector('.ce-speech') || blockEl;
          const nextSpeech = next.querySelector('.ce-speech') || next;
          const curHtml  = blockHtml(curSpeech);
          const nextHtml = blockHtml(nextSpeech);
          const caretPos = stripHtml(curHtml).length;
          setBlockHtml(blockEl, curHtml + nextHtml);
          next.remove();
          setCaret(blockEl, caretPos);
        } else {
          const curText  = blockText(blockEl);
          const nextText = blockText(next);
          setBlockText(blockEl, curText + nextText);
          next.remove();
          setCaret(blockEl, curText.length);
        }
        doParse();
        return;
      }
    }
  }, [doParse, onBadgeClick, onCharSuggest]);

  // ── Click: dialogue 블록 클릭 시 인물명(::before 영역) 클릭이면 피커 열기
  const handleClick = useCallback((e) => {
    const el = surfaceRef.current;
    if (!el) return;
    const blockEl = findBlockEl(e.target, el);
    if (!blockEl || blockEl.dataset.blockType !== 'dialogue') return;
    // ::before 영역은 blockEl 왼쪽 padding 안쪽
    const rect = blockEl.getBoundingClientRect();
    const style = window.getComputedStyle(blockEl);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    if (e.clientX < rect.left + paddingLeft) {
      e.preventDefault();
      onBadgeClick?.(blockEl.dataset.blockId, blockEl);
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
        caretColor: 'var(--c-accent)',
      }}
      className="ce-surface"
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={() => { composingRef.current = false; doParse(); }}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onClick={(e) => { handleClick(e); doParse(); }}
      onPaste={onPaste}
    />
  );
});

// ─── ScriptEditor (main) ──────────────────────────────────────────────────────
export default function ScriptEditor({ scrollToSceneId, onScrollHandled, keyboardUp, isMobile, onScrollRefReady }) {
  const { state, dispatch } = useApp();
  const {
    activeEpisodeId, activeProjectId, scriptBlocks,
    scenes, characters, saveStatus, saveErrorMsg, initialized, stylePreset,
    pendingScriptReload,
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
  const [charPickerState, setCharPickerState] = useState(null); // { blockId, top, left, fromDialogue? }
  const [charPickerNoSel, setCharPickerNoSel] = useState(null); // { top, left } — 선택안함 표시
  const [charSuggestState, setCharSuggestState] = useState(null); // { blockId, blockEl, charName }
  const [suggestEnabled, setSuggestEnabled] = useState(() => localStorage.getItem(CHAR_SUGGEST_KEY) !== 'off');
  const [pasteToast, setPasteToast] = useState(null);
  const [sceneRefPicker, setSceneRefPicker] = useState(null); // { top, left, insertAfterId, mobile }
  const [pendingBlockType, setPendingBlockType] = useState(null); // for mobile / no-focus toolbar clicks
  const [activeBlockType, setActiveBlockType] = useState(null);  // 현재 커서의 블록 타입 (툴바 하이라이트)
  const [charCheckPicker, setCharCheckPicker] = useState(null); // { sceneId, top, left, mobile }
  const [symbolPickerCloseToken, setSymbolPickerCloseToken] = useState(0);
  const hasKeyboard = !!keyboardUp; // App.jsx에서 내려온 키보드 감지값 사용
  const charCheckBtnRef = useRef(null);
  const editorScrollRef = useRef(null);
  useEffect(() => { if (onScrollRefReady) onScrollRefReady(editorScrollRef); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Undo 스택 (1초 디바운스로 스냅샷 저장, 최대 50개) ─────────────────────
  const undoStack = useRef([]);
  const undoActive = useRef(false);
  const undoPushTimer = useRef(null);
  useEffect(() => {
    if (undoActive.current) return;
    clearTimeout(undoPushTimer.current);
    undoPushTimer.current = setTimeout(() => {
      const serialized = JSON.stringify(blocks);
      const last = undoStack.current[undoStack.current.length - 1];
      if (last !== serialized) {
        undoStack.current.push(serialized);
        if (undoStack.current.length > 50) undoStack.current.shift();
      }
    }, 1000);
    return () => clearTimeout(undoPushTimer.current);
  }, [blocks]);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length <= 1) return;
    undoStack.current.pop(); // 현재 상태 제거
    const prev = undoStack.current[undoStack.current.length - 1];
    if (!prev) return;
    undoActive.current = true;
    const restored = JSON.parse(prev);
    setBlocks(restored);
    requestAnimationFrame(() => {
      surfaceApiRef.current?.loadBlocks(restored);
      undoActive.current = false;
    });
  }, []);

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

    // 자동저장 타이머 무조건 취소 (새 화 ID로 이전 화 내용이 저장되는 버그 방지)
    clearTimeout(saveTimer.current);

    // Flush unsaved data for the PREVIOUS episode before switching
    const prevEpId = prevEpisodeIdRef.current;
    if (prevEpId && prevEpId !== activeEpisodeId) {
      const prevBlocks = blocksRef.current;
      const prevSerialized = JSON.stringify(prevBlocks);
      if (prevBlocks.length > 0 && prevSerialized !== lastSavedBlocks.current) {
        dispatch({ type: 'SET_BLOCKS', episodeId: prevEpId, payload: prevBlocks });
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
      }
    }
    prevEpisodeIdRef.current = activeEpisodeId;

    const epBlocks = scriptBlocks.filter(b => b.episodeId === activeEpisodeId);
    const raw = epBlocks.length > 0
      ? epBlocks
      : [{ id: genId(), episodeId: activeEpisodeId, projectId: activeProjectId,
           type: 'action', content: '', label: '', createdAt: now(), updatedAt: now() }];
    // scene_number 블록 content가 비어있으면 씬 structured 필드에서 재파생
    const loaded = raw.map(b => {
      if (b.type === 'scene_number' && b.sceneId && !b.content) {
        const scene = scenes.find(s => s.id === b.sceneId);
        if (scene) {
          const derived = resolveSceneLabel({ ...scene, label: '' });
          if (derived) return { ...b, content: derived };
        }
      }
      return b;
    });
    setBlocks(loaded);
    lastSavedBlocks.current = JSON.stringify(loaded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEpisodeId, initialized]);

  // ── External block injection (e.g. IMPORT_TREATMENT_TO_SCRIPT)
  useEffect(() => {
    if (!pendingScriptReload || pendingScriptReload !== activeEpisodeId) return;
    const epBlocksRaw = scriptBlocks.filter(b => b.episodeId === activeEpisodeId);
    if (!epBlocksRaw.length) return;
    const epBlocks = epBlocksRaw.map(b => {
      if (b.type === 'scene_number' && b.sceneId && !b.content) {
        const scene = scenes.find(s => s.id === b.sceneId);
        if (scene) {
          const derived = resolveSceneLabel({ ...scene, label: '' });
          if (derived) return { ...b, content: derived };
        }
      }
      return b;
    });
    lastSavedBlocks.current = JSON.stringify(epBlocks);
    setBlocks(epBlocks);
    requestAnimationFrame(() => surfaceApiRef.current?.loadBlocks(epBlocks));
    dispatch({ type: 'CLEAR_PENDING_RELOAD' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingScriptReload]);

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
      // scene_number 블록이 없으면 SYNC_SCENES 하지 않음 — 씬리스트에서 추가한 orphan 씬들이 사라지는 버그 방지
      if (updatedScenes.length > 0) {
        dispatch({ type: 'SYNC_SCENES', episodeId: activeEpisodeId, payload: updatedScenes });
      }
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
      // 변경사항 있든 없든 항상 flush (navigate away 시 데이터 유실 방지)
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
      if (updatedScenes.length > 0) {
        dispatch({ type: 'SYNC_SCENES', episodeId: epId, payload: updatedScenes });
      }
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

  // ── Typewriter mode — keep cursor line centered in scroll container
  // 타이핑 시에만 자동스크롤 — 클릭/탭으로 커서 이동할 때는 스크롤 안 함
  useEffect(() => {
    let rafId = null;
    let lastEventWasKey = false;

    const onKeyDown = () => { lastEventWasKey = true; };
    const onPointerDown = () => { lastEventWasKey = false; };

    const onSelectionChange = () => {
      if (!lastEventWasKey) return; // 클릭/탭 → 스크롤 건너뜀
      if (rafId) return; // throttle to one frame
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const container = editorScrollRef.current;
        if (!container) return;
        const sel = window.getSelection();
        if (!sel?.rangeCount) return;
        const range = sel.getRangeAt(0);
        // Only act when cursor is inside this editor
        if (!container.contains(range.startContainer)) return;
        // Find the block-level div containing the cursor
        let node = range.startContainer;
        while (node && node !== container) {
          if (node.nodeType === 1 && node.dataset?.blockId) break;
          node = node.parentElement;
        }
        const blockEl = (node && node !== container) ? node : null;
        if (!blockEl) return;
        const blockRect    = blockEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const blockCenter   = blockRect.top + blockRect.height / 2 - containerRect.top;
        const targetCenter  = containerRect.height / 2;
        container.scrollTop += blockCenter - targetCenter;
      });
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('selectionchange', onSelectionChange);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

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
        const rawText = scene.content || resolveSceneLabel({ ...scene, label: '' }) || scene.label;
        // displayText includes parentheses e.g. "(S#3 거실)"
        const newText = rawText ? `(${rawText})` : ref.displayText;
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
    if (anyChanged) {
      setBlocks(updated);
      // Also update inline spans directly in the DOM
      requestAnimationFrame(() => {
        const surface = document.querySelector('[data-editor-surface]');
        if (!surface) return;
        updated.forEach(b => {
          (b.sceneRefs || []).forEach(ref => {
            surface.querySelectorAll(`span[data-ref-scene-id="${ref.sceneId}"]`).forEach(span => {
              if (span.textContent !== ref.displayText) span.textContent = ref.displayText;
            });
          });
        });
      });
    }
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

  // ── applyFormat (B/I/U 툴바)
  const applyFormat = useCallback((format) => {
    surfaceApiRef.current?.applyFormat(format);
  }, []);

  // ── applyBlockType (toolbar)
  const applyBlockType = useCallback((type) => {
    surfaceApiRef.current?.applyBlockType(type);
    setPendingBlockType(null);
    setCharCheckPicker(null);
    setSceneRefPicker(null);
    setSymbolPickerCloseToken(t => t + 1);
    setCharPickerState(null);
    if (type === 'dialogue') {
      requestAnimationFrame(() => {
        const surface = document.querySelector('[data-editor-surface]');
        const sel = window.getSelection();
        if (!surface) return;
        let node = sel?.rangeCount ? sel.getRangeAt(0).startContainer : null;
        if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
        while (node && node !== surface) {
          if (node.dataset?.blockId) {
            const rect = node.getBoundingClientRect();
            // rect.bottom <= 60이면 아직 렌더 안 됐거나 툴바 위 → 열지 않음
            if (rect.bottom > 60) {
              setCharPickerState({ blockId: node.dataset.blockId, top: rect.bottom + 4, left: rect.left, fromDialogue: true });
            }
            return;
          }
          node = node.parentElement;
        }
      });
    }
  }, []);

  // ── flushSave: 즉시 저장 (자동저장 타이머 무시)
  const flushSave = useCallback(() => {
    if (!activeEpisodeId || !blocks.length) return;
    clearTimeout(saveTimer.current);
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
        location: existing?.location ?? '', subLocation: existing?.subLocation ?? '',
        timeOfDay: existing?.timeOfDay ?? '', specialSituation: existing?.specialSituation ?? '',
        sourceTreatmentItemId: existing?.sourceTreatmentItemId ?? null,
        sceneListContent: existing?.sceneListContent ?? '',
        createdAt: existing?.createdAt || now(), updatedAt: now(),
      };
    });
    dispatch({ type: 'SET_BLOCKS', episodeId: activeEpisodeId, payload: blocks });
    dispatch({ type: 'SYNC_SCENES', episodeId: activeEpisodeId, payload: updatedScenes });
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
    lastSavedBlocks.current = JSON.stringify(blocks);
  }, [activeEpisodeId, activeProjectId, blocks, scenes, dispatch]);

  // ── 씬번호 블록에 인물 태그 표시 (등장체크 + 대사에서 감지된 인물)
  useEffect(() => {
    const surface = document.querySelector('[data-editor-surface]');
    if (!surface || !blocks.length) return;

    // 씬별로 대사 인물 수집
    const dialogueCharsByScene = {};
    let currentSceneId = null;
    for (const b of blocks) {
      if (b.type === 'scene_number') {
        currentSceneId = b.sceneId;
        if (!dialogueCharsByScene[currentSceneId]) dialogueCharsByScene[currentSceneId] = new Set();
      } else if (b.type === 'dialogue' && currentSceneId) {
        const name = b.characterName || b.charName || '';
        if (name) dialogueCharsByScene[currentSceneId].add(name);
      }
    }

    // 씬번호 DOM 업데이트
    surface.querySelectorAll('[data-block-type="scene_number"]').forEach(div => {
      const sceneId = div.dataset.sceneId;
      if (!sceneId) return;

      const detected = dialogueCharsByScene[sceneId] || new Set();

      // 등장체크로 등록된 인물 (characterIds → 이름 resolve)
      const scene = episodeScenes.find(s => s.id === sceneId);
      const checkedNames = (scene?.characterIds || [])
        .map(id => {
          const c = projectChars.find(ch => ch.id === id);
          return c ? (c.givenName || c.name || '') : '';
        })
        .filter(Boolean);

      // 합치기 (등장체크 우선, 중복 제거)
      const all = [...new Set([...checkedNames, ...detected])];

      if (all.length) {
        div.dataset.charTags = all.join(' · ');
      } else {
        delete div.dataset.charTags;
      }
    });
  }, [blocks, episodeScenes, projectChars]);

  const handleCharCheckRef = useRef(null);

  const sceneRefPickerRef = useRef(null);

  // ── 씬연결 피커: Esc/외부클릭으로 닫기
  useEffect(() => {
    if (!sceneRefPicker) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setSceneRefPicker(null); }
    };
    const onMouseDown = (e) => {
      if (sceneRefPickerRef.current && !sceneRefPickerRef.current.contains(e.target)) {
        setSceneRefPicker(null);
      }
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => document.addEventListener('mousedown', onMouseDown), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [sceneRefPicker]);

  // ── Ctrl+Shift+1/2/3/4 단축키 + 상단바 저장 버튼 이벤트
  useEffect(() => {
    const blockTypeMap = { 'Digit1': 'scene_number', 'Digit2': 'action', 'Digit3': 'dialogue' };
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      const type = blockTypeMap[e.code];
      if (type) {
        e.preventDefault();
        applyBlockType(type);
      } else if (e.code === 'Digit4') {
        e.preventDefault();
        handleCharCheckRef.current?.();
      } else if (e.code === 'Digit5') {
        e.preventDefault();
        // 커서 위치 기준 씬연결 피커 열기
        const surface = document.querySelector('[data-editor-surface]');
        const sel = window.getSelection();
        let insertAfterId = null;
        let anchorEl = null;
        if (sel?.rangeCount && surface) {
          let node = sel.getRangeAt(0).startContainer;
          node = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
          while (node && node !== surface) {
            if (node.dataset?.blockId) { anchorEl = node; insertAfterId = node.dataset.blockId; break; }
            node = node.parentElement;
          }
        }
        const rect = anchorEl?.getBoundingClientRect() || { bottom: 120, left: 200 };
        const savedRange = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
        setSceneRefPicker({ top: rect.bottom + 4, left: rect.left, insertAfterId, savedRange });
      }
    };
    const onSave = () => flushSave();
    window.addEventListener('keydown', onKey);
    window.addEventListener('script:requestSave', onSave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('script:requestSave', onSave);
    };
  }, [flushSave, applyBlockType]);

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
    setSceneRefPicker(null);
    setCharPickerState(null);
    setSymbolPickerCloseToken(t => t + 1);
    if (hasKeyboard) {
      setCharCheckPicker({ sceneId, mobile: true });
    } else {
      const rect = charCheckBtnRef.current?.getBoundingClientRect();
      setCharCheckPicker({ sceneId, top: rect ? rect.bottom + 4 : 60, left: rect ? rect.left : 0, mobile: false });
    }
  }, [getCurrentSceneId, hasKeyboard]);
  handleCharCheckRef.current = handleCharCheck;

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

  // ── Paste: 시나리오 자동 파싱
  const handleEditorPaste = useCallback((e) => {
    const text = e.clipboardData?.getData('text/plain') || '';
    const lines = text.split('\n');
    const nonEmpty = lines.filter(l => l.trim());
    if (nonEmpty.length <= 1) return; // 단일 행은 기본 동작

    e.preventDefault();

    // ── 패턴 정의
    const SCENE_RE = /^(S#\d+\.?|s#\d+\.?|씬\s*\d+\.?|\d+씬\.?|#\d+\.?|\d+\.\s)/i;
    const PAREN_RE = /^\s*\(.*\)\s*$/;

    const charNameSet = new Set(projectChars.flatMap(c =>
      [c.name, c.givenName, c.surname ? (c.surname + c.givenName) : null].filter(Boolean)
    ));

    // 대사 감지: 탭/콜론/"이름  대사" 형식
    const detectDialogue = (line) => {
      const s = line.trim();
      // 탭 구분: "이름\t대사"
      const tabM = s.match(/^([^\t]+)\t(.+)$/);
      if (tabM) return { name: tabM[1].trim(), text: tabM[2].trim() };
      // 콜론 구분: "이름: 대사" (이름 6자 이하)
      const colonM = s.match(/^([가-힣A-Za-z·\s]{1,8})\s*[：:]\s*(.+)$/);
      if (colonM) return { name: colonM[1].trim(), text: colonM[2].trim() };
      // 등록된 인물명 + 2칸 이상 공백: "이름  대사"
      for (const name of charNameSet) {
        if (s.startsWith(name) && s.length > name.length) {
          const after = s.slice(name.length);
          if (/^\s{2,}/.test(after)) return { name, text: after.trim() };
        }
      }
      return null;
    };

    const makeBase = (sceneId) => ({
      id: genId(), episodeId: activeEpisodeId, projectId: activeProjectId,
      label: '', sceneId: sceneId || genId(), createdAt: now(), updatedAt: now(),
    });

    // ── 씬 안에서 공유할 sceneId (씬번호 블록 생성 시 갱신)
    let currentSceneId = genId();
    const newBlocks = nonEmpty.map(line => {
      const s = line.trim();
      if (!s) return null;

      if (SCENE_RE.test(s)) {
        currentSceneId = genId();
        const content = s.replace(SCENE_RE, '').trim();
        return { ...makeBase(currentSceneId), type: 'scene_number', content };
      }

      if (PAREN_RE.test(s)) {
        return { ...makeBase(currentSceneId), type: 'parenthetical',
          content: s.replace(/^\s*\(|\)\s*$/g, '').trim() };
      }

      const diag = detectDialogue(line);
      if (diag) {
        const char = projectChars.find(c =>
          [c.name, c.givenName, c.surname ? c.surname + c.givenName : null]
            .filter(Boolean).includes(diag.name)
        );
        return { ...makeBase(currentSceneId), type: 'dialogue',
          content: diag.text,
          characterId: char?.id || '',
          characterName: char?.givenName || char?.name || diag.name,
          charName:      char?.givenName || char?.name || diag.name,
        };
      }

      // 인식 안된 부분 → 지문으로 보존 (Ctrl+Shift+1/2/3으로 수동 변경 가능)
      return { ...makeBase(currentSceneId), type: 'action', content: s };
    }).filter(Boolean);

    if (!newBlocks.length) return;

    // ── 커서 위치 이후에 삽입
    const surface = document.querySelector('[data-editor-surface]');
    const sel = window.getSelection();
    let insertAfterId = null;
    if (sel?.rangeCount && surface) {
      const blockEl = surface.querySelector('[data-block-id]') &&
        (() => {
          let el = sel.getRangeAt(0).startContainer;
          el = el.nodeType === Node.TEXT_NODE ? el.parentElement : el;
          while (el && el !== surface) {
            if (el.dataset?.blockId) return el;
            el = el.parentElement;
          }
          return null;
        })();
      if (blockEl) insertAfterId = blockEl.dataset.blockId;
    }

    setBlocks(prev => {
      const merged = (() => {
        const labelled = newBlocks;
        if (!insertAfterId) return syncLabels([...prev, ...labelled]);
        const idx = prev.findIndex(b => b.id === insertAfterId);
        if (idx < 0) return syncLabels([...prev, ...labelled]);
        return syncLabels([...prev.slice(0, idx + 1), ...labelled, ...prev.slice(idx + 1)]);
      })();
      // DOM도 즉시 갱신
      requestAnimationFrame(() => surfaceApiRef.current?.loadBlocks(merged));
      return merged;
    });

    // 붙여넣기 결과 피드백
    const nScenes    = newBlocks.filter(b => b.type === 'scene_number').length;
    const nDialogue  = newBlocks.filter(b => b.type === 'dialogue').length;
    const nAction    = newBlocks.filter(b => b.type === 'action').length;
    const nUnknown   = nAction; // 지문으로 분류된 것 중 인식 불확실
    setPasteToast(`붙여넣기 완료 — 씬 ${nScenes}, 대사 ${nDialogue}, 지문 ${nAction}${nUnknown ? ' (지문은 Ctrl+Shift+1/2/3으로 형식 변경)' : ''}`);
    setTimeout(() => setPasteToast(null), 4000);
  }, [activeEpisodeId, activeProjectId, projectChars, setBlocks]);

  const editorFontSize = stylePreset?.fontSize ? `${stylePreset.fontSize}pt` : '11pt';
  const editorLineHeight = stylePreset?.lineHeight ?? 1.6;
  const { cssStack: editorFontFamily } = resolveFont(stylePreset, 'editor');

  // 키보드 감지: App.jsx의 keyboardUp prop 사용 (제거됨)

  // 커서 자동스크롤 — 커서가 뷰 밖으로 나갈 때만 스크롤 (smooth 제거로 흔들림 방지)
  useEffect(() => {
    let raf = null;
    const handleSelectionChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel?.rangeCount) return;
        const range = sel.getRangeAt(0).cloneRange();
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        const scrollEl = editorScrollRef.current;
        if (!scrollEl || rect.height === 0) return;
        const elRect = scrollEl.getBoundingClientRect();
        const MARGIN = 80; // 상하 여백 — 커서가 이 범위 안에 있으면 스크롤 안 함
        const tooHigh = rect.top < elRect.top + MARGIN;
        const tooLow  = rect.bottom > elRect.bottom - MARGIN;
        if (!tooHigh && !tooLow) return; // 커서가 뷰 안에 있으면 무시
        const cursorY  = rect.top - elRect.top + scrollEl.scrollTop;
        const targetTop = cursorY - scrollEl.clientHeight / 2;
        scrollEl.scrollTo({ top: targetTop, behavior: 'instant' });
      });
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      cancelAnimationFrame(raf);
    };
  }, []);

  const BLOCK_TYPE_BTNS = [
    { type: 'scene_number', label: 'S#',  title: '씬번호 (Ctrl+Shift+1)' },
    { type: 'action',       label: '지문', title: '지문 (Ctrl+Shift+2)' },
    { type: 'dialogue',     label: '대사', title: '대사 (Ctrl+Shift+3)' },
  ];
  const BTN_W = 40; // px — 상단 툴바 버튼 통일 너비

  if (!activeEpisodeId) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--c-text5)', background: 'var(--c-bg)' }}>
        좌측에서 회차를 선택하세요
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, display: 'flex', flexDirection: 'column', background: 'var(--c-bg)' }}>
      {/* Toolbar */}
      <div className="px-6 py-2 flex items-center gap-2 text-xs shrink-0" style={{ borderBottom: '1px solid var(--c-border2)' }}>
        <span style={{ color: 'var(--c-text3)' }}>{episode?.number}회 {episode?.title || ''}</span>
        <div data-tour-id="scene-block-btns" className="flex gap-1 ml-2">
          {!hasKeyboard && (<>
          {BLOCK_TYPE_BTNS.map(({ type, label, title }) => {
            const isPending = pendingBlockType === type;
            const isActive  = !isPending && activeBlockType === type;
            return (
              <button
                key={type}
                title={isPending ? `${title} — 본문을 클릭하면 적용됩니다` : title}
                onMouseDown={e => { e.preventDefault(); applyBlockType(type); }}
                style={{
                  flexShrink: 0, width: BTN_W, textAlign: 'center',
                  fontSize: 'clamp(10px, 2.8vw, 13px)',
                  padding: '4px 0', borderRadius: 6,
                  border: `1px solid ${isPending || isActive ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                  background: isPending ? 'var(--c-accent)' : 'transparent',
                  color: isPending ? '#fff' : isActive ? 'var(--c-accent)' : 'var(--c-text4)',
                  fontWeight: isActive ? '600' : 'normal',
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  transition: 'background 0.1s, color 0.1s, border-color 0.1s',
                }}
              >{label}</button>
            );
          })}
          <button
            ref={charCheckBtnRef}
            title="등장 — 현재 씬 등장인물 추가 (Ctrl+Shift+4)"
            onMouseDown={e => { e.preventDefault(); handleCharCheck(); }}
            style={{
              flexShrink: 0, width: BTN_W, textAlign: 'center',
              fontSize: 'clamp(10px, 2.8vw, 13px)', color: 'var(--c-text4)',
              padding: '4px 0', border: '1px solid var(--c-border3)',
              borderRadius: 6, background: 'transparent', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent', marginLeft: 4,
            }}
          >등장</button>
          <button
            title="연결 — 현재 위치에 다른 씬 참조 삽입 (Ctrl+Shift+5)"
            onMouseDown={e => {
              e.preventDefault();
              setCharCheckPicker(null);
              setCharPickerState(null);
              setSymbolPickerCloseToken(t => t + 1);
              const surface = document.querySelector('[data-editor-surface]');
              const sel = window.getSelection();
              let insertAfterId = null;
              let anchorEl = null;
              if (sel?.rangeCount && surface) {
                let node = sel.getRangeAt(0).startContainer;
                node = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
                while (node && node !== surface) {
                  if (node.dataset?.blockId) { anchorEl = node; insertAfterId = node.dataset.blockId; break; }
                  node = node.parentElement;
                }
              }
              const btn = e.currentTarget;
              const rect = anchorEl?.getBoundingClientRect() || btn.getBoundingClientRect();
              const savedRange = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
              setSceneRefPicker({ top: rect.bottom + 4, left: rect.left, insertAfterId, savedRange, mobile: false });
            }}
            style={{
              flexShrink: 0, width: BTN_W, textAlign: 'center',
              fontSize: 'clamp(10px, 2.8vw, 13px)', color: 'var(--c-text4)',
              padding: '4px 0', border: '1px solid var(--c-border3)',
              borderRadius: 6, background: 'transparent', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent', marginLeft: 4,
            }}
          >연결</button>
          <SymbolPicker
            closeToken={symbolPickerCloseToken}
            onOpen={() => { setCharCheckPicker(null); setSceneRefPicker(null); setCharPickerState(null); }}
          />
          {/* B/I/U 서식 버튼 — action/dialogue 블록에서 동작, 모바일에서는 MobileMenuBar에 있으므로 숨김 */}
          {!isMobile && <div style={{ borderLeft: '1px solid var(--c-border3)', paddingLeft: 6, marginLeft: 2, display: 'flex', gap: 2 }}>
            {[
              { format: 'bold',      label: 'B', style: { fontWeight: 700 },                title: '굵게 (Ctrl+B)' },
              { format: 'italic',    label: 'I', style: { fontStyle: 'italic' },             title: '기울임 (Ctrl+I)' },
              { format: 'underline', label: 'U', style: { textDecoration: 'underline' },     title: '밑줄 (Ctrl+U)' },
            ].map(({ format, label, style, title }) => (
              <button
                key={format}
                title={title}
                onMouseDown={e => { e.preventDefault(); applyFormat(format); }}
                style={{
                  flexShrink: 0, width: BTN_W, textAlign: 'center',
                  fontSize: 'clamp(10px, 2.8vw, 13px)',
                  padding: '4px 0', borderRadius: 6,
                  border: '1px solid var(--c-border3)',
                  background: 'transparent',
                  color: 'var(--c-text4)',
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  ...style,
                }}
              >{label}</button>
            ))}
          </div>}
          </>)}
        </div>
        <span className="ml-auto flex items-center gap-3">
          {brokenSceneRefs.length > 0 && (
            <button
              onClick={() => { setReconnectIdx(0); setReconnectTarget(brokenSceneRefs[0]); }}
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', cursor: 'pointer' }}
            >⚠ S# 참조 {brokenSceneRefs.length}개 끊김</button>
          )}
          <PageCounter blocks={blocks} stylePreset={stylePreset} scrollRef={editorScrollRef} />
          <span style={{ color: 'var(--c-border3)' }}>● 저장됨</span>
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
        ref={editorScrollRef}
        className="flex-1 min-h-0 overflow-y-auto relative"
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
          className="max-w-2xl mx-auto py-8 px-6 md:px-16"
          style={{ fontFamily: editorFontFamily, fontSize: editorFontSize, lineHeight: editorLineHeight }}
        >
          <EditorSurface
            ref={surfaceApiRef}
            episodeId={activeEpisodeId}
            initialBlocks={blocks}
            onBlocksChange={setBlocks}
            onBadgeClick={handleBadgeClick}
            onCharSuggest={handleCharSuggest}
            onSelectionChange={setActiveBlockType}
            dialogueGap={dialogueGap}
            fontFamily={editorFontFamily}
            fontSize={editorFontSize}
            lineHeight={editorLineHeight}
            activeEpisodeId={activeEpisodeId}
            activeProjectId={activeProjectId}
            onPaste={handleEditorPaste}
            onUndo={handleUndo}
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
          onAddNew={(name) => {
            const newChar = { id: genId(), projectId: activeProjectId, name, givenName: name, role: 'extra', createdAt: now() };
            dispatch({ type: 'ADD_CHARACTER', payload: newChar });
            surfaceApiRef.current?.updateBlockChar(charPickerState.blockId, newChar.id, name);
            setCharPickerState(null);
          }}
          onClose={() => {
            if (charPickerState.fromDialogue) {
              const { top, left } = charPickerState;
              setCharPickerNoSel({ top, left });
              setTimeout(() => setCharPickerNoSel(null), 1800);
            }
            setCharPickerState(null);
          }}
        />
      )}

      {/* 선택안함 레이블 */}
      {charPickerNoSel && createPortal(
        <div style={{
          position: 'fixed', top: charPickerNoSel.top, left: charPickerNoSel.left,
          zIndex: 9999, padding: '4px 10px', borderRadius: 6,
          background: 'var(--c-tag)', border: '1px solid #f87171',
          color: '#ef4444', fontSize: 12, fontWeight: 600,
          pointerEvents: 'none',
        }}>선택안함</div>,
        document.body
      )}

      {/* 등장체크 Char Picker */}
      {charCheckPicker && (
        <CharPickerOverlay
          anchor={{ top: charCheckPicker.top, left: charCheckPicker.left }}
          projectChars={projectChars}
          onSelect={handleCharCheckSelect}
          onClose={() => setCharCheckPicker(null)}
          mobile={charCheckPicker.mobile}
        />
      )}

      {/* 씬연결 피커 */}
      {sceneRefPicker && (() => {
        const getDisplay = (s) => s.content || resolveSceneLabel({ ...s, label: '' }) || s.label;
        // 커서 이전에 등장한 씬만 포함
        const cursorIdx = sceneRefPicker.insertAfterId
          ? blocks.findIndex(b => b.id === sceneRefPicker.insertAfterId)
          : blocks.length - 1;
        const seenSceneIds = new Set(
          blocks.slice(0, cursorIdx + 1)
            .filter(b => b.type === 'scene_number' && b.sceneId)
            .map(b => b.sceneId)
        );
        const sceneItems = episodeScenes.filter(s => seenSceneIds.has(s.id)).slice(0, 8);
        const handleSceneSelect = (scene) => {
          const label = scene.label || '';
          const sceneText = getDisplay(scene);
          const rawText = label ? `${label} ${sceneText}` : sceneText;
          const displayText = `(${rawText})`;
          const { savedRange } = sceneRefPicker;
          setSceneRefPicker(null);
          requestAnimationFrame(() => {
            const sel = window.getSelection();
            if (savedRange && sel) {
              sel.removeAllRanges();
              sel.addRange(savedRange.cloneRange());
            }
            const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
            if (!range) return;
            const span = document.createElement('span');
            span.contentEditable = 'false';
            span.dataset.refSceneId = scene.id;
            span.className = 'scene-ref-chip';
            span.textContent = displayText;
            range.insertNode(span);
            range.setStartAfter(span);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          });
        };
        return createPortal(
          <div
            ref={sceneRefPickerRef}
            style={{
              position: 'fixed', zIndex: 9999, borderRadius: '0.5rem',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              ...(sceneRefPicker.mobile ? (() => {
                // visual viewport 기준으로 floating toolbar 바로 위에 위치
                // bottom: X (fixed) 는 layout viewport 기준 → 키보드에 가려질 수 있어 top 기준 사용
                const vvTop = window.visualViewport?.offsetTop ?? 0;
                const vvH   = window.visualViewport?.height ?? window.innerHeight;
                const toolbarH = 50; // 플로팅 툴바 높이 근사값
                const pickerH  = 240;
                const top = Math.max(vvTop + 8, vvTop + vvH - toolbarH - pickerH - 8);
                return { top, left: 8, right: 8, background: 'var(--c-tag)', border: '1px solid var(--c-border4)' };
              })() : {
                top: sceneRefPicker.top, left: sceneRefPicker.left,
                background: 'var(--c-tag)', border: '1px solid var(--c-border4)',
                minWidth: '220px',
              }),
            }}
          >
            <div className="px-3 py-1.5 text-[10px] font-semibold" style={{ color: 'var(--c-text5)', borderBottom: '1px solid var(--c-border)' }}>
              씬연결 — 씬 선택
            </div>
            <div style={{ maxHeight: '192px', overflowY: 'auto' }}>
              {sceneItems.length === 0 ? (
                <div className="px-3 py-2 text-xs" style={{ color: 'var(--c-text6)' }}>씬 없음</div>
              ) : sceneItems.map(s => {
                const display = getDisplay(s);
                return (
                  <div
                    key={s.id}
                    onMouseDown={e => { e.preventDefault(); handleSceneSelect(s); }}
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
          </div>,
          document.body
        );
      })()}

      {/* 붙여넣기 결과 토스트 */}
      {pasteToast && (
        <div style={{
          position: 'fixed', bottom: '72px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--c-tag)', border: '1px solid var(--c-border3)',
          color: 'var(--c-text2)', fontSize: '11px', padding: '8px 16px',
          borderRadius: '8px', zIndex: 200, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          {pasteToast}
        </div>
      )}

      {/* Shortcuts hint — 터치 기기(소프트 키보드)에서는 숨김 */}
      {!hasKeyboard && !('ontouchstart' in window) && (
        <div className="px-6 py-2 flex gap-4 text-[11px] shrink-0 flex-wrap" style={{ borderTop: '1px solid var(--c-border)', color: 'var(--c-dim)' }}>
          <span>Ctrl+Shift+1 씬번호</span>
          <span>Ctrl+Shift+2 지문</span>
          <span>Ctrl+Shift+3 대사</span>
          <span>Ctrl+Shift+5 씬연결</span>
          <span>Ctrl+B/I/U 굵게/기울임/밑줄</span>
          <span>Ctrl+Z Undo</span>
          <span>Enter 다음 블록</span>
          <span>Shift+Enter 줄바꿈</span>
          <span>Backspace (빈 블록) 삭제</span>
        </div>
      )}

      {/* 저장 상태 — 우하단 fixed 토스트 */}
      {(saveStatus === 'saving' || saveStatus === 'error') && (
        <div style={{
          position: 'fixed', bottom: 12, right: 12, zIndex: 500,
          fontSize: 11, padding: '4px 10px', borderRadius: 6,
          background: saveStatus === 'error' ? '#fee2e2' : 'var(--c-card)',
          border: `1px solid ${saveStatus === 'error' ? '#fca5a5' : 'var(--c-border3)'}`,
          color: saveStatus === 'error' ? '#b91c1c' : 'var(--c-text5)',
          pointerEvents: saveStatus === 'error' ? 'auto' : 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}
          onClick={saveStatus === 'error' ? () => dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' }) : undefined}
        >
          {saveStatus === 'saving' ? '저장 중…' : `⚠ 저장 실패${saveErrorMsg ? ' (탭해서 닫기)' : ''}`}
        </div>
      )}

      {/* 모바일 플로팅 툴바 — 소프트 키보드가 올라와 있을 때 (flex 항목으로 배치 — position:fixed 대신) */}
      {hasKeyboard && (
        <div style={{
          flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px',
          background: 'var(--c-header)',
          borderTop: '1px solid var(--c-border)',
          overflowX: 'auto', scrollbarWidth: 'none',
        }}>
          {[
            { type: 'scene_number', label: 'S#' },
            { type: 'action',       label: '지문' },
            { type: 'dialogue',     label: '대사' },
          ].map(({ type, label }) => {
            const isPending = pendingBlockType === type;
            const isActive  = !isPending && activeBlockType === type;
            return (
              <button
                key={type}
                onMouseDown={e => { e.preventDefault(); applyBlockType(type); }}
                style={{
                  flex: '0 0 auto', width: 44, fontSize: 12, padding: '5px 0',
                  borderRadius: 6, textAlign: 'center',
                  border: `1px solid ${isPending || isActive ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                  background: isPending ? 'var(--c-accent)' : 'transparent',
                  color: isPending ? '#fff' : isActive ? 'var(--c-accent)' : 'var(--c-text4)',
                  fontWeight: isActive ? 600 : 'normal',
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >{label}</button>
            );
          })}
          <div style={{ width: 1, height: 16, background: 'var(--c-border3)', flexShrink: 0 }} />
          <button
            ref={charCheckBtnRef}
            onMouseDown={e => { e.preventDefault(); handleCharCheck(); }}
            style={{
              flex: '0 0 auto', width: 44, fontSize: 12, padding: '5px 0',
              borderRadius: 6, textAlign: 'center',
              border: '1px solid var(--c-border3)', background: 'transparent',
              color: 'var(--c-text4)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >등장</button>
          <button
            onPointerDown={e => {
              e.preventDefault();
              setCharCheckPicker(null);
              setCharPickerState(null);
              setSymbolPickerCloseToken(t => t + 1);
              const surface = document.querySelector('[data-editor-surface]');
              const sel = window.getSelection();
              let insertAfterId = null;
              if (sel?.rangeCount && surface) {
                let node = sel.getRangeAt(0).startContainer;
                node = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
                while (node && node !== surface) {
                  if (node.dataset?.blockId) { insertAfterId = node.dataset.blockId; break; }
                  node = node.parentElement;
                }
              }
              const savedRange = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
              setSceneRefPicker({ mobile: true, insertAfterId, savedRange });
            }}
            style={{
              flex: '0 0 auto', width: 44, fontSize: 12, padding: '5px 0',
              borderRadius: 6, textAlign: 'center',
              border: '1px solid var(--c-border3)', background: 'transparent',
              color: 'var(--c-text4)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >연결</button>
          <SymbolPicker
            mobile
            closeToken={symbolPickerCloseToken}
            onOpen={() => { setCharCheckPicker(null); setSceneRefPicker(null); setCharPickerState(null); }}
          />
        </div>
      )}
    </div>
  );
}
