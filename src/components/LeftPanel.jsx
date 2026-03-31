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
  const { episodes, characters, activeProjectId, activeEpisodeId, activeDoc } = state;
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
          <NavItem label="작품 시놉시스" active={activeDoc === 'synopsis'} onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'synopsis' })} indent={2} />

          <div className="mt-1">
            <div className="py-0.5 text-[10px] uppercase tracking-wider" style={{ paddingLeft: '24px', color: 'var(--c-text6)' }}>회차</div>
            {epList.map(ep => <EpisodeItem key={ep.id} ep={ep} />)}
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

function EpisodeItem({ ep }) {
  const { state, dispatch } = useApp();
  const { activeEpisodeId, activeDoc, scenes } = state;
  const isActive = activeEpisodeId === ep.id && activeDoc === 'script';
  const sceneCount = scenes.filter(s => s.episodeId === ep.id).length;
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
        <span className="text-xs shrink-0 select-none" style={{ color: isActive ? 'var(--c-accent2)' : 'var(--c-text6)' }}>
          {ep.number}회
        </span>
        {/* 제목 — 더블클릭으로 편집 진입 */}
        <span
          className="text-sm flex-1 truncate"
          onDoubleClick={e => { e.stopPropagation(); setEditingTitle(true); }}
          title="더블클릭으로 제목 수정"
        >
          {ep.title || <span style={{ color: 'var(--c-text6)', fontStyle: 'italic' }}>제목 없음</span>}
        </span>
        {sceneCount > 0 && (
          <span className="text-[10px] shrink-0 tabular-nums" style={{ color: 'var(--c-text6)' }}>{sceneCount}</span>
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

export default function LeftPanel() {
  const { state, dispatch } = useApp();
  const { projects } = state;
  const [addingProject, setAddingProject] = useState(false);

  return (
    <div className="h-full flex flex-col select-none" style={{ background: 'var(--c-panel)', borderRight: '1px solid var(--c-border)' }}>
      <div className="px-3 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--c-border)' }}>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text6)' }}>대본 작업실</span>
        <button onClick={() => setAddingProject(true)} className="text-lg leading-none font-light" style={{ color: 'var(--c-text5)' }} title="새 작품">+</button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {projects.map(p => <ProjectItem key={p.id} project={p} />)}
        {addingProject && (
          <InlineInput
            placeholder="새 작품명"
            onCommit={title => {
              const p = { id: genId(), title, genre: '', status: 'draft', createdAt: now(), updatedAt: now() };
              dispatch({ type: 'ADD_PROJECT', payload: p });
              dispatch({ type: 'SET_ACTIVE_PROJECT', id: p.id });
              setAddingProject(false);
            }}
            onCancel={() => setAddingProject(false)}
            indent={1}
          />
        )}
        {projects.length === 0 && !addingProject && (
          <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--c-text6)' }}>
            + 버튼으로 첫 작품을 만들어보세요
          </div>
        )}
      </div>

      {/* 광고 영역 placeholder */}
      <div
        className="shrink-0 mx-2 mb-2 rounded flex items-center justify-center"
        style={{
          height: '80px',
          border: '1px dashed var(--c-border3)',
          background: 'var(--c-bg)',
          color: 'var(--c-text6)',
          fontSize: '10px',
        }}
      >
        광고 영역
      </div>
    </div>
  );
}
