/**
 * v2 App Shell — Phase 5
 * 3-panel layout: LeftPanel | CenterPanel | RightPanel
 * Nav tabs in center panel header: 대본 / 씬리스트 / 인물
 * RightPanel: outline (script view) or empty
 * Phase 5: PDF/DOCX export via PrintBridge
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StoreProvider, useStore, genId, now } from './store/StoreContext.jsx';
import { sel } from './store/selectors.js';
import * as A from './store/actions.js';
import EditorCore from './editor/EditorCore.jsx';
import V2RightPanel from './ui/V2RightPanel.jsx';
import V2SceneListPage from './ui/V2SceneListPage.jsx';
import V2CharacterPage from './ui/V2CharacterPage.jsx';
import { v2StateToV1AppState, buildPrintSelection } from './print/PrintBridge.js';
import './editor/editor.css';

export default function V2App() {
  return (
    <StoreProvider>
      <V2Shell />
    </StoreProvider>
  );
}

function V2Shell() {
  const { state, dispatch } = useStore();
  const [leftWidth,  setLeftWidth]  = useState(() => parseInt(localStorage.getItem('v2_leftW')  || '240'));
  const [rightWidth, setRightWidth] = useState(() => parseInt(localStorage.getItem('v2_rightW') || '260'));
  const [scrollToSceneId, setScrollToSceneId] = useState(null);
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => { localStorage.setItem('v2_leftW',  leftWidth);  }, [leftWidth]);
  useEffect(() => { localStorage.setItem('v2_rightW', rightWidth); }, [rightWidth]);

  // Handle scroll-to-scene: clear after EditorCore consumes it
  const handleScrollHandled = useCallback(() => setScrollToSceneId(null), []);

  // Listen to RightPanel outline clicks → scroll editor
  useEffect(() => {
    if (state.ui.scrollToSceneId) {
      setScrollToSceneId(state.ui.scrollToSceneId);
      dispatch({ type: A.SET_SCROLL_TO_SCENE, id: null });
    }
  }, [state.ui.scrollToSceneId]);

  if (!state.meta.initialized) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--c-bg)', color: 'var(--c-text5)', fontSize: 14 }}>
        로딩 중…
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column',
                  background: 'var(--c-bg)', color: 'var(--c-text)' }}>
      <V2MenuBar onPrint={() => setShowPrint(true)} />
      {showPrint && <PrintDialog state={state} dispatch={dispatch} onClose={() => setShowPrint(false)} />}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left */}
        <div style={{ width: leftWidth, flexShrink: 0, borderRight: '1px solid var(--c-border2)',
                      overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <V2LeftPanel />
        </div>

        <DragHandle onDrag={dx => setLeftWidth(w => Math.max(160, Math.min(400, w + dx)))} />

        {/* Center */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <V2CenterPanel
            scrollToSceneId={scrollToSceneId}
            onScrollHandled={handleScrollHandled}
          />
        </div>

        <DragHandle onDrag={dx => setRightWidth(w => Math.max(180, Math.min(400, w - dx)))} />

        {/* Right */}
        <div style={{ width: rightWidth, flexShrink: 0, borderLeft: '1px solid var(--c-border2)',
                      overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <V2RightPanel />
        </div>
      </div>
    </div>
  );
}

// ─── MenuBar ──────────────────────────────────────────────────────────────────
function V2MenuBar({ onPrint }) {
  const { state, dispatch } = useStore();
  const { saveStatus, saveError } = state.ui;

  const handleNewProject = () => {
    const id = genId();
    const ts = now();
    dispatch({ type: A.ADD_PROJECT, payload: { id, title: '새 작품', createdAt: ts, updatedAt: ts } });
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
    <div style={{
      height: 38, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px',
      borderBottom: '1px solid var(--c-border2)', flexShrink: 0, background: 'var(--c-surface)',
    }}>
      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text)', letterSpacing: '0.01em' }}>
        ✦ 대본 작업실 v2
      </span>
      <Breadcrumb state={state} />
      <div style={{ flex: 1 }} />
      <MenuBtn label="새 작품" onClick={handleNewProject} />
      <MenuBtn label="출력 / PDF" onClick={onPrint} />
      <SaveIndicator status={saveStatus} error={saveError} />
    </div>
  );
}

function Breadcrumb({ state }) {
  const proj = sel.activeProject(state);
  const ep   = sel.activeEpisode(state);
  if (!proj) return null;
  return (
    <span style={{ fontSize: 12, color: 'var(--c-text5)' }}>
      {proj.title}
      {ep && <> › <span style={{ color: 'var(--c-text4)' }}>{ep.number}회 {ep.title || ''}</span></>}
    </span>
  );
}

function MenuBtn({ label, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '2px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
      border: '1px solid var(--c-border3)', background: 'transparent', color: 'var(--c-text3)',
    }}
    onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >{label}</button>
  );
}

function SaveIndicator({ status, error }) {
  if (status === 'saved')  return <span style={{ fontSize: 11, color: 'var(--c-text6)' }}>● 저장됨</span>;
  if (status === 'dirty')  return <span style={{ fontSize: 11, color: 'var(--c-text5)' }}>수정됨</span>;
  if (status === 'saving') return <span style={{ fontSize: 11, color: 'var(--c-text5)' }}>저장 중…</span>;
  if (status === 'error')  return <span style={{ fontSize: 11, color: '#f87171' }} title={error}>⚠ 저장 실패</span>;
  return null;
}

// ─── Left Panel ───────────────────────────────────────────────────────────────
function V2LeftPanel() {
  const { state, dispatch } = useStore();
  const projects = sel.projects(state);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
      {projects.map(proj => (
        <ProjectItem key={proj.id} project={proj} state={state} dispatch={dispatch} />
      ))}
      {projects.length === 0 && (
        <div style={{ padding: '16px', fontSize: 12, color: 'var(--c-text6)', textAlign: 'center' }}>
          상단 메뉴에서 새 작품을 만드세요
        </div>
      )}
    </div>
  );
}

function ProjectItem({ project, state, dispatch }) {
  const isActive = project.id === state.ui.activeProjectId;
  const [expanded, setExpanded] = useState(isActive);
  const [addingEp, setAddingEp] = useState(false);
  const [newTitle, setNewTitle] = useState('');
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
    setNewTitle('');
  };

  return (
    <div>
      <div
        onClick={() => { setExpanded(e => !e); if (!isActive) dispatch({ type: A.SET_ACTIVE_PROJECT, id: project.id }); }}
        style={{
          padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          color: isActive ? 'var(--c-accent)' : 'var(--c-text2)',
          background: isActive ? 'var(--c-active)' : 'transparent',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-hover)'; }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ fontSize: 10 }}>{expanded ? '▾' : '▸'}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project.title || '(제목 없음)'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--c-text6)' }}>{episodes.length}회</span>
      </div>

      {expanded && (
        <div>
          {episodes.map(ep => (
            <EpisodeItem key={ep.id} episode={ep}
              isActive={ep.id === state.ui.activeEpisodeId} dispatch={dispatch}
              sceneCount={sel.sceneCount(state, ep.id)}
            />
          ))}
          {addingEp ? (
            <div style={{ padding: '2px 12px 2px 28px' }}>
              <input
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addEpisode(newTitle);
                  if (e.key === 'Escape') { setAddingEp(false); setNewTitle(''); }
                }}
                onBlur={() => addEpisode(newTitle)}
                placeholder={`${episodes.length + 1}회 제목 (선택)`}
                style={{
                  width: '100%', fontSize: 11, padding: '2px 4px', borderRadius: 3,
                  border: '1px solid var(--c-accent)', background: 'var(--c-input)',
                  color: 'var(--c-text)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          ) : (
            <div
              onClick={() => setAddingEp(true)}
              style={{ padding: '2px 12px 2px 28px', fontSize: 11, cursor: 'pointer', color: 'var(--c-text6)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text6)'; }}
            >+ 회차 추가</div>
          )}
        </div>
      )}
    </div>
  );
}

function EpisodeItem({ episode, isActive, dispatch, sceneCount }) {
  return (
    <div
      onClick={() => dispatch({ type: A.SET_ACTIVE_EPISODE, id: episode.id })}
      style={{
        padding: '3px 12px 3px 28px', cursor: 'pointer', fontSize: 12,
        color: isActive ? 'var(--c-accent)' : 'var(--c-text3)',
        background: isActive ? 'var(--c-active)' : 'transparent',
        display: 'flex', alignItems: 'center', gap: 4,
        whiteSpace: 'nowrap', overflow: 'hidden',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-hover)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ color: 'var(--c-text5)', fontSize: 11, flexShrink: 0 }}>{episode.number}회</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
        {episode.title || <span style={{ color: 'var(--c-text6)', fontStyle: 'italic' }}>(제목 없음)</span>}
      </span>
      {sceneCount > 0 && (
        <span style={{ fontSize: 9, color: 'var(--c-text6)', flexShrink: 0 }}>S{sceneCount}</span>
      )}
    </div>
  );
}

// ─── Center Panel ─────────────────────────────────────────────────────────────
// Nav tabs: 대본 | 씬리스트 | 인물 | (표지 | 시놉시스 — Phase 7)
const CENTER_TABS = [
  { key: 'script',     label: '대본'   },
  { key: 'scenelist',  label: '씬리스트' },
  { key: 'characters', label: '인물'   },
];

function V2CenterPanel({ scrollToSceneId, onScrollHandled }) {
  const { state, dispatch } = useStore();
  const { activeDoc, activeEpisodeId, activeProjectId } = state.ui;

  // Determine which tab is current.
  // activeDoc can be: 'script' | 'scenelist' | 'characters' | 'cover' | 'synopsis'
  const activeTab = CENTER_TABS.find(t => t.key === activeDoc)?.key ?? 'script';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        borderBottom: '1px solid var(--c-border2)', flexShrink: 0,
        background: 'var(--c-surface)', padding: '0 16px',
      }}>
        {CENTER_TABS.map(tab => (
          <TabBtn
            key={tab.key}
            label={tab.label}
            isActive={activeTab === tab.key}
            onClick={() => dispatch({ type: A.SET_ACTIVE_DOC, payload: tab.key })}
          />
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'script' && (
          <EditorCore
            scrollToSceneId={scrollToSceneId}
            onScrollHandled={onScrollHandled}
          />
        )}
        {activeTab === 'scenelist' && <V2SceneListPage />}
        {activeTab === 'characters' && <V2CharacterPage />}
      </div>
    </div>
  );
}

function TabBtn({ label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px', fontSize: 12, background: 'transparent',
        border: 'none', borderBottom: isActive ? '2px solid var(--c-accent)' : '2px solid transparent',
        color: isActive ? 'var(--c-accent)' : 'var(--c-text4)',
        cursor: 'pointer', fontWeight: isActive ? 600 : 400,
        transition: 'color 0.1s, border-color 0.1s',
        marginBottom: -1,  // overlap the container border
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--c-text2)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--c-text4)'; }}
    >{label}</button>
  );
}

// ─── Print Dialog ─────────────────────────────────────────────────────────────
function PrintDialog({ state, dispatch, onClose }) {
  const { activeProjectId } = state.ui;
  const episodes = activeProjectId ? sel.episodesByProject(state, activeProjectId) : [];

  // Episode selection state — default all on
  const [epSel, setEpSel] = useState(() => {
    const init = {};
    episodes.forEach(ep => { init[ep.id] = true; });
    return init;
  });
  const [includeCover,    setIncludeCover]    = useState(true);
  const [includeSynopsis, setIncludeSynopsis] = useState(false);
  const [includeChars,    setIncludeChars]    = useState(false);

  // Style settings (mirror v1 preset)
  const preset = state.settings?.stylePreset || {};
  const [fontSize,   setFontSize]   = useState(preset.fontSize   ?? 11);
  const [lineHeight, setLineHeight] = useState(preset.lineHeight ?? 1.6);

  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [errMsg, setErrMsg] = useState('');

  const handleFontSizeChange = (v) => {
    setFontSize(v);
    dispatch({ type: A.SET_STYLE_PRESET, payload: { fontSize: v } });
  };
  const handleLineHeightChange = (v) => {
    setLineHeight(v);
    dispatch({ type: A.SET_STYLE_PRESET, payload: { lineHeight: v } });
  };

  const buildSelection = () => ({
    cover:    includeCover,
    synopsis: includeSynopsis,
    episodes: epSel,
    chars:    includeChars,
  });

  const handleExportPdf = async () => {
    setStatus('loading');
    setErrMsg('');
    try {
      const { exportPdf } = await import('../print/printPdf.jsx');
      const appState = v2StateToV1AppState(state);
      appState.stylePreset = { ...preset, fontSize, lineHeight };
      await exportPdf(appState, buildSelection(), {
        onStep: (label) => console.log('[v2 print] step:', label),
      });
      setStatus('done');
    } catch (e) {
      console.error('[v2 print] PDF export failed:', e);
      setErrMsg(e.message || '알 수 없는 오류');
      setStatus('error');
    }
  };

  const handleExportDocx = async () => {
    setStatus('loading');
    setErrMsg('');
    try {
      const { exportDocx } = await import('../print/printDocx.js');
      const appState = v2StateToV1AppState(state);
      appState.stylePreset = { ...preset, fontSize, lineHeight };
      await exportDocx(appState, buildSelection());
      setStatus('done');
    } catch (e) {
      console.error('[v2 print] DOCX export failed:', e);
      setErrMsg(e.message || '알 수 없는 오류');
      setStatus('error');
    }
  };

  // Keyboard close
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.55)', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  };
  const dialogStyle = {
    background: 'var(--c-surface)', border: '1px solid var(--c-border3)',
    borderRadius: 8, padding: '20px 24px', width: 360, maxHeight: '80vh',
    overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    color: 'var(--c-text)',
  };
  const sectionLabel = {
    fontSize: 10, fontWeight: 600, color: 'var(--c-text5)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginTop: 14, marginBottom: 6,
  };
  const checkRow = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12 };
  const inputNum = {
    width: 56, padding: '2px 6px', borderRadius: 3, fontSize: 12,
    border: '1px solid var(--c-border3)', background: 'var(--c-input)',
    color: 'var(--c-text)', outline: 'none', textAlign: 'center',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>출력 설정</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
                                             fontSize: 16, color: 'var(--c-text5)', lineHeight: 1 }}>✕</button>
        </div>

        {/* Sections */}
        <div style={sectionLabel}>포함 섹션</div>
        <div style={checkRow}>
          <input type="checkbox" id="cb-cover" checked={includeCover}
            onChange={e => setIncludeCover(e.target.checked)} />
          <label htmlFor="cb-cover">표지</label>
        </div>
        <div style={checkRow}>
          <input type="checkbox" id="cb-synopsis" checked={includeSynopsis}
            onChange={e => setIncludeSynopsis(e.target.checked)} />
          <label htmlFor="cb-synopsis">시놉시스</label>
        </div>
        <div style={checkRow}>
          <input type="checkbox" id="cb-chars" checked={includeChars}
            onChange={e => setIncludeChars(e.target.checked)} />
          <label htmlFor="cb-chars">인물 목록</label>
        </div>

        {/* Episodes */}
        {episodes.length > 0 && (
          <>
            <div style={sectionLabel}>회차</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4, fontSize: 11 }}>
              <button onClick={() => { const a = {}; episodes.forEach(e => a[e.id] = true); setEpSel(a); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-accent)', padding: 0 }}>전체</button>
              <span style={{ color: 'var(--c-text6)' }}>|</span>
              <button onClick={() => { const a = {}; episodes.forEach(e => a[e.id] = false); setEpSel(a); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text5)', padding: 0 }}>해제</button>
            </div>
            {episodes.map(ep => (
              <div key={ep.id} style={checkRow}>
                <input type="checkbox" id={`cb-ep-${ep.id}`}
                  checked={!!epSel[ep.id]}
                  onChange={e => setEpSel(prev => ({ ...prev, [ep.id]: e.target.checked }))} />
                <label htmlFor={`cb-ep-${ep.id}`}>
                  {ep.number}회 {ep.title || <span style={{ color: 'var(--c-text6)', fontStyle: 'italic' }}>(제목 없음)</span>}
                </label>
              </div>
            ))}
          </>
        )}

        {/* Style settings */}
        <div style={sectionLabel}>글자 설정</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--c-text5)' }}>크기</span>
            <input type="number" min={8} max={16} step={0.5}
              value={fontSize} onChange={e => handleFontSizeChange(parseFloat(e.target.value) || 11)}
              style={inputNum} />
            <span style={{ fontSize: 10, color: 'var(--c-text6)' }}>pt</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--c-text5)' }}>행간</span>
            <input type="number" min={1} max={3} step={0.1}
              value={lineHeight} onChange={e => handleLineHeightChange(parseFloat(e.target.value) || 1.6)}
              style={inputNum} />
          </div>
        </div>

        {/* Status */}
        {status === 'loading' && (
          <div style={{ fontSize: 12, color: 'var(--c-text5)', marginTop: 10 }}>생성 중…</div>
        )}
        {status === 'error' && (
          <div style={{ fontSize: 11, color: '#f87171', marginTop: 10, whiteSpace: 'pre-wrap' }}>{errMsg}</div>
        )}
        {status === 'done' && (
          <div style={{ fontSize: 12, color: '#22c55e', marginTop: 10 }}>완료! 파일을 확인하세요.</div>
        )}

        {/* Export buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={handleExportPdf}
            disabled={status === 'loading'}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 4, fontSize: 12, cursor: 'pointer',
              border: '1px solid var(--c-accent)', background: 'var(--c-accent)',
              color: '#fff', fontWeight: 600, opacity: status === 'loading' ? 0.6 : 1,
            }}
          >PDF 다운로드</button>
          <button
            onClick={handleExportDocx}
            disabled={status === 'loading'}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 4, fontSize: 12, cursor: 'pointer',
              border: '1px solid var(--c-border3)', background: 'transparent',
              color: 'var(--c-text2)', opacity: status === 'loading' ? 0.6 : 1,
            }}
          >DOCX 다운로드</button>
        </div>
      </div>
    </div>
  );
}

// ─── Drag handle ──────────────────────────────────────────────────────────────
function DragHandle({ onDrag }) {
  const startRef = useRef(null);
  const onMouseDown = (e) => {
    e.preventDefault();
    startRef.current = e.clientX;
    const move = (ev) => { const dx = ev.clientX - startRef.current; startRef.current = ev.clientX; onDrag(dx); };
    const up   = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <div
      onMouseDown={onMouseDown}
      style={{ width: 4, flexShrink: 0, cursor: 'col-resize', background: 'transparent' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-accent)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    />
  );
}
