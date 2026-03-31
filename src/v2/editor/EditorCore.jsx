/**
 * v2 EditorCore
 * ─────────────────────────────────────────────────────────────
 * Main editor component. Manages:
 * - Loading blocks from store when episode changes
 * - Flushing to store (debounced + unmount flush — NO data loss)
 * - Scene sync (SYNC_SCENES after SET_BLOCKS)
 * - Toolbar buttons + Ctrl+1/2/3 shortcuts
 * - Character picker overlay
 * - Character suggestion panel
 * - pendingBlockType (toolbar click without focus → apply on next body click)
 * - selectionState (block type for toolbar highlight)
 */
import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { useStore, genId, now } from '../store/StoreContext.jsx';
import { sel } from '../store/selectors.js';
import * as A from '../store/actions.js';
import EditorSurface from './EditorSurface.jsx';
import { resolveFont } from '../../print/FontRegistry.js';
import { deriveSpeakersFromBlocks } from '../store/selectors.js';

const CHAR_SUGGEST_STORAGE_KEY = 'v2_charSuggestEnabled';

// ─── EditorCore ───────────────────────────────────────────────────────────────
export default function EditorCore({ scrollToSceneId, onScrollHandled }) {
  const { state, dispatch } = useStore();
  const { ui, settings } = state;
  const { activeEpisodeId, activeProjectId, saveStatus, saveError } = ui;
  const stylePreset = settings.stylePreset;

  // ── Derived ────────────────────────────────────────────────────────────────
  const episode        = sel.episodeById(state, activeEpisodeId);
  const episodeScenes  = sel.scenesByEpisode(state, activeEpisodeId);
  const projectChars   = sel.charactersByProject(state, activeProjectId);
  const storedBlocks   = sel.scriptBlocksByEpisode(state, activeEpisodeId);

  // ── Refs (no stale closures) ───────────────────────────────────────────────
  const surfaceRef         = useRef(null);  // EditorSurface imperative handle
  const blocksRef          = useRef([]);    // always-current blocks (set via onCommit)
  const activeEpIdRef      = useRef(null);  // always-current episode ID
  const activeProjectIdRef = useRef(null);
  const scenesRef          = useRef([]);    // always-current scenes
  const saveTimerRef       = useRef(null);
  const lastSavedRef       = useRef(null);
  const flushSaveRef       = useRef(null);  // stable ref to flush function
  const prevEpisodeIdRef   = useRef(null);

  activeEpIdRef.current      = activeEpisodeId;
  activeProjectIdRef.current = activeProjectId;
  scenesRef.current          = episodeScenes;

  // ── UI State ───────────────────────────────────────────────────────────────
  const [pendingBlockType, setPendingBlockType] = useState(null);
  const [selectionState,   setSelectionState]   = useState({ blockType: null, blockId: null });
  const [charPickerState,  setCharPickerState]   = useState(null); // { blockId, top, left }
  const [charSuggestState, setCharSuggestState]  = useState(null); // { blockId, charName, charObj }
  const [suggestEnabled, setSuggestEnabled]      = useState(
    () => localStorage.getItem(CHAR_SUGGEST_STORAGE_KEY) !== 'off'
  );
  // For UI display (scene/dialogue counts), updated lazily
  const [displayBlocks, setDisplayBlocks] = useState([]);

  const { cssStack: fontStack } = resolveFont(stylePreset, 'editor');
  const editorStyle = {
    fontFamily:  fontStack,
    fontSize:    stylePreset?.fontSize    ? `${stylePreset.fontSize}pt` : '11pt',
    lineHeight:  stylePreset?.lineHeight  ?? 1.6,
    '--dialogue-gap': stylePreset?.dialogueGap || '7em',
  };

  // ── flushSave (always-current via ref) ────────────────────────────────────
  flushSaveRef.current = () => {
    const blocks  = blocksRef.current;
    const epId    = activeEpIdRef.current;
    if (!epId || !blocks.length) return;
    const serialized = JSON.stringify(blocks);
    if (serialized === lastSavedRef.current) return;

    clearTimeout(saveTimerRef.current);

    // Derive scenes from scene_number blocks
    const currentScenes = scenesRef.current;
    const sceneBlocks   = blocks.filter(b => b.type === 'scene_number');

    // Phase 4: derive speaker characterIds per scene from dialogue blocks
    const speakerMap = deriveSpeakersFromBlocks(blocks); // Map<sceneId, Set<charId>>

    const updatedScenes = sceneBlocks.map((b, idx) => {
      const existing    = currentScenes.find(s => s.id === b.sceneId);
      // Merge manual characterIds with dialogue-derived speakers (dedup, no deleted chars)
      const manual      = existing?.characterIds || [];
      const speakers    = [...(speakerMap.get(b.sceneId) || new Set())];
      const mergedIds   = [...new Set([...manual, ...speakers])];

      return {
        id:          b.sceneId || genId(),
        episodeId:   epId,
        projectId:   b.projectId || activeProjectIdRef.current,
        sceneSeq:    idx + 1,
        label:       `S#${idx + 1}.`,
        status:      existing?.status      || 'draft',
        tags:        existing?.tags        || [],
        characterIds: mergedIds,           // ← canonical: manual ∪ dialogue speakers
        specialSituation: existing?.specialSituation || '',
        location:    existing?.location    || '',
        subLocation: existing?.subLocation || '',
        timeOfDay:   existing?.timeOfDay   || '',
        content:     b.content,
        sceneListContent: existing?.sceneListContent || '',
        sourceTreatmentItemId: existing?.sourceTreatmentItemId || null,
        createdAt:   existing?.createdAt   || now(),
        updatedAt:   now(),
      };
    });

    dispatch({ type: A.SET_BLOCKS,   payload: { episodeId: epId, blocks } });
    dispatch({ type: A.SYNC_SCENES,  payload: { episodeId: epId, scenes: updatedScenes } });
    dispatch({ type: A.SET_SAVE_STATUS, payload: 'saved' });
    lastSavedRef.current = serialized;
  };

  // ── Load blocks when episode changes ──────────────────────────────────────
  useEffect(() => {
    if (!activeEpisodeId || !state.meta.initialized) return;

    // Flush previous episode before switching (no data loss on episode switch)
    const prevEpId = prevEpisodeIdRef.current;
    if (prevEpId && prevEpId !== activeEpisodeId) {
      const prevBlocks = blocksRef.current;
      const prevSerialized = JSON.stringify(prevBlocks);
      if (prevBlocks.length > 0 && prevSerialized !== lastSavedRef.current) {
        clearTimeout(saveTimerRef.current);
        dispatch({ type: A.SET_BLOCKS, payload: { episodeId: prevEpId, blocks: prevBlocks } });
        lastSavedRef.current = prevSerialized;
      }
    }
    prevEpisodeIdRef.current = activeEpisodeId;

    // Load blocks for new episode
    const loaded = storedBlocks.length > 0
      ? storedBlocks
      : [{
          id: genId(), episodeId: activeEpisodeId, projectId: activeProjectId,
          type: 'action', content: '', label: '', createdAt: now(), updatedAt: now(),
        }];

    blocksRef.current    = loaded;
    lastSavedRef.current = JSON.stringify(loaded);
    setDisplayBlocks(loaded);
    surfaceRef.current?.resetWith(loaded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEpisodeId, state.meta.initialized]);

  // ── Unmount flush (mount-only effect — no data loss on unmount) ────────────
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current);
      flushSaveRef.current?.();
    };
  }, []);

  // ── Scroll to scene ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!scrollToSceneId) return;
    surfaceRef.current?.scrollToScene(scrollToSceneId);
    onScrollHandled?.();
  }, [scrollToSceneId]);

  // ── Inject char tags on scene blocks (for display) ────────────────────────
  useEffect(() => {
    if (!surfaceRef.current) return;
    episodeScenes.forEach(scene => {
      const names = (scene.characterIds || [])
        .map(id => sel.characterById(state, id))
        .filter(Boolean)
        .map(c => c.givenName || c.name || '')
        .filter(Boolean)
        .join(' · ');
      surfaceRef.current.setSceneCharTags(scene.id, names);
    });
  }, [episodeScenes, state.entities.characters]);

  // ── onCommit: called synchronously from EditorSurface on every change ─────
  const handleCommit = useCallback((blocks, selInfo) => {
    blocksRef.current = blocks;

    // Update selection state for toolbar highlight (cheap)
    if (selInfo) setSelectionState(selInfo);

    // Debounced save
    clearTimeout(saveTimerRef.current);
    dispatch({ type: A.SET_SAVE_STATUS, payload: 'dirty' });
    saveTimerRef.current = setTimeout(() => {
      flushSaveRef.current?.();
    }, 600);

    // Update display counts lazily (not on every keystroke)
    setDisplayBlocks(blocks);
  }, [dispatch]);

  // ── applyBlockType: toolbar/shortcut entry point ──────────────────────────
  const applyBlockType = useCallback((type) => {
    const applied = surfaceRef.current?.applyBlockType(type);
    if (applied === false) {
      // Editor not focused — set pending type, apply on next body click
      setPendingBlockType(prev => prev === type ? null : type);
    } else {
      setPendingBlockType(null);
    }
  }, []);

  // ── Badge click: open char picker ─────────────────────────────────────────
  const handleBadgeClick = useCallback((blockId, blockEl) => {
    const rect = blockEl.getBoundingClientRect();
    setCharPickerState({ blockId, top: rect.bottom + 4, left: rect.left });
  }, []);

  // ── Char picker select ─────────────────────────────────────────────────────
  const handleCharSelect = useCallback((char) => {
    if (!charPickerState) return;
    const { blockId } = charPickerState;
    const charName = char.givenName || char.name || '';
    surfaceRef.current?.updateBlockChar(blockId, char.id, charName);
    setCharPickerState(null);
  }, [charPickerState]);

  // ── Char suggest (action block looks like char name) ──────────────────────
  const handleCharSuggest = useCallback((blockId, content) => {
    if (!suggestEnabled || !blockId) { setCharSuggestState(null); return; }
    const trimmed = (content || '').trim();
    if (!trimmed) { setCharSuggestState(null); return; }
    const match = projectChars.find(c =>
      [c.givenName, c.name].filter(Boolean).some(n => n.startsWith(trimmed))
    );
    if (match) setCharSuggestState({ blockId, charName: match.givenName || match.name, charObj: match });
    else setCharSuggestState(null);
  }, [suggestEnabled, projectChars]);

  // ── Char suggest keyboard listener ───────────────────────────────────────
  useEffect(() => {
    if (!charSuggestState) return;
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setCharSuggestState(null); return; }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const { blockId, charObj } = charSuggestState;
        surfaceRef.current?.updateBlockChar(blockId, charObj.id, charObj.givenName || charObj.name);
        setCharSuggestState(null);
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [charSuggestState]);

  // ── No episode selected ────────────────────────────────────────────────────
  if (!activeEpisodeId) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--c-text5)', background: 'var(--c-bg)' }}>
        좌측에서 회차를 선택하세요
      </div>
    );
  }

  const sceneCount    = displayBlocks.filter(b => b.type === 'scene_number').length;
  const dialogueCount = displayBlocks.filter(b => b.type === 'dialogue').length;

  const BTNS = [
    { type: 'scene_number', label: 'S#',  title: '씬번호 (Ctrl+1)' },
    { type: 'action',       label: '지문', title: '지문 (Ctrl+2)'   },
    { type: 'dialogue',     label: '대사', title: '대사 (Ctrl+3)'   },
  ];

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--c-bg)' }}>

      {/* Toolbar */}
      <div className="px-6 py-2 flex items-center gap-2 text-xs shrink-0"
           style={{ borderBottom: '1px solid var(--c-border2)' }}>
        <span style={{ color: 'var(--c-text3)' }}>
          {episode?.number}회 {episode?.title || ''}
        </span>
        <span style={{ color: 'var(--c-text5)' }}>
          {sceneCount}개 씬 · {dialogueCount}개 대사
        </span>

        {/* Block type buttons */}
        <div className="flex gap-1 ml-2">
          {BTNS.map(({ type, label, title }) => {
            const isPending = pendingBlockType === type;
            const isActive  = selectionState.blockType === type;
            return (
              <button
                key={type}
                title={isPending ? `${title} — 본문을 클릭하면 적용됩니다` : title}
                onMouseDown={e => { e.preventDefault(); applyBlockType(type); }}
                className="px-2 py-0.5 rounded text-xs"
                style={{
                  color:       isPending ? '#fff' : isActive ? 'var(--c-accent)' : 'var(--c-text3)',
                  border:      `1px solid ${isPending ? 'var(--c-accent)' : isActive ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                  background:  isPending ? 'var(--c-accent)' : 'transparent',
                  cursor:      'pointer',
                  transition:  'background 0.1s, color 0.1s, border-color 0.1s',
                  fontWeight:  isActive ? '600' : 'normal',
                }}
              >{label}</button>
            );
          })}
        </div>

        {/* Save status */}
        <span className="ml-auto flex items-center gap-2">
          {saveStatus === 'dirty'  && <span style={{ color: 'var(--c-text6)' }}>수정됨</span>}
          {saveStatus === 'saving' && <span style={{ color: 'var(--c-text6)' }}>저장 중…</span>}
          {saveStatus === 'saved'  && <span style={{ color: 'var(--c-border3)' }}>● 저장됨</span>}
          {saveStatus === 'error'  && (
            <span className="text-red-400 cursor-pointer" title={saveError || '저장 실패'}
              onClick={() => dispatch({ type: A.SET_SAVE_STATUS, payload: 'saved' })}>
              ⚠ 저장 실패
            </span>
          )}
          {import.meta.env.DEV && (
            <button
              title="편집기 자가진단 (dev only)"
              onMouseDown={e => {
                e.preventDefault();
                import('./EditorSelfCheck.js').then(({ runEditorSelfCheck }) => {
                  runEditorSelfCheck(surfaceRef, activeEpisodeId, activeProjectId).then(({ passed, results, passing, total }) => {
                    const lines = results.map(r => `${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ': ' + r.detail : ''}`).join('\n');
                    alert(`[Self-check] ${passed ? '✅ ALL PASSED' : '❌ FAILED'} (${passing}/${total})\n\n${lines}`);
                  });
                });
              }}
              style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 3,
                border: '1px solid var(--c-border3)', background: 'transparent',
                color: 'var(--c-text6)', cursor: 'pointer',
              }}
            >SELF CHECK</button>
          )}
        </span>
      </div>

      {/* Editor scroll area */}
      <div
        className="flex-1 overflow-y-auto relative"
        onClick={e => {
          const inSurface = !!e.target.closest('[data-v2-surface]');
          if (inSurface) {
            if (pendingBlockType) {
              const pt = pendingBlockType;
              setPendingBlockType(null);
              requestAnimationFrame(() => surfaceRef.current?.applyBlockType(pt));
            }
            return;
          }
          // Clicked in empty space below surface — focus end
          surfaceRef.current?.focusEnd();
          if (pendingBlockType) {
            const pt = pendingBlockType;
            setPendingBlockType(null);
            requestAnimationFrame(() => surfaceRef.current?.applyBlockType(pt));
          }
        }}
      >
        <div className="max-w-2xl mx-auto py-8 px-16">
          <EditorSurface
            ref={surfaceRef}
            episodeId={activeEpisodeId}
            activeProjectId={activeProjectId}
            onCommit={handleCommit}
            onBadgeClick={handleBadgeClick}
            onCharSuggest={handleCharSuggest}
            style={editorStyle}
          />
          <div className="h-48" />
        </div>

        {/* Char suggestion panel */}
        {charSuggestState && suggestEnabled && (() => {
          const blockEl = document.querySelector(`[data-v2-id="${charSuggestState.blockId}"]`);
          if (!blockEl) return null;
          const rect = blockEl.getBoundingClientRect();
          return (
            <div style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, zIndex: 50 }}>
              <CharSuggestionPanel
                charName={charSuggestState.charName}
                onConfirm={() => {
                  surfaceRef.current?.updateBlockChar(
                    charSuggestState.blockId,
                    charSuggestState.charObj.id,
                    charSuggestState.charObj.givenName || charSuggestState.charObj.name
                  );
                  setCharSuggestState(null);
                }}
                onDismiss={() => setCharSuggestState(null)}
              />
            </div>
          );
        })()}
      </div>

      {/* Char picker overlay */}
      {charPickerState && (
        <CharPickerOverlay
          anchor={charPickerState}
          projectChars={projectChars}
          onSelect={handleCharSelect}
          onClose={() => setCharPickerState(null)}
        />
      )}
    </div>
  );
}

// ─── CharSuggestionPanel ──────────────────────────────────────────────────────
function CharSuggestionPanel({ charName, onConfirm, onDismiss }) {
  return (
    <div
      className="rounded shadow-lg px-3 py-2 text-xs flex items-center gap-3"
      style={{ background: 'var(--c-tag)', border: '1px solid var(--c-border4)', userSelect: 'none' }}
    >
      <span style={{ color: 'var(--c-text5)' }}>
        <b style={{ color: 'var(--c-accent)' }}>{charName}</b> 대사로 전환? (Enter)
      </span>
      <button
        onMouseDown={e => { e.preventDefault(); onConfirm(); }}
        className="px-2 py-0.5 rounded text-xs"
        style={{ background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
      >확인</button>
      <button
        onMouseDown={e => { e.preventDefault(); onDismiss(); }}
        className="px-2 py-0.5 rounded text-xs"
        style={{ background: 'transparent', color: 'var(--c-text5)', border: '1px solid var(--c-border3)', cursor: 'pointer' }}
      >Esc</button>
    </div>
  );
}

// ─── CharPickerOverlay ────────────────────────────────────────────────────────
function CharPickerOverlay({ anchor, projectChars, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 30); }, []);
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const filtered = (query
    ? projectChars.filter(c => (c.name || '').includes(query) || (c.givenName || '').includes(query))
    : projectChars
  ).slice(0, 12);

  return (
    <div
      className="fixed z-[100] rounded shadow-xl overflow-hidden"
      style={{ top: anchor.top, left: anchor.left,
               background: 'var(--c-tag)', border: '1px solid var(--c-border4)', minWidth: '180px' }}
    >
      <div className="px-2 py-1.5" style={{ borderBottom: '1px solid var(--c-border)' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.nativeEvent?.isComposing) return;
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
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-xs" style={{ color: 'var(--c-text6)' }}>
            {query ? '검색 결과 없음' : '등록된 인물 없음'}
          </div>
        )}
        {filtered.map(c => (
          <div
            key={c.id || c.name}
            onMouseDown={e => { e.preventDefault(); onSelect(c); }}
            className="px-3 py-1.5 text-xs cursor-pointer flex items-center gap-2"
            style={{ color: 'var(--c-text2)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-active)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span className="font-medium">{c.givenName || c.name}</span>
            {c.role === 'lead' && <span className="text-[10px] px-1 rounded" style={{ background: 'var(--c-accent-dim)', color: 'var(--c-accent)' }}>주인공</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
