/**
 * v2 App Shell
 * ─────────────────────────────────────────────────────────────
 * Minimal 3-panel layout using v2 store + v2 editor.
 * Reuses v1 UI components where possible (LeftPanel, etc.)
 * with v2 store adapters.
 *
 * Panels: LeftPanel (v1, adapted) | EditorCore (v2) | RightPanel (v1, adapted)
 */
import React, { useState, useEffect } from 'react';
import { StoreProvider, useStore } from './store/StoreContext.jsx';
import { sel } from './store/selectors.js';
import * as A from './store/actions.js';
import { genId, now } from './store/StoreContext.jsx';
import EditorCore from './editor/EditorCore.jsx';
import './editor/editor.css';

// ─── Provider wrapper ─────────────────────────────────────────────────────────
export default function V2App() {
  return (
    <StoreProvider>
      <V2Shell />
    </StoreProvider>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────
function V2Shell() {
  const { state, dispatch } = useStore();
  const { ui } = state;

  const [leftWidth,  setLeftWidth]  = useState(() => parseInt(localStorage.getItem('v2_leftW')  || '240'));
  const [rightWidth, setRightWidth] = useState(() => parseInt(localStorage.getItem('v2_rightW') || '260'));
  const [scrollToSceneId, setScrollToSceneId] = useState(null);

  useEffect(() => { localStorage.setItem('v2_leftW',  leftWidth);  }, [leftWidth]);
  useEffect(() => { localStorage.setItem('v2_rightW', rightWidth); }, [rightWidth]);

  if (!state.meta.initialized) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--c-bg)', color: 'var(--c-text5)', fontSize: '14px' }}>
        로딩 중…
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column',
                  background: 'var(--c-bg)', color: 'var(--c-text)', fontFamily: 'inherit' }}>

      {/* MenuBar */}
      <V2MenuBar />

      {/* 3-column body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left Panel */}
        <div style={{ width: leftWidth, flexShrink: 0, borderRight: '1px solid var(--c-border2)',
                      overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <V2LeftPanel onScrollToScene={id => setScrollToSceneId(id)} />
        </div>

        {/* Resize handle left */}
        <DragHandle
          axis="x"
          onDrag={dx => setLeftWidth(w => Math.max(160, Math.min(400, w + dx)))}
        />

        {/* Center: editor or other docs */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <V2CenterPanel
            scrollToSceneId={scrollToSceneId}
            onScrollHandled={() => setScrollToSceneId(null)}
          />
        </div>

        {/* Resize handle right */}
        <DragHandle
          axis="x"
          onDrag={dx => setRightWidth(w => Math.max(180, Math.min(400, w - dx)))}
        />

        {/* Right panel */}
        <div style={{ width: rightWidth, flexShrink: 0, borderLeft: '1px solid var(--c-border2)',
                      overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <V2RightPanel />
        </div>
      </div>
    </div>
  );
}

// ─── MenuBar ──────────────────────────────────────────────────────────────────
function V2MenuBar() {
  const { state, dispatch } = useStore();
  const { ui } = state;

  const handleNewProject = () => {
    const id = genId();
    const ts = now();
    dispatch({
      type: A.ADD_PROJECT,
      payload: { id, title: '새 작품', createdAt: ts, updatedAt: ts },
    });
    // Add cover doc
    dispatch({
      type: A.SET_COVER,
      payload: {
        id: genId(), projectId: id, title: '새 작품',
        fields: [
          { id: genId(), label: '작가', value: '' },
          { id: genId(), label: '장르', value: '' },
        ],
      },
    });
    dispatch({ type: A.SET_ACTIVE_PROJECT, id });
  };

  return (
    <div
      style={{
        height: 38, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px',
        borderBottom: '1px solid var(--c-border2)', flexShrink: 0,
        background: 'var(--c-surface)',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text)', letterSpacing: '0.01em' }}>
        ✦ 대본 작업실 v2
      </span>
      <div style={{ flex: 1 }} />
      <MenuBtn label="새 작품" onClick={handleNewProject} />
      <SaveStatusIndicator />
    </div>
  );
}

function MenuBtn({ label, onClick, accent }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '2px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
        border: `1px solid ${accent ? 'var(--c-accent)' : 'var(--c-border3)'}`,
        background: hovered
          ? (accent ? 'var(--c-accent)' : 'var(--c-hover)')
          : 'transparent',
        color: accent
          ? (hovered ? '#fff' : 'var(--c-accent)')
          : 'var(--c-text3)',
        transition: 'background 0.1s, color 0.1s',
      }}
    >{label}</button>
  );
}

function SaveStatusIndicator() {
  const { state } = useStore();
  const { saveStatus, saveError } = state.ui;
  if (saveStatus === 'saved')  return <span style={{ fontSize: 11, color: 'var(--c-text6)' }}>● 저장됨</span>;
  if (saveStatus === 'dirty')  return <span style={{ fontSize: 11, color: 'var(--c-text5)' }}>수정됨</span>;
  if (saveStatus === 'saving') return <span style={{ fontSize: 11, color: 'var(--c-text5)' }}>저장 중…</span>;
  if (saveStatus === 'error')  return <span style={{ fontSize: 11, color: '#f87171' }} title={saveError}>⚠ 저장 실패</span>;
  return null;
}

// ─── Left Panel ───────────────────────────────────────────────────────────────
function V2LeftPanel({ onScrollToScene }) {
  const { state, dispatch } = useStore();
  const projects = sel.projects(state);
  const { ui } = state;

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
      {projects.map(proj => (
        <ProjectItem
          key={proj.id}
          project={proj}
          isActive={proj.id === ui.activeProjectId}
          activeEpisodeId={ui.activeEpisodeId}
          state={state}
          dispatch={dispatch}
        />
      ))}
      {projects.length === 0 && (
        <div style={{ padding: '16px', fontSize: 12, color: 'var(--c-text6)', textAlign: 'center' }}>
          우측 메뉴에서 새 작품을 만드세요
        </div>
      )}
    </div>
  );
}

function ProjectItem({ project, isActive, activeEpisodeId, state, dispatch }) {
  const [expanded, setExpanded] = useState(isActive);
  const [addingEp, setAddingEp]   = useState(false);
  const [newEpTitle, setNewEpTitle] = useState('');
  const episodes = sel.episodesByProject(state, project.id);

  const addEpisode = (title) => {
    const maxNum = episodes.length > 0 ? Math.max(...episodes.map(e => e.number)) : 0;
    const ep = {
      id: genId(), projectId: project.id,
      number: maxNum + 1, title: title || '',
      createdAt: now(), updatedAt: now(),
      treatmentItemIds: [],
    };
    dispatch({ type: A.ADD_EPISODE, payload: ep });
    dispatch({ type: A.SET_ACTIVE_EPISODE, id: ep.id });
    setAddingEp(false);
    setNewEpTitle('');
  };

  return (
    <div>
      {/* Project row */}
      <div
        onClick={() => {
          setExpanded(e => !e);
          if (!isActive) dispatch({ type: A.SET_ACTIVE_PROJECT, id: project.id });
        }}
        style={{
          padding: '4px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 600,
          color: isActive ? 'var(--c-accent)' : 'var(--c-text2)',
          background: isActive ? 'var(--c-active)' : 'transparent',
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-hover)'; }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ fontSize: 10 }}>{expanded ? '▾' : '▸'}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project.title || '(제목 없음)'}
        </span>
      </div>

      {/* Episodes */}
      {expanded && (
        <div>
          {episodes.map(ep => (
            <EpisodeItem
              key={ep.id}
              episode={ep}
              isActive={ep.id === activeEpisodeId}
              dispatch={dispatch}
            />
          ))}

          {/* Add episode row */}
          {addingEp ? (
            <div style={{ padding: '2px 12px 2px 28px' }}>
              <input
                autoFocus
                value={newEpTitle}
                onChange={e => setNewEpTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addEpisode(newEpTitle);
                  if (e.key === 'Escape') { setAddingEp(false); setNewEpTitle(''); }
                }}
                onBlur={() => addEpisode(newEpTitle)}
                placeholder={`${episodes.length + 1}회 제목 (선택)`}
                style={{
                  width: '100%', fontSize: 11, padding: '2px 4px', borderRadius: 3,
                  border: '1px solid var(--c-accent)', background: 'var(--c-input)', color: 'var(--c-text)',
                  outline: 'none',
                }}
              />
            </div>
          ) : (
            <div
              onClick={() => setAddingEp(true)}
              style={{
                padding: '2px 12px 2px 28px', fontSize: 11, cursor: 'pointer',
                color: 'var(--c-text6)',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text6)'; }}
            >+ 회차 추가</div>
          )}
        </div>
      )}
    </div>
  );
}

function EpisodeItem({ episode, isActive, dispatch }) {
  return (
    <div
      onClick={() => dispatch({ type: A.SET_ACTIVE_EPISODE, id: episode.id })}
      style={{
        padding: '3px 12px 3px 28px', cursor: 'pointer', fontSize: 12,
        color: isActive ? 'var(--c-accent)' : 'var(--c-text3)',
        background: isActive ? 'var(--c-active)' : 'transparent',
        display: 'flex', alignItems: 'center', gap: 4,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-hover)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ color: 'var(--c-text5)', fontSize: 11 }}>{episode.number}회</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {episode.title || <span style={{ color: 'var(--c-text6)', fontStyle: 'italic' }}>(제목 없음)</span>}
      </span>
    </div>
  );
}

// ─── Center Panel ─────────────────────────────────────────────────────────────
function V2CenterPanel({ scrollToSceneId, onScrollHandled }) {
  const { state } = useStore();
  const { activeDoc, activeEpisodeId } = state.ui;

  if (activeDoc === 'script' && activeEpisodeId) {
    return (
      <EditorCore
        scrollToSceneId={scrollToSceneId}
        onScrollHandled={onScrollHandled}
      />
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--c-text5)', fontSize: 13 }}>
      {activeDoc === 'cover'    && <CoverPlaceholder />}
      {activeDoc === 'synopsis' && <SynopsisPlaceholder />}
      {(!activeDoc || activeDoc === 'script') && (
        <span>좌측에서 회차를 선택하거나, 메뉴에서 문서를 열어주세요</span>
      )}
    </div>
  );
}

function CoverPlaceholder() {
  const { state } = useStore();
  const project = sel.activeProject(state);
  return (
    <div style={{ textAlign: 'center', color: 'var(--c-text5)', fontSize: 13 }}>
      <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: 'var(--c-text2)' }}>
        {project?.title || '새 작품'}
      </div>
      <div>표지 편집 기능은 Phase 7에서 v1 CoverEditor와 연결됩니다</div>
    </div>
  );
}

function SynopsisPlaceholder() {
  return (
    <div style={{ color: 'var(--c-text5)', fontSize: 13 }}>
      시놉시스 편집 기능은 Phase 7에서 v1 SynopsisEditor와 연결됩니다
    </div>
  );
}

// ─── Right Panel ──────────────────────────────────────────────────────────────
function V2RightPanel() {
  const { state, dispatch } = useStore();
  const { activeEpisodeId, activeDoc, selectedSceneId } = state.ui;
  const scenes = sel.scenesByEpisode(state, activeEpisodeId);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 0', fontSize: 12 }}>
      {activeDoc === 'script' && activeEpisodeId ? (
        <>
          <div style={{ padding: '4px 12px 8px', fontWeight: 600, fontSize: 11,
                        color: 'var(--c-text5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            씬 목록
          </div>
          {scenes.map(scene => (
            <SceneListItem
              key={scene.id}
              scene={scene}
              isSelected={scene.id === selectedSceneId}
              dispatch={dispatch}
            />
          ))}
          {scenes.length === 0 && (
            <div style={{ padding: '8px 12px', color: 'var(--c-text6)' }}>
              씬번호 블록을 추가하면 여기에 표시됩니다
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: '12px', color: 'var(--c-text6)' }}>
          회차 대본을 열면 씬 목록이 표시됩니다
        </div>
      )}
    </div>
  );
}

function SceneListItem({ scene, isSelected, dispatch }) {
  const label = scene.label || `S#${scene.sceneSeq}.`;
  const loc   = [scene.specialSituation && `${scene.specialSituation})`, scene.location, scene.subLocation && `- ${scene.subLocation}`, scene.timeOfDay && `(${scene.timeOfDay})`].filter(Boolean).join(' ');

  return (
    <div
      onClick={() => dispatch({ type: A.SET_SELECTED_SCENE, id: scene.id })}
      style={{
        padding: '4px 12px', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 6,
        background: isSelected ? 'var(--c-active)' : 'transparent',
        color: isSelected ? 'var(--c-accent)' : 'var(--c-text3)',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--c-hover)'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ fontWeight: 700, flexShrink: 0, fontSize: 11 }}>{label}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
        {loc || scene.content || <span style={{ color: 'var(--c-text6)', fontStyle: 'italic' }}>(미입력)</span>}
      </span>
    </div>
  );
}

// ─── DragHandle ───────────────────────────────────────────────────────────────
function DragHandle({ onDrag }) {
  const startRef = useRef(null);

  const onMouseDown = (e) => {
    e.preventDefault();
    startRef.current = e.clientX;
    const move = (ev) => {
      const dx = ev.clientX - startRef.current;
      startRef.current = ev.clientX;
      onDrag(dx);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: 4, flexShrink: 0, cursor: 'col-resize',
        background: 'transparent',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-accent)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    />
  );
}
