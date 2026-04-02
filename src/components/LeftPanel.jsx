import React, { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { genId, now } from '../store/db';

function NavItem({ label, active, onClick, indent = 1, badge }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center py-[5px] cursor-pointer text-sm rounded mx-1 mb-0.5 transition-colors"
      style={{
        paddingLeft: `${indent * 12}px`,
        paddingRight: '8px',
        background: active ? 'var(--c-active)' : 'transparent',
        color: active ? 'var(--c-accent)' : 'var(--c-text4)',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--c-hover)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <span className="truncate flex-1">{label}</span>
      {badge != null && (
        <span className="ml-1 text-[10px]" style={{ color: 'var(--c-text6)' }}>{badge}</span>
      )}
    </div>
  );
}

function InlineInput({ placeholder, defaultValue = '', onCommit, onCancel, indent = 1, allowEmpty = false }) {
  const [val, setVal] = useState(defaultValue);
  const doCommit = () => {
    const trimmed = val.trim();
    if (trimmed || allowEmpty) onCommit(trimmed);
    else onCancel();
  };
  return (
    <input
      autoFocus
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') doCommit();
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={doCommit}
      placeholder={placeholder}
      className="w-full text-sm px-2 py-1 rounded outline-none mx-1 my-0.5"
      style={{
        marginLeft: `${indent * 12}px`,
        width: `calc(100% - ${indent * 12 + 8}px)`,
        background: 'var(--c-tag)',
        color: 'var(--c-text)',
        border: '1px solid var(--c-accent)',
      }}
    />
  );
}

function ProjectItem({ project }) {
  const { state, dispatch } = useApp();
  const { episodes, characters, activeProjectId, activeEpisodeId, activeDoc, synopsisDocs, stylePreset } = state;
  const isActive = project.id === activeProjectId;
  const [expanded, setExpanded] = useState(isActive);
  const [addingEp, setAddingEp] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isActive) setExpanded(true);
  }, [isActive]);

  const epList = episodes
    .filter(e => e.projectId === project.id)
    .sort((a, b) => a.number - b.number);

  const handleSelect = () => {
    dispatch({ type: 'SET_ACTIVE_PROJECT', id: project.id });
    setExpanded(true);
  };

  const synopsisDoc = synopsisDocs?.find(d => d.projectId === project.id);
  const synopsisPages = isActive ? estimateSynopsisPages(synopsisDoc, stylePreset) : 0;

  const addEpisode = (title) => {
    const num = epList.length + 1;
    const ep = {
      id: genId(), projectId: project.id, number: num,
      title: title || '', majorEpisodes: '', summaryItems: [],
      status: 'draft', createdAt: now(), updatedAt: now(),
    };
    dispatch({ type: 'ADD_EPISODE', payload: ep });
    dispatch({ type: 'SET_ACTIVE_EPISODE', id: ep.id });
    setAddingEp(false);
  };

  return (
    <div>
      {renaming ? (
        <InlineInput
          placeholder={project.title}
          onCommit={v => { dispatch({ type: 'UPDATE_PROJECT', payload: { id: project.id, title: v } }); setRenaming(false); }}
          onCancel={() => setRenaming(false)}
          indent={1}
        />
      ) : (
        <div
          className="group flex items-center px-2 py-[6px] cursor-pointer rounded mx-1 mb-0.5"
          style={{ color: isActive ? 'var(--c-text)' : 'var(--c-text3)' }}
          onClick={handleSelect}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span
            className="mr-1.5 text-[10px] select-none"
            style={{ color: 'var(--c-text6)' }}
            onClick={e => { e.stopPropagation(); setExpanded(o => !o); }}
          >
            {expanded ? '▼' : '▶'}
          </span>
          <span className="text-sm font-medium flex-1 truncate">{project.title}</span>
          {isActive && (
            <span className="flex gap-1 opacity-0 group-hover:opacity-100">
              <button onClick={e => { e.stopPropagation(); setRenaming(true); }} className="text-[10px] px-1" style={{ color: 'var(--c-text6)' }}>✎</button>
              {confirmDelete ? (
                <span className="flex items-center gap-1">
                  <button onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_PROJECT', id: project.id }); }} className="text-[10px] px-1" style={{ color: '#f87171' }}>확인</button>
                  <button onClick={e => { e.stopPropagation(); setConfirmDelete(false); }} className="text-[10px] px-1" style={{ color: 'var(--c-text6)' }}>취소</button>
                </span>
              ) : (
                <button onClick={e => { e.stopPropagation(); setConfirmDelete(true); }} className="text-[10px] px-1" style={{ color: 'var(--c-text6)' }}>✕</button>
              )}
            </span>
          )}
        </div>
      )}

      {expanded && isActive && (
        <div>
          <NavItem label="표지" active={activeDoc === 'cover' && !activeEpisodeId} onClick={() => { dispatch({ type: 'SET_ACTIVE_PROJECT', id: project.id }); dispatch({ type: 'SET_ACTIVE_DOC', payload: 'cover' }); }} indent={2} />
          <NavItem label="작품 시놉시스" active={activeDoc === 'synopsis'} onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'synopsis' })} indent={2} badge={synopsisPages > 0 ? `약 ${synopsisPages}p` : null} />

          <div className="mt-1">
            <div className="py-0.5 text-[10px] uppercase tracking-wider" style={{ paddingLeft: '24px', color: 'var(--c-text6)' }}>회차</div>
            {epList.map(ep => <EpisodeItem key={ep.id} ep={ep} isSingle={project.projectType === 'single'} />)}
            {addingEp ? (
              <InlineInput placeholder={`${epList.length + 1}회 제목 (선택)`} onCommit={addEpisode} onCancel={() => setAddingEp(false)} indent={2} allowEmpty />
            ) : (
              <div onClick={() => setAddingEp(true)} className="text-[11px] cursor-pointer py-1" style={{ paddingLeft: '24px', color: 'var(--c-text6)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-text4)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text6)'; }}
              >
                + 회차 추가
              </div>
            )}
          </div>

          {/* 자료 구역 */}
          <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--c-border)' }}>
            <div className="py-0.5 text-[10px] uppercase tracking-wider font-semibold" style={{ paddingLeft: '24px', color: 'var(--c-text5)' }}>자료</div>
            <NavItem
              label="인물"
              active={activeDoc === 'characters'}
              onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'characters' })}
              indent={2}
              badge={characters.filter(c => c.projectId === project.id).length || null}
            />
            <NavItem
              label="인물이력서"
              active={activeDoc === 'biography'}
              onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'biography' })}
              indent={2}
            />
            <NavItem
              label="인물관계도"
              active={activeDoc === 'relationships'}
              onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'relationships' })}
              indent={2}
            />
            <NavItem
              label="자료수집"
              active={activeDoc === 'resources'}
              onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'resources' })}
              indent={2}
            />
          </div>

          {/* 설계 구역 */}
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--c-border)' }}>
            <div className="py-0.5 text-[10px] uppercase tracking-wider font-semibold" style={{ paddingLeft: '24px', color: 'var(--c-text5)' }}>설계</div>
            <NavItem
              label="구조"
              active={activeDoc === 'structure'}
              onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'structure' })}
              indent={2}
            />
            <NavItem
              label="트리트먼트"
              active={activeDoc === 'treatment'}
              onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'treatment' })}
              indent={2}
            />
            <NavItem
              label="씬리스트"
              active={activeDoc === 'scenelist'}
              onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'scenelist' })}
              indent={2}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function estimateSynopsisPages(synopsisDoc, preset) {
  if (!synopsisDoc) return 0;
  const text = [synopsisDoc.genre, synopsisDoc.theme, synopsisDoc.intent, synopsisDoc.story, synopsisDoc.content]
    .filter(Boolean).join(' ');
  if (!text.trim()) return 0;
  const fontSize = preset?.fontSize ?? 11;
  const lineHeight = preset?.lineHeight ?? 1.6;
  const margins = preset?.pageMargins ?? { top: 35, bottom: 30 };
  const usablePt = 841.89 - (margins.top + margins.bottom) * 2.835;
  const linesPerPage = Math.floor(usablePt / (fontSize * lineHeight));
  const charsPerLine = Math.round(50 * (11 / fontSize));
  const totalLines = Math.ceil(text.length / charsPerLine);
  return Math.max(1, Math.ceil(totalLines / linesPerPage));
}

function estimatePages(scriptBlocks, epId, preset) {
  const blocks = scriptBlocks.filter(b => b.episodeId === epId);
  if (!blocks.length) return 0;
  const fontSize = preset?.fontSize ?? 11;
  const lineHeight = preset?.lineHeight ?? 1.6;
  const margins = preset?.pageMargins ?? { top: 35, bottom: 30 };
  const a4HeightPt = 841.89;
  const usablePt = a4HeightPt - (margins.top + margins.bottom) * 2.835;
  const linesPerPage = Math.floor(usablePt / (fontSize * lineHeight));
  let totalLines = 0;
  for (const b of blocks) {
    if (b.type === 'scene_number') totalLines += 2;
    else totalLines += 1 + Math.floor((b.content?.length || 0) / 30);
  }
  return Math.max(1, Math.ceil(totalLines / linesPerPage));
}

function EpisodeItem({ ep, isSingle }) {
  const { state, dispatch } = useApp();
  const { activeEpisodeId, activeDoc, scenes, scriptBlocks, stylePreset } = state;
  const isActive = activeEpisodeId === ep.id && activeDoc === 'script';
  const sceneCount = scenes.filter(s => s.episodeId === ep.id).length;
  const pageEst = estimatePages(scriptBlocks, ep.id, stylePreset);
  const [confirm, setConfirm] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingMajor, setEditingMajor] = useState(false);

  // ── 인라인 제목 편집 ─────────────────────────────────────────────────────
  if (editingTitle) {
    return (
      <InlineInput
        placeholder={ep.title || `${ep.number}회 제목`}
        defaultValue={ep.title || ''}
        onCommit={v => { dispatch({ type: 'UPDATE_EPISODE', payload: { id: ep.id, title: v }, _record: true }); setEditingTitle(false); }}
        onCancel={() => setEditingTitle(false)}
        indent={2}
      />
    );
  }

  // ── 인라인 주요에피소드 편집 ─────────────────────────────────────────────
  if (editingMajor) {
    return (
      <InlineInput
        placeholder="주요 에피소드"
        defaultValue={ep.majorEpisodes || ''}
        onCommit={v => { dispatch({ type: 'UPDATE_EPISODE', payload: { id: ep.id, majorEpisodes: v }, _record: true }); setEditingMajor(false); }}
        onCancel={() => setEditingMajor(false)}
        indent={2}
      />
    );
  }

  const btnStyle = { background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1 };

  return (
    <div
      className="group cursor-pointer rounded mx-1 mb-0.5 py-[5px] pr-1"
      style={{
        paddingLeft: '24px',
        background: isActive ? 'var(--c-active)' : 'transparent',
        color: isActive ? 'var(--c-accent)' : 'var(--c-text4)',
      }}
      onClick={() => dispatch({ type: 'SET_ACTIVE_EPISODE', id: ep.id })}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-hover)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      {/* ── 주 행: 번호 + 제목 + 씬 수 + 액션 버튼 ── */}
      <div className="flex items-center gap-1">
        {!isSingle && (
          <span className="text-xs shrink-0 select-none" style={{ color: isActive ? 'var(--c-accent2)' : 'var(--c-text6)' }}>
            {ep.number}회
          </span>
        )}
        {/* 제목 — 더블클릭으로 편집 진입 */}
        <span
          className="text-sm flex-1 truncate"
          onDoubleClick={e => { e.stopPropagation(); setEditingTitle(true); }}
          title="더블클릭으로 제목 수정"
        >
          {ep.title || <span style={{ color: 'var(--c-text6)', fontStyle: 'italic' }}>제목 없음</span>}
        </span>
        {sceneCount > 0 && (
          <span className="text-[10px] shrink-0 tabular-nums" style={{ color: 'var(--c-text6)' }}>{sceneCount}씬</span>
        )}
        {pageEst > 0 && (
          <span className="text-[10px] shrink-0 tabular-nums" style={{ color: 'var(--c-text6)' }}>약{pageEst}p</span>
        )}
        {/* 액션 버튼 — hover 시 표시, 모두 stopPropagation */}
        <span className="flex items-center gap-0 opacity-0 group-hover:opacity-100 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setEditingTitle(true); }}
            style={{ ...btnStyle, color: 'var(--c-text6)', fontSize: '11px' }}
            title="제목 수정"
          >✎</button>
          <button
            onClick={e => { e.stopPropagation(); setEditingMajor(true); }}
            style={{ ...btnStyle, color: 'var(--c-text6)', fontSize: '13px', fontWeight: 300 }}
            title="주요 에피소드 추가"
          >+</button>
          {confirm ? (
            <>
              <button onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_EPISODE', id: ep.id }); }} style={{ ...btnStyle, color: '#f87171', fontSize: '10px' }}>확인</button>
              <button onClick={e => { e.stopPropagation(); setConfirm(false); }} style={{ ...btnStyle, color: 'var(--c-text6)', fontSize: '10px' }}>취소</button>
            </>
          ) : (
            <button onClick={e => { e.stopPropagation(); setConfirm(true); }} style={{ ...btnStyle, color: 'var(--c-text6)', fontSize: '11px' }}>✕</button>
          )}
        </span>
      </div>

      {/* ── 주요 에피소드 행 — 설정된 경우만 표시, 클릭으로 수정 ── */}
      {ep.majorEpisodes && (
        <div
          className="text-[10px] truncate mt-0.5"
          style={{ color: 'var(--c-text5)', paddingRight: '4px' }}
          onClick={e => { e.stopPropagation(); setEditingMajor(true); }}
          title="주요 에피소드 수정 (클릭)"
        >
          ▸ {ep.majorEpisodes}
        </div>
      )}
    </div>
  );
}

// ─── New project type picker ───────────────────────────────────────────────────
function NewProjectModal({ onCommit, onCancel }) {
  const [title, setTitle] = useState('');
  const [step, setStep] = useState('name'); // 'name' | 'type'

  const handleNameCommit = () => {
    if (!title.trim()) { onCancel(); return; }
    setStep('type');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onCancel}>
      <div className="rounded-xl p-5 w-72 flex flex-col gap-3" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }} onClick={e => e.stopPropagation()}>
        {step === 'name' ? (
          <>
            <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>새 작품</div>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleNameCommit(); if (e.key === 'Escape') onCancel(); }}
              placeholder="작품명 입력"
              className="w-full text-sm px-3 py-2 rounded outline-none"
              style={{ background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-border3)' }}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded" style={{ color: 'var(--c-text5)', border: '1px solid var(--c-border3)', background: 'transparent', cursor: 'pointer' }}>취소</button>
              <button onClick={handleNameCommit} className="text-xs px-3 py-1.5 rounded" style={{ color: '#fff', background: 'var(--c-accent)', border: 'none', cursor: 'pointer' }}>다음</button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>작품 형식</div>
            <div className="text-xs mb-1" style={{ color: 'var(--c-text5)' }}>"{title}"</div>
            <div className="flex gap-2">
              {[
                { type: 'single', label: '단막', desc: '회차 번호 없음' },
                { type: 'series', label: '미니시리즈', desc: '회차 번호 표시' },
              ].map(({ type, label, desc }) => (
                <button
                  key={type}
                  onClick={() => onCommit(title.trim(), type)}
                  className="flex-1 py-3 rounded text-center"
                  style={{ border: '1px solid var(--c-border3)', background: 'var(--c-input)', cursor: 'pointer' }}
                >
                  <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{label}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--c-text6)' }}>{desc}</div>
                </button>
              ))}
            </div>
            <button onClick={onCancel} className="text-xs self-end" style={{ color: 'var(--c-text6)', background: 'none', border: 'none', cursor: 'pointer' }}>취소</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function LeftPanel() {
  const { state, dispatch } = useApp();
  const { projects } = state;
  const [addingProject, setAddingProject] = useState(false);

  const handleAddProject = (title, projectType) => {
    const p = { id: genId(), title, genre: '', status: 'draft', projectType, createdAt: now(), updatedAt: now() };
    dispatch({ type: 'ADD_PROJECT', payload: p });
    dispatch({ type: 'SET_ACTIVE_PROJECT', id: p.id });
    setAddingProject(false);
  };

  return (
    <div className="h-full flex flex-col select-none" style={{ background: 'var(--c-panel)', borderRight: '1px solid var(--c-border)' }}>
      {addingProject && <NewProjectModal onCommit={handleAddProject} onCancel={() => setAddingProject(false)} />}
      <div className="px-3 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--c-border)' }}>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text6)' }}>대본 작업실</span>
        <button onClick={() => setAddingProject(true)} className="text-lg leading-none font-light" style={{ color: 'var(--c-text5)' }} title="새 작품">+</button>
      </div>

      <div className="flex-1 overflow-y-auto py-2" style={{ paddingBottom: '88px' }}>
        {projects.map(p => <ProjectItem key={p.id} project={p} />)}
        {projects.length === 0 && (
          <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--c-text6)' }}>
            + 버튼으로 첫 작품을 만들어보세요
          </div>
        )}
      </div>

    </div>
  );
}
