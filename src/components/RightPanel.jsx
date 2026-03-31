import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { now, genId } from '../store/db';
import { CoverPreview } from './CoverEditor';
import { charDisplayName } from './CharacterPanel';
import { resolveSceneLabel, TIME_OF_DAY_OPTIONS } from '../utils/sceneResolver';
import { GuidePanel } from './StructurePage';

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
function SceneItem({ scene, sceneContent, segmentBlocks, isActive, onClick, onStatusChange, onTagsChange, onMetaChange }) {
  const [showTags, setShowTags] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const dialogueCount = segmentBlocks.filter(b => b.type === 'dialogue').length;
  const actionCount = segmentBlocks.filter(b => b.type === 'action').length;
  const tags = scene.tags || [];

  return (
    <div
      className="px-3 py-2.5 cursor-pointer transition-all"
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
          {(dialogueCount > 0 || actionCount > 0) && (
            <div className="mt-0.5 text-[10px] flex gap-2" style={{ color: 'var(--c-text6)' }}>
              {actionCount > 0 && <span>지문 {actionCount}</span>}
              {dialogueCount > 0 && <span>대사 {dialogueCount}</span>}
            </div>
          )}
          {/* Tags display */}
          {tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.map(t => (
                <span key={t} className="text-[10px] px-1.5 rounded" style={{ background: 'var(--c-tag)', color: 'var(--c-accent2)' }}>
                  #{t}
                </span>
              ))}
            </div>
          )}
          {/* Tag edit toggle */}
          <button
            onClick={e => { e.stopPropagation(); setShowTags(v => !v); }}
            className="mt-0.5 text-[10px] opacity-50 hover:opacity-100"
            style={{ color: 'var(--c-text5)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {showTags ? '태그 닫기' : '+ 태그'}
          </button>
          {showTags && (
            <div onClick={e => e.stopPropagation()}>
              <TagEditor tags={tags} onSave={onTagsChange} />
            </div>
          )}
          {/* Scene metadata toggle */}
          <button
            onClick={e => { e.stopPropagation(); setShowMeta(v => !v); }}
            className="mt-0.5 text-[10px] opacity-50 hover:opacity-100"
            style={{ color: 'var(--c-text5)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {showMeta ? '씬 정보 닫기' : '+ 씬 정보'}
          </button>
          {showMeta && (
            <div onClick={e => e.stopPropagation()} className="mt-1.5 space-y-1">
              <input
                placeholder="장소"
                value={scene.location || ''}
                onChange={e => onMetaChange({ location: e.target.value })}
                className="w-full text-[10px] px-1.5 py-0.5 rounded outline-none"
                style={{ background: 'var(--c-input)', color: 'var(--c-text3)', border: '1px solid var(--c-border3)' }}
              />
              <input
                placeholder="세부장소"
                value={scene.subLocation || ''}
                onChange={e => onMetaChange({ subLocation: e.target.value })}
                className="w-full text-[10px] px-1.5 py-0.5 rounded outline-none"
                style={{ background: 'var(--c-input)', color: 'var(--c-text3)', border: '1px solid var(--c-border3)' }}
              />
              <div className="flex gap-1">
                <select
                  value={scene.timeOfDay || ''}
                  onChange={e => onMetaChange({ timeOfDay: e.target.value })}
                  className="flex-1 text-[10px] px-1 py-0.5 rounded outline-none"
                  style={{ background: 'var(--c-input)', color: 'var(--c-text3)', border: '1px solid var(--c-border3)' }}
                >
                  <option value="">시간대</option>
                  {TIME_OF_DAY_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  placeholder="특수상황(예:회상)"
                  value={scene.specialSituation || ''}
                  onChange={e => onMetaChange({ specialSituation: e.target.value })}
                  className="flex-1 text-[10px] px-1.5 py-0.5 rounded outline-none"
                  style={{ background: 'var(--c-input)', color: 'var(--c-text3)', border: '1px solid var(--c-border3)' }}
                />
              </div>
            </div>
          )}
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
  const sceneCount = useMemo(() => {
    const sceneIds = new Set();
    dialogueBlocks.forEach(b => { if (b.sceneId) sceneIds.add(b.sceneId); });
    return sceneIds.size;
  }, [dialogueBlocks]);

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
    </div>
  );
}

// ─── CoverMiniPreview ─────────────────────────────────────────────────────────
function CoverMiniPreview() {
  const { state } = useApp();
  const { coverDocs, synopsisDocs, activeProjectId, activeDoc } = state;

  if (activeDoc === 'cover') {
    const doc = coverDocs.find(d => d.projectId === activeProjectId);
    if (!doc) {
      return (
        <div className="flex-1 flex items-center justify-center px-4 text-center text-xs" style={{ color: 'var(--c-text6)' }}>
          표지를 작성하면<br/>미리보기가 표시됩니다
        </div>
      );
    }
    // Build values/customFields from doc
    const values = {
      title: doc.title || '', subtitle: doc.subtitle || '', writer: doc.writer || '',
      coWriter: doc.coWriter || '', genre: doc.genre || '', broadcaster: doc.broadcaster || '',
      note: doc.note || '',
    };
    if (doc.fields) {
      doc.fields.forEach(f => { if (f.id in values) values[f.id] = f.value || ''; });
    }
    return (
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-[10px] uppercase tracking-widest mb-2 text-center" style={{ color: 'var(--c-text6)' }}>표지 미리보기</div>
        <CoverPreview values={values} customFields={doc.customFields || []} />
      </div>
    );
  }

  if (activeDoc === 'synopsis') {
    const doc = synopsisDocs.find(d => d.projectId === activeProjectId);
    const fieldCount = doc
      ? [doc.genre, doc.theme, doc.intent, doc.story].filter(Boolean).length
      : 0;
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-2">
        <div className="text-2xl" style={{ color: 'var(--c-border3)' }}>📄</div>
        <div className="text-xs" style={{ color: 'var(--c-text5)' }}>시놉시스</div>
        {fieldCount > 0 ? (
          <div className="text-[10px]" style={{ color: 'var(--c-text6)' }}>
            {fieldCount}개 항목 입력됨
            {doc?.characters?.length > 0 && ` · 인물 ${doc.characters.length}명`}
          </div>
        ) : (
          <div className="text-[10px]" style={{ color: 'var(--c-text6)' }}>내용을 입력하세요</div>
        )}
      </div>
    );
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
    <div className="px-3 py-2 shrink-0" style={{ borderTop: '1px solid var(--c-border)' }}>
      <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--c-text6)' }}>메모 (출력 미포함)</div>
      <textarea
        value={memo}
        onChange={handleChange}
        placeholder="내부 메모..."
        rows={3}
        className="w-full text-xs rounded outline-none resize-none"
        style={{
          background: 'var(--c-input)',
          color: 'var(--c-text2)',
          border: '1px solid var(--c-border3)',
          padding: '4px 6px',
          lineHeight: 1.5,
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}

// ─── Page context info panels ─────────────────────────────────────────────────
function PageInfoPanel({ icon, title, items }) {
  return (
    <div className="flex-1 flex flex-col overflow-y-auto px-4 py-4 gap-3">
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
  const { scenes, scriptBlocks, activeEpisodeId, activeDoc, selectedCharacterId, activeProjectId, selectedStructureSceneId } = state;

  const episodeScenes = scenes
    .filter(s => s.episodeId === activeEpisodeId)
    .sort((a, b) => a.sceneSeq - b.sceneSeq);

  const [activeSceneId, setActiveSceneId] = useState(null);
  const [tab, setTab] = useState('scenes'); // 'scenes' | 'character'
  const [tagFilter, setTagFilter] = useState('');
  const [mainTab, setMainTab] = useState('context'); // 'context' | 'checklist'

  // Switch to character tab when a character is selected
  React.useEffect(() => {
    if (selectedCharacterId) setTab('character');
  }, [selectedCharacterId]);

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
      <PageInfoPanel icon="📋" title="인물이력서 작성 팁" items={[
        '인물의 외형·성격·배경을 구체적으로 작성하세요.',
        '다른 인물과의 관계, 동기, 비밀 등을 기록하면 대본 집필에 도움이 됩니다.',
        '이력서는 출력물에 포함되지 않으므로 자유롭게 메모하세요.',
      ]} />,
      'biography'
    );
  } else if (activeDoc === 'relationships') {
    contextContent = withMemo(
      <PageInfoPanel icon="🔗" title="인물관계도 안내" items={[
        '편집 탭에서 인물 간 관계를 추가하세요.',
        '그래프 탭에서 노드를 드래그해 배치를 조정할 수 있습니다.',
        '인쇄 탭에서 관계도를 PDF로 저장할 수 있습니다.',
      ]} />,
      'relationships'
    );
  } else if (activeDoc === 'resources') {
    contextContent = withMemo(
      <PageInfoPanel icon="📁" title="자료수집 안내" items={[
        '참고 이미지, 링크, 메모 등 창작 자료를 정리하세요.',
        '태그를 활용해 자료를 카테고리별로 묶어두면 편리합니다.',
        '자료수집 항목은 출력물에 포함되지 않습니다.',
      ]} />,
      'resources'
    );
  } else if (activeDoc === 'treatment') {
    contextContent = withMemo(
      <PageInfoPanel icon="📝" title="트리트먼트 작성 팁" items={[
        '각 씬의 주요 행동과 감정 변화를 간결하게 서술하세요.',
        '대사보다는 장면의 흐름과 인물의 의도에 집중하세요.',
        '한 씬 = 2~5줄이 적당합니다.',
      ]} />,
      'treatment'
    );
  } else if (activeDoc === 'scenelist') {
    contextContent = withMemo(
      <PageInfoPanel icon="🎬" title="씬리스트 안내" items={[
        '씬 번호, 장소, 시간대, 등장인물을 정리하세요.',
        '씬리스트는 대본 전체 구조 파악에 도움이 됩니다.',
        '구조 페이지에서 비트 태그를 씬에 연결할 수 있습니다.',
      ]} />,
      'scenelist'
    );
  } else if (activeDoc === 'structure') {
    contextContent = (
      <div className="flex-1 overflow-y-auto">
        <GuidePanel
          selectedSceneId={selectedStructureSceneId}
          scenes={scenes}
          dispatch={dispatch}
        />
      </div>
    );
  } else if (isCharView && selectedCharacterId) {
    contextContent = (
      <>
        {/* Sub-tabs: scene outline vs character usage */}
        <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--c-border)' }}>
          {[['scenes', '씬 개요'], ['character', '인물 현황']].map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2 text-[11px] font-medium"
              style={{ background: 'transparent', border: 'none',
                borderBottom: tab === t ? '2px solid var(--c-accent)' : '2px solid transparent',
                color: tab === t ? 'var(--c-accent)' : 'var(--c-text5)', cursor: 'pointer' }}>
              {l}
            </button>
          ))}
        </div>
        {tab === 'character'
          ? <CharacterUsagePanel charId={selectedCharacterId} onScrollToScene={onScrollToScene} />
          : <SceneOutlineContent />}
      </>
    );
  } else if (isScriptView) {
    contextContent = <SceneOutlineContent />;
  } else if (activeDoc === 'characters') {
    contextContent = (
      <PageInfoPanel icon="👥" title="인물 패널 안내" items={[
        '인물을 선택하면 해당 인물의 대사 목록이 표시됩니다.',
        '인물관계도에서 인물 간 관계를 시각적으로 확인하세요.',
      ]} />
    );
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
              {tagFilter ? `#${tagFilter} 씬 없음` : 'Ctrl+1 로 씬번호를 추가하세요'}
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
                  segmentBlocks={segmentBlocks}
                  isActive={activeSceneId === scene.id}
                  onClick={() => handleSceneClick(scene)}
                  onStatusChange={status => handleStatusChange(scene.id, status)}
                  onTagsChange={tags => handleTagsChange(scene.id, tags)}
                  onMetaChange={meta => handleMetaChange(scene.id, meta)}
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
      </>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--c-panel)', borderLeft: '1px solid var(--c-border)' }}>
      {/* Top-level tabs: 문맥 | 체크리스트 */}
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
            docId={activeEpisodeId || (activeDoc !== 'cover' ? activeDoc : null)}
          />
        : <div className="flex flex-col flex-1 min-h-0">{contextContent}</div>
      }
    </div>
  );
}
