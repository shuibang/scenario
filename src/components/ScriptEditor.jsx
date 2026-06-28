import React, {
  useState, useEffect, useRef, useCallback, useMemo,
  forwardRef, useImperativeHandle, useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { useApp } from '../store/AppContext';
import { genId, now, getAll, setAll } from '../store/db';
import { resolveSceneLabel, SCENE_PREFIX_STRIP_RE } from '../utils/sceneResolver';
import { buildSceneNumberBlock } from '../utils/sceneBlockBuilder';
import { buildSceneLabel, getScenePrefix } from '../utils/scenePrefix';
import { parseScriptText } from '../utils/parseScriptText';
import { getSceneFormat, formatSceneHeader } from '../utils/sceneFormat';
import { resolveFont } from '../print/FontRegistry';
import { getLayoutMetrics } from '../print/LineTokenizer';
import EmotionTagPicker from './EmotionTagPicker';
import UnifiedTagPicker from './UnifiedTagPicker';
import AnnotationPopover from './annotations/AnnotationPopover';
import BlockAnnotations from './annotations/BlockAnnotations';
import { createAnnotation } from '../utils/annotationUtils';
import { BUILTIN_GUIDES } from '../data/structureTags';
import { resolveAnchorRect } from '../utils/pickerPosition';

let suppressSceneNormalize = false;

// ─── Constants ────────────────────────────────────────────────────────────────
const CHAR_SUGGEST_KEY = 'drama_charSuggestInAction';

const DEFAULT_SYMBOLS = ['(E)', '(F)', 'Flashback', 'Insert', 'Ins.', 'Subtitle)', 'S.T.', '(N)', 'N.A.'];

// Slash command palette items (간소화 — 자주 쓰는 것만)
const INSERT_SHORTCUT_HINTS = {
  scene_number: '1.',
  action: '/ + 1',
  dialogue: '/ + 2',
  charcheck: '/ + 3',
  sceneref: '/ + 4',
  symbol: '/ + 5',
  tag: '/ + 6',
  scene_separator: 'Space x2',
  parenthetical: 'Space x2',
};

const SLASH_COMMANDS = [
  { type: 'action',        action: 'block',      icon: '지', label: '지문',     desc: '행동과 상황 묘사' },
  { type: 'dialogue',      action: 'block',      icon: '대', label: '대사',     desc: '인물 대사' },
  { type: 'charcheck',     action: 'charcheck',  icon: '등', label: '등장체크', desc: '현재 씬 등장인물 추가' },
  { type: 'sceneref',      action: 'sceneref',   icon: '연', label: '씬연결',   desc: '다른 씬 참조 삽입' },
  { type: 'symbol',        action: 'symbol',     icon: '기', label: '기타',     desc: '특수 기호 삽입' },
  { type: 'tag',           action: 'unifiedtag', icon: '태', label: '태그',     desc: '구조태그와 감정태그 검색' },
  { type: 'memo',          action: 'memo',        icon: '메', label: '메모',     desc: '현재 위치에 메모 남기기' },
];

// ─── MemoInputBox ─────────────────────────────────────────────────────────────
function MemoInputBox({ top, left, sceneId, quotedText, episodeId, savedRange, onClose }) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const textareaRef = useRef(null);
  useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleSave = async () => {
    if (!content.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const memo = { id: genId(), scene_id: sceneId || null, quoted_text: quotedText || null, content: content.trim(), created_at: now() };
      const existing = await getAll('script_memos_' + episodeId);
      await setAll('script_memos_' + episodeId, [...existing, memo]);
      onClose(savedRange, true);
    } catch {
      setSaveError('저장에 실패했어요. 다시 시도해주세요.');
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(savedRange); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSave(); }
  };

  return createPortal(
    <div style={{
      position: 'fixed', top, left, zIndex: 200,
      background: 'var(--c-bg-card, #fff)', border: '1px solid var(--c-border2)',
      borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
      width: 280, maxWidth: 'calc(100vw - 32px)',
    }}>
      {quotedText && (
        <div style={{
          fontSize: 11, color: 'var(--c-text4)', borderLeft: '3px solid var(--c-accent)',
          paddingLeft: 8, lineHeight: 1.5,
          overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
        }}>{quotedText}</div>
      )}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="메모를 입력하세요"
        rows={3}
        style={{
          resize: 'none', fontSize: 13, lineHeight: 1.6,
          border: '1px solid var(--c-border2)', borderRadius: 6,
          padding: '6px 8px', outline: 'none',
          background: 'var(--c-bg)', color: 'var(--c-text1)', fontFamily: 'inherit',
        }}
      />
      {saveError && <div style={{ fontSize: 11, color: '#e05c5c' }}>{saveError}</div>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          onClick={() => onClose(savedRange)}
          style={{ fontSize: 12, padding: '4px 10px', border: '1px solid var(--c-border2)',
            borderRadius: 6, background: 'transparent', color: 'var(--c-text4)', cursor: 'pointer' }}
        >취소</button>
        <button
          onClick={handleSave}
          disabled={!content.trim() || saving}
          style={{ fontSize: 12, padding: '4px 12px', border: 'none',
            borderRadius: 6, background: 'var(--c-accent)', color: '#fff',
            cursor: content.trim() && !saving ? 'pointer' : 'not-allowed',
            opacity: content.trim() && !saving ? 1 : 0.5 }}
        >{saving ? '저장 중…' : '저장 (⌘↩)'}</button>
      </div>
    </div>,
    document.body
  );
}

// ─── Symbol Picker ────────────────────────────────────────────────────────────
function SymbolPicker({ mobile = false, closeToken = 0, onOpen, forceOpen = null, onForceClose }) {
  const { state, dispatch } = useApp();
  // dropPos null = closed, { top?, bottom?, left } = open — 둘을 분리하지 않아 (0,0) 렌더 방지
  const [dropPos, setDropPos] = useState(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [editMode, setEditMode] = useState(false);
  const [newSym, setNewSym] = useState('');
  const ref = useRef(null);
  const btnRef = useRef(null);
  const dropRef = useRef(null);
  const savedRangeRef = useRef(null); // 버튼 탭 시 커서 위치 저장 (모바일 키보드 닫힘으로 selection 소실 방지)
  const customSymbols = state.stylePreset?.customSymbols || [];
  // customSymbols가 비어있으면 DEFAULT_SYMBOLS를 초기 목록으로 사용
  const allSymbols = customSymbols.length > 0 ? customSymbols : [...DEFAULT_SYMBOLS];
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

  // 슬래시 커맨드에서 forceOpen 위치로 열기 요청
  useEffect(() => {
    if (forceOpen) {
      setDropPos(forceOpen);
      onOpen?.();
    }
  }, [forceOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) { setActiveIdx(-1); return; }
    const handler = (e) => {
      const inBtn = ref.current?.contains(e.target);
      const inDrop = dropRef.current?.contains(e.target);
      if (!inBtn && !inDrop) { setDropPos(null); onForceClose?.(); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Ctrl+6 단축키로 열기 (Shift 없이만 — Ctrl+Shift+6은 태그 버튼)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'Digit6') {
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
      const COLS = 2;
      const len = allSymbols.length;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveIdx(i => {
          const col = i % COLS;
          return col === COLS - 1 ? i : Math.min(i + 1, len - 1);
        });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveIdx(i => {
          const col = i % COLS;
          return col === 0 ? i : i - 1;
        });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + COLS, len - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - COLS, 0));
      } else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        e.stopPropagation(); // 에디터 Enter(줄바꿈) 차단 — capture 단계에서 실행됨
        insertSymbol(allSymbols[activeIdx]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setDropPos(null);
      }
    };
    window.addEventListener('keydown', onKey, true); // capture: React 이벤트 위임보다 먼저 실행
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, activeIdx, allSymbols]);

  const saveSymbols = (arr) => {
    dispatch({ type: 'SET_STYLE_PRESET', payload: { customSymbols: arr } });
  };

  const addCustomSym = () => {
    const s = newSym.trim();
    if (!s) return;
    if (!allSymbols.includes(s)) saveSymbols([...allSymbols, s]);
    setNewSym('');
  };

  const removeCustomSym = (sym) => {
    saveSymbols(allSymbols.filter(s => s !== sym));
  };

  const moveCustomSym = (sym, dir) => {
    const idx = allSymbols.indexOf(sym);
    if (idx < 0) return;
    const next = dir === 'up' ? idx - 1 : idx + 1;
    if (next < 0 || next >= allSymbols.length) return;
    const arr = [...allSymbols];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    saveSymbols(arr);
  };

  const resetSymbols = () => {
    dispatch({ type: 'SET_STYLE_PRESET', payload: { customSymbols: [] } });
  };

  const insertSymbol = (sym) => {
    setDropPos(null);
    onForceClose?.();
    const surface = document.querySelector('[data-editor-surface]');
    if (!surface) return;

    // 슬래시 메뉴 경로: blockId가 있으면 커서 위치와 무관하게 해당 블록에 직접 삽입
    // (surface.focus() 후 모바일에서 커서가 블록 밖으로 이동하는 문제 방지)
    const targetBlockId = forceOpen?.blockId;
    if (targetBlockId) {
      const targetEl = surface.querySelector(`[data-block-id="${targetBlockId}"]`);
      if (targetEl) {
        const speechEl = targetEl.dataset.blockType === 'dialogue'
          ? (targetEl.querySelector('.ce-speech') || targetEl) : targetEl;
        surface.focus();
        if (targetEl.dataset.blockType === 'dialogue' && speechEl !== targetEl) {
          // 대사 블록: textContent 직접 설정 (ce-char-badge 인접 span에서 range 삽입 시 위치 오류 방지)
          speechEl.textContent = sym;
          cleanupBr(speechEl);
          const textNode = speechEl.firstChild;
          if (textNode) {
            try {
              const r = document.createRange();
              r.setStart(textNode, textNode.length);
              r.collapse(true);
              window.getSelection()?.removeAllRanges();
              window.getSelection()?.addRange(r);
            } catch (_) {}
          }
          surface.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          // 지문 등 다른 블록: execCommand 방식
          const r = document.createRange();
          r.selectNodeContents(speechEl);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(r);
          document.execCommand('insertText', false, sym);
          cleanupBr(speechEl);
        }
        return;
      }
      return;
    }

    // 일반 경로 (버튼 직접 클릭): 현재 커서 위치에 삽입
    surface.focus();
    const sel = window.getSelection();
    // 모바일에서 키보드 닫힘으로 selection이 사라진 경우 저장해둔 range로 복원
    if (!sel?.rangeCount && savedRangeRef.current) {
      try {
        sel?.removeAllRanges();
        sel?.addRange(savedRangeRef.current);
      } catch (_) {}
    }
    savedRangeRef.current = null;
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(sym);
    range.insertNode(textNode);
    cleanupBr(textNode.parentNode);
    const r = document.createRange();
    r.setStartAfter(textNode);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    surface.dispatchEvent(new Event('input', { bubbles: true }));
    requestAnimationFrame(() => { surface.focus(); });
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        onMouseDown={e => {
          e.preventDefault();
          // 드롭다운 열기 전 커서 위치 저장 (모바일: 버튼 탭 시 키보드 닫혀 selection 소실)
          if (!open) {
            const sel = window.getSelection();
            savedRangeRef.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
          }
          if (open) {
            setDropPos(null);
          } else {
            const rect = e.currentTarget.getBoundingClientRect();
            setDropPos(calcDropPos(rect));
            onOpen?.();
          }
        }}
        title={`기타 (${INSERT_SHORTCUT_HINTS.symbol})`}
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
          onPointerDown={e => { if (e.target.closest('button, input')) return; e.preventDefault(); e.stopPropagation(); }} // 포털 전체: 에디터 커서 이동 차단 (아이템 자체가 stopPropagation 처리)
          style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            zIndex: 9999,
            background: 'var(--c-tag)', border: '1px solid var(--c-border4)',
            borderRadius: '0.5rem', overflow: 'hidden',
            minWidth: '180px', maxWidth: '280px', boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            touchAction: 'manipulation', // 모바일 탭 지연(300ms) 제거
          }}
        >
          <div style={{ padding: '4px 12px 6px', fontSize: 10, fontWeight: 600, color: 'var(--c-text5)', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>기타 삽입</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {editMode && (
                <button
                  onPointerDown={e => { e.preventDefault(); e.stopPropagation(); resetSymbols(); }}
                  style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, border: '1px solid var(--c-border3)', background: 'transparent', color: 'var(--c-text5)', cursor: 'pointer' }}
                >초기화</button>
              )}
              <button
                onPointerDown={e => { e.preventDefault(); e.stopPropagation(); setEditMode(v => !v); }}
                style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, border: '1px solid var(--c-border3)', background: editMode ? 'var(--c-accent)' : 'transparent', color: editMode ? '#fff' : 'var(--c-text5)', cursor: 'pointer' }}
              >편집</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, maxHeight: 192, overflowY: 'auto' }}>
            {allSymbols.map((sym, i) => (
              <div
                key={sym + i}
                data-sym-item="1"
                onPointerDown={e => { if (!editMode) { e.preventDefault(); e.stopPropagation(); insertSymbol(sym); } }}
                onMouseEnter={() => !editMode && setActiveIdx(i)}
                onMouseLeave={() => setActiveIdx(-1)}
                style={{
                  padding: '5px 10px', fontSize: 12, cursor: editMode ? 'default' : 'pointer',
                  color: activeIdx === i ? 'var(--c-text)' : 'var(--c-text2)',
                  background: activeIdx === i ? 'var(--c-active)' : 'transparent',
                  width: editMode ? '100%' : '50%', boxSizing: 'border-box',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{sym}</span>
                {editMode && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      onPointerDown={e => { e.preventDefault(); e.stopPropagation(); moveCustomSym(sym, 'up'); }}
                      style={{ fontSize: 12, color: 'var(--c-text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                    >↑</button>
                    <button
                      onPointerDown={e => { e.preventDefault(); e.stopPropagation(); moveCustomSym(sym, 'down'); }}
                      style={{ fontSize: 12, color: 'var(--c-text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                    >↓</button>
                    <button
                      onPointerDown={e => { e.preventDefault(); e.stopPropagation(); removeCustomSym(sym); }}
                      style={{ fontSize: 14, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                    >×</button>
                  </div>
                )}
              </div>
            ))}
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
                onPointerDown={e => { e.preventDefault(); e.stopPropagation(); addCustomSym(); }}
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
  const { totalPages, totalScenes, charCount } = useMemo(() => {
    if (!blocks.length) return { totalPages: 1, totalScenes: 0, charCount: 0 };
    const m = getLayoutMetrics(stylePreset);
    const { charsPerLine, charsInSpeech, linesPerPage, fontSize, lineHeight } = m;
    const lineHpt = fontSize * lineHeight;
    let total = 0;
    let scenes = 0;
    let chars = 0;
    // ep_title: TOKEN_HEIGHTS.ep_title = (fs+2)/fs (토크나이저와 동일)
    total += (fontSize + 2) / fontSize;
    for (const b of blocks) {
      const text = stripHtml(b.content || '');
      switch (b.type) {
        case 'scene_number':
          scenes += 1;
          total += 1 + 12 / lineHpt;
          break;
        case 'action': {
          const lines = Math.max(1, Math.ceil(text.length / (charsPerLine - 2)));
          total += lines * (1 + 1 / lineHpt);
          chars += text.length;
          break;
        }
        case 'dialogue': {
          const lines = Math.max(1, Math.ceil(text.length / charsInSpeech));
          total += lines * (1 + 1 / lineHpt);
          chars += text.length;
          break;
        }
        default: {
          const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
          total += lines * (1 + 1 / lineHpt);
          chars += text.length;
        }
      }
    }
    return {
      totalPages: Math.max(1, Math.ceil(total / linesPerPage)),
      totalScenes: scenes,
      charCount: chars,
    };
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
    <span
      className="text-[10px] tabular-nums"
      style={{ color: 'var(--c-text6)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
      title={`페이지 ${currentPage}/${totalPages} · 씬 ${totalScenes}개 · 글자 ${charCount.toLocaleString('ko-KR')}자`}
    >
      <span>{currentPage}/{totalPages}</span>
      {totalScenes > 0 && <><span style={{ opacity: 0.5 }}>·</span><span>씬 {totalScenes}</span></>}
      <span style={{ opacity: 0.5 }}>·</span>
      <span>{charCount.toLocaleString('ko-KR')}자</span>
    </span>
  );
}

// ─── syncLabels ───────────────────────────────────────────────────────────────
function syncLabels(blocks) {
  let seq = 0;
  return blocks.map(b => {
    if (b.type === 'scene_number') { seq++; return { ...b, label: buildSceneLabel(seq) }; }
    return b;
  });
}

// ─── HTML escape ──────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Inline HTML helpers (B/I/U 서식 저장용) ─────────────────────────────────
const INLINE_PURIFY_CONFIG = { ALLOWED_TAGS: ['b', 'i', 'u', 's'], ALLOWED_ATTR: [] };
function sanitizeInlineHtml(html) {
  if (!html) return '';
  const normalized = html
    .replace(/<strong(\s[^>]*)?>/gi, '<b>').replace(/<\/strong>/gi, '</b>')
    .replace(/<em(\s[^>]*)?>/gi, '<i>').replace(/<\/em>/gi, '</i>')
    .replace(/<strike(\s[^>]*)?>/gi, '<s>').replace(/<\/strike>/gi, '</s>')
    .replace(/<del(\s[^>]*)?>/gi, '<s>').replace(/<\/del>/gi, '</s>')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(?!\/?(b|i|u|s)(\s[^>]*)?>)[^>]+>/gi, '')
    .replace(/\n$/, '');
  return DOMPurify.sanitize(normalized, INLINE_PURIFY_CONFIG);
}
function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '');
}
function blockHtml(el) {
  if (!el) return '';
  return sanitizeInlineHtml(el.innerHTML);
}
const BLOCK_PURIFY_CONFIG = { ALLOWED_TAGS: ['b', 'i', 'u', 's', 'br'], ALLOWED_ATTR: [] };
function setBlockHtml(el, html) {
  if (!el) return;
  el.innerHTML = html ? DOMPurify.sanitize(html, BLOCK_PURIFY_CONFIG) : '<br>';
}

// ─── Blocks → innerHTML ──────────────────────────────────────────────────────
// For scene_number: strip the "S#n." prefix — label shown via CSS ::before
// For dialogue: strip charName prefix from content (old format had name embedded in content)
function blockDisplayContent(b) {
  if (b.type === 'scene_number') {
    // 구조화 필드가 있으면 유저 포맷으로 실시간 조합
    if (b.location || b.specialSituation) {
      return formatSceneHeader(b, getSceneFormat());
    }
    // 폴백: content에서 label prefix 제거
    return (b.content || '').replace(SCENE_PREFIX_STRIP_RE, '');
  }
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
    const dcRaw = b.sceneRefs?.length ? buildRichHtml(displayContent, b.sceneRefs) : isRichBlock ? displayContent : esc(displayContent);
    // 빈 블록에 <br> 삽입 — 브라우저가 화살표 키 caret stop으로 인식하도록
    const dc = dcRaw || '<br>';
    const alignAttr = b.alignment ? ` data-alignment="${b.alignment}" style="text-align:${b.alignment}"` : '';
    switch (b.type) {
      case 'scene_number': {
        const label = esc(b.label || '');
        const sceneId = esc(b.sceneId || '');
        const draftAttr = b.sceneDraft ? ' data-scene-draft="true"' : '';
        return `<div data-block-id="${id}" data-block-type="scene_number" data-label="${label}" data-scene-id="${sceneId}"${draftAttr} class="ce-block ce-scene"${alignAttr}>${dc}</div>`;
      }
      case 'dialogue': {
        const cn = esc(b.characterName || b.charName || '');
        const ci = esc(b.characterId || '');
        const cp = esc(b.charPrefix || '');
        const cs = esc(b.charSuffix || '');
        return `<div data-block-id="${id}" data-block-type="dialogue" data-char-name="${cn}" data-char-id="${ci}" data-char-prefix="${cp}" data-char-suffix="${cs}" class="ce-block ce-dialogue"${alignAttr}>${dc}</div>`;
      }
      case 'scene_ref': {
        const refId = esc(b.refSceneId || '');
        return `<div data-block-id="${id}" data-block-type="scene_ref" data-ref-scene-id="${refId}" class="ce-block ce-scene_ref"${alignAttr}>${dc}</div>`;
      }
      default:
        return `<div data-block-id="${id}" data-block-type="${b.type}" class="ce-block ce-${b.type}"${alignAttr}>${dc}</div>`;
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
  if (!text) { el.innerHTML = '<br>'; return; }
  el.innerText = text;
}

// ─── cleanupBr ────────────────────────────────────────────────────────────────
// 텍스트가 있는 요소에서 직접 자식 <br>을 제거한다.
// 빈 블록의 <br>은 커서 위치 확보용이므로 보존한다.
// DOM 삽입 후 이 함수를 호출해 <br> 관련 줄바꿈 버그를 방지한다.
function cleanupBr(el) {
  if (!el || !el.textContent) return; // 텍스트 없으면 placeholder 보존
  [...el.childNodes].forEach(n => { if (n.nodeName === 'BR') el.removeChild(n); });
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
    // 빈 블록(<br> placeholder만): <br> 앞에 빈 텍스트 노드를 주입하고 그 안에 caret.
    // 이유: caret이 컨테이너 끝(br 뒤)에 있으면 한글 IME 첫 자모 commit 직후 세션이
    // 끊겨 'ㄱㅏ나다'처럼 자모가 분리되는 Chrome contenteditable 버그 발생.
    const tn = document.createTextNode('');
    if (target.firstChild) target.insertBefore(tn, target.firstChild);
    else target.appendChild(tn);
    const r = document.createRange();
    r.setStart(tn, 0); r.collapse(true);
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
    div.dataset.sceneDraft = 'true';
    div.innerHTML = text ? esc(text) : '<br>';
  } else if (type === 'dialogue') {
    div.dataset.charName = charMeta.charName || '';
    div.dataset.charId = charMeta.charId || '';
    div.innerHTML = text ? esc(text) : '<br>';
  } else {
    div.innerHTML = text ? esc(text) : '<br>';
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
  const displayText = newType === 'scene_number' ? text.replace(SCENE_PREFIX_STRIP_RE, '') : text;
  if (newType === 'dialogue') {
    let prefix = '';
    let cleanText = displayText;
    for (const sym of DEFAULT_SYMBOLS) {
      if (displayText.startsWith(sym)) {
        const after = displayText.slice(sym.length);
        if (after.startsWith(' ')) {
          prefix = sym + ' ';   // 띄어쓰기 포함
          cleanText = after.slice(1);
        } else {
          prefix = sym;          // 붙임
          cleanText = after;
        }
        break;
      }
    }
    const SUFFIX_RE = /\s?\([A-Za-z./\s]+\)$/;
    let suffix = '';
    const suffixMatch = cleanText.match(SUFFIX_RE);
    if (suffixMatch) {
      suffix = suffixMatch[0];
      cleanText = cleanText.slice(0, -suffixMatch[0].length);
    }
    blockEl.dataset.charName = cleanText;
    blockEl.dataset.charId = '';
    blockEl.dataset.charPrefix = prefix;
    blockEl.dataset.charSuffix = suffix;
    blockEl.innerHTML = '<br>';
  } else if (old === 'dialogue') {
    delete blockEl.dataset.charName; delete blockEl.dataset.charId; delete blockEl.dataset.charPrefix; delete blockEl.dataset.charSuffix;
    blockEl.textContent = displayText;
  } else {
    blockEl.textContent = displayText;
  }
  if (old === 'scene_number' && newType !== 'scene_number') {
    delete blockEl.dataset.label;
    delete blockEl.dataset.sceneId;
    delete blockEl.dataset.sceneDraft;
  }
  if (newType === 'scene_number') {
    if (!blockEl.dataset.label) blockEl.dataset.label = '';
    if (!blockEl.dataset.sceneId) blockEl.dataset.sceneId = genId();
    if (old !== 'scene_number') blockEl.dataset.sceneDraft = 'true';
  }
}

function normalizeEmptySceneNumberBlocks(blocks = []) {
  return blocks.map((block) => {
    if (block?.type !== 'scene_number') return block;
    const hasStructured = !!(block.location || block.specialSituation);
    if (block.sceneDraft) return block;
    if (hasStructured) return block;
    const rawContent = (block.content || '').trim();
    const body = rawContent.replace(SCENE_PREFIX_STRIP_RE, '').trim();
    if (body) return block;
    if (rawContent) return block;  // prefix만 입력된 상태(입력 중) — 변환하지 않음
    const {
      label,
      sceneId,
      sceneDraft,
      location,
      subLocation,
      timeOfDay,
      specialSituation,
      ...rest
    } = block;
    if (suppressSceneNormalize) return { ...rest };
    return { ...rest, type: 'action', content: '' };
  });
}

function normalizeEmptySceneNumberDom(surface) {
  if (!surface) return null;
  let normalizedEl = null;
  [...surface.querySelectorAll('[data-block-type="scene_number"]')].forEach((blockEl) => {
    if (blockEl.dataset.sceneDraft === 'true') return;
    if (blockText(blockEl).trim()) return;
    changeBlockTypeEl(blockEl, 'action');
    setBlockText(blockEl, '');
    normalizedEl = normalizedEl || blockEl;
  });
  return normalizedEl;
}

function syncSceneDraftDom(surface) {
  if (!surface) return;
  [...surface.querySelectorAll('[data-block-type="scene_number"][data-scene-draft="true"]')].forEach((blockEl) => {
    if (blockText(blockEl).trim()) delete blockEl.dataset.sceneDraft;
  });
}

function syncNormalizedBlockTypes(surface, parsedBlocks = [], normalizedBlocks = []) {
  if (!surface) return null;
  let activeNormalizedEl = null;
  const sel = window.getSelection();
  normalizedBlocks.forEach((block, idx) => {
    const parsed = parsedBlocks[idx];
    if (!parsed || !block || parsed.id !== block.id) return;
    if (parsed.type === 'scene_number' && block.type !== 'scene_number') {
      const div = surface.querySelector(`[data-block-id="${parsed.id}"]`);
      if (!div) return;
      const hasCaret = !!(sel?.rangeCount && div.contains(sel.getRangeAt(0).startContainer));
      changeBlockTypeEl(div, block.type);
      setBlockText(div, block.content || '');
      if (hasCaret) activeNormalizedEl = div;
    }
  });
  return activeNormalizedEl;
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
      label: type === 'scene_number' ? (prev.label || div.dataset.label || '') : '',
      createdAt: prev.createdAt || now(),
      updatedAt: rawText !== prev.rawText ? now() : (prev.updatedAt || now()),
      rawText, // internal cache for change detection
      sceneRefs,
      emotionTag: prev.emotionTag || null,
      alignment: div.dataset.alignment || prev.alignment || undefined,
      annotations: prev.annotations ?? [],
    };
    if (type === 'scene_number') {
      const label = prev.label || div.dataset.label || '';
      const sceneId = div.dataset.sceneId || prev.sceneId || genId();
      const sceneFields = buildSceneNumberBlock({ prev, rawText, label, sceneId });
      const sceneDraft = (div.dataset.sceneDraft === 'true' || prev.sceneDraft === true) && rawText.trim() === '';
      return { ...base, ...sceneFields, sceneDraft };
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
        charPrefix: div.dataset.charPrefix || prev.charPrefix || '',
        charSuffix: div.dataset.charSuffix || prev.charSuffix || '',
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
// ─── SlashPalette ─────────────────────────────────────────────────────────────
function SlashPalette({ commands, position, selectedIdx, onSelect, onClose }) {
  const itemRefs = useRef([]);
  useEffect(() => {
    itemRefs.current[selectedIdx]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  if (!commands.length) return null;
  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onMouseDown={e => { e.preventDefault(); onClose(); }} />
      <div style={{
        position: 'fixed', top: position.y, left: position.x,
        zIndex: 200, background: 'var(--c-panel)',
        border: '1px solid var(--c-border)', borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)', minWidth: 190,
        maxHeight: position.maxH ? `${Math.floor(position.maxH)}px` : 260,
        overflowY: 'auto',
      }}>
        {commands.map((cmd, idx) => {
          const sel = idx === selectedIdx;
          return (
            <div
              key={cmd.type}
              ref={el => { itemRefs.current[idx] = el; }}
              onMouseDown={e => { e.preventDefault(); onSelect(cmd.type); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 14px',
                background: sel ? 'var(--c-accent)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <span style={{
                width: 26, height: 26, borderRadius: 6,
                background: sel ? 'rgba(255,255,255,0.25)' : 'var(--c-border2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                color: sel ? '#fff' : 'var(--c-text4)', flexShrink: 0,
              }}>{cmd.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: sel ? 700 : 500, color: sel ? '#fff' : 'var(--c-text)' }}>{cmd.label}</div>
                <div style={{ fontSize: 10, color: sel ? 'rgba(255,255,255,0.75)' : 'var(--c-text5)' }}>{cmd.desc}</div>
              </div>
              {idx < 9 && (
                <span style={{
                  marginLeft: 'auto',
                  minWidth: 18,
                  height: 18,
                  padding: '0 4px',
                  borderRadius: 999,
                  border: sel ? '1px solid rgba(255,255,255,0.35)' : '1px solid var(--c-border2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  color: sel ? '#fff' : 'var(--c-text5)',
                  flexShrink: 0,
                }}>{idx + 1}</span>
              )}
            </div>
          );
        })}
      </div>
    </>,
    document.body
  );
}

// ─── SlashTagPickerPanel ──────────────────────────────────────────────────────
function SlashTagPickerPanel({ position, scene, tagPool, onAdd, onRemove, onClose }) {
  const [input, setInput] = useState('');
  const [suggIdx, setSuggIdx] = useState(0);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    // 포커스 — rAF으로 팔레트 렌더 후 focus
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const currentTags = scene.tags || [];

  // 입력값 기준 추천 목록: 아직 안 붙은 태그 중 입력값 포함하는 것
  const suggestions = input.trim()
    ? tagPool.filter(t => !currentTags.includes(t) && t.includes(input.trim()))
    : [];

  const commitTag = (tag) => {
    const t = (tag || input).trim().replace(/^#/, '');
    if (!t) return;
    onAdd(t);
    setInput('');
    setSuggIdx(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSuggIdx(i => Math.min(i + 1, suggestions.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSuggIdx(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions.length && suggIdx < suggestions.length) {
        commitTag(suggestions[suggIdx]);
      } else {
        commitTag(input);
      }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
  };

  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 219 }} onMouseDown={onClose} />
      <div
        style={{
          position: 'fixed', top: position.top, left: position.left,
          zIndex: 220, background: 'var(--c-panel)', border: '1px solid var(--c-border2)',
          borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.2)',
          minWidth: 220, padding: '10px',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* 현재 태그 */}
        {currentTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {currentTags.map(tag => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '2px 8px', borderRadius: 99,
                  background: 'var(--c-accent)', color: '#fff',
                  fontSize: 11, fontWeight: 500,
                }}
              >
                #{tag}
                <button
                  onMouseDown={e => { e.preventDefault(); onRemove(tag); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}
                >×</button>
              </span>
            ))}
          </div>
        )}

        {/* 입력창 */}
        <input
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); setSuggIdx(0); }}
          onKeyDown={handleKeyDown}
          placeholder="태그 입력 후 Enter"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '6px 10px', borderRadius: 6,
            border: '1px solid var(--c-border3)',
            background: 'var(--c-bg)', color: 'var(--c-text)',
            fontSize: 13, outline: 'none',
          }}
        />

        {/* 자동완성 추천 */}
        {suggestions.length > 0 && (
          <div style={{ marginTop: 4, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--c-border2)' }}>
            {suggestions.slice(0, 8).map((s, i) => (
              <div
                key={s}
                onMouseDown={e => { e.preventDefault(); commitTag(s); }}
                style={{
                  padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                  background: i === suggIdx ? 'var(--c-accent)' : 'var(--c-panel)',
                  color: i === suggIdx ? '#fff' : 'var(--c-text3)',
                }}
              >#{s}</div>
            ))}
          </div>
        )}
      </div>
    </>,
    document.body
  );
}

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
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const getDisplayText = (s) => s.content || resolveSceneLabel({ ...s, label: '' }) || s.label;
  const filtered = scenes.filter(s => {
    if (!query) return true;
    const display = getDisplayText(s);
    return display.includes(query) || (s.label || '').includes(query);
  }).slice(0, 8);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

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

// ─── NextTypePickerOverlay ────────────────────────────────────────────────────
// 대사 블록 다음 형식 선택 (씬번호 / 지문) — 방향키·Enter·Esc 지원
const NEXT_TYPE_OPTIONS = [
  { type: 'scene_number', label: '씬번호' },
  { type: 'action',       label: '지문'   },
  { type: 'dialogue',     label: '대사'   },
];
function NextTypePickerOverlay({ anchor, onSelect, onClose, excludeType }) {
  const options = NEXT_TYPE_OPTIONS.filter(o => o.type !== excludeType);
  const [idx, setIdx] = useState(0);
  const ref = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 마운트 시 팝업 자체에 포커스
  useEffect(() => { ref.current?.focus(); }, []);

  useEffect(() => {
    const onMouse = (e) => { if (ref.current && !ref.current.contains(e.target)) onCloseRef.current(); };
    const t = setTimeout(() => document.addEventListener('mousedown', onMouse), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onMouse); };
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx(i => (i - 1 + options.length) % options.length);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx(i => (i + 1) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onSelectRef.current(options[idx].type);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCloseRef.current();
    }
  };

  return createPortal(
    <div
      ref={ref}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed', top: anchor.top, left: anchor.left, zIndex: 9999,
        display: 'flex', gap: 6, padding: '6px 8px', borderRadius: 8,
        background: 'var(--c-tag)', border: '1px solid var(--c-border4)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)', outline: 'none',
      }}
    >
      {options.map(({ type, label }, i) => (
        <button
          key={type}
          onMouseDown={e => { e.preventDefault(); onSelect(type); }}
          onMouseEnter={() => setIdx(i)}
          style={{
            padding: '4px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
            border: `1px solid ${i === idx ? 'var(--c-accent)' : 'var(--c-border3)'}`,
            background: i === idx ? 'var(--c-active)' : 'transparent',
            color: 'var(--c-text)',
          }}
        >{label}</button>
      ))}
    </div>,
    document.body
  );
}

// ─── CharPickerOverlay ────────────────────────────────────────────────────────
function CharPickerOverlay({ anchor, projectChars, onSelect, onClose, onAddNew, onSkip, initialQuery = '', mobile = false }) {
  const [query, setQuery] = useState(initialQuery);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const containerRef = useRef(null);
  // ref로 콜백 안정화 — inline arrow가 바뀌어도 effect 재실행 없음
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const focusInput = () => inputRef.current?.focus({ preventScroll: true });
    const rafId = requestAnimationFrame(focusInput);
    const timerId = setTimeout(focusInput, 30);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
    };
  }, []);
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

  const PICKER_SUFFIX_RE = /\s?\([A-Za-z./\s]+\)$/;
  const querySuffix = query.match(PICKER_SUFFIX_RE)?.[0] || '';
  const queryBase = querySuffix ? query.slice(0, -querySuffix.length).trim() : query;

  const filtered = (queryBase
    ? projectChars.filter(c => (c.name || '').includes(queryBase) || (c.givenName || '').includes(queryBase))
    : projectChars
  ).slice(0, 10);

  // 미등록 행이 표시되는 조건
  const showUnreg = filtered.length === 0 && queryBase.trim();
  // 방향키 인덱스 최대값: 등록 목록 또는 미등록 행(그대로=0, 인물추가=1)
  const maxIdx = showUnreg ? (onAddNew ? 1 : 0) : filtered.length - 1;

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-char-item]');
    items[activeIdx]?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const handleKeyNav = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, maxIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (!showUnreg) {
        // 등록 인물 목록
        if (activeIdx >= 0 && filtered[activeIdx]) {
          const sel = filtered[activeIdx];
          const isExact = querySuffix && (sel.name === queryBase || sel.givenName === queryBase);
          onSelect(sel, isExact ? querySuffix : '');
        } else if (onSkip) {
          onSkip();
        } else {
          onClose();
        }
      } else {
        // 미등록 행: 0=그대로 사용, 1=인물 추가
        if (activeIdx === 1 && onAddNew) {
          onAddNew(queryBase.trim(), querySuffix);
        } else {
          onSelect({ id: undefined, name: queryBase.trim(), givenName: queryBase.trim() }, querySuffix);
        }
      }
    }
  };

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
          onKeyDown={handleKeyNav}
          placeholder="인물명 검색"
          className="w-full text-sm px-1 outline-none bg-transparent"
          style={{ color: 'var(--c-text)', caretColor: 'var(--c-accent)' }}
          spellCheck={false}
        />
      </div>
      <div ref={listRef} className="max-h-48 overflow-y-auto">
        {filtered.map((c, i) => {
          const charDisplay = c.givenName || c.name;
          const exactMatch = querySuffix && (c.name === queryBase || c.givenName === queryBase);
          return (
            <div
              key={c.id || c.name}
              data-char-item
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onSelect(c, exactMatch ? querySuffix : ''); }}
              onMouseEnter={() => setActiveIdx(i)}
              className="px-3 py-1.5 text-sm cursor-pointer"
              style={{ color: 'var(--c-text)', background: i === activeIdx ? 'var(--c-active)' : 'transparent' }}
            >
              {exactMatch ? query.trim() : charDisplay}
              {c.surname && c.givenName && <span className="ml-2 text-[10px]" style={{ color: 'var(--c-text6)' }}>{c.surname}{c.givenName}</span>}
            </div>
          );
        })}
        {showUnreg && (
          <>
            <div
              data-char-item
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onSelect({ id: undefined, name: queryBase.trim(), givenName: queryBase.trim() }, querySuffix); }}
              onMouseEnter={() => setActiveIdx(0)}
              className="px-3 py-1.5 text-sm cursor-pointer"
              style={{ color: 'var(--c-accent2)', background: activeIdx === 0 ? 'var(--c-active)' : 'transparent' }}
            >"{query}" 그대로 사용</div>
            {onAddNew && (
              <div
                data-char-item
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onAddNew(queryBase.trim(), querySuffix); }}
                onMouseEnter={() => setActiveIdx(1)}
                className="px-3 py-1.5 text-sm cursor-pointer"
                style={{ color: 'var(--c-text)', background: activeIdx === 1 ? 'var(--c-active)' : 'transparent' }}
              >+ 인물 추가</div>
            )}
          </>
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
  onCopy,          // 사이트 내부 클립보드 마커 + JSON 블록 데이터 저장
  onUndo,          // () → 커스텀 Undo 핸들러
  onSlashInput,    // ({ blockEl, query }) → 슬래시 팔레트 오픈
  onSlashClose,    // () → 슬래시 팔레트 닫기
  slashOpenRef,    // ref: 팔레트 열림 여부
  onSlashKeyNav,   // (key) → ↑↓ 탐색
  onSlashSelectCurrent, // () → Tab으로 현재 항목 선택
  onSlashSelectIndex, // (idx) → 숫자키로 항목 선택
  onNextTypePick,  // ({ blockId, top, left }) → 대사 블록에서 다음 형식 선택 팝업
  onCloseSceneRef, // () → 타이핑 시 씬연결 피커 자동 닫기
  blockStyles,
  stylePreset,
}, ref) {
  const surfaceRef = useRef(null);
  const metaRef = useRef({});
  const composingRef = useRef(false);
  const slashOffsetRef = useRef(null); // { blockId, offset } — '/' 위치 추적
  const lastKeyRef = useRef(null); // 더블스페이스 감지용
  const fromParseRef = useRef(false); // doParse 직후엔 DOM 이미 최신 → useEffect 동기화 불필요
  // Backspace/Delete 머지처럼 직접 DOM 조작 후 명시적으로 doParse를 호출했을 때,
  // 그 직후 자동 발동되는 onInput이 cleanupBr + doParse를 또 돌려 race로 줄이 복제되는 버그 가드.
  const suppressNextInputRef = useRef(false);
  const sceneBackspaceScheduledRef = useRef(false);
  const epIdRef = useRef(activeEpisodeId);
  const projIdRef = useRef(activeProjectId);
  epIdRef.current = activeEpisodeId;
  projIdRef.current = activeProjectId;

  const syncMeta = useCallback((blocks, syncDom = true) => {
    const m = {};
    blocks.forEach(b => { m[b.id] = b; });
    metaRef.current = m;
    const el = surfaceRef.current;
    if (!el) return;
    blocks.forEach(b => {
      const div = el.querySelector(`[data-block-id="${b.id}"]`);
      if (!div) return;
      // emotion dataset/CSS변수는 항상 sync — doParse가 ce-block을 재생성해도 dot 보존.
      // (updateEmotionTag만으론 doParse 경로에서 dataset 누락 발생 — 별개 버그 fix)
      if (b.emotionTag) {
        div.dataset.emotionColor = b.emotionTag.color;
        div.dataset.emotionWord = b.emotionTag.word;
        div.style.setProperty('--emotion-dot-color', b.emotionTag.color);
      } else {
        delete div.dataset.emotionColor;
        delete div.dataset.emotionWord;
        div.style.removeProperty('--emotion-dot-color');
      }
      // scene_number는 ::before(라벨)/::after(char-tags)가, dialogue는 ::before(인물명)가
      // 점유 → dot은 자식 span으로. contenteditable=false로 편집·선택·클릭 영향 없음.
      if (b.type === 'scene_number' || b.type === 'dialogue') {
        let dotEl = div.querySelector('.header-emotion-dot');
        if (b.emotionTag) {
          if (!dotEl) {
            dotEl = document.createElement('span');
            dotEl.className = 'header-emotion-dot';
            dotEl.setAttribute('contenteditable', 'false');
            dotEl.setAttribute('aria-hidden', 'true');
            div.insertBefore(dotEl, div.firstChild);
          }
          dotEl.style.background = b.emotionTag.color;
        } else if (dotEl) {
          dotEl.remove();
        }
      }
      // alignment는 doParse가 별도 처리 → syncDom=true일 때만 sync
      if (!syncDom) return;
      if (b.alignment) {
        div.dataset.alignment = b.alignment;
        div.style.textAlign = b.alignment;
      } else {
        delete div.dataset.alignment;
        div.style.textAlign = '';
      }
    });
  }, []);

  // ── Initialize DOM on episode change ONLY ──────────────────────────────────
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    syncMeta(initialBlocks);
    el.innerHTML = blocksToHtml(initialBlocks);
    // caret만 마지막 블록 끝으로 — 스크롤 위치는 ScriptEditor가 editorScrollRef로 처리
    const all = [...el.querySelectorAll('[data-block-id]')];
    const last = all[all.length - 1];
    if (last) setCaret(last, blockText(last).length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId]);

  // ── Sync external block changes to non-focused DOM elements ───────────────
  // (e.g. sceneRef auto-update, external block type change)
  useEffect(() => {
    // doParse 직후에는 DOM이 이미 최신 상태 → 200+ querySelector 루프 건너뜀
    if (fromParseRef.current) {
      fromParseRef.current = false;
      return;
    }

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
      // caret만 마지막 블록 끝으로 — 스크롤은 ScriptEditor가 처리
      const all = [...el.querySelectorAll('[data-block-id]')];
      const last = all[all.length - 1];
      if (last) setCaret(last, blockText(last).length);
      return;
    }

    const sel = window.getSelection();
    let activeBlockEl = null;
    if (sel?.rangeCount) {
      activeBlockEl = findBlockEl(sel.getRangeAt(0).startContainer, el);
    }
    initialBlocks.forEach(b => {
      const div = el.querySelector(`[data-block-id="${b.id}"]`);
      if (!div) return;
      if (div === activeBlockEl) return;
      const expected = blockDisplayContent(b);
      const isRich = b.type === 'action' || b.type === 'dialogue';
      const expectedPlain = isRich ? stripHtml(expected) : expected;
      const compareEl = (b.type === 'dialogue' && div.querySelector('.ce-speech')) ? div.querySelector('.ce-speech') : div;
      if (blockText(compareEl) !== expectedPlain) {
        if (isRich) setBlockHtml(div, expected); else setBlockText(div, expected);
      }
      if (b.type === 'dialogue') {
        const cn = b.characterName || b.charName || '';
        if (div.dataset.charName !== cn) {
          div.dataset.charName = cn;
          div.dataset.charId = b.characterId || '';
        }
        div.dataset.charPrefix = b.charPrefix || '';
        div.dataset.charSuffix = b.charSuffix || '';
      }
      if (b.type === 'scene_number' && b.label && div.dataset.label !== b.label) {
        div.dataset.label = b.label;
      }
    });
  }, [initialBlocks]);

  // ── Core parse: DOM → blocks ──────────────────────────────────────────────
  const doParse = useCallback(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const parsedBlocks = parseSurface(el, metaRef, epIdRef.current, projIdRef.current);
    const blocks = normalizeEmptySceneNumberBlocks(parsedBlocks);
    const normalizedActiveEl = syncNormalizedBlockTypes(el, parsedBlocks, blocks);
    syncMeta(blocks, false); // metaRef만 업데이트, DOM dot는 updateEmotionTag가 처리
    fromParseRef.current = true; // DOM이 최신 → useEffect([initialBlocks]) 루프 건너뜀
    onBlocksChange(blocks);
    if (normalizedActiveEl) setCaret(normalizedActiveEl, blockText(normalizedActiveEl).length);
    // 현재 커서의 블록 타입을 선택 상태 콜백으로 전달
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      const blockEl = findBlockEl(sel.getRangeAt(0).startContainer, el);
      onSelectionChange?.(blockEl?.dataset.blockType || null);
      window.dispatchEvent(new CustomEvent('script:alignment:state', { detail: blockEl?.dataset.alignment || null }));
    }
  }, [onBlocksChange, syncMeta, onSelectionChange]);

  // ── Imperative API for parent ──────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    parse() { doParse(); },
    // pagehide flush 전용: setState 우회하고 DOM에서 즉시 blocks 추출.
    // IME 게이트(handleInput의 composingRef early-return)와 React 렌더 사이클
    // 양쪽을 모두 우회 — DOM이 진실값.
    parseToBlocks() {
      const el = surfaceRef.current;
      if (!el) return null;
      try {
        return normalizeEmptySceneNumberBlocks(
          parseSurface(el, metaRef, epIdRef.current, projIdRef.current),
        );
      } catch {
        return null;
      }
    },
    blurSurface() {
      const el = surfaceRef.current;
      if (el && document.activeElement === el) el.blur();
    },
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
    updateBlockChar(blockId, charId, charName, charSuffix = undefined) {
      const el = surfaceRef.current;
      if (!el) return;
      const div = el.querySelector(`[data-block-id="${blockId}"]`);
      if (!div) return;
      div.dataset.charName = charName;
      div.dataset.charId = charId || '';
      if (charSuffix !== undefined) div.dataset.charSuffix = charSuffix;
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
      // preventScroll: Chrome contenteditable이 focus 시 surface 시작점으로 자동 스크롤하는
      // 동작 차단. 슬래시 메뉴/picker 닫힌 직후 빈 영역 클릭에서 화면이 맨 위로 점프하던 회귀 방지.
      el.focus({ preventScroll: true });
      const all = [...el.querySelectorAll('[data-block-id]')];
      const last = all[all.length - 1];
      if (last) {
        setCaret(last, blockText(last).length);
        // center: 회차 진입과 동일한 정책. /슬래시 후 새 블록이 viewport 아래쪽 끝에 끼어 있을
        // 때 'nearest'면 무동작이라 입력줄이 답답한 위치에 머무는 회귀가 있어 'center'로 통일.
        last.scrollIntoView({ block: 'center' });
      }
    },
    loadBlocks(blocks) {
      const el = surfaceRef.current;
      if (!el) return;
      const normalizedBlocks = normalizeEmptySceneNumberBlocks(blocks);
      el.innerHTML = blocksToHtml(normalizedBlocks);
      const synced = normalizeEmptySceneNumberBlocks(
        parseSurface(el, metaRef, epIdRef.current, projIdRef.current),
      );
      // parseSurface re-parses display text which may lose structured fields for some timeFmt values
      // (e.g. space-separated "주막 - 안 낮" cannot be reliably re-parsed). Restore from originals.
      // emotionTag도 input blocks에서 보존 — innerHTML이 dataset.emotionColor 안 박고
      // metaRef는 신규 블록에 대해 stale (가져오기/undo로 새 ID 들어올 때).
      const origMap = new Map(normalizedBlocks.map(b => [b.id, b]));
      const preserved = synced.map(b => {
        const orig = origMap.get(b.id);
        if (!orig) return b;
        const next = { ...b, emotionTag: orig.emotionTag ?? null };
        if (b.type !== 'scene_number') return next;
        if (!orig.location && !orig.specialSituation) return next;
        return { ...next, location: orig.location, subLocation: orig.subLocation, timeOfDay: orig.timeOfDay, specialSituation: orig.specialSituation };
      });
      syncMeta(preserved);
      onBlocksChange(preserved);
    },
    applyFormat(format) {
      // format: 'bold' | 'italic' | 'underline' | 'strikeThrough'
      document.execCommand('styleWithCSS', false, false);
      document.execCommand(format, false, null);
      doParse();
    },
    applyAlignment(alignment) {
      const el = surfaceRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const blockEl = findBlockEl(sel.getRangeAt(0).startContainer, el);
      if (!blockEl) return;
      const id = blockEl.dataset.blockId;
      if (!id) return;
      const newAlign = blockEl.dataset.alignment === alignment ? undefined : alignment;
      if (newAlign) {
        blockEl.dataset.alignment = newAlign;
        blockEl.style.textAlign = newAlign;
      } else {
        delete blockEl.dataset.alignment;
        blockEl.style.textAlign = '';
      }
      if (metaRef.current[id]) metaRef.current[id] = { ...metaRef.current[id], alignment: newAlign };
      doParse();
    },
    updateEmotionTag(blockId, emotionTag) {
      // metaRef 즉시 업데이트 (이후 doParse 시 emotionTag 유실 방지)
      metaRef.current[blockId] = {
        ...(metaRef.current[blockId] || {}),
        emotionTag: emotionTag ?? null,
      };
      // DOM dot 즉시 반영
      const el = surfaceRef.current;
      if (el) {
        const div = el.querySelector(`[data-block-id="${blockId}"]`);
        if (div) {
          if (emotionTag) {
            div.dataset.emotionColor = emotionTag.color;
            div.dataset.emotionWord = emotionTag.word;
            div.style.setProperty('--emotion-dot-color', emotionTag.color);
          } else {
            delete div.dataset.emotionColor;
            delete div.dataset.emotionWord;
            div.style.removeProperty('--emotion-dot-color');
          }
          // scene_number/dialogue는 ::before가 다른 용도로 점유 → 자식 span으로 dot 표시
          const blockType = div.dataset.blockType;
          if (blockType === 'scene_number' || blockType === 'dialogue') {
            let dotEl = div.querySelector('.header-emotion-dot');
            if (emotionTag) {
              if (!dotEl) {
                dotEl = document.createElement('span');
                dotEl.className = 'header-emotion-dot';
                dotEl.setAttribute('contenteditable', 'false');
                dotEl.setAttribute('aria-hidden', 'true');
                div.insertBefore(dotEl, div.firstChild);
              }
              dotEl.style.background = emotionTag.color;
            } else if (dotEl) {
              dotEl.remove();
            }
          }
        }
      }
      // doParse는 호출하지 않음 — 호출자(ScriptEditor)에서 setBlocks로 직접 처리
    },
    insertBlockAfter(blockId, type) {
      const el = surfaceRef.current;
      if (!el) return;
      const blockEl = el.querySelector(`[data-block-id="${blockId}"]`);
      if (!blockEl) return;
      const newEl = insertBlockAfterEl(el, blockEl, type, '');
      setCaret(newEl, 0);
      if (type === 'dialogue') onBadgeClick?.(newEl.dataset.blockId, newEl);
      doParse();
    },
    focusBlock(blockId) {
      const el = surfaceRef.current;
      if (!el) return;
      const blockEl = el.querySelector(`[data-block-id="${blockId}"]`);
      if (!blockEl) return;
      el.focus();
      setCaret(blockEl, 0);
    },
  }), [doParse, onBadgeClick, syncMeta, onBlocksChange]);

  const syncSlashPalette = useCallback((selection = window.getSelection()) => {
    const el = surfaceRef.current;
    if (!selection?.rangeCount || !el) {
      slashOffsetRef.current = null;
      onSlashClose?.();
      return false;
    }

    let blockEl = findBlockEl(selection.getRangeAt(0).startContainer, el);
    if (!blockEl) {
      const allBlocks = [...el.querySelectorAll('[data-block-id]')];
      blockEl = allBlocks[0] || null;
    }
    if (!blockEl) {
      slashOffsetRef.current = null;
      onSlashClose?.();
      return false;
    }

    const bType = blockEl.dataset.blockType;
    if (bType === 'scene_number') {
      slashOffsetRef.current = null;
      onSlashClose?.();
      return false;
    }

    const speechEl = bType === 'dialogue' ? blockEl.querySelector('.ce-speech') : null;
    const textNode = speechEl || blockEl;
    const rawText = bType === 'dialogue'
      ? (speechEl ? speechEl.innerText.replace(/\n$/, '') : blockText(blockEl))
      : blockText(blockEl);
    const range = selection.getRangeAt(0);
    let caretOffset = 0;
    try {
      const tempRange = document.createRange();
      tempRange.setStart(textNode, 0);
      tempRange.setEnd(range.startContainer, range.startOffset);
      caretOffset = tempRange.toString().length;
    } catch (_) {
      caretOffset = rawText.length;
    }

    const slashIdx = rawText.lastIndexOf('/', caretOffset - 1);
    const query = slashIdx >= 0 ? rawText.slice(slashIdx + 1, caretOffset) : null;
    if (slashIdx >= 0 && query !== null && !/\s/.test(query)) {
      slashOffsetRef.current = { blockId: blockEl.dataset.blockId, slashIdx, caretOffset };
      onSlashInput?.({ blockEl, query });
      return true;
    }

    slashOffsetRef.current = null;
    onSlashClose?.();
    return false;
  }, [onSlashClose, onSlashInput]);

  // ── Input handler ─────────────────────────────────────────────────────────
  const handleInput = useCallback((e) => {
    if (composingRef.current) return;
    if (suppressNextInputRef.current) {
      const inputType = e?.nativeEvent?.inputType || '';
      suppressNextInputRef.current = false;
      if (!inputType.startsWith('insert')) return;
    }

    // 씬연결 피커가 열려있으면 타이핑 시 자동 닫기
    onCloseSceneRef?.();

    // DOM 삽입 후 남은 <br> placeholder 정규화 (모든 블록 타입)
    {
      const selPre = window.getSelection();
      const elPre = surfaceRef.current;
      if (selPre?.rangeCount && elPre) {
        const bElPre = findBlockEl(selPre.getRangeAt(0).startContainer, elPre);
        if (bElPre) {
          const target = bElPre.dataset.blockType === 'dialogue'
            ? (bElPre.querySelector('.ce-speech') || bElPre)
            : bElPre;
          cleanupBr(target);
        }
      }
    }

    syncSceneDraftDom(surfaceRef.current);

    // "1." → 씬번호 변환 (모바일 IME 키보드는 keydown에서 '.' 키를 못 잡으므로
    // input 이벤트에서도 "숫자+마침표" 상태를 감지해 변환한다. 데스크톱은 keydown
    // 핸들러가 '.' 입력 전에 이미 변환하므로 여기 도달하지 않음.)
    {
      const selN = window.getSelection();
      const elN = surfaceRef.current;
      if (selN?.rangeCount && elN) {
        let bElN = findBlockEl(selN.getRangeAt(0).startContainer, elN);
        if (!bElN) {
          const allBlocks = [...elN.querySelectorAll('[data-block-id]')];
          bElN = allBlocks[0] || null;
        }
        const tN = bElN?.dataset.blockType;
        if (bElN && tN && tN !== 'scene_number') {
          const txtElN = tN === 'dialogue' ? (bElN.querySelector('.ce-speech') || bElN) : bElN;
          const rawN = blockText(txtElN);
          if (/^\d+\.$/.test(rawN.trim()) && caretOff(selN.getRangeAt(0), txtElN) === rawN.length) {
            slashOffsetRef.current = null;
            onSlashClose?.();
            onCharSuggest?.(null, null);
            changeBlockTypeEl(bElN, 'scene_number');
            setBlockText(bElN, '');
            setCaret(bElN, 0);
            doParse();
            return;
          }
        }
      }
    }

    doParse();

    const sel = window.getSelection();
    const el = surfaceRef.current;
    if (!sel?.rangeCount || !el) return;

    // input/textarea에 포커스가 있으면 슬래시 감지 건너뜀
    const active = document.activeElement;
    const tag = active?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (active?.isContentEditable && !el.contains(active))) {
      slashOffsetRef.current = null;
      onSlashClose?.();
      return;
    }

    const blockEl = findBlockEl(sel.getRangeAt(0).startContainer, el);

    // Slash palette: 커서 앞에 '/'가 있으면 감지 (내용 있는 블록도 지원)
    if (syncSlashPalette(sel)) {
      return; // 슬래시 메뉴 열린 동안 charSuggest 건너뜀
    }

    // CharSuggestion: check if current action block content looks like a character name
    if (blockEl?.dataset.blockType === 'action') {
      onCharSuggest?.(blockEl.dataset.blockId, blockText(blockEl));
    } else {
      onCharSuggest?.(null, null);
    }
  }, [doParse, onCharSuggest, syncSlashPalette, onSlashClose]);

  // ── KeyDown handler ───────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    // Allow Ctrl/Meta shortcuts through IME composition (e.g. Ctrl+1/2/3, Ctrl+Z)
    if (!ctrl && (composingRef.current || e.nativeEvent?.isComposing)) return;
    const sel = window.getSelection();
    const el = surfaceRef.current;
    if (!sel?.rangeCount || !el) return;
    const range = sel.getRangeAt(0);
    let blockEl = findBlockEl(range.startContainer, el);
    if (!blockEl) {
      const allBlocks = [...el.querySelectorAll('[data-block-id]')];
      blockEl = allBlocks[0] || null;
    }
    if (!blockEl) return;
    const type = blockEl.dataset.blockType;

    if (!ctrl && !e.altKey && (e.key === 'Backspace' || e.key === 'Delete') && type === 'scene_number') {
      const hasContent = blockText(blockEl).trim().length > 0;
      if (hasContent) {
        suppressSceneNormalize = true;
        sceneBackspaceScheduledRef.current = true;
        requestAnimationFrame(() => {
          sceneBackspaceScheduledRef.current = false;
          doParse();
          suppressSceneNormalize = false;
        });
      }
    }

    if (!ctrl && !e.altKey && !e.shiftKey && e.key === '.' && sel.isCollapsed && type !== 'scene_number') {
      const textEl = type === 'dialogue' ? (blockEl.querySelector('.ce-speech') || blockEl) : blockEl;
      const rawText = blockText(textEl).trim();
      const caretAtEnd = caretOff(range, textEl) === blockText(textEl).length;
      if (/^\d+$/.test(rawText) && caretAtEnd) {
        e.preventDefault();
        slashOffsetRef.current = null;
        onSlashClose?.();
        onCharSuggest?.(null, null);
        changeBlockTypeEl(blockEl, 'scene_number');
        setBlockText(blockEl, '');
        setCaret(blockEl, 0);
        doParse();
        return;
      }
    }

    if (!ctrl && !e.altKey && e.key === '/' && type !== 'scene_number') {
      requestAnimationFrame(() => {
        if (!composingRef.current) syncSlashPalette();
      });
    }

    // ── ArrowUp/Down: 빈 블록 건너뜀 방지
    // 브라우저는 <br>만 있는 빈 블록을 수직 탐색에서 건너뛰므로 직접 처리.
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !ctrl) {
      // 슬래시 팔레트가 열려있으면 빈 블록 탐색 건너뜀 → 팔레트 핸들러로 위임
      if (slashOpenRef?.current) { /* fall through to slash palette handler below */ }
      else {
      const isUp = e.key === 'ArrowUp';
      const caretRect  = range.getBoundingClientRect();
      const blockRect  = blockEl.getBoundingClientRect();
      const lineH      = parseFloat(window.getComputedStyle(blockEl).lineHeight) || 20;
      const onFirstLine = caretRect.top <= blockRect.top + lineH;
      const onLastLine  = caretRect.bottom >= blockRect.bottom - lineH;

      if (isUp && onFirstLine) {
        const prev = prevBlockEl(el, blockEl);
        if (prev) {
          const isEmpty = !blockText(prev);
          if (isEmpty) {
            // 빈 블록으로 명시적 이동
            e.preventDefault();
            setCaret(prev, 0);
            doParse();
            return;
          }
        }
      } else if (!isUp && onLastLine) {
        const next = nextBlockEl(el, blockEl);
        if (next) {
          const isEmpty = !blockText(next);
          if (isEmpty) {
            e.preventDefault();
            setCaret(next, 0);
            doParse();
            return;
          }
        }
      }
      } // end else (slashOpenRef not open)
    }

    // ── Slash palette keyboard handling
    if (slashOpenRef?.current) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        onSlashKeyNav?.(e.key);
        return;
      }
      if (!e.shiftKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        onSlashSelectIndex?.(Number(e.key) - 1);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        onSlashSelectCurrent?.();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onSlashClose?.({ restoreCaret: true, savedRange: range.cloneRange() });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        onSlashSelectCurrent?.(); // Enter = 현재 항목 선택 (줄바꿈 없음)
        return;
      }
    }

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
    if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('script:redo'));
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

    // ── Ctrl+Shift+X: 취소선 (action/dialogue 블록에서만)
    if (ctrl && e.shiftKey && e.key === 'x') {
      if (type === 'action' || type === 'dialogue') {
        e.preventDefault();
        document.execCommand('styleWithCSS', false, false);
        document.execCommand('strikeThrough', false, null);
        doParse();
      }
      return;
    }

    // ── Ctrl+Enter: 다음 형식 선택 팝업
    if (ctrl && e.key === 'Enter') {
      e.preventDefault();
      window.dispatchEvent(new Event('script:closeCharPicker'));
      if (onNextTypePick) {
        const rect = blockEl.getBoundingClientRect();
        onNextTypePick({ blockId: blockEl.dataset.blockId, currentType: type, top: rect.bottom + 4, left: rect.left });
      }
      return;
    }

    // ── action/dialogue 더블스페이스: 괄호 자동 삽입 + 커서 괄호 안으로
    if (e.key === ' ' && (type === 'action' || type === 'dialogue') && lastKeyRef.current === ' ' && !ctrl && !e.shiftKey && !composingRef.current) {
      e.preventDefault();
      lastKeyRef.current = null;
      // 앞 스페이스 하나 제거
      const selPre = window.getSelection();
      if (selPre?.rangeCount) {
        const rPre = selPre.getRangeAt(0).cloneRange();
        if (rPre.startOffset > 0) {
          rPre.setStart(rPre.startContainer, rPre.startOffset - 1);
          if (rPre.toString() === ' ') rPre.deleteContents();
        }
      }
      // '(' 삽입 후 커서 위치 저장, ')' 삽입 후 커서 복원
      document.execCommand('insertText', false, '(');
      const selParen = window.getSelection();
      const insidePos = selParen.getRangeAt(0).cloneRange();
      document.execCommand('insertText', false, ')');
      selParen.removeAllRanges();
      selParen.addRange(insidePos);
      doParse();
      return;
    }

    // ── 씬번호 블록 더블스페이스: 구분자 자동 삽입
    if (e.key === ' ' && type === 'scene_number' && lastKeyRef.current === ' ' && !ctrl && !e.shiftKey && !composingRef.current) {
      e.preventDefault();
      lastKeyRef.current = null;

      const fmt = getSceneFormat();
      const currentText = blockEl.textContent || '';
      const hasLocSep = currentText.includes(fmt.locSep.trim());

      // 앞 스페이스 하나 제거 (첫 번째 스페이스 입력분)
      const selNow = window.getSelection();
      if (selNow?.rangeCount) {
        const r = selNow.getRangeAt(0);
        // 캐럿 직전 문자가 스페이스면 삭제
        const preRange = r.cloneRange();
        preRange.collapse(true);
        if (preRange.startOffset > 0) {
          preRange.setStart(preRange.startContainer, preRange.startOffset - 1);
          if (preRange.toString() === ' ') preRange.deleteContents();
        }
      }

      if (!hasLocSep) {
        // 1차: 장소↔세부장소 구분자 삽입
        document.execCommand('insertText', false, fmt.locSep);
      } else {
        // 2차: 시간대 wrapper 삽입 + 커서를 열림/닫힘 사이로
        const open  = fmt.timeFmt === 'paren'  ? ' ('
                    : fmt.timeFmt === 'slash'  ? '/'
                    : fmt.timeFmt === 'space'  ? ' '
                    : (fmt.customTimeOpen ?? ' ');
        const close = fmt.timeFmt === 'paren'  ? ')'
                    : fmt.timeFmt === 'slash'  ? ''
                    : fmt.timeFmt === 'space'  ? ' '
                    : (fmt.customTimeClose ?? '');

        if (close) {
          document.execCommand('insertText', false, open);
          // 커서 위치 저장 후 닫힘 문자 삽입, 커서 되돌리기
          const sel2 = window.getSelection();
          const afterOpen = sel2.getRangeAt(0).cloneRange();
          document.execCommand('insertText', false, close);
          // 커서를 open과 close 사이로 복원
          sel2.removeAllRanges();
          sel2.addRange(afterOpen);
        } else {
          document.execCommand('insertText', false, open);
        }
      }

      doParse();
      return;
    }
    // 직전 키 기록 (Space 여부만 추적 — scene_number, action, dialogue)
    lastKeyRef.current = (e.key === ' ' && (type === 'scene_number' || type === 'action' || type === 'dialogue')) ? ' ' : null;

    // ── Enter: split block at caret
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      window.dispatchEvent(new Event('script:closeCharPicker'));
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
        // 삭제로 블록이 사라져 stale reference가 되면 setCaret이 첫 블록으로
        // 점프하는 부작용이 있어 조용히 종료한다 (사용자 보고: "여러 줄 삭제 후
        // 커서가 맨 위로 이동").
        if (!blockEl2 || !el.contains(blockEl2)) return;
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

    // ── Backspace at start of block: merge with previous (or delete first block)
    if (e.key === 'Backspace' && sel.isCollapsed) {
      const offset = caretOff(range, blockEl);
      // dialogue는 ce-char-badge 텍스트 길이만큼 offset이 밀려 있어
      // blockEl 기준 offset === 0이 아닌 경우도 "블록 시작"으로 처리해야 함.
      const speechEl = type === 'dialogue'
        ? (blockEl.querySelector('.ce-speech') || blockEl)
        : null;
      // 빈 대사 블록: ce-char-badge DOM 텍스트가 있어 caretOff가 0이 아닐 수 있음.
      // speechEl(= .ce-speech 또는 blockEl)의 텍스트가 비어 있으면 항상 삭제/머지 처리.
      const contentEl = speechEl || blockEl;
      const isContentEmpty = blockText(contentEl) === '';
      const atBlockStart = isContentEmpty || offset === 0
        || (speechEl !== null && speechEl !== blockEl && caretOff(range, speechEl) === 0);

      if (atBlockStart) {
        const prev = prevBlockEl(el, blockEl);
        if (!prev) {
          if (isContentEmpty) {
            // 빈 첫 블록: 뒤에 블록이 있으면 삭제
            const allBlocks = [...el.querySelectorAll('[data-block-id]')];
            if (allBlocks.length <= 1) {
              e.preventDefault();
              if (type === 'scene_number') {
                changeBlockTypeEl(blockEl, 'action');
                setCaret(blockEl, 0);
                doParse();
              }
              return;
            }
            e.preventDefault();
            const nextBlock = nextBlockEl(el, blockEl);
            blockEl.remove();
            if (nextBlock) setCaret(nextBlock, 0);
            suppressNextInputRef.current = true;
            doParse();
            return;
          }
          if (type === 'scene_number') {
            // rAF 예약 중이면 action 변환 차단 — rAF에서 처리
            if (sceneBackspaceScheduledRef.current) return;
            // 내용 있는 씬번호 첫 블록: action 변환 (씬번호 라벨만 제거, 텍스트 유지)
            e.preventDefault();
            changeBlockTypeEl(blockEl, 'action');
            setCaret(blockEl, 0);
            doParse();
            return;
          }
          // 내용 있는 기타 첫 블록: 아무것도 안 함
          return;
        }
        if (type === 'scene_number' && sceneBackspaceScheduledRef.current) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        const prevIsRich = prev.dataset.blockType === 'action' || prev.dataset.blockType === 'dialogue';
        const curIsRich  = type === 'action' || type === 'dialogue';
        if (prevIsRich || curIsRich) {
          const prevSpeech = prev.querySelector('.ce-speech') || prev;
          const curSpeech  = speechEl || blockEl;
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
        suppressNextInputRef.current = true;
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
        suppressNextInputRef.current = true;
        doParse();
        return;
      }
    }
  }, [doParse, onBadgeClick, onCharSuggest, onNextTypePick, onSlashClose, onSlashKeyNav, onSlashSelectCurrent, onSlashSelectIndex, onUndo, syncSlashPalette]);

  // ── Click: dialogue 블록 클릭 시 인물명(::before 영역) 클릭이면 피커 열기
  const handleClick = useCallback((e) => {
    lastKeyRef.current = null;
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
        '--line-height': lineHeight,
        outline: 'none',
        '--dialogue-gap':      dialogueGap || '7em',
        '--action-indent':    `${(blockStyles?.action?.indent    ?? 1) * 8}mm`,
        '--scene-indent':     `${(blockStyles?.sceneNumber?.indent ?? 0) * 8}mm`,
        '--dialogue-indent':  `${(blockStyles?.dialogue?.indent   ?? 0) * 8}mm`,
        '--scene-bold':       blockStyles?.sceneNumber?.bold !== false ? 'bold' : 'normal',
        '--scene-italic':     blockStyles?.sceneNumber?.italic ? 'italic' : 'normal',
        '--scene-underline':  blockStyles?.sceneNumber?.underline ? 'underline' : 'none',
        '--action-bold':      blockStyles?.action?.bold ? 'bold' : 'normal',
        '--action-italic':    blockStyles?.action?.italic ? 'italic' : 'normal',
        '--action-underline': blockStyles?.action?.underline ? 'underline' : 'none',
        '--charname-bold':    blockStyles?.charName?.bold !== false ? 'bold' : 'normal',
        '--charname-italic':  blockStyles?.charName?.italic ? 'italic' : 'normal',
        '--charname-underline': blockStyles?.charName?.underline ? 'underline' : 'none',
        '--dialogue-bold':    blockStyles?.dialogue?.bold ? 'bold' : 'normal',
        '--dialogue-italic':  blockStyles?.dialogue?.italic ? 'italic' : 'normal',
        '--dialogue-underline': blockStyles?.dialogue?.underline ? 'underline' : 'none',
        '--scene-tab-width':  `${(stylePreset?.sceneHeaderTabWidth ?? 2) * 2}em`,
        caretColor: 'var(--c-accent)',
      }}
      className={`ce-surface${stylePreset?.sceneHeaderLayout === 'tabbed' ? ' scene-header-tabbed' : ''}${stylePreset?.dialogueLayout === 'hollywood' ? ' dialogue-hollywood' : ''}`}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={() => { composingRef.current = false; doParse(); }}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onClick={(e) => { handleClick(e); doParse(); }}
      onBlur={() => { lastKeyRef.current = null; }}
      onPaste={onPaste}
      onCopy={onCopy}
    />
  );
});

// ─── AnnotationLayer ─────────────────────────────────────────────────────────
// 모든 주석(position 무관)을 블록 바로 뒤 contenteditable="false" placeholder에
// createPortal로 렌더링 → 문서 흐름에 참여해 이후 블록과 겹치지 않음.
function AnnotationLayer({ blocks, onAnnotationsChange }) {
  const placeholderMap = useRef({}); // blockId → placeholder div
  const [tick, setTick] = useState(0); // force re-render after placeholders are created

  useLayoutEffect(() => {
    const surface = document.querySelector('[data-editor-surface]');
    if (!surface) return;

    // 주석이 있는 블록의 DOM 요소 수집
    const needPlaceholder = new Map(); // blockId → blockEl
    for (const b of blocks) {
      if (!b.annotations?.some(a => a.note?.trim())) continue;
      const el = surface.querySelector(`[data-block-id="${b.id}"]`);
      if (el) needPlaceholder.set(b.id, el);
    }

    // 불필요해진 placeholder 제거
    for (const id of Object.keys(placeholderMap.current)) {
      if (!needPlaceholder.has(id)) {
        try { placeholderMap.current[id].remove(); } catch {}
        delete placeholderMap.current[id];
      }
    }

    // placeholder 생성 / 재연결 / 위치 교정
    let changed = false;
    for (const [id, blockEl] of needPlaceholder) {
      let ph = placeholderMap.current[id];
      if (!ph || !ph.isConnected) {
        ph = document.createElement('div');
        ph.setAttribute('contenteditable', 'false');
        ph.setAttribute('data-annotation-ui', '');
        ph.setAttribute('data-ann-host', id);
        placeholderMap.current[id] = ph;
        changed = true;
      }
      if (blockEl.nextSibling !== ph) {
        blockEl.after(ph);
        changed = true;
      }
    }
    if (changed) setTick(t => t + 1);
  }, [blocks]);

  // Cleanup on unmount
  useEffect(() => () => {
    for (const ph of Object.values(placeholderMap.current)) {
      try { ph.remove(); } catch {}
    }
  }, []);

  const annotated = blocks.filter(b => b.annotations?.some(a => a.note?.trim()));
  if (!annotated.length) return null;

  return annotated.map(b => {
    const ph = placeholderMap.current[b.id];
    if (!ph?.isConnected) return null;

    const callbacks = {
      onUpdate: (annId, note) => onAnnotationsChange(b.id,
        b.annotations.map(a => a.id === annId ? { ...a, note, updatedAt: now() } : a)
      ),
      onDelete: (annId) => onAnnotationsChange(b.id,
        b.annotations.filter(a => a.id !== annId)
      ),
    };

    return createPortal(
      <div data-annotation-ui>
        <BlockAnnotations annotations={b.annotations} {...callbacks} />
      </div>,
      ph,
      `ann-${b.id}`
    );
  });
}

// ─── MemoViewPopover ─────────────────────────────────────────────────────────
function MemoViewPopover({ sceneId, memos, top, left, onDelete, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      data-annotation-ui
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: Math.min(top, (window.visualViewport?.height ?? window.innerHeight) - 300),
        left: Math.max(8, Math.min(left, window.innerWidth - 296)),
        zIndex: 200,
        background: 'var(--c-bg-card, #fff)',
        border: '1px solid var(--c-border2)',
        borderRadius: 10,
        boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: 280,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 360,
        overflowY: 'auto',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text4)' }}>
        메모 {memos.length}개
      </div>
      {memos.map(memo => (
        <div key={memo.id} style={{
          borderRadius: 6,
          background: 'var(--c-bg)',
          padding: '6px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          {memo.quoted_text && (
            <div style={{
              fontSize: 11, color: 'var(--c-text4)',
              borderLeft: '3px solid var(--c-accent)',
              paddingLeft: 8, lineHeight: 1.5,
              overflow: 'hidden', display: '-webkit-box',
              WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
            }}>{memo.quoted_text}</div>
          )}
          <div style={{ fontSize: 13, color: 'var(--c-text1)', lineHeight: 1.6 }}>
            {memo.content}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
            <button
              onClick={() => onDelete(memo.id, sceneId)}
              style={{
                fontSize: 11, padding: '2px 8px',
                border: '1px solid var(--c-border2)', borderRadius: 5,
                background: 'transparent', color: '#e05c5c', cursor: 'pointer',
              }}
            >삭제</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── MemoGutterLayer ─────────────────────────────────────────────────────────
// scene_number 블록 오른쪽 gutter에 메모 수 뱃지를 position:fixed로 표시.
// DOM 주입 없이 getBoundingClientRect + 스크롤 추적으로 위치 동기화 →
// AnnotationLayer placeholder와 DOM 순서 충돌 없음.
function MemoGutterLayer({ blocks, episodeId, refreshToken, scrollRef }) {
  const [memosByScene, setMemosByScene] = useState({});
  const [badgeRects, setBadgeRects] = useState([]);
  const [popover, setPopover] = useState(null); // null | { sceneId, top, left }

  useEffect(() => {
    if (!episodeId) { setMemosByScene({}); return; }
    let cancelled = false;
    getAll('script_memos_' + episodeId).then(memos => {
      if (cancelled) return;
      const grouped = {};
      for (const m of (memos || [])) {
        const key = m.scene_id || '__no_scene__';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(m);
      }
      setMemosByScene(grouped);
    });
    return () => { cancelled = true; };
  }, [episodeId, refreshToken]);

  useEffect(() => { setPopover(null); }, [episodeId]);

  const computeRects = useCallback(() => {
    const surface = document.querySelector('[data-editor-surface]');
    if (!surface) return;
    const rects = [];
    for (const b of blocks) {
      if (b.type !== 'scene_number' || !b.sceneId) continue;
      const el = surface.querySelector(`[data-block-id="${b.id}"]`);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height > 0) rects.push({ blockId: b.id, sceneId: b.sceneId, rect });
    }
    setBadgeRects(rects);
  }, [blocks]);

  useLayoutEffect(() => { computeRects(); }, [computeRects]);

  useEffect(() => {
    const el = scrollRef?.current;
    window.addEventListener('resize', computeRects);
    el?.addEventListener('scroll', computeRects, { passive: true });
    return () => {
      window.removeEventListener('resize', computeRects);
      el?.removeEventListener('scroll', computeRects);
    };
  }, [computeRects, scrollRef]);

  const handleDelete = async (memoId, sceneId) => {
    const existing = await getAll('script_memos_' + episodeId);
    await setAll('script_memos_' + episodeId, existing.filter(m => m.id !== memoId));
    if ((memosByScene[sceneId] || []).length <= 1) setPopover(null);
    setMemosByScene(prev => {
      const key = sceneId || '__no_scene__';
      const updated = (prev[key] || []).filter(m => m.id !== memoId);
      const next = { ...prev };
      if (updated.length) next[key] = updated; else delete next[key];
      return next;
    });
  };

  const visible = badgeRects.filter(({ sceneId }) => (memosByScene[sceneId] || []).length > 0);
  if (!visible.length && !popover) return null;

  return createPortal(
    <>
      {visible.map(({ blockId, sceneId, rect }) => {
        const count = (memosByScene[sceneId] || []).length;
        const isOpen = popover?.sceneId === sceneId;
        return (
          <button
            key={blockId}
            data-annotation-ui
            onClick={e => {
              e.stopPropagation();
              setPopover(isOpen ? null : {
                sceneId,
                top: rect.bottom + 4,
                left: Math.min(rect.left, window.innerWidth - 296),
              });
            }}
            style={{
              position: 'fixed',
              top: rect.top + Math.round((rect.height - 22) / 2),
              right: Math.max(4, window.innerWidth - rect.right + 4),
              zIndex: 10,
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 7px',
              border: `1px solid ${isOpen ? 'var(--c-accent)' : 'var(--c-border2)'}`,
              borderRadius: 10,
              background: isOpen ? 'var(--c-accent)' : 'var(--c-bg-card, #fff)',
              color: isOpen ? '#fff' : 'var(--c-text4)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              lineHeight: 1.4,
              pointerEvents: 'auto',
            }}
          >
            메 {count}
          </button>
        );
      })}
      {popover && (
        <>
          <div
            data-annotation-ui
            style={{ position: 'fixed', inset: 0, zIndex: 9 }}
            onMouseDown={() => setPopover(null)}
          />
          <MemoViewPopover
            sceneId={popover.sceneId}
            memos={memosByScene[popover.sceneId] || []}
            top={popover.top}
            left={popover.left}
            onDelete={handleDelete}
            onClose={() => setPopover(null)}
          />
        </>
      )}
    </>,
    document.body
  );
}

// ─── ScriptEditor (main) ──────────────────────────────────────────────────────
export default function ScriptEditor({ scrollToSceneId, onScrollHandled, keyboardUp, isMobile, onScrollRefReady, focusMode, setFocusMode }) {
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
  const episodeTitleRef = useRef(null);
  // Refs for unmount-flush and episode-switch flush (always up-to-date)
  const blocksRef = useRef([]);
  const activeEpisodeIdRef = useRef(null);
  const activeProjectIdRef = useRef(null);
  const scenesRef = useRef([]);
  const prevEpisodeIdRef = useRef(null);
  // pagehide 후 다음 진입 시 1회만 emergency_backup 복구 시도
  const recoveryAttemptedRef = useRef(false);
  const [charPickerState, setCharPickerState] = useState(null); // { blockId, top, left, fromDialogue?, savedRange? }
  const [charPickerNoSel, setCharPickerNoSel] = useState(null); // { top, left } — 선택안함 표시
  const [nextTypePicker, setNextTypePicker] = useState(null); // { blockId, top, left, onSelect } — 다음 형식 선택
  const [charSuggestState, setCharSuggestState] = useState(null); // { blockId, blockEl, charName }
  const [annPopover, setAnnPopover] = useState(null); // null | { blockId, selectedText, position: {x,y} }
  const [annMiniBar, setAnnMiniBar] = useState(null); // null | { blockId, selectedText, position: {x,y} } — 선택 시 작은 툴바
  const [suggestEnabled, setSuggestEnabled] = useState(() => localStorage.getItem(CHAR_SUGGEST_KEY) !== 'off');
  const suppressCharPickerOpenUntilRef = useRef(0);
  const [pasteToast, setPasteToast] = useState(null);
  const [sceneRefPicker, setSceneRefPicker] = useState(null); // { top, left, insertAfterId, mobile }
  const [sceneRefActiveIdx, setSceneRefActiveIdx] = useState(-1);
  const sceneRefActiveIdxRef = useRef(-1);
  const sceneItemsRef = useRef([]); // render마다 갱신 — keydown 핸들러에서 참조
  const [pendingBlockType, setPendingBlockType] = useState(null); // for mobile / no-focus toolbar clicks
  const [activeBlockType, setActiveBlockType] = useState(null);  // 현재 커서의 블록 타입 (툴바 하이라이트)
  const [charCheckPicker, setCharCheckPicker] = useState(null); // { sceneId, top, left, mobile }
  const [symbolPickerCloseToken, setSymbolPickerCloseToken] = useState(0);
  const [slashPalette, setSlashPalette] = useState(null); // null | { blockEl, query, x, y, selectedIdx }
  const [slashSymbolPos, setSlashSymbolPos] = useState(null); // null | { top, left } — 슬래시에서 기타 피커 강제 오픈
  const [slashTagPicker, setSlashTagPicker] = useState(null); // legacy (구버전 호환)
  const [slashEmotionPicker, setSlashEmotionPicker] = useState(null); // 🎭 버튼 전용 (3단계)
  const [slashUnifiedTag, setSlashUnifiedTag] = useState(null); // null | { blockId, sceneId, top, left }
  const [memoInputState, setMemoInputState] = useState(null); // null | { top, left, sceneId, quotedText, savedRange }
  const [memoRefreshToken, setMemoRefreshToken] = useState(0);
  // UnifiedTagPicker의 emotion/custom 항목 클릭은 onOpenFullPicker(); onClose(); 두 콜백을
  // 같은 mousedown에서 연속 호출. 이때 onClose 내 restoreEditorSelection이 EmotionTagPicker의
  // 마운트 직후 focus를 강탈해 picker 동작을 방해 → ref 플래그로 전환 시 onClose의 caret 복원만 스킵.
  const skipUnifiedTagRestoreRef = useRef(false);
  const slashOpenRef = useRef(false);
  slashOpenRef.current = slashPalette !== null; // 매 렌더마다 ref 동기화
  // 슬래시 흐름의 모든 picker가 닫히면 anchor ref 초기화 (다음 슬래시 흐름 위해).
  // picker.onSelect의 collapseAndPushFinal는 ref 값을 사용한 후 setPicker(null) 호출 →
  // 이 effect가 다음 사이클에 ref 초기화. cancel(외부 클릭/ESC) 흐름도 동일.
  useEffect(() => {
    if (!slashPalette && !slashEmotionPicker && !slashUnifiedTag) {
      slashAnchorIdxRef.current = null;
    }
  }, [slashPalette, slashEmotionPicker, slashUnifiedTag]);
  const slashPaletteRef = useRef(null);
  slashPaletteRef.current = slashPalette; // executeSlashAction 클로저에서 최신 query 접근용
  const slashSelectionRef = useRef(null);
  const hasKeyboard = !!keyboardUp; // App.jsx에서 내려온 키보드 감지값 사용
  // shortcutHintOpen 제거 — 항상 펼쳐진 상태로 표시
  useEffect(() => {
    const handleCloseCharPicker = () => setCharPickerState(null);
    window.addEventListener('script:closeCharPicker', handleCloseCharPicker);
    return () => window.removeEventListener('script:closeCharPicker', handleCloseCharPicker);
  }, []);
  const charCheckBtnRef = useRef(null);
  const editorScrollRef = useRef(null);
  useEffect(() => { if (onScrollRefReady) onScrollRefReady(editorScrollRef); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Undo / Redo 스택 ────────────────────────────────────────────────────────
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const undoActive = useRef(false);
  const undoPushTimer = useRef(null);
  // 슬래시 picker 흐름의 anchor 인덱스. 슬래시 처음 감지 시점에 "다음 push될 인덱스"를
  // 기억해두고, picker.onSelect 시 anchor 이후(=슬래시/단어 입력의 디바운스 push 모두) collapse.
  // → "슬래시→단어→감정선택" 전체가 1 undo 단위로 묶임.
  const slashAnchorIdxRef = useRef(null);
  const isSavingRef = useRef(false); // SET_SAVE_STATUS 중복 dispatch 방지
  // Mount 직후 첫 debounced save effect 실행에서는 'saving' dispatch 스킵.
  // 이유: load effect가 setBlocks(loaded) 직후 deps[blocks]가 변경되어 effect가 fire하지만
  // 실제 사용자 편집은 없음(같은 데이터 재로드). 이 첫 fire에서 'saving' 띄우면 창 크기 변동 등 리마운트마다 깜빡.
  const firstRunAfterMount = useRef(true);
  useEffect(() => {
    if (undoActive.current) return;
    clearTimeout(undoPushTimer.current);
    undoPushTimer.current = setTimeout(() => {
      const serialized = JSON.stringify(blocks);
      const last = undoStack.current[undoStack.current.length - 1];
      if (last !== serialized) {
        undoStack.current.push(serialized);
        if (undoStack.current.length > 20) undoStack.current.shift();
        redoStack.current = []; // 새 변경 → redo 스택 초기화
        window.dispatchEvent(new CustomEvent('scriptundostate', {
          detail: { canUndo: undoStack.current.length > 1, canRedo: false },
        }));
      }
    }, 1000);
    return () => clearTimeout(undoPushTimer.current);
  }, [blocks]);

  // 변경된 첫 블록을 찾아 scroll + flash 피드백
  const flashChangedBlock = useCallback((prevBlocks, nextBlocks) => {
    let changedId = null;
    for (let i = 0; i < Math.max(prevBlocks.length, nextBlocks.length); i++) {
      if (!prevBlocks[i] || !nextBlocks[i] || prevBlocks[i].content !== nextBlocks[i].content) {
        changedId = nextBlocks[i]?.id ?? nextBlocks[nextBlocks.length - 1]?.id;
        break;
      }
    }
    if (!changedId || !editorScrollRef.current) return;
    requestAnimationFrame(() => {
      const surface = editorScrollRef.current?.querySelector('[data-editor-surface]');
      const blockEl = surface?.querySelector(`[data-block-id="${changedId}"]`);
      if (!blockEl) return;
      blockEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      blockEl.classList.add('ce-undo-flash');
      setTimeout(() => blockEl.classList.remove('ce-undo-flash'), 700);
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length <= 1) return;
    const currentSerialized = undoStack.current[undoStack.current.length - 1];
    redoStack.current.push(currentSerialized);
    if (redoStack.current.length > 20) redoStack.current.shift();
    undoStack.current.pop();
    const prev = undoStack.current[undoStack.current.length - 1];
    if (!prev) { redoStack.current.pop(); return; }
    undoActive.current = true;
    let currentBlocks, restored;
    try { currentBlocks = JSON.parse(currentSerialized); } catch { undoActive.current = false; return; }
    try { restored = JSON.parse(prev); } catch { undoActive.current = false; return; }
    // setBlocks → loadBlocks 과정에서 surface가 contentEditable을 다시 그리며
    // scrollTop을 0으로 리셋하는 경우가 있어 사용자가 보던 위치가 사라짐.
    // 직전 scroll 위치를 저장해두고, flashChangedBlock가 변경 블록을 못 찾을 때
    // 최소 보던 위치는 유지되도록 폴백.
    const scrollContainer = editorScrollRef.current;
    const savedScrollTop = scrollContainer?.scrollTop ?? 0;
    setBlocks(restored);
    // 전역 state.scriptBlocks 동기화 — 우측 패널 chip 등 다른 뷰가 stale 안 되도록.
    // SET_BLOCKS는 AUTO_RECORD에 없어 전역 history에 entry 안 만듦 → redo 흐름 안전.
    dispatch({ type: 'SET_BLOCKS', episodeId: activeEpisodeId, payload: restored });
    requestAnimationFrame(() => {
      surfaceApiRef.current?.loadBlocks(restored);
      if (scrollContainer) scrollContainer.scrollTop = savedScrollTop;
      undoActive.current = false;
      flashChangedBlock(currentBlocks, restored);
      window.dispatchEvent(new CustomEvent('scriptundostate', {
        detail: { canUndo: undoStack.current.length > 1, canRedo: redoStack.current.length > 0 },
      }));
    });
  }, [flashChangedBlock, dispatch, activeEpisodeId]);

  const handleRedo = useCallback(() => {
    if (!redoStack.current.length) return;
    const next = redoStack.current.pop();
    const currentSerialized = undoStack.current[undoStack.current.length - 1];
    undoStack.current.push(next);
    if (undoStack.current.length > 20) undoStack.current.shift();
    undoActive.current = true;
    let currentBlocks, restored;
    try { currentBlocks = currentSerialized ? JSON.parse(currentSerialized) : []; } catch { currentBlocks = []; }
    try { restored = JSON.parse(next); } catch { undoActive.current = false; return; }
    const scrollContainer = editorScrollRef.current;
    const savedScrollTop = scrollContainer?.scrollTop ?? 0;
    setBlocks(restored);
    dispatch({ type: 'SET_BLOCKS', episodeId: activeEpisodeId, payload: restored });
    requestAnimationFrame(() => {
      surfaceApiRef.current?.loadBlocks(restored);
      if (scrollContainer) scrollContainer.scrollTop = savedScrollTop;
      undoActive.current = false;
      flashChangedBlock(currentBlocks, restored);
      window.dispatchEvent(new CustomEvent('scriptundostate', {
        detail: { canUndo: undoStack.current.length > 1, canRedo: redoStack.current.length > 0 },
      }));
    });
  }, [flashChangedBlock, dispatch, activeEpisodeId]);

  // ── Annotation handlers ───────────────────────────────────────────────────
  const handleAnnotationsChange = useCallback((blockId, nextAnnotations) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, annotations: nextAnnotations } : b));
  }, []);

  const handleAnnotationMouseUp = useCallback((e) => {
    if (e.target.closest('[data-annotation-ui]')) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const selectedText = sel.toString().trim();
    if (!selectedText) return;
    const range = sel.getRangeAt(0);
    const surface = document.querySelector('[data-editor-surface]');
    if (!surface) return;
    const anchor = range.commonAncestorContainer;
    const blockEl = (anchor.nodeType === 1 ? anchor : anchor.parentElement)
      ?.closest('[data-block-id]');
    if (!blockEl || !surface.contains(blockEl)) return;
    const rect = range.getBoundingClientRect();
    // 즉시 주석 폼 대신 미니 툴바 표시 — 복사와 주석 달기를 분리
    setAnnMiniBar({
      blockId: blockEl.dataset.blockId,
      selectedText,
      position: { x: rect.left, y: rect.bottom + 6 },
    });
  }, []);

  // anchor 인덱스부터 모두 제거하고 최종 상태 1개 push.
  // 슬래시 감정 태그 같이 "한 작가 액션 = 1 undo 단위"로 묶어야 할 때 사용.
  // anchor 자체도 제거 → undo 1회로 슬래시 직전 안정 snap으로 복귀.
  const collapseAndPushFinal = useCallback((anchorIdx, finalBlocks) => {
    clearTimeout(undoPushTimer.current);
    if (typeof anchorIdx === 'number' && anchorIdx >= 0 && anchorIdx <= undoStack.current.length) {
      undoStack.current.splice(anchorIdx);
    }
    const serialized = JSON.stringify(finalBlocks);
    const last = undoStack.current[undoStack.current.length - 1];
    if (last !== serialized) {
      undoStack.current.push(serialized);
      if (undoStack.current.length > 20) undoStack.current.shift();
      redoStack.current = [];
    }
    window.dispatchEvent(new CustomEvent('scriptundostate', {
      detail: { canUndo: undoStack.current.length > 1, canRedo: redoStack.current.length > 0 },
    }));
  }, []);

  // Keep refs in sync every render so unmount-flush sees latest values
  blocksRef.current = blocks;
  activeEpisodeIdRef.current = activeEpisodeId;
  activeProjectIdRef.current = activeProjectId;
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

  // ── 포맷 변경 시 로컬 blocks 재조합 (에디터 화면 즉시 반영)
  // SceneFormatSync(App 레벨)가 AppContext를 업데이트하지만,
  // ScriptEditor는 로컬 state를 가지므로 별도로 rebuild 필요
  // 포맷 변경 시 loadBlocks 재호출 → blockDisplayContent가 getSceneFormat()으로 즉시 재조합
  useEffect(() => {
    const handler = () => {
      requestAnimationFrame(() => surfaceApiRef.current?.loadBlocks(blocksRef.current));
    };
    window.addEventListener('scene_format_changed', handler);
    return () => window.removeEventListener('scene_format_changed', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      // 이전 화 스크롤 위치 저장
      const prevScroll = editorScrollRef.current?.scrollTop;
      if (prevScroll != null) {
        try { localStorage.setItem(`drama_scroll_ep_${prevEpId}`, prevScroll); } catch {}
      }
    }
    prevEpisodeIdRef.current = activeEpisodeId;

    const epBlocks = scriptBlocks.filter(b => b.episodeId === activeEpisodeId);
    const raw = epBlocks.length > 0
      ? epBlocks
      : [{ id: genId(), episodeId: activeEpisodeId, projectId: activeProjectId,
           type: 'action', content: '', label: '', createdAt: now(), updatedAt: now(),
           annotations: [] }];
    // scene_number 블록 content가 비어있으면 씬 structured 필드에서 재파생
    // annotations 필드가 없는 구 블록에 [] 로 마이그레이션
    const loaded = normalizeEmptySceneNumberBlocks(raw.map(b => {
      const withAnnotations = b.annotations != null ? b : { ...b, annotations: [] };
      if (withAnnotations.type === 'scene_number' && withAnnotations.sceneId && !withAnnotations.content) {
        const scene = scenes.find(s => s.id === withAnnotations.sceneId);
        if (scene) {
          const derived = resolveSceneLabel({ ...scene, label: '' });
          if (derived) return { ...withAnnotations, content: derived };
        }
      }
      return withAnnotations;
    }));
    setBlocks(loaded);
    lastSavedBlocks.current = JSON.stringify(loaded);
    // 회차 진입 시: 저장된 스크롤 위치가 있으면 복원, 없으면 마지막 블록으로
    const epId = activeEpisodeId;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        let restored = false;
        try {
          const saved = localStorage.getItem(`drama_scroll_ep_${epId}`);
          if (saved != null && editorScrollRef.current) {
            editorScrollRef.current.scrollTop = parseInt(saved, 10) || 0;
            restored = true;
          }
        } catch {}
        if (!restored) surfaceApiRef.current?.focusEnd();
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEpisodeId, initialized]);

  // ── emergency_backup 복구 — pagehide 핸들러가 IME/디바운스 잔여분을 localStorage에
  //    동기로 백업한 게 있으면, 다음 진입 시 IndexedDB 시각과 비교해 자동 복구.
  //    충돌 시 정책: 백업이 IndexedDB의 max(updatedAt)보다 1초 이상 새것일 때만
  //    덮어쓰기. 그 외(backup이 더 오래된 경우, 사용자가 다른 기기에서 작업해
  //    state가 더 신선한 경우)는 백업 폐기. 이중 안전장치: 7일 이상 묵은 백업도 폐기.
  useEffect(() => {
    if (recoveryAttemptedRef.current) return;
    if (!activeEpisodeId || !initialized) return;

    let raw;
    try { raw = localStorage.getItem('drama_emergency_backup'); } catch { return; }
    if (!raw) return;

    let backup;
    try { backup = JSON.parse(raw); }
    catch {
      try { localStorage.removeItem('drama_emergency_backup'); } catch {}
      return;
    }
    if (!backup?.episodeId || !Array.isArray(backup.blocks) || !backup.ts) {
      try { localStorage.removeItem('drama_emergency_backup'); } catch {}
      return;
    }

    // 7일 초과 — episode가 삭제됐거나 잊혀진 백업. 폐기.
    if (Date.now() - backup.ts > 7 * 24 * 60 * 60 * 1000) {
      try { localStorage.removeItem('drama_emergency_backup'); } catch {}
      return;
    }

    // 다른 episode의 백업이면 그대로 두기 — 사용자가 그 episode를 열 때 처리.
    if (backup.episodeId !== activeEpisodeId) return;

    // 이번 episode의 백업 — 1회만 시도.
    recoveryAttemptedRef.current = true;

    const currentEpBlocks = scriptBlocks.filter(b => b.episodeId === activeEpisodeId);
    const currentMaxUpdate = currentEpBlocks.reduce(
      (max, b) => Math.max(max, b.updatedAt || 0), 0
    );

    // 백업이 1초 이상 새것이어야 적용 (race condition 방지).
    if (backup.ts <= currentMaxUpdate + 1000) {
      try { localStorage.removeItem('drama_emergency_backup'); } catch {}
      return;
    }

    // 복구.
    dispatch({ type: 'SET_BLOCKS', episodeId: activeEpisodeId, payload: backup.blocks });
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
    try { localStorage.removeItem('drama_emergency_backup'); } catch {}

    setPasteToast('이전 세션의 마지막 변경분을 복구했습니다');
    setTimeout(() => setPasteToast(null), 4000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEpisodeId, initialized, scriptBlocks]);

  useEffect(() => {
    const isAsciiPrintable = (key) => key.length === 1 && /^[\x20-\x7E]$/.test(key);
    const shouldRouteTypingToEditor = (e) => {
      if (e.defaultPrevented) return false;
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (e.isComposing || e.key === 'Process') return false;
      const active = document.activeElement;
      const tag = active?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || active?.isContentEditable) return false;
      return e.key.length === 1;
    };

    const onKeyDownCapture = (e) => {
      if (!shouldRouteTypingToEditor(e)) return;
      if (!surfaceApiRef.current) return;
      const surface = document.querySelector('[data-editor-surface]');
      if (!surface) return;
      if (surface.contains(e.target) || e.target === surface) return;

      if (isAsciiPrintable(e.key)) {
        e.preventDefault();
        surfaceApiRef.current.focusEnd();
        requestAnimationFrame(() => {
          const activeSurface = document.querySelector('[data-editor-surface]');
          if (!activeSurface) return;
          activeSurface.focus();
          document.execCommand('insertText', false, e.key);
        });
        return;
      }

      surfaceApiRef.current.focusEnd();
    };

    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  }, []);

  // ── External block injection (e.g. IMPORT_TREATMENT_TO_SCRIPT)
  useEffect(() => {
    if (!pendingScriptReload || pendingScriptReload !== activeEpisodeId) return;
    const epBlocksRaw = scriptBlocks.filter(b => b.episodeId === activeEpisodeId);
    if (!epBlocksRaw.length) return;
    const epBlocks = normalizeEmptySceneNumberBlocks(epBlocksRaw.map(b => {
      if (b.type === 'scene_number' && b.sceneId && !b.content) {
        const scene = scenes.find(s => s.id === b.sceneId);
        if (scene) {
          const derived = resolveSceneLabel({ ...scene, label: '' });
          if (derived) return { ...b, content: derived };
        }
      }
      return b;
    }));
    const labelledBlocks = syncLabels(epBlocks);
    lastSavedBlocks.current = JSON.stringify(labelledBlocks);
    setBlocks(labelledBlocks);
    requestAnimationFrame(() => surfaceApiRef.current?.loadBlocks(labelledBlocks));
    dispatch({ type: 'CLEAR_PENDING_RELOAD' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingScriptReload]);

  // ── Debounced save + scene sync
  // 최적화: JSON.stringify는 타이머 안에서만, dispatch('saving')는 1회만 → 매 키입력 25컴포넌트 리렌더 방지
  useEffect(() => {
    if (!activeEpisodeId || !blocks.length) return;
    // 마운트 직후 첫 fire는 load effect의 setBlocks 결과 — 사용자 편집 아님. 스킵.
    if (firstRunAfterMount.current) {
      firstRunAfterMount.current = false;
      return;
    }
    if (!isSavingRef.current) {
      isSavingRef.current = true;
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
    }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const currentBlocks = blocksRef.current;
      const serialized = JSON.stringify(currentBlocks);
      if (serialized === lastSavedBlocks.current) {
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
        isSavingRef.current = false;
        return;
      }
      const currentScenes = scenesRef.current;
      const sceneBlocks = currentBlocks.filter(b => b.type === 'scene_number');
      const sceneMapForSave = new Map(currentScenes.map(s => [s.id, s]));
      const updatedScenes = sceneBlocks.map((b, idx) => {
        const existing = sceneMapForSave.get(b.sceneId);
        return {
          ...(existing || {}),
          id: b.sceneId || existing?.id || genId(),
          episodeId: activeEpisodeId, projectId: activeProjectId,
          sceneSeq: idx + 1, label: buildSceneLabel(idx + 1),
          status: existing?.status || 'draft',
          tags: existing?.tags || [], characters: existing?.characters || [],
          characterIds: existing?.characterIds || [],
          content: b.content,
          location:          existing?.location          ?? '',
          subLocation:       existing?.subLocation       ?? '',
          timeOfDay:         existing?.timeOfDay         ?? '',
          specialSituation:  existing?.specialSituation  ?? '',
          sourceTreatmentItemId: existing?.sourceTreatmentItemId ?? null,
          sceneListContent:  existing?.sceneListContent  ?? '',
          createdAt: existing?.createdAt || now(), updatedAt: now(),
        };
      });
      dispatch({ type: 'SET_BLOCKS', episodeId: activeEpisodeId, payload: currentBlocks });
      dispatch({ type: 'SYNC_SCENES', episodeId: activeEpisodeId, payload: updatedScenes, removeOrphans: true });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
      lastSavedBlocks.current = serialized;
      isSavingRef.current = false;
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [blocks, activeEpisodeId]);

  // ── Unmount flush: prevent data loss when user navigates away before debounce fires
  useEffect(() => {
    return () => {
      const epId = activeEpisodeIdRef.current;
      if (!epId) return;

      // 스크롤 위치 저장 (페이지 재진입 시 복원용)
      const scrollTop = editorScrollRef.current?.scrollTop;
      if (scrollTop != null) {
        try { localStorage.setItem(`drama_scroll_ep_${epId}`, scrollTop); } catch {}
      }

      // IME 조합 중 이탈 대비: DOM에서 직접 최신 blocks 추출 (ref보다 신선)
      let currentBlocks = null;
      try {
        surfaceApiRef.current?.blurSurface?.(); // IME 강제 commit
        currentBlocks = surfaceApiRef.current?.parseToBlocks?.() ?? null;
      } catch {}
      if (!currentBlocks?.length) currentBlocks = blocksRef.current;
      if (!currentBlocks?.length) return;

      const serialized = JSON.stringify(currentBlocks);
      // 변경 없으면 dispatch 스킵 — editor:flush 핸들러와 동일 패턴.
      // 창 크기 변동 등으로 unmount될 때 SET_BLOCKS가 새 reference 만들어 자동저장 effect를 깨우는 것을 방지.
      if (serialized === lastSavedBlocks.current) return;
      clearTimeout(saveTimer.current);
      const currentScenes = scenesRef.current;
      const sceneBlocks = currentBlocks.filter(b => b.type === 'scene_number');
      const updatedScenes = sceneBlocks.map((b, idx) => {
        const existing = currentScenes.find(s => s.id === b.sceneId);
        return {
          ...(existing || {}),
          id: b.sceneId || existing?.id || genId(),
          episodeId: epId, projectId: b.projectId,
          sceneSeq: idx + 1, label: buildSceneLabel(idx + 1),
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
      dispatch({ type: 'SYNC_SCENES', episodeId: epId, payload: updatedScenes, removeOrphans: true });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
      lastSavedBlocks.current = serialized;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── editor:flush event — immediately sync local blocks to global state
  // Fired by App.jsx before opening the print modal to prevent stale preview
  useEffect(() => {
    const handler = () => {
      const epId = activeEpisodeIdRef.current;
      const currentBlocks = blocksRef.current;
      if (!epId || !currentBlocks.length) return;
      const serialized = JSON.stringify(currentBlocks);
      if (serialized === lastSavedBlocks.current) return; // no change
      clearTimeout(saveTimer.current);
      dispatch({ type: 'SET_BLOCKS', episodeId: epId, payload: currentBlocks });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
      lastSavedBlocks.current = serialized;
    };
    window.addEventListener('editor:flush', handler);
    return () => window.removeEventListener('editor:flush', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── pagehide flush — protect the last 800ms of typing on full reload,
  // tab close, or mobile background entry. Use pagehide instead of beforeunload
  // — beforeunload is unreliable on mobile (iOS Safari rarely fires it on
  // backgrounding).
  //
  // 핵심 우회: handleInput은 IME 조립 중(composingRef.current)이면 early-return
  // 하므로 blocksRef.current가 마지막 한국어 글자를 못 받는 경우가 있음.
  // → blur로 IME 강제 commit 시도 + parseSurface로 DOM 직접 추출(state/ref 우회).
  // IndexedDB write는 async라 페이지 navigate에 따라잡힐 수 있어 localStorage
  // 비상 백업도 동기로 같이 기록.
  useEffect(() => {
    const handler = () => {
      const epId = activeEpisodeIdRef.current;
      const projId = activeProjectIdRef.current;
      if (!epId) return;

      // 1) IME 강제 commit — 브라우저가 contentEditable에서 blur 시 조립 중인
      //    음절을 자동으로 확정함. blur가 compositionend를 트리거하므로
      //    ScriptSurface 내부 composingRef도 자연스럽게 해제됨. mobile Gboard/
      //    Samsung Keyboard도 동일 동작 (blur가 IME 세션을 끊음).
      try { surfaceApiRef.current?.blurSurface?.(); } catch {}

      // 2) DOM에서 최신 blocks 직접 추출 (handleInput의 IME early-return 우회)
      //    실패 시 blocksRef.current로 fallback.
      let latestBlocks = null;
      try { latestBlocks = surfaceApiRef.current?.parseToBlocks?.() ?? null; } catch {}
      if (!latestBlocks || !latestBlocks.length) latestBlocks = blocksRef.current;
      if (!latestBlocks.length) return;

      const serialized = JSON.stringify(latestBlocks);
      if (serialized === lastSavedBlocks.current) return;
      clearTimeout(saveTimer.current);

      // 3) Scene 메타 동기화 (unmount-flush와 동일 로직)
      const currentScenes = scenesRef.current;
      const sceneBlocks = latestBlocks.filter(b => b.type === 'scene_number');
      const updatedScenes = sceneBlocks.map((b, idx) => {
        const existing = currentScenes.find(s => s.id === b.sceneId);
        return {
          ...(existing || {}),
          id: b.sceneId || existing?.id || genId(),
          episodeId: epId, projectId: b.projectId,
          sceneSeq: idx + 1, label: buildSceneLabel(idx + 1),
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

      // 4) 글로벌 state로 dispatch (sync). IndexedDB write는 effect 안이라 async,
      //    페이지 navigate에 못 미칠 수 있음 → 5)의 localStorage가 안전망.
      dispatch({ type: 'SET_BLOCKS', episodeId: epId, payload: latestBlocks });
      dispatch({ type: 'SYNC_SCENES', episodeId: epId, payload: updatedScenes, removeOrphans: true });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
      lastSavedBlocks.current = serialized;

      // 5) 동기 비상 백업 — 다음 진입 시 mount-effect가 IndexedDB 시각과 비교해 복구.
      //    localStorage write는 sync (IndexedDB와 달리 즉시 디스크 반영).
      try {
        localStorage.setItem('drama_emergency_backup', JSON.stringify({
          episodeId: epId, projectId: projId || null,
          blocks: latestBlocks, ts: Date.now(),
        }));
      } catch {}
    };
    window.addEventListener('pagehide', handler);
    return () => window.removeEventListener('pagehide', handler);
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
    let pointerActive = false; // pointerdown ~ pointerup 사이: drag/click 중

    const onKeyDown = () => { lastEventWasKey = true; };
    const onPointerDown = () => { lastEventWasKey = false; pointerActive = true; };
    const onPointerUp   = () => { pointerActive = false; };

    const onSelectionChange = () => {
      if (!lastEventWasKey || pointerActive) return; // 클릭/드래그 중 → 스크롤 건너뜀
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
        // 커서 실제 위치 기준으로 스크롤 (블록 전체 중심이 아니라 커서 라인 기준)
        const caretRect     = range.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        // caretRect가 비어있으면 (빈 줄 등) fallback으로 블록 중심 사용
        if (!caretRect || caretRect.height === 0) {
          let node = range.startContainer;
          while (node && node !== container) {
            if (node.nodeType === 1 && node.dataset?.blockId) break;
            node = node.parentElement;
          }
          const blockEl = (node && node !== container) ? node : null;
          if (!blockEl) return;
          const blockRect   = blockEl.getBoundingClientRect();
          const blockCenter = blockRect.top + blockRect.height / 2 - containerRect.top;
          container.scrollTop += blockCenter - containerRect.height / 2;
          return;
        }
        const caretTop    = caretRect.top - containerRect.top;
        const caretBottom = caretRect.bottom - containerRect.top;
        const margin      = 80; // 커서 위아래 여유 공간 (px)
        // 이미 화면 안에 있으면 스크롤하지 않음
        if (caretTop >= margin && caretBottom <= containerRect.height - margin) return;
        // 화면 밖으로 나간 경우 커서를 세로 중앙에 맞춤
        const caretCenter = caretRect.top + caretRect.height / 2 - containerRect.top;
        container.scrollTop += caretCenter - containerRect.height / 2;
      });
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup',   onPointerUp,   true);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup',   onPointerUp,   true);
      document.removeEventListener('selectionchange', onSelectionChange);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // ── sceneRefs auto-update
  useEffect(() => {
    if (!blocks.length) return;
    const sceneMap = new Map(scenes.map(s => [s.id, s]));
    let anyChanged = false;
    const updated = blocks.map(b => {
      if (!b.sceneRefs?.length) return b;
      let content = b.content;
      let blockChanged = false;
      const newRefs = b.sceneRefs.map(ref => {
        const scene = sceneMap.get(ref.sceneId);
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
    const sceneIdSet = new Set(scenes.map(s => s.id));
    const broken = [];
    blocks.forEach(b => {
      (b.sceneRefs || []).forEach(ref => {
        if (!sceneIdSet.has(ref.sceneId))
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

  const restoreEditorSelection = useCallback((savedRange) => {
    const range = savedRange ? (savedRange.cloneRange?.() || savedRange) : null;
    requestAnimationFrame(() => {
      const surface = document.querySelector('[data-editor-surface]');
      if (!surface || !range) return;
      surface.focus();
      requestAnimationFrame(() => {
        try {
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        } catch (_) {}
      });
    });
  }, []);

  // ── Badge click: show char picker
  const handleBadgeClick = useCallback((blockId, blockEl, initialQuery = '') => {
    if (performance.now() < suppressCharPickerOpenUntilRef.current) return;
    const rect = blockEl.getBoundingClientRect();
    const sel = window.getSelection();
    const savedRange = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    setCharPickerState({ blockId, top: rect.bottom + 4, left: rect.left, initialQuery, savedRange });
  }, []);

  // ── CharSuggest: action block content looks like a char name
  const handleCharSuggest = useCallback((blockId, content) => {
    if (!suggestEnabled || !blockId) { setCharSuggestState(null); return; }
    const trimmed = (content || '').trim();
    if (!trimmed) { setCharSuggestState(null); return; }
    const allSymbols = (state.stylePreset?.customSymbols?.length > 0)
      ? state.stylePreset.customSymbols
      : DEFAULT_SYMBOLS;
    let detectedPrefix = '';
    let nameToMatch = trimmed;
    for (const sym of allSymbols) {
      if (trimmed.startsWith(sym)) {
        detectedPrefix = sym;
        nameToMatch = trimmed.slice(sym.length).trim();
        break;
      }
    }
    const CHAR_SUFFIX_RE = /\s?\([A-Za-z./\s]+\)$/;
    let detectedSuffix = '';
    const suffixMatch = nameToMatch.match(CHAR_SUFFIX_RE);
    if (suffixMatch) {
      detectedSuffix = suffixMatch[0];
      nameToMatch = nameToMatch.slice(0, -suffixMatch[0].length).trim();
    }
    if (!nameToMatch) { setCharSuggestState(null); return; }
    const match = projectChars.find(c =>
      [c.name, c.givenName].filter(Boolean).some(n => n.startsWith(nameToMatch))
    );
    if (match) {
      const el = surfaceApiRef.current ? document.querySelector(`[data-block-id="${blockId}"]`) : null;
      setCharSuggestState({ blockId, charName: match.givenName || match.name, charObj: match, blockEl: el, charPrefix: detectedPrefix, charSuffix: detectedSuffix });
    } else {
      setCharSuggestState(null);
    }
  }, [suggestEnabled, projectChars, state.stylePreset]);

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
            const savedRange = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
            // rect.bottom <= 60이면 아직 렌더 안 됐거나 툴바 위 → 열지 않음
            if (rect.bottom > 60) {
              setCharPickerState({ blockId: node.dataset.blockId, top: rect.bottom + 4, left: rect.left, fromDialogue: true, savedRange });
            }
            return;
          }
          node = node.parentElement;
        }
      });
    }
  }, []);

  // ── Slash palette handlers
  const handleSlashInput = useCallback(({ blockEl, query }) => {
    // 슬래시 처음 감지된 시점(query=='' 또는 anchor 미설정)에만 anchor 인덱스 기억.
    // 이후 query 변화로 재호출되어도 anchor 유지 → 한 번의 슬래시 흐름 = 1 undo 단위.
    if (slashAnchorIdxRef.current === null) {
      slashAnchorIdxRef.current = undoStack.current.length;
    }
    const sel = window.getSelection();
    slashSelectionRef.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const rect = blockEl.getBoundingClientRect();
    const vv = window.visualViewport;
    const vvH = vv?.height ?? window.innerHeight;
    const vvW = vv?.width ?? window.innerWidth;
    const MIN_H = 120;
    const spaceBelow = vvH - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    let y, maxH;
    if (spaceBelow >= MIN_H) {
      y = rect.bottom + 4;
      maxH = spaceBelow;
    } else {
      maxH = Math.max(MIN_H, spaceAbove);
      y = Math.max(4, rect.top - maxH - 4);
    }
    const x = Math.min(rect.left, vvW - 204);
    setSlashPalette({ blockEl, query, x, y, maxH, selectedIdx: 0 });
  }, []);

  const handleSlashClose = useCallback((opts = {}) => {
    const savedRangeSource = opts.savedRange || slashSelectionRef.current;
    const savedRange = savedRangeSource ? (savedRangeSource.cloneRange?.() || savedRangeSource) : null;
    setSlashPalette(null);
    if (!opts.keepSelectionRef) slashSelectionRef.current = savedRange;
    if (!opts.restoreCaret) return;
    requestAnimationFrame(() => {
      const surface = document.querySelector('[data-editor-surface]');
      if (!surface) return;
      surface.focus();
      requestAnimationFrame(() => {
        if (!savedRange) return;
        try {
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(savedRange);
        } catch (_) {}
      });
    });
  }, []);

  // 슬래시 팔레트에서 보여줄 항목 필터링
  const getSlashFiltered = useCallback((query) => {
    return SLASH_COMMANDS.filter(cmd => {
      if (!query) return true;
      return cmd.label.includes(query) || cmd.type.includes(query) || cmd.desc.includes(query);
    });
  }, []);

  const handleSlashKeyNav = useCallback((key) => {
    setSlashPalette(prev => {
      if (!prev) return null;
      const filtered = SLASH_COMMANDS.filter(cmd => {
        if (!prev.query) return true;
        return cmd.label.includes(prev.query) || cmd.type.includes(prev.query) || cmd.desc.includes(prev.query);
      });
      const len = filtered.length;
      if (!len) return null;
      const delta = key === 'ArrowDown' ? 1 : -1;
      return { ...prev, selectedIdx: ((prev.selectedIdx ?? 0) + delta + len) % len };
    });
  }, [isMobile]);

  // 슬래시 액션 실행 공통 함수
  const executeSlashAction = useCallback((cmd, blockEl) => {
    const isDialogue = blockEl?.dataset.blockType === 'dialogue';
    const targetEl = isDialogue
      ? (blockEl?.querySelector('.ce-speech') || blockEl)
      : blockEl;

    // unifiedtag: '/' + 쿼리만 제거하고 앞 내용 보존
    const removeSlashOnly = (el, target) => {
      if (!el || !target) return;
      const query = slashPaletteRef.current?.query || '';
      const toRemove = '/' + query;
      const raw = target.innerText || target.textContent || '';
      const idx = raw.lastIndexOf(toRemove);
      if (idx >= 0) {
        target.textContent = raw.slice(0, idx) + raw.slice(idx + toRemove.length);
        try {
          const r = document.createRange();
          if (target.firstChild?.nodeType === Node.TEXT_NODE) {
            r.setStart(target.firstChild, Math.min(idx, target.firstChild.length));
          } else {
            r.setStart(target, 0);
          }
          r.collapse(true);
          window.getSelection()?.removeAllRanges();
          window.getSelection()?.addRange(r);
        } catch (_) {}
      }
    };

    // 전체 삭제 (block 타입 변경 시)
    const clearBlockSlash = (el) => {
      if (!el) return;
      const speech = isDialogue ? el.querySelector('.ce-speech') : null;
      const target = speech || el; // .ce-speech 없는 대사 블록도 el로 폴백
      // speech span이 있으면 speech만, 없으면(대사 포함) el 전체 삭제
      (speech || el).textContent = '';
      cleanupBr(target); // 삭제 후 남은 <br> placeholder 제거
      try {
        const r = document.createRange();
        r.setStart(target, 0);
        r.collapse(true);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(r);
      } catch (_) {}
    };

    if (blockEl && cmd.action !== 'sceneref' && cmd.action !== 'symbol'
        && cmd.action !== 'unifiedtag' && cmd.action !== 'parenthetical'
        && cmd.action !== 'block' && cmd.action !== 'charcheck'
        && cmd.action !== 'memo') {
      clearBlockSlash(blockEl);
    }

    if (cmd.action === 'block') {
      removeSlashOnly(blockEl, targetEl);
      requestAnimationFrame(() => applyBlockType(cmd.type));
    } else if (cmd.action === 'charcheck') {
      removeSlashOnly(blockEl, targetEl);
      charCheckSavedRangeRef.current = window.getSelection()?.rangeCount > 0
        ? window.getSelection().getRangeAt(0).cloneRange()
        : null;
      requestAnimationFrame(() => handleCharCheckRef.current?.());
    } else if (cmd.action === 'sceneref') {
      // 연결: 현재 블록 기준으로 sceneRefPicker 열기
      const surface = document.querySelector('[data-editor-surface]');
      const sel = window.getSelection();
      let insertAfterId = blockEl?.dataset.blockId ?? null;
      const rect = blockEl?.getBoundingClientRect() || { bottom: 120, left: 200 };
      const savedRange = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      if (blockEl) clearBlockSlash(blockEl);
      requestAnimationFrame(() => {
        setSceneRefPicker({ top: rect.bottom + 4, left: rect.left, insertAfterId, savedRange, mobile: hasKeyboard });
      });
    } else if (cmd.action === 'symbol') {
      // 기타: 블록 텍스트 지우고 기타 피커 열기
      if (blockEl) clearBlockSlash(blockEl);
      const rect3 = blockEl?.getBoundingClientRect() || { bottom: 120, left: 200 };
      const blockId3 = blockEl?.dataset.blockId;
      requestAnimationFrame(() => setSlashSymbolPos({ top: rect3.bottom + 4, left: rect3.left, blockId: blockId3 }));
    } else if (cmd.action === 'unifiedtag') {
      // 통합 태그: 구조태그 + 감정태그 한 번에
      removeSlashOnly(blockEl, targetEl);
      cleanupBr(targetEl);
      surfaceApiRef.current?.parse();
      const blockId = blockEl?.dataset.blockId;
      const sceneId = getCurrentSceneIdRef.current?.();
      // picker가 input.focus()로 selection을 강탈하므로 미리 caret range 저장 → 닫힐 때 복원
      const sel2 = window.getSelection();
      const savedRange = sel2?.rangeCount ? sel2.getRangeAt(0).cloneRange() : null;
      if (blockId || sceneId) {
        requestAnimationFrame(() => {
          // anchorRect는 layout flush 후 rAF 안에서 측정 — removeSlashOnly로 변경된 caret 위치 반영
          const anchorRect = resolveAnchorRect(savedRange, blockEl);
          setSlashUnifiedTag({ blockId, sceneId, anchorRect, savedRange });
        });
      }
    } else if (cmd.action === 'parenthetical') {
      // /쿼리 제거 후 () 삽입, 커서를 괄호 안으로
      removeSlashOnly(blockEl, targetEl);
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const parenNode = document.createTextNode('()');
        range.insertNode(parenNode);
        const r = document.createRange();
        r.setStart(parenNode, 1); // ( 와 ) 사이
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        surfaceApiRef.current?.parse();
      });
    } else if (cmd.action === 'memo') {
      const quotedText = window.getSelection()?.toString() || '';
      const sceneId = getCurrentSceneIdRef.current?.();
      const rect = blockEl?.getBoundingClientRect() || { bottom: 120, left: 200 };
      const sel = window.getSelection();
      const savedRange = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      if (blockEl) clearBlockSlash(blockEl);
      requestAnimationFrame(() => {
        setMemoInputState({
          top:  Math.min(rect.bottom + 4, window.innerHeight - 220),
          left: Math.min(rect.left, window.innerWidth - 296),
          sceneId,
          quotedText: quotedText || null,
          savedRange,
        });
      });
    }
  }, [applyBlockType, hasKeyboard]);

  const handleSlashSelectType = useCallback((cmdType) => {
    const current = slashPaletteRef.current;
    setSlashPalette(null);
    if (!current) return;
    const cmd = SLASH_COMMANDS.find(c => c.type === cmdType);
    if (cmd) executeSlashAction(cmd, current.blockEl);
  }, [executeSlashAction]);

  const handleSlashSelectCurrent = useCallback(() => {
    const current = slashPaletteRef.current;
    setSlashPalette(null);
    if (!current) return;
    const filtered = SLASH_COMMANDS.filter(cmd => {
      if (!current.query) return true;
      return cmd.label.includes(current.query) || cmd.type.includes(current.query) || cmd.desc.includes(current.query);
    });
    const item = filtered[current.selectedIdx ?? 0];
    if (item) executeSlashAction(item, current.blockEl);
  }, [executeSlashAction]);

  const handleSlashSelectIndex = useCallback((idx) => {
    const current = slashPaletteRef.current;
    setSlashPalette(null);
    if (!current) return;
    const filtered = SLASH_COMMANDS.filter(cmd => {
      if (!current.query) return true;
      return cmd.label.includes(current.query) || cmd.type.includes(current.query) || cmd.desc.includes(current.query);
    });
    const item = filtered[idx];
    if (item) executeSlashAction(item, current.blockEl);
  }, [executeSlashAction]);

  // ── flushSave: 즉시 저장 (자동저장 타이머 무시)
  const flushSave = useCallback(() => {
    if (!activeEpisodeId || !blocks.length) return;
    clearTimeout(saveTimer.current);

    // composing 중이면 DOM 직접 읽어 in-flight 음절 포함 (Ctrl+S 타이밍 버그 방지)
    let saveBlocks = blocks;
    if (composingRef.current && surfaceRef.current) {
      const parsed = parseSurface(surfaceRef.current, metaRef, activeEpisodeId, activeProjectId);
      const normalized = normalizeEmptySceneNumberBlocks(parsed);
      if (normalized.length > 0) saveBlocks = normalized;
      composingRef.current = false;
    }

    const sceneBlocks = saveBlocks.filter(b => b.type === 'scene_number');
    const updatedScenes = sceneBlocks.map((b, idx) => {
      const existing = scenes.find(s => s.id === b.sceneId);
      return {
        ...(existing || {}),
        id: b.sceneId || existing?.id || genId(),
        episodeId: activeEpisodeId, projectId: activeProjectId,
        sceneSeq: idx + 1, label: buildSceneLabel(idx + 1),
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
    dispatch({ type: 'SET_BLOCKS', episodeId: activeEpisodeId, payload: saveBlocks });
    dispatch({ type: 'SYNC_SCENES', episodeId: activeEpisodeId, payload: updatedScenes, removeOrphans: true });
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
    lastSavedBlocks.current = JSON.stringify(saveBlocks);
  }, [activeEpisodeId, activeProjectId, blocks, scenes, dispatch]);

  // ── 씬번호 블록에 인물 태그 표시 (등장체크 + 대사에서 감지된 인물)
  useEffect(() => {
    // 디바운스 300ms — 매 키입력마다 O(n²) DOM 업데이트 방지
    const charTagTimer = setTimeout(() => {
      const surface = document.querySelector('[data-editor-surface]');
      const currentBlocks = blocksRef.current;
      if (!surface || !currentBlocks.length) return;

      const sceneMap = new Map(episodeScenes.map(s => [s.id, s]));
      const charMap  = new Map(projectChars.map(c => [c.id, c]));

      // 씬별로 대사 인물 수집 — 인물정보(characterId)가 등록된 인물만
      const dialogueCharsByScene = {};
      let currentSceneId = null;
      for (const b of currentBlocks) {
        if (b.type === 'scene_number') {
          currentSceneId = b.sceneId;
          if (!dialogueCharsByScene[currentSceneId]) dialogueCharsByScene[currentSceneId] = new Set();
        } else if (b.type === 'dialogue' && currentSceneId && b.characterId && charMap.has(b.characterId)) {
          const c = charMap.get(b.characterId);
          const name = c.givenName || c.name || '';
          if (name) dialogueCharsByScene[currentSceneId].add(name);
        }
      }

      // 씬번호 DOM 업데이트
      surface.querySelectorAll('[data-block-type="scene_number"]').forEach(div => {
        const sceneId = div.dataset.sceneId;
        if (!sceneId) return;

        const detected = dialogueCharsByScene[sceneId] || new Set();
        const scene = sceneMap.get(sceneId);
        const checkedNames = (scene?.characterIds || [])
          .map(id => { const c = charMap.get(id); return c ? (c.givenName || c.name || '') : ''; })
          .filter(Boolean);

        const all = [...new Set([...checkedNames, ...detected])];
        if (all.length) { div.dataset.charTags = all.join(' · '); }
        else { delete div.dataset.charTags; }
      });
    }, 300);
    return () => clearTimeout(charTagTimer);
  }, [blocks, episodeScenes, projectChars]);

  const handleCharCheckRef = useRef(null);
  const charCheckSavedRangeRef = useRef(null);
  const getCurrentSceneIdRef = useRef(null);

  const sceneRefPickerRef = useRef(null);

  // ── 씬연결 피커: Esc/외부클릭/방향키/Enter 처리
  useEffect(() => {
    sceneRefActiveIdxRef.current = -1;
    setSceneRefActiveIdx(-1);
    if (!sceneRefPicker) return;

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setSceneRefPicker(null); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(sceneRefActiveIdxRef.current + 1, sceneItemsRef.current.length - 1);
        sceneRefActiveIdxRef.current = next;
        setSceneRefActiveIdx(next);
        requestAnimationFrame(() => {
          sceneRefPickerRef.current?.querySelector(`[data-scene-ref-item="${next}"]`)?.scrollIntoView({ block: 'nearest' });
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = Math.max(sceneRefActiveIdxRef.current - 1, 0);
        sceneRefActiveIdxRef.current = next;
        setSceneRefActiveIdx(next);
        requestAnimationFrame(() => {
          sceneRefPickerRef.current?.querySelector(`[data-scene-ref-item="${next}"]`)?.scrollIntoView({ block: 'nearest' });
        });
        return;
      }
      if (e.key === 'Enter' && sceneRefActiveIdxRef.current >= 0) {
        e.preventDefault();
        e.stopPropagation(); // 에디터 줄바꿈 차단
        const scene = sceneItemsRef.current[sceneRefActiveIdxRef.current];
        if (!scene) return;
        const getDisplay = (s) => s.content || resolveSceneLabel({ ...s, label: '' }) || s.label;
        const label = scene.label || '';
        const sceneText = getDisplay(scene);
        const rawText = label ? `${label} ${sceneText}` : sceneText;
        const displayText = `(${rawText})`;
        const { savedRange } = sceneRefPicker;
        setSceneRefPicker(null);
        requestAnimationFrame(() => {
          const surface = document.querySelector('[data-editor-surface]');
          surface?.focus();
          const sel = window.getSelection();
          if (savedRange && sel) { sel.removeAllRanges(); sel.addRange(savedRange.cloneRange()); }
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
      }
    };
    const onMouseDown = (e) => {
      if (sceneRefPickerRef.current && !sceneRefPickerRef.current.contains(e.target)) {
        setSceneRefPicker(null);
      }
    };
    window.addEventListener('keydown', onKey, true); // capture: 에디터 onKeyDown보다 먼저 실행
    const t = setTimeout(() => document.addEventListener('mousedown', onMouseDown), 0);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      clearTimeout(t);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [sceneRefPicker]);

  // ── 태그 피커 열기 (버튼/단축키 공통) ──────────────────────────────────────
  const openEmotionPickerOnCursor = useCallback(() => {
    const surface = document.querySelector('[data-editor-surface]');
    const sel = window.getSelection();
    if (!sel?.rangeCount || !surface) return;
    let node = sel.getRangeAt(0).startContainer;
    node = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    let blockEl = null;
    while (node && node !== surface) {
      if (node.dataset?.blockId) { blockEl = node; break; }
      node = node.parentElement;
    }
    if (!blockEl) return;
    const blockId = blockEl.dataset.blockId;
    const sceneId = getCurrentSceneIdRef.current?.();
    const savedRange = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const anchorRect = resolveAnchorRect(savedRange, blockEl);
    setSlashUnifiedTag({ blockId, sceneId, anchorRect, savedRange });
  }, []);

  // ── 기타 피커 열기 (버튼/단축키 공통) ─────────────────────────────────────
  const openSymbolPickerOnCursor = useCallback(() => {
    const surface = document.querySelector('[data-editor-surface]');
    const sel = window.getSelection();
    let rect = { bottom: 120, left: 200 };
    if (sel?.rangeCount && surface) {
      let node = sel.getRangeAt(0).startContainer;
      node = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      while (node && node !== surface) {
        if (node.dataset?.blockId) { rect = node.getBoundingClientRect(); break; }
        node = node.parentElement;
      }
    }
    // blockId 없이 열면 insertSymbol은 일반 경로(커서 위치 삽입) 사용
    setSlashSymbolPos({ top: rect.bottom + 4, left: rect.left });
  }, []);

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
      } else if (e.code === 'Digit6') {
        e.preventDefault();
        openSymbolPickerOnCursor();
      } else if (e.code === 'Digit7') {
        e.preventDefault();
        openEmotionPickerOnCursor();
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
    const onUndo = () => handleUndo();
    const onRedo = () => handleRedo();
    window.addEventListener('keydown', onKey);
    window.addEventListener('script:requestSave', onSave);
    window.addEventListener('script:undo', onUndo);
    window.addEventListener('script:redo', onRedo);
    const onAlignment = (e) => surfaceApiRef.current?.applyAlignment(e.detail);
    const onEpisodeTitleAlignment = (e) => {
      const el = episodeTitleRef.current;
      if (!el || !el.contains(document.activeElement)) return;
      el.style.textAlign = e.detail;
      dispatch({ type: 'UPDATE_EPISODE', payload: { id: episode.id, titleAlign: e.detail } });
    };
    window.addEventListener('script:alignment', onAlignment);
    window.addEventListener('script:alignment', onEpisodeTitleAlignment);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('script:requestSave', onSave);
      window.removeEventListener('script:undo', onUndo);
      window.removeEventListener('script:redo', onRedo);
      window.removeEventListener('script:alignment', onAlignment);
      window.removeEventListener('script:alignment', onEpisodeTitleAlignment);
    };
  }, [flushSave, applyBlockType, handleUndo, handleRedo, openEmotionPickerOnCursor, openSymbolPickerOnCursor]);

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
    for (let i = Math.max(idx, 0); i < all.length; i++) {
      if (all[i].dataset.blockType === 'scene_number') return all[i].dataset.sceneId || null;
    }
    return null;
  }, []);
  getCurrentSceneIdRef.current = getCurrentSceneId;

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
    if (charCheckSavedRangeRef.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(charCheckSavedRangeRef.current);
      charCheckSavedRangeRef.current = null;
    }
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
        const { blockId, charObj, charPrefix = '', charSuffix = '' } = charSuggestState;
        const surface = document.querySelector('[data-editor-surface]');
        if (surface) {
          const div = surface.querySelector(`[data-block-id="${blockId}"]`);
          if (div) {
            div.dataset.blockType = 'dialogue';
            div.className = 'ce-block ce-dialogue';
            div.dataset.charName = charObj.givenName || charObj.name;
            div.dataset.charId = charObj.id || '';
            div.dataset.charPrefix = charPrefix;
            div.dataset.charSuffix = charSuffix;
            div.innerHTML = `<span contenteditable="false" class="ce-char-badge">${esc(charObj.givenName || charObj.name)}</span><span class="ce-speech"></span>`;
            setCaret(div, 0);
          }
        }
        setCharSuggestState(null);
        setBlocks(prev => syncLabels(prev.map(b =>
          b.id === blockId
            ? { ...b, type: 'dialogue', content: '', characterId: charObj.id, characterName: charObj.name, charName: charObj.givenName || charObj.name, charPrefix, charSuffix }
            : b
        )));
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [charSuggestState]);

  // ── (인물태그 DOM 주입은 위 디바운스 effect에서 통합 처리) ──────────────────

  // ── Copy: 사이트 내부 클립보드 마커 + JSON 블록 데이터 저장
  // 다른 ScriptEditor에 붙여넣을 때 블록 타입·인라인 서식(B/I/U) 그대로 복원하기 위해.
  // 단일 블록 부분 선택은 default copy 동작 유지(텍스트만 복사).
  const handleEditorCopy = useCallback((e) => {
    const surface = document.querySelector('[data-editor-surface]');
    if (!surface) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!surface.contains(range.commonAncestorContainer)) return;

    const findBlock = (node) => {
      let el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      while (el && el !== surface) {
        if (el.dataset?.blockId) return el;
        el = el.parentElement;
      }
      return null;
    };
    const startBlockEl = findBlock(range.startContainer);
    const endBlockEl = findBlock(range.endContainer);
    if (!startBlockEl || !endBlockEl) return;

    const allBlocks = [...surface.querySelectorAll('[data-block-id]')];
    const lo = Math.min(allBlocks.indexOf(startBlockEl), allBlocks.indexOf(endBlockEl));
    const hi = Math.max(allBlocks.indexOf(startBlockEl), allBlocks.indexOf(endBlockEl));
    if (lo < 0) return;

    // 단일 블록 부분 선택 → default copy (텍스트만 복사)
    if (lo === hi) {
      const blockText = (allBlocks[lo].textContent || '').trim();
      const selectedText = range.toString().trim();
      if (selectedText.length < blockText.length) return;
    }

    const ids = allBlocks.slice(lo, hi + 1).map(el => el.dataset.blockId);
    const blocksData = ids.map(id => blocks.find(b => b.id === id)).filter(Boolean);
    if (!blocksData.length) return;

    const json = JSON.stringify({ source: 'drama-editor', version: 1, blocks: blocksData });
    // 블록 사이는 \n 1개로 join — 작가 의도와 시각 표시 1:1 매핑.
    // \n\n 사용 시 빈 블록 1개가 \n\n\n\n로 표현되어 시놉시스 paste 시 빈 줄 3개 증식.
    const plainText = blocksData.map(b => stripHtml(b.content || '')).join('\n');

    e.preventDefault();
    e.clipboardData.setData('application/x-drama-blocks', json);
    e.clipboardData.setData('text/plain', plainText);
  }, [blocks]);

  // ── Paste: 시나리오 자동 파싱
  const handleEditorPaste = useCallback((e) => {
    // 사이트 내부 복사 마커 있으면 → JSON 블록 데이터 그대로 복원 (자동 파싱 우회)
    const dramaJson = e.clipboardData?.getData('application/x-drama-blocks');
    if (dramaJson) {
      e.preventDefault();
      let payload = null;
      try { payload = JSON.parse(dramaJson); } catch {}
      if (!payload?.blocks?.length) return;

      const ts = Date.now();
      const newBlocks = payload.blocks.map((b, i) => {
        const next = {
          ...b,
          id: genId(),
          episodeId: activeEpisodeId,
          projectId: activeProjectId,
          createdAt: ts + i,
          updatedAt: ts + i,
        };
        // scene_number 블록은 새 sceneId 발급 (씬 메타와 충돌 방지)
        if (b.type === 'scene_number') next.sceneId = genId();
        return next;
      });

      // 커서 위치 이후에 삽입
      const surface = document.querySelector('[data-editor-surface]');
      const sel = window.getSelection();
      let insertAfterId = null;
      if (sel?.rangeCount && surface) {
        let el = sel.getRangeAt(0).startContainer;
        el = el.nodeType === Node.TEXT_NODE ? el.parentElement : el;
        while (el && el !== surface) {
          if (el.dataset?.blockId) { insertAfterId = el.dataset.blockId; break; }
          el = el.parentElement;
        }
      }

      setBlocks(prev => {
        const merged = (() => {
          if (!insertAfterId) return syncLabels([...prev, ...newBlocks]);
          const idx = prev.findIndex(b => b.id === insertAfterId);
          if (idx < 0) return syncLabels([...prev, ...newBlocks]);
          return syncLabels([...prev.slice(0, idx + 1), ...newBlocks, ...prev.slice(idx + 1)]);
        })();
        requestAnimationFrame(() => surfaceApiRef.current?.loadBlocks(merged));
        return merged;
      });

      const nScenes   = newBlocks.filter(b => b.type === 'scene_number').length;
      const nDialogue = newBlocks.filter(b => b.type === 'dialogue').length;
      const nAction   = newBlocks.filter(b => b.type === 'action').length;
      setPasteToast(`사이트 내 붙여넣기 완료 — 씬 ${nScenes}, 대사 ${nDialogue}, 지문 ${nAction}`);
      setTimeout(() => setPasteToast(null), 3000);
      return;
    }

    const text = e.clipboardData?.getData('text/plain') || '';
    const lines = text.split('\n');
    const nonEmpty = lines.filter(l => l.trim());
    // 단일 행은 평문으로 강제 삽입 — 브라우저 기본 paste를 그대로 두면
    // HTML 클립보드의 inline style(padding 등)이 들어와 새 블록의 CSS 변수
    // (--action-indent 등)와 중첩 적용되어 들여쓰기가 2배가 되는 버그 방지.
    if (nonEmpty.length <= 1) {
      e.preventDefault();
      document.execCommand('insertText', false, text);
      return;
    }

    e.preventDefault();

    // ── 빈 줄 기준으로 단락 분리 → 각 단락을 파서에 전달 → 단락 사이 빈 블록 삽입
    const ctx = { episodeId: activeEpisodeId, projectId: activeProjectId, characters: projectChars };
    const segments = text.split(/\r?\n(?:\r?\n)+/); // 1개 이상의 빈 줄로 분할
    const newBlocks = [];
    segments.forEach((seg, i) => {
      if (!seg.trim()) return;
      const parsed = parseScriptText(seg, ctx);
      if (i > 0 && newBlocks.length > 0) {
        const prev = newBlocks[newBlocks.length - 1];
        newBlocks.push({
          id: genId(), episodeId: activeEpisodeId, projectId: activeProjectId,
          type: 'action', content: '', label: '',
          sceneId: prev.sceneId || genId(), createdAt: now(), updatedAt: now(),
          annotations: [],
        });
      }
      newBlocks.push(...parsed);
    });

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
    setPasteToast(`붙여넣기 완료 — 씬 ${nScenes}, 대사 ${nDialogue}, 지문 ${nAction}${nUnknown ? ' (형식은 1. 또는 / + 숫자로 변경)' : ''}`);
    setTimeout(() => setPasteToast(null), 4000);
  }, [activeEpisodeId, activeProjectId, projectChars, setBlocks]);

  const editorFontSize = stylePreset?.fontSize ? `${stylePreset.fontSize}pt` : '11pt';
  const editorLineHeight = stylePreset?.lineHeight ?? 1.6;
  const { cssStack: editorFontFamily } = resolveFont(stylePreset, 'editor');

  // 키보드 감지: App.jsx의 keyboardUp prop 사용 (제거됨)

  // 집중 모드 — ESC로 종료
  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setFocusMode(false); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [focusMode, setFocusMode]);

  // 집중 모드 배율 — CSS zoom 사용 (layout 자동 반영, transform:scale 재흐름 없음)
  const PAPER_PX = 680; // 인쇄 기준 용지 콘텐츠 너비(px)
  const [focusZoomPct, setFocusZoomPct] = useState(100); // 100 = 폭맞춤
  const [viewportW, setViewportW] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // focusMode 해제 시 배율 리셋
  useEffect(() => { if (!focusMode) setFocusZoomPct(100); }, [focusMode]);
  // fitScale: 용지폭이 뷰포트 너비에 꽉 차는 배율 (여백 32px)
  const fitScale = (viewportW - 32) / PAPER_PX;
  const appliedZoom = focusMode ? fitScale * (focusZoomPct / 100) : 1;

  // 커서 자동스크롤 — 커서가 뷰 밖으로 나갈 때만 스크롤 (smooth 제거로 흔들림 방지)
  useEffect(() => {
    let raf = null;
    const handleSelectionChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel?.rangeCount) return;
        // drag로 selection 확장 중에는 동작 금지: native auto-scroll로 화면이 내려가면 selection
        // 시작점이 viewport 밖으로 나가고, 이 핸들러가 시작점으로 화면을 되돌리면서 native와
        // 충돌해 진동 발생. selection이 펼쳐진 상태(drag 중/직후)는 작가가 텍스트를 잡고 있는
        // 상태이므로 자동 스크롤하지 않는 게 자연스러움.
        if (!sel.isCollapsed) return;
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
    { type: 'scene_number', label: getScenePrefix().trim() || 'S#', title: `씬번호 (${INSERT_SHORTCUT_HINTS.scene_number})` },
    { type: 'action',       label: '지문', title: `지문 (${INSERT_SHORTCUT_HINTS.action})` },
    { type: 'dialogue',     label: '대사', title: `대사 (${INSERT_SHORTCUT_HINTS.dialogue})` },
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
      {/* Toolbar — 1행: 블록 버튼 (키보드 올라오면 숨김) */}
      {!hasKeyboard && (
        <div className="px-3 py-1.5 flex items-center gap-1 text-xs shrink-0" style={{ borderBottom: '1px solid var(--c-border2)' }}>
          <div data-tour-id="scene-block-btns" className="flex gap-1 flex-1 min-w-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
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
              title={`등장 — 현재 씬 등장인물 추가 (${INSERT_SHORTCUT_HINTS.charcheck})`}
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
              title={`연결 — 현재 위치에 다른 씬 참조 삽입 (${INSERT_SHORTCUT_HINTS.sceneref})`}
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
              onOpen={() => { setCharCheckPicker(null); setSceneRefPicker(null); setCharPickerState(null); setSlashPalette(null); }}
              forceOpen={slashSymbolPos}
              onForceClose={() => setSlashSymbolPos(null)}
            />
            <button
              onMouseDown={e => { e.preventDefault(); openEmotionPickerOnCursor(); }}
              title={`태그 (${INSERT_SHORTCUT_HINTS.tag})`}
              style={{
                flexShrink: 0, width: BTN_W, textAlign: 'center',
                fontSize: 'clamp(10px, 2.8vw, 13px)', color: 'var(--c-text4)',
                padding: '4px 0', border: '1px solid var(--c-border3)',
                borderRadius: 6, background: 'transparent', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent', marginLeft: 4,
              }}
            >태그</button>
          </div>
        </div>
      )}

      {/* Toolbar — 2행: 회차 정보 + 페이지수/씬수/글자수 + 저장됨 (모바일 전용) */}
      <div className="md:hidden px-4 py-1 flex items-center gap-2 text-xs shrink-0" style={{ borderBottom: '1px solid var(--c-border2)' }}>
        {/* 회차 제목은 길면 잘리도록(truncate) — 통계/저장 표시가 우측으로 밀려 화면 밖으로 나가지 않게 */}
        <span style={{ color: 'var(--c-text3)', flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {episode?.number}회 {episode?.title || ''}
        </span>
        {brokenSceneRefs.length > 0 && (
          <button
            onClick={() => { setReconnectIdx(0); setReconnectTarget(brokenSceneRefs[0]); }}
            className="text-xs px-1.5 py-0.5 rounded shrink-0"
            style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', cursor: 'pointer' }}
          >⚠ S# 참조 {brokenSceneRefs.length}개 끊김</button>
        )}
        <span className="shrink-0"><PageCounter blocks={blocks} stylePreset={stylePreset} scrollRef={editorScrollRef} /></span>
        <span className="shrink-0" style={{ color: 'var(--c-border3)' }}>● 저장됨</span>
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
        style={{ overflowX: 'hidden' }}
        onClick={(e) => {
          // React portal events bubble through the React tree even when the DOM target is outside
          // this container (e.g. AnnotationPopover portaled to document.body). Skip in that case.
          if (!editorScrollRef.current?.contains(e.target)) return;
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
          // drag로 selection이 살아있으면 작가가 의도적으로 텍스트를 잡은 상태 → 흔들지 않음.
          // (drag 중 마우스가 viewport 밖으로 나가 mouseup이 surface 바깥에서 발생하면
          //  click이 여기로 와서 selection을 무효화하던 회귀 방지.)
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed) return;
          // Click in the scroll wrapper outside the surface — always move caret to end.
          // 작가 직감: "에디터 어디든 누르면 커서 생긴다". surface 바깥 패딩/여백 클릭도
          // 새로 입력하려는 의도이므로 마지막 블록 끝으로 caret 이동. pendingBlockType는
          // 그 후에 caret 위치(마지막 블록) 기준으로 적용되어 단축어 흐름과도 호환.
          surfaceApiRef.current?.focusEnd();
          if (pendingBlockType) {
            const pt = pendingBlockType;
            setPendingBlockType(null);
            requestAnimationFrame(() => surfaceApiRef.current?.applyBlockType(pt));
          }
        }}
      >
        <div
          onMouseUp={handleAnnotationMouseUp}
          style={focusMode ? {
            // 집중 모드: 고정 용지폭 + CSS zoom (layout 자동 반영, 렉 없음)
            position: 'relative',
            width: PAPER_PX,
            marginLeft: 'auto',
            marginRight: 'auto',
            fontFamily: editorFontFamily,
            fontSize: editorFontSize,
            lineHeight: editorLineHeight,
            paddingTop: '2rem',
            paddingBottom: '2rem',
            paddingLeft: '3rem',
            paddingRight: '3rem',
            zoom: appliedZoom,
          } : {
            position: 'relative',
            maxWidth: '42rem',
            marginLeft: 'auto',
            marginRight: 'auto',
            fontFamily: editorFontFamily,
            fontSize: editorFontSize,
            lineHeight: editorLineHeight,
            paddingTop: '2rem',
            paddingBottom: '2rem',
            paddingLeft: isMobile ? '1.5rem' : '3rem',
            paddingRight: '1.5rem',
          }}
        >
          {episode?.title !== undefined && (
            <div
              ref={episodeTitleRef}
              contentEditable
              suppressContentEditableWarning
              onFocus={(e) => {
                // 전체 선택
                const range = document.createRange();
                range.selectNodeContents(e.currentTarget);
                window.getSelection()?.removeAllRanges();
                window.getSelection()?.addRange(range);
              }}
              onBlur={(e) => {
                const newTitle = e.currentTarget.textContent.trim();
                if (newTitle !== (episode.title || '')) {
                  dispatch({ type: 'UPDATE_EPISODE', payload: { id: episode.id, title: newTitle } });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              style={{
                textAlign: episode.titleAlign || 'center',
                fontWeight: 'bold',
                fontSize: '1em',
                color: 'var(--c-text1)',
                padding: '0 0 1.5rem 0',
                outline: 'none',
                cursor: 'text',
                minHeight: '1.5em',
                whiteSpace: 'pre-wrap',
              }}
              data-placeholder="에피소드 제목"
            >
              {episode.title || ''}
            </div>
          )}
          <EditorSurface
            ref={surfaceApiRef}
            episodeId={activeEpisodeId}
            initialBlocks={blocks}
            onBlocksChange={setBlocks}
            onBadgeClick={handleBadgeClick}
            onCharSuggest={handleCharSuggest}
            onSelectionChange={setActiveBlockType}
            dialogueGap={dialogueGap}
            blockStyles={stylePreset?.blockStyles}
            stylePreset={stylePreset}
            fontFamily={editorFontFamily}
            fontSize={editorFontSize}
            lineHeight={editorLineHeight}
            activeEpisodeId={activeEpisodeId}
            activeProjectId={activeProjectId}
            onPaste={handleEditorPaste}
            onCopy={handleEditorCopy}
            onUndo={handleUndo}
            onSlashInput={handleSlashInput}
            onSlashClose={handleSlashClose}
            slashOpenRef={slashOpenRef}
            onSlashKeyNav={handleSlashKeyNav}
            onSlashSelectCurrent={handleSlashSelectCurrent}
            onSlashSelectIndex={handleSlashSelectIndex}
            onNextTypePick={({ blockId, currentType, top, left }) => setNextTypePicker({ blockId, currentType, top, left, mode: 'create' })}
            onCloseSceneRef={() => { if (sceneRefPickerRef.current) setSceneRefPicker(null); }}
          />
          <AnnotationLayer blocks={blocks} onAnnotationsChange={handleAnnotationsChange} />
          <MemoGutterLayer blocks={blocks} episodeId={activeEpisodeId} refreshToken={memoRefreshToken} scrollRef={editorScrollRef} />
          {annMiniBar && createPortal(
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 299 }}
                onMouseDown={e => { e.preventDefault(); setAnnMiniBar(null); window.getSelection()?.removeAllRanges(); }}
              />
              <div
                data-annotation-ui
                style={{
                  position: 'fixed',
                  top: Math.min(annMiniBar.position.y, (window.visualViewport?.height ?? window.innerHeight) - 48),
                  left: Math.max(0, Math.min(annMiniBar.position.x, (window.visualViewport?.width ?? window.innerWidth) - 100)),
                  zIndex: 300,
                  display: 'flex',
                  gap: 0,
                  background: 'var(--c-panel)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 6,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  overflow: 'hidden',
                }}
                onMouseDown={e => e.stopPropagation()}
              >
                <button
                  title="주석 추가"
                  onClick={() => {
                    setAnnPopover(annMiniBar);
                    setAnnMiniBar(null);
                  }}
                  style={{
                    fontSize: 12, padding: '5px 10px', border: 'none', cursor: 'pointer',
                    background: 'transparent', color: 'var(--c-text2)',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <span style={{ fontSize: 13 }}>✏</span> 주석
                </button>
              </div>
            </>,
            document.body
          )}
          {annPopover && (
            <div data-annotation-ui className="annotation-popover">
              <AnnotationPopover
                selectedText={annPopover.selectedText}
                position={annPopover.position}
                onSave={(note) => {
                  const block = blocks.find(b => b.id === annPopover.blockId);
                  if (!block) return;
                  const ann = createAnnotation(
                    { selectedText: annPopover.selectedText, note },
                    block.annotations ?? []
                  );
                  handleAnnotationsChange(annPopover.blockId, [...(block.annotations ?? []), ann]);
                  setAnnPopover(null);
                  window.getSelection()?.removeAllRanges();
                }}
                onClose={() => { setAnnPopover(null); window.getSelection()?.removeAllRanges(); }}
              />
            </div>
          )}
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
                  const { blockId, charObj, charPrefix = '', charSuffix = '' } = charSuggestState;
                  const surface = document.querySelector('[data-editor-surface]');
                  if (!surface) return;
                  const div = surface.querySelector(`[data-block-id="${blockId}"]`);
                  if (div) {
                    div.dataset.blockType = 'dialogue';
                    div.className = 'ce-block ce-dialogue';
                    div.dataset.charName = charObj.givenName || charObj.name;
                    div.dataset.charId = charObj.id || '';
                    div.dataset.charPrefix = charPrefix;
                    div.dataset.charSuffix = charSuffix;
                    div.innerHTML = `<span contenteditable="false" class="ce-char-badge">${esc(charObj.givenName || charObj.name)}</span><span class="ce-speech"></span>`;
                    setCaret(div, 0);
                  }
                  setCharSuggestState(null);
                  setBlocks(prev => syncLabels(prev.map(b =>
                    b.id === blockId
                      ? { ...b, type: 'dialogue', content: '', characterId: charObj.id, characterName: charObj.name, charName: charObj.givenName || charObj.name, charPrefix, charSuffix }
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

      {/* Slash Command Palette */}
      {slashPalette && (() => {
        const filtered = getSlashFiltered(slashPalette.query);
        if (!filtered.length) return null;
        return (
          <SlashPalette
            commands={filtered}
            position={{ x: slashPalette.x, y: slashPalette.y }}
            selectedIdx={slashPalette.selectedIdx ?? 0}
            onSelect={handleSlashSelectType}
            onClose={handleSlashClose}
          />
        );
      })()}

      {/* Memo Input Box */}
      {memoInputState && (
        <MemoInputBox
          {...memoInputState}
          episodeId={activeEpisodeIdRef.current}
          onClose={(savedRange, saved) => {
            setMemoInputState(null);
            if (saved) setMemoRefreshToken(t => t + 1);
            if (savedRange) {
              requestAnimationFrame(() => {
                try {
                  window.getSelection()?.removeAllRanges();
                  window.getSelection()?.addRange(savedRange);
                } catch (_) {}
              });
            }
          }}
        />
      )}

      {/* Slash tag picker (모바일 전용) */}
      {slashTagPicker && (() => {
        const sceneObj = episodeScenes.find(s => s.id === slashTagPicker.sceneId);
        if (!sceneObj) return null;
        // 추천 태그 풀: 구조 지침 beats + 프로젝트 내 모든 씬의 기존 태그
        const builtinBeats = BUILTIN_GUIDES.flatMap(g => g.beats);
        const existingTags = [...new Set(scenes.flatMap(s => s.tags || []))];
        const tagPool = [...new Set([...builtinBeats, ...existingTags])];
        return (
          <SlashTagPickerPanel
            position={{ top: slashTagPicker.top, left: slashTagPicker.left }}
            scene={sceneObj}
            tagPool={tagPool}
            onAdd={tag => {
              const cur = sceneObj.tags || [];
              if (!cur.includes(tag)) {
                dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneObj.id, tags: [...cur, tag] }, _record: true });
              }
            }}
            onRemove={tag => {
              const cur = sceneObj.tags || [];
              dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneObj.id, tags: cur.filter(t => t !== tag) }, _record: true });
            }}
            onClose={() => setSlashTagPicker(null)}
          />
        );
      })()}

      {/* Slash Emotion Tag Picker */}
      {slashEmotionPicker && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 299 }}
            onMouseDown={(e) => {
              e.preventDefault();
              const sr = slashEmotionPicker.savedRange;
              setSlashEmotionPicker(null);
              restoreEditorSelection(sr);
            }}
          />
          <EmotionTagPicker
            anchorRect={slashEmotionPicker.anchorRect}
            existingTag={slashEmotionPicker.existingTag}
            initialWord={slashEmotionPicker.initialWord || ''}
            onSelect={(tag) => {
              const bid = slashEmotionPicker.blockId;
              // anchor = 슬래시 첫 감지 시점에 handleSlashInput이 기록한 인덱스
              // collapse가 anchor 부터 모두 제거하므로 슬래시/단어/emotion 전체가 1 undo로 묶임.
              const anchorIdx = slashAnchorIdxRef.current;
              const savedRange = slashEmotionPicker.savedRange;
              surfaceApiRef.current?.updateEmotionTag(bid, tag);
              const finalBlocks = blocks.map(b => b.id === bid ? { ...b, emotionTag: tag } : b);
              setBlocks(finalBlocks);
              dispatch({ type: 'UPDATE_BLOCK_EMOTION', blockId: bid, emotionTag: tag });
              collapseAndPushFinal(anchorIdx, finalBlocks);
              setSlashEmotionPicker(null);
              // picker 닫힌 후 caret 복원 — picker가 input.focus()로 강탈한 selection을 에디터로 되돌림
              restoreEditorSelection(savedRange);
            }}
            onClose={() => {
              const sr = slashEmotionPicker.savedRange;
              setSlashEmotionPicker(null);
              restoreEditorSelection(sr);
            }}
          />
        </>,
        document.body
      )}

      {/* Unified Tag Picker (구조태그 + 감정태그 통합 검색) */}
      {slashUnifiedTag && (() => {
        const tagScene = episodeScenes.find(s => s.id === slashUnifiedTag.sceneId);
        const currentStructureTags = tagScene?.tags || [];
        return (
          <UnifiedTagPicker
            anchorRect={slashUnifiedTag.anchorRect}
            currentStructureTags={currentStructureTags}
            onAddStructure={(beat) => {
              if (tagScene) {
                const tags = currentStructureTags.includes(beat)
                  ? currentStructureTags
                  : [...currentStructureTags, beat];
                dispatch({ type: 'UPDATE_SCENE', payload: { id: tagScene.id, tags }, _record: true });
              }
              const sr = slashUnifiedTag.savedRange;
              skipUnifiedTagRestoreRef.current = true; // 뒤따르는 UnifiedTagPicker.onClose의 중복 복원 스킵
              setSlashUnifiedTag(null);
              restoreEditorSelection(sr);
            }}
            onOpenFullPicker={(word) => {
              const { blockId, anchorRect, savedRange } = slashUnifiedTag;
              const existing = scriptBlocks.find(b => b.id === blockId)?.emotionTag || null;
              // savedRange/anchorRect를 EmotionTagPicker로 인계 → 같은 caret 기준으로 2단계 자체 사이즈로 재계산.
              skipUnifiedTagRestoreRef.current = true; // 뒤따르는 onClose의 caret 복원 스킵 (다음 picker가 focus 가져감)
              setSlashEmotionPicker({ blockId, anchorRect, existingTag: existing, initialWord: word, savedRange });
              setSlashUnifiedTag(null);
            }}
            onClose={() => {
              const sr = slashUnifiedTag?.savedRange;
              setSlashUnifiedTag(null);
              if (skipUnifiedTagRestoreRef.current) {
                skipUnifiedTagRestoreRef.current = false;
                return;
              }
              restoreEditorSelection(sr);
            }}
          />
        );
      })()}

      {/* Char Picker Overlay */}
      {charPickerState && (
        <CharPickerOverlay
          anchor={{ top: charPickerState.top, left: charPickerState.left }}
          projectChars={projectChars}
          initialQuery={charPickerState.initialQuery || ''}
          onSelect={(char, detectedSuffix = '') => {
            const blockId = charPickerState.blockId;
            const charId = char.id || '';
            const charName = char.givenName || char.name || '';
            suppressCharPickerOpenUntilRef.current = performance.now() + 300;
            setCharPickerState(null);
            requestAnimationFrame(() => {
              surfaceApiRef.current?.updateBlockChar(blockId, charId, charName, detectedSuffix);
            });
          }}
          onAddNew={(name, detectedSuffix = '') => {
            const blockId = charPickerState.blockId;
            suppressCharPickerOpenUntilRef.current = performance.now() + 300;
            setCharPickerState(null);
            const newChar = { id: genId(), projectId: activeProjectId, name, givenName: name, role: '', createdAt: now() };
            dispatch({ type: 'ADD_CHARACTER', payload: newChar });
            requestAnimationFrame(() => {
              surfaceApiRef.current?.updateBlockChar(blockId, newChar.id, name, detectedSuffix);
            });
          }}
          onClose={() => {
            const { savedRange } = charPickerState;
            if (charPickerState.fromDialogue) {
              const { top, left } = charPickerState;
              setCharPickerNoSel({ top, left });
              setTimeout(() => setCharPickerNoSel(null), 1800);
            }
            setCharPickerState(null);
            restoreEditorSelection(savedRange);
          }}
          onSkip={() => {
            // 인물 미선택 Enter → 다음 형식 선택 팝업 (기존 새 블록의 타입 변경)
            const { blockId, top, left } = charPickerState;
            setCharPickerState(null);
            requestAnimationFrame(() => {
              setNextTypePicker({ blockId, top, left, mode: 'change' });
            });
          }}
        />
      )}

      {/* 다음 형식 선택 팝업 (Ctrl+Enter / 인물 미선택 Enter) */}
      {nextTypePicker && createPortal(
        <NextTypePickerOverlay
          anchor={{ top: nextTypePicker.top, left: nextTypePicker.left }}
          blockId={nextTypePicker.blockId}
          excludeType={nextTypePicker.mode === 'create' ? nextTypePicker.currentType : undefined}
          onSelect={(type) => {
            const { blockId, mode } = nextTypePicker;
            setNextTypePicker(null);
            if (mode === 'create') {
              // Ctrl+Enter: 현재 블록 다음에 새 블록 생성
              surfaceApiRef.current?.insertBlockAfter(blockId, type);
            } else {
              // onSkip: 이미 생성된 새 블록의 타입 변경
              requestAnimationFrame(() => {
                surfaceApiRef.current?.focusBlock(blockId);
                requestAnimationFrame(() => surfaceApiRef.current?.applyBlockType(type));
              });
            }
          }}
          onClose={() => {
            const blockId = nextTypePicker.blockId;
            setNextTypePicker(null);
            requestAnimationFrame(() => surfaceApiRef.current?.focusBlock(blockId));
          }}
        />,
        document.body
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
        sceneItemsRef.current = sceneItems;
        const handleSceneSelect = (scene) => {
          const label = scene.label || '';
          const sceneText = getDisplay(scene);
          const rawText = label ? `${label} ${sceneText}` : sceneText;
          const displayText = `(${rawText})`;
          const { savedRange } = sceneRefPicker;
          setSceneRefPicker(null);
          requestAnimationFrame(() => {
            const surface = document.querySelector('[data-editor-surface]');
            surface?.focus();
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
              ) : sceneItems.map((s, i) => {
                const display = getDisplay(s);
                const isActive = i === sceneRefActiveIdx;
                return (
                  <div
                    key={s.id}
                    data-scene-ref-item={i}
                    onMouseDown={e => { e.preventDefault(); handleSceneSelect(s); }}
                    onMouseEnter={() => { sceneRefActiveIdxRef.current = i; setSceneRefActiveIdx(i); }}
                    onMouseLeave={() => { sceneRefActiveIdxRef.current = -1; setSceneRefActiveIdx(-1); }}
                    className="px-3 py-1.5 text-xs cursor-pointer"
                    style={{ color: 'var(--c-text2)', background: isActive ? 'var(--c-active)' : 'transparent' }}
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
            { type: 'scene_number', label: getScenePrefix().trim() || 'S#' },
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
            onOpen={() => { setCharCheckPicker(null); setSceneRefPicker(null); setCharPickerState(null); setSlashPalette(null); }}
            forceOpen={slashSymbolPos}
            onForceClose={() => setSlashSymbolPos(null)}
          />
          <button
            onMouseDown={e => { e.preventDefault(); openEmotionPickerOnCursor(); }}
            style={{
              flex: '0 0 auto', width: 44, fontSize: 14, padding: '5px 0',
              borderRadius: 6, textAlign: 'center',
              border: '1px solid var(--c-border3)', background: 'transparent',
              color: 'var(--c-text4)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >태그</button>
        </div>
      )}

      {/* 집중 모드 — 배율 컨트롤 + 닫기 버튼 */}
      {focusMode && setFocusMode && (
        <>
          <FocusZoomControl
            zoomPct={focusZoomPct}
            onChange={setFocusZoomPct}
            appliedZoom={appliedZoom}
          />
          <FocusModeExitBtn onExit={() => setFocusMode(false)} />
        </>
      )}
    </div>
  );
}

// ─── FocusModeExitBtn ─────────────────────────────────────────────────────────
function FocusModeExitBtn({ onExit }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onExit}
      title="집중 모드 종료 (ESC)"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 14px',
        borderRadius: 20,
        border: 'none',
        background: hovered ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.22)',
        color: '#fff',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        opacity: hovered ? 1 : 0.45,
        transition: 'opacity 0.2s, background 0.2s',
        boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 11 }}>✕</span> 닫기
    </button>
  );
}

// ─── FocusZoomControl ─────────────────────────────────────────────────────────
function FocusZoomControl({ zoomPct, onChange, appliedZoom }) {
  const [hovered, setHovered] = useState(false);
  const displayPct = Math.round(appliedZoom * 100);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        borderRadius: 20,
        background: hovered ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.22)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
        opacity: hovered ? 1 : 0.45,
        transition: 'opacity 0.2s, background 0.2s',
        userSelect: 'none',
      }}
    >
      <button
        onMouseDown={e => { e.preventDefault(); onChange(v => Math.max(50, v - 10)); }}
        style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
      >−</button>
      <span style={{ color: '#fff', fontSize: 12, minWidth: 44, textAlign: 'center' }}>
        {displayPct}%
      </span>
      <button
        onMouseDown={e => { e.preventDefault(); onChange(v => Math.min(200, v + 10)); }}
        style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
      >+</button>
      <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.3)', margin: '0 2px' }} />
      <button
        onMouseDown={e => { e.preventDefault(); onChange(100); }}
        title="폭 맞춤으로 초기화"
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}
      >폭맞춤</button>
    </div>
  );
}
