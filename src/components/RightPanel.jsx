import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { now, genId } from '../store/db';
import { CoverPreview } from './CoverEditor';
import { charDisplayName } from './CharacterPanel';
import { resolveSceneLabel, TIME_OF_DAY_OPTIONS } from '../utils/sceneResolver';
import { GuidePanel } from './StructurePage';
import AdBanner from './AdBanner';

const STATUS_COLORS = { done: '#22c55e', writing: '#eab308', draft: 'var(--c-border3)' };
const STATUS_LABELS = { done: '완료', writing: '작성 중', draft: '초안' };

// ─── Tag input ─────────────────────────────────────────────────────────────────
function TagEditor({ tags, onSave }) {
  const [input, setInput] = useState('');

  const addTag = (raw) => {
    const tag = raw.trim().replace(/^#/, '');
    if (!tag || tags.includes(tag)) return;
    onSave([...tags, tag]);
  };

  const removeTag = (t) => onSave(tags.filter(x => x !== t));

  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-1 mb-1">
        {tags.map(t => (
          <span
            key={t}
            className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 cursor-pointer"
            style={{ background: 'var(--c-tag)', color: 'var(--c-accent2)', border: '1px solid var(--c-border4)' }}
          >
            #{t}
            <span
              onClick={(e) => { e.stopPropagation(); removeTag(t); }}
              className="ml-0.5 opacity-50 hover:opacity-100"
              style={{ cursor: 'pointer', lineHeight: 1 }}
            >×</span>
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.nativeEvent.isComposing) return;
          if ((e.key === 'Enter' || e.key === ' ') && input.trim()) {
            e.preventDefault();
            addTag(input);
            setInput('');
          }
        }}
        onBlur={() => { if (input.trim()) { addTag(input); setInput(''); } }}
        placeholder="#태그 입력 후 Enter"
        className="w-full text-[10px] px-1.5 py-0.5 rounded outline-none"
        style={{
          background: 'var(--c-input)',
          color: 'var(--c-text3)',
          border: '1px solid var(--c-border3)',
        }}
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

// ─── Scene Item ────────────────────────────────────────────────────────────────
function SceneItem({ scene, sceneContent, isActive, onClick, onStatusChange, onTagsChange }) {
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const tags = scene.tags || [];

  const commitTag = () => {
    const tag = tagInput.trim().replace(/^#/, '');
    if (tag && !tags.includes(tag)) onTagsChange([...tags, tag]);
    setTagInput('');
    setAddingTag(false);
  };

  return (
    <div
      className="px-3 py-2 cursor-pointer transition-all"
      style={{
        borderLeft: `2px solid ${isActive ? 'var(--c-accent)' : 'transparent'}`,
        background: isActive ? 'var(--c-active)' : 'transparent',
      }}
      onClick={onClick}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-hover)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-1 w-2 h-2 rounded-full shrink-0"
          style={{ background: STATUS_COLORS[scene.status] || STATUS_COLORS.draft, border: 'none', cursor: 'pointer' }}
          onClick={e => {
            e.stopPropagation();
            const cycle = { draft: 'writing', writing: 'done', done: 'draft' };
            onStatusChange(cycle[scene.status] || 'draft');
          }}
          title={STATUS_LABELS[scene.status]}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-bold shrink-0" style={{ color: 'var(--c-accent2)' }}>{scene.label}</span>
            <span className="text-xs truncate" style={{ color: 'var(--c-text2)' }}>
              {resolveSceneLabel({ ...scene, label: '', content: sceneContent }) || <span style={{ color: 'var(--c-text6)', fontStyle: 'italic' }}>장소 미입력</span>}
            </span>
          </div>
          {/* Tags — one line, compact */}
          <div className="mt-0.5 flex flex-wrap items-center gap-1" onClick={e => e.stopPropagation()}>
            {tags.map(t => (
              <span
                key={t}
                className="text-[10px] px-1 rounded flex items-center gap-0.5"
                style={{ background: 'var(--c-tag)', color: 'var(--c-accent2)', border: '1px solid var(--c-border4)', lineHeight: '1.4' }}
              >
                #{t}
                <span onClick={() => onTagsChange(tags.filter(x => x !== t))} style={{ cursor: 'pointer', opacity: 0.5 }}>×</span>
              </span>
            ))}
            {addingTag ? (
              <input
                autoFocus
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commitTag(); }
                  if (e.key === 'Escape') { setAddingTag(false); setTagInput(''); }
                }}
                onBlur={commitTag}
                placeholder="태그"
                className="text-[10px] px-1 rounded outline-none"
                style={{ width: '4rem', background: 'var(--c-input)', color: 'var(--c-text3)', border: '1px solid var(--c-accent)' }}
              />
            ) : (
              <button
                onClick={() => setAddingTag(true)}
                className="text-[10px] opacity-40 hover:opacity-80"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text5)', padding: 0 }}
              >+태그</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Character Usage Panel ─────────────────────────────────────────────────────
function CharacterUsagePanel({ charId, onScrollToScene }) {
  const { state, dispatch } = useApp();
  const { characters, scriptBlocks, episodes } = state;

  const char = characters.find(c => c.id === charId);
  if (!char) return null;

  const dialogueBlocks = scriptBlocks.filter(b => b.type === 'dialogue' && b.characterId === charId);
  // 패널에 표시되는 씬 기준으로 카운트 (선행 scene_number 블록 ID 기준)
  const sceneCount = useMemo(() => {
    const seenSceneBlockIds = new Set();
    dialogueBlocks.forEach(b => {
      const epBlocks = scriptBlocks.filter(x => x.episodeId === b.episodeId);
      const bIdx = epBlocks.findIndex(x => x.id === b.id);
      for (let i = bIdx - 1; i >= 0; i--) {
        if (epBlocks[i].type === 'scene_number') { seenSceneBlockIds.add(epBlocks[i].id); break; }
      }
    });
    return seenSceneBlockIds.size;
  }, [dialogueBlocks, scriptBlocks]);

  // Group by episode
  const byEpisode = useMemo(() => {
    const map = {};
    dialogueBlocks.forEach(b => {
      const epId = b.episodeId || '_';
      if (!map[epId]) map[epId] = [];
      map[epId].push(b);
    });
    return map;
  }, [dialogueBlocks]);

  const handleNav = (epId, blockId) => {
    dispatch({ type: 'SET_ACTIVE_EPISODE', id: epId });
    setTimeout(() => dispatch({ type: 'SET_SCROLL_TO_SCENE', id: blockId }), 50);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto">
      {/* Summary */}
      <div className="px-3 py-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
        <div className="font-semibold text-sm mb-1" style={{ color: 'var(--c-text)' }}>{charDisplayName(char)}</div>
        <div className="flex gap-4 text-xs" style={{ color: 'var(--c-text4)' }}>
          <span>등장 씬 <strong style={{ color: 'var(--c-accent2)' }}>{sceneCount}</strong></span>
          <span>대사 <strong style={{ color: 'var(--c-accent2)' }}>{dialogueBlocks.length}</strong>줄</span>
        </div>
      </div>

      {dialogueBlocks.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs" style={{ color: 'var(--c-text6)' }}>등록된 대사 없음</div>
      ) : (
        <div className="py-1">
          {Object.entries(byEpisode).map(([epId, blocks]) => {
            const ep = episodes.find(e => e.id === epId);
            const epBlocks = scriptBlocks.filter(x => x.episodeId === epId);
            return (
              <div key={epId} className="mb-2">
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-accent)' }}>
                  {ep ? `${ep.number}회 ${ep.title || ''}` : '미분류'}
                </div>
                {blocks.map(b => {
                  // Find scene label preceding this block
                  const bIdx = epBlocks.findIndex(x => x.id === b.id);
                  let sceneLbl = '';
                  for (let i = bIdx - 1; i >= 0; i--) {
                    if (epBlocks[i].type === 'scene_number') { sceneLbl = epBlocks[i].label || ''; break; }
                  }
                  const excerpt = (b.content || '').slice(0, 55) + ((b.content || '').length > 55 ? '…' : '');
                  return (
                    <button
                      key={b.id}
                      onClick={() => handleNav(epId, b.id)}
                      className="w-full text-left px-3 py-1.5 transition-colors"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {sceneLbl && <div className="text-[10px]" style={{ color: 'var(--c-text6)' }}>{sceneLbl}</div>}
                      <div className="text-xs leading-relaxed" style={{ color: 'var(--c-text3)' }}>
                        {excerpt || <em style={{ color: 'var(--c-text6)' }}>(빈 대사)</em>}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      </div>
      <AdBanner slot={`char-${charId}`} mobileHide style={{ margin: '6px 8px' }} />
    </div>
  );
}

// ─── ChecklistPanel ───────────────────────────────────────────────────────────
// scope: 'project' (projectId, docId=null) or 'doc' (projectId, docId)
function ChecklistPanel({ projectId, docId }) {
  const { state, dispatch } = useApp();
  const items = state.checklistItems.filter(it =>
    it.projectId === projectId && (docId ? it.docId === docId : !it.docId)
  );
  const [inputVal, setInputVal] = useState('');
  const [showDone, setShowDone] = useState(false);
  const inputRef = useRef(null);

  const addItem = () => {
    const text = inputVal.trim();
    if (!text) return;
    dispatch({ type: 'ADD_CHECKLIST_ITEM', payload: {
      id: genId(), projectId, docId: docId || null, text, done: false, createdAt: now(),
    }});
    setInputVal('');
    inputRef.current?.focus();
  };

  const toggle = (id, done) => dispatch({ type: 'UPDATE_CHECKLIST_ITEM', payload: { id, done } });
  const del    = (id)       => dispatch({ type: 'DELETE_CHECKLIST_ITEM', id });
  const editText = (id, text) => dispatch({ type: 'UPDATE_CHECKLIST_ITEM', payload: { id, text } });

  const pendingItems = items.filter(it => !it.done);
  const doneItems    = items.filter(it => it.done);
  const total = items.length;

  const CheckItem = ({ it }) => (
    <div className="flex items-start gap-2 px-3 py-1.5 group"
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
      <button
        onClick={() => toggle(it.id, !it.done)}
        className="mt-0.5 w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center border transition-colors"
        style={{
          borderColor: it.done ? 'var(--c-accent)' : 'var(--c-border3)',
          background: it.done ? 'var(--c-accent)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        {it.done && <span className="text-white text-[8px]">✓</span>}
      </button>
      <input
        value={it.text}
        onChange={e => editText(it.id, e.target.value)}
        className="flex-1 text-xs bg-transparent outline-none leading-relaxed"
        style={{
          color: it.done ? 'var(--c-text6)' : 'var(--c-text3)',
          textDecoration: it.done ? 'line-through' : 'none',
          border: 'none',
        }}
      />
      <button onClick={() => del(it.id)}
        className="opacity-0 group-hover:opacity-100 text-[10px] shrink-0"
        style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid var(--c-border)' }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--c-text6)' }}>
            {docId ? '문서 체크리스트' : '프로젝트 체크리스트'}
          </span>
          {total > 0 && (
            <span className="text-[10px]" style={{ color: doneItems.length === total ? 'var(--c-success, #22c55e)' : 'var(--c-text6)' }}>
              {doneItems.length}/{total}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <input
            ref={inputRef}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') addItem(); }}
            placeholder="항목 추가 후 Enter"
            className="flex-1 text-xs px-2 py-1 rounded outline-none"
            style={{ background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-border3)' }}
          />
          <button onClick={addItem} className="px-2 py-1 rounded text-xs"
            style={{ background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>+</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {/* Pending items */}
        {pendingItems.length === 0 && doneItems.length === 0 && (
          <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--c-text6)' }}>항목 없음</div>
        )}
        {pendingItems.length === 0 && doneItems.length > 0 && (
          <div className="px-3 py-4 text-center text-xs" style={{ color: 'var(--c-success, #22c55e)' }}>모두 완료됨 ✓</div>
        )}
        {pendingItems.map(it => <CheckItem key={it.id} it={it} />)}

        {/* 완료됨 collapsible section */}
        {doneItems.length > 0 && (
          <div className="mt-1">
            <button
              onClick={() => setShowDone(v => !v)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px]"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--c-text6)', borderTop: '1px solid var(--c-border)',
              }}
            >
              <span style={{ fontSize: '8px' }}>{showDone ? '▼' : '▶'}</span>
              완료됨 {doneItems.length}개
            </button>
            {showDone && doneItems.map(it => <CheckItem key={it.id} it={it} />)}
          </div>
        )}
      </div>
      <AdBanner slot="checklist" mobileHide style={{ margin: '6px 8px' }} />
    </div>
  );
}

// ─── CoverMiniPreview ─────────────────────────────────────────────────────────
function CoverMiniPreview() {
  const { state } = useApp();
  const { activeDoc } = state;

  if (activeDoc === 'cover') {
    return <AdBanner slot="cover-panel" mobileHide={false} height={120} style={{ margin: 12 }} />;
  }

  if (activeDoc === 'synopsis') {
    return <AdBanner slot="synopsis-panel" mobileHide={false} height={120} style={{ margin: 12 }} />;
  }

  return null;
}

// ─── DocMemo ──────────────────────────────────────────────────────────────────
// Internal (non-printable) memo per page. Stored in localStorage per project+page.
function DocMemo({ projectId, docKey }) {
  const storageKey = `drama_docMemo_${projectId}_${docKey}`;
  const [memo, setMemo] = useState(() => {
    try { return localStorage.getItem(storageKey) || ''; } catch { return ''; }
  });
  const timerRef = useRef(null);

  const handleChange = (e) => {
    const val = e.target.value;
    setMemo(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try { localStorage.setItem(storageKey, val); } catch {}
    }, 400);
  };

  return (
    <div className="px-3 py-2 flex-1 flex flex-col min-h-0" style={{ borderTop: '1px solid var(--c-border)' }}>
      <div className="text-[10px] uppercase tracking-widest mb-1 shrink-0" style={{ color: 'var(--c-text6)' }}>메모</div>
      <textarea
        value={memo}
        onChange={handleChange}
        placeholder="메모 입력..."
        className="flex-1 w-full text-xs rounded outline-none resize-none"
        style={{
          background: 'var(--c-input)',
          color: 'var(--c-text2)',
          border: '1px solid var(--c-border3)',
          padding: '4px 6px',
          lineHeight: 1.5,
          fontFamily: 'inherit',
          minHeight: '60px',
        }}
      />
    </div>
  );
}

// ─── Page context info panels ─────────────────────────────────────────────────
function PageInfoPanel({ icon, title, items }) {
  return (
    <div className="shrink-0 flex flex-col px-4 py-4 gap-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl" style={{ color: 'var(--c-border3)' }}>{icon}</span>
        <span className="text-xs font-semibold" style={{ color: 'var(--c-text4)' }}>{title}</span>
      </div>
      {items.map((item, i) => (
        <div key={i} className="text-[11px] leading-relaxed" style={{ color: 'var(--c-text5)' }}>
          {item}
        </div>
      ))}
    </div>
  );
}

// ─── RightPanel ───────────────────────────────────────────────────────────────
export default function RightPanel({ onScrollToScene }) {
  const { state, dispatch } = useApp();
  const { scenes, scriptBlocks, activeEpisodeId, activeDoc, activeProjectId, selectedStructureSceneId } = state;

  const episodeScenes = scenes
    .filter(s => s.episodeId === activeEpisodeId)
    .sort((a, b) => a.sceneSeq - b.sceneSeq);

  const [activeSceneId, setActiveSceneId] = useState(null);
  const [tagFilter, setTagFilter] = useState('');
  const [mainTab, setMainTab] = useState('context'); // 'context' | 'checklist'

  const handleSceneClick = (scene) => {
    setActiveSceneId(scene.id);
    onScrollToScene?.(scene.id);
  };

  const handleStatusChange = (sceneId, status) => {
    dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, status, updatedAt: now() } });
  };

  const handleTagsChange = (sceneId, tags) => {
    dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, tags, updatedAt: now() }, _record: true });
  };

  const handleMetaChange = (sceneId, meta) => {
    dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, ...meta, updatedAt: now() } });
  };

  // Collect all unique tags for filter
  const allTags = useMemo(() => {
    const set = new Set();
    episodeScenes.forEach(s => (s.tags || []).forEach(t => set.add(t)));
    return [...set];
  }, [episodeScenes]);

  const filteredScenes = tagFilter
    ? episodeScenes.filter(s => (s.tags || []).includes(tagFilter))
    : episodeScenes;

  const isScriptView = activeDoc === 'script' && activeEpisodeId;
  const isCharView = activeDoc === 'characters';
  // 표지: 체크리스트만 표시 (문맥 패널 없음)
  // 그 외: 문맥 + 체크리스트 탭

  // Determine the context content
  const withMemo = (children, docKey) => (
    <>
      {children}
      {activeProjectId && <DocMemo projectId={activeProjectId} docKey={docKey} />}
    </>
  );

  let contextContent = null;
  if (activeDoc === 'cover') {
    contextContent = withMemo(<CoverMiniPreview />, 'cover');
  } else if (activeDoc === 'synopsis') {
    contextContent = withMemo(<CoverMiniPreview />, 'synopsis');
  } else if (activeDoc === 'biography') {
    contextContent = withMemo(
      <div className="flex flex-col items-center justify-center" style={{ padding: '12px', flex: 1 }}>
        <AdBanner slot="biography-panel" mobileHide={false} height={120} style={{ width: '100%' }} />
      </div>,
      'biography'
    );
  } else if (activeDoc === 'relationships') {
    contextContent = withMemo(
      <div className="flex flex-col items-center justify-center" style={{ padding: '12px', flex: 1 }}>
        <AdBanner slot="relationships-panel" mobileHide={false} height={120} style={{ width: '100%' }} />
      </div>,
      'relationships'
    );
  } else if (activeDoc === 'resources') {
    contextContent = withMemo(
      <div className="flex flex-col items-center justify-center" style={{ padding: '12px', flex: 1 }}>
        <AdBanner slot="resources-panel" mobileHide={false} height={120} style={{ width: '100%' }} />
      </div>,
      'resources'
    );
  } else if (activeDoc === 'treatment') {
    contextContent = withMemo(
      <div className="flex flex-col items-center justify-center" style={{ padding: '12px', flex: 1 }}>
        <AdBanner slot="treatment-panel" mobileHide={false} height={120} style={{ width: '100%' }} />
      </div>,
      'treatment'
    );
  } else if (activeDoc === 'scenelist') {
    contextContent = withMemo(
      <div className="flex flex-col items-center justify-center" style={{ padding: '12px', flex: 1 }}>
        <AdBanner slot="scenelist-panel" mobileHide={false} height={120} style={{ width: '100%' }} />
      </div>,
      'scenelist'
    );
  } else if (activeDoc === 'structure') {
    contextContent = withMemo(
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto min-h-0">
          <GuidePanel
            selectedSceneId={selectedStructureSceneId}
            scenes={scenes}
            dispatch={dispatch}
          />
        </div>
        <AdBanner slot="structure-panel" mobileHide style={{ margin: '6px 8px' }} />
      </div>,
      'structure'
    );
  } else if (isCharView) {
    contextContent = withMemo(
      <div className="flex flex-col items-center justify-center" style={{ padding: '12px', flex: 1 }}>
        <AdBanner slot="characters-panel" mobileHide={false} height={120} style={{ width: '100%' }} />
      </div>,
      'characters'
    );
  } else if (isScriptView) {
    contextContent = <SceneOutlineContent />;
  } else {
    contextContent = (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-xs text-center px-4" style={{ color: 'var(--c-text6)' }}>
          회차 대본을<br/>열면 씬 목록이<br/>표시됩니다
        </span>
      </div>
    );
  }

  function SceneOutlineContent() {
    return (
      <>
        <div className="px-3 py-3 shrink-0" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text6)' }}>씬 개요</span>
            <span className="text-[10px]" style={{ color: 'var(--c-text6)' }}>{episodeScenes.length}개</span>
          </div>
          {allTags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              <button
                onClick={() => setTagFilter('')}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  background: tagFilter === '' ? 'var(--c-accent)' : 'var(--c-tag)',
                  color: tagFilter === '' ? '#fff' : 'var(--c-text5)',
                  border: 'none', cursor: 'pointer',
                }}
              >전체</button>
              {allTags.map(t => (
                <button
                  key={t}
                  onClick={() => setTagFilter(tagFilter === t ? '' : t)}
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    background: tagFilter === t ? 'var(--c-accent)' : 'var(--c-tag)',
                    color: tagFilter === t ? '#fff' : 'var(--c-accent2)',
                    border: 'none', cursor: 'pointer',
                  }}
                >#{t}</button>
              ))}
            </div>
          )}
        </div>

        <div className="px-3 py-1.5 flex gap-3 shrink-0" style={{ borderBottom: '1px solid var(--c-border)' }}>
          {Object.entries(STATUS_LABELS).map(([s, l]) => (
            <div key={s} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLORS[s] }} />
              <span className="text-[9px]" style={{ color: 'var(--c-text6)' }}>{l}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filteredScenes.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs" style={{ color: 'var(--c-text6)' }}>
              {tagFilter ? `#${tagFilter} 씬 없음` : 'Ctrl+Shift+1 로 씬번호를 추가하세요'}
            </div>
          ) : (
            filteredScenes.map(scene => {
              const allEpBlocks = scriptBlocks.filter(b => b.episodeId === activeEpisodeId);
              const sceneNumBlock = allEpBlocks.find(b => b.type === 'scene_number' && b.sceneId === scene.id);
              const sceneNumBlocks = allEpBlocks.filter(b => b.type === 'scene_number');
              const sceneIdx = sceneNumBlocks.indexOf(sceneNumBlock);
              const nextSceneBlock = sceneNumBlocks[sceneIdx + 1];
              const startI = sceneNumBlock ? allEpBlocks.indexOf(sceneNumBlock) : -1;
              const endI = nextSceneBlock ? allEpBlocks.indexOf(nextSceneBlock) : allEpBlocks.length;
              const segmentBlocks = startI >= 0 ? allEpBlocks.slice(startI + 1, endI) : [];

              return (
                <SceneItem
                  key={scene.id}
                  scene={scene}
                  sceneContent={sceneNumBlock?.content || scene.content}
                  isActive={activeSceneId === scene.id}
                  onClick={() => handleSceneClick(scene)}
                  onStatusChange={status => handleStatusChange(scene.id, status)}
                  onTagsChange={tags => handleTagsChange(scene.id, tags)}
                />
              );
            })
          )}
        </div>

        {episodeScenes.length > 0 && (
          <div className="px-3 py-2 text-[10px] shrink-0" style={{ borderTop: '1px solid var(--c-border)', color: 'var(--c-text6)' }}>
            완료 {episodeScenes.filter(s => s.status === 'done').length} /
            작성 중 {episodeScenes.filter(s => s.status === 'writing').length} /
            초안 {episodeScenes.filter(s => s.status === 'draft').length}
          </div>
        )}
        {activeProjectId && <DocMemo projectId={activeProjectId} docKey={`script_${activeEpisodeId}`} />}
      </>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--c-panel)', borderLeft: '1px solid var(--c-border)' }}>
      {/* Top-level tabs: 문맥(인물현황) | 체크리스트 */}
      <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--c-border)' }}>
        {[['context', '문맥'], ['checklist', '체크리스트']].map(([t, l]) => (
          <button key={t} onClick={() => setMainTab(t)}
            className="flex-1 py-2 text-[11px] font-medium"
            style={{
              background: 'transparent', border: 'none',
              borderBottom: mainTab === t ? '2px solid var(--c-accent)' : '2px solid transparent',
              color: mainTab === t ? 'var(--c-accent)' : 'var(--c-text5)', cursor: 'pointer',
            }}>
            {l}
          </button>
        ))}
      </div>
      {/* Content */}
      {mainTab === 'checklist'
        ? <ChecklistPanel
            projectId={activeProjectId}
            docId={null}
          />
        : <div className="flex flex-col flex-1 min-h-0">{contextContent}</div>
      }
    </div>
  );
}
