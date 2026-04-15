import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../store/AppContext';
import { genId, now } from '../store/db';

function NavItem({ label, active, onClick, indent = 1, badge, large }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center cursor-pointer rounded mx-1 mb-0.5 transition-colors"
      style={{
        paddingLeft: `${indent * (large ? 16 : 12)}px`,
        paddingRight: '8px',
        paddingTop: large ? '10px' : '5px',
        paddingBottom: large ? '10px' : '5px',
        fontSize: large ? 'clamp(14px, 4vw, 16px)' : undefined,
        background: active ? 'var(--c-active)' : 'transparent',
        color: active ? 'var(--c-accent)' : 'var(--c-text4)',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--c-hover)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <span className={`truncate flex-1 ${large ? '' : 'text-sm'}`}>{label}</span>
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

function ProjectItem({ project, section = 'all', expanded, onToggle }) {
  const { state, dispatch } = useApp();
  const { episodes, characters, activeProjectId, activeEpisodeId, activeDoc, synopsisDocs, stylePreset } = state;
  const isActive = project.id === activeProjectId;
  const [addingEp, setAddingEp] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const epList = episodes
    .filter(e => e.projectId === project.id)
    .sort((a, b) => a.number - b.number);

  const handleSelect = () => {
    dispatch({ type: 'SET_ACTIVE_PROJECT', id: project.id });
    onToggle(project.id, true);
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

  const large = section === 'script';

  return (
    <div>
        <div
          className="group flex items-center cursor-pointer rounded mx-1 mb-0.5"
          style={{
            color: isActive ? 'var(--c-text)' : 'var(--c-text3)',
            padding: large ? '10px 8px' : '6px 8px',
            WebkitTapHighlightColor: 'transparent',
          }}
          onClick={handleSelect}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span
            style={{ color: 'var(--c-text6)', marginRight: 6, fontSize: large ? 12 : 10, userSelect: 'none' }}
            onClick={e => { e.stopPropagation(); onToggle(project.id); }}
          >
            {expanded ? '▼' : '▶'}
          </span>
          <span style={{ fontSize: large ? 'clamp(14px, 4vw, 17px)' : undefined }} className={`font-medium flex-1 truncate ${large ? '' : 'text-sm'}`}>{project.title}</span>
          {isActive && !large && (
            <span className="flex gap-1 opacity-0 group-hover:opacity-100">
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

      {expanded && (
        <div>
          <NavItem large={large} label="표지" active={activeDoc === 'cover' && !activeEpisodeId} onClick={() => { dispatch({ type: 'SET_ACTIVE_PROJECT', id: project.id }); dispatch({ type: 'SET_ACTIVE_DOC', payload: 'cover' }); }} indent={2} />
          <NavItem large={large} label="작품 시놉시스" active={activeDoc === 'synopsis'} onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'synopsis' })} indent={2} badge={synopsisPages > 0 ? `약 ${synopsisPages}p` : null} />

          <div className="mt-1">
            <div style={{ paddingLeft: large ? '32px' : '24px', paddingTop: 2, paddingBottom: 2, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--c-text6)' }}>회차</div>
            {epList.map(ep => <EpisodeItem key={ep.id} ep={ep} isSingle={project.projectType === 'single'} large={large} />)}
            {addingEp ? (
              <InlineInput placeholder={`${epList.length + 1}회 제목 (선택)`} onCommit={addEpisode} onCancel={() => setAddingEp(false)} indent={2} allowEmpty />
            ) : (
              <div onClick={() => setAddingEp(true)} className="cursor-pointer py-1" style={{ paddingLeft: large ? '32px' : '24px', fontSize: large ? 13 : 11, color: 'var(--c-text6)', WebkitTapHighlightColor: 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-text4)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text6)'; }}
              >
                + 회차 추가
              </div>
            )}
          </div>

          {/* 자료/설계 구역 — section='script' 일 때 숨김 */}
          {section !== 'script' && <>
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
          </>}
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

function EpisodeItem({ ep, isSingle, large }) {
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
      className="group cursor-pointer rounded mx-1 mb-0.5 pr-1"
      style={{
        paddingLeft: large ? '32px' : '24px',
        paddingTop: large ? '10px' : '5px',
        paddingBottom: large ? '10px' : '5px',
        fontSize: large ? 'clamp(13px, 3.8vw, 16px)' : undefined,
        background: isActive ? 'var(--c-active)' : 'transparent',
        color: isActive ? 'var(--c-accent)' : 'var(--c-text4)',
        WebkitTapHighlightColor: 'transparent',
      }}
      onClick={() => dispatch({ type: 'SET_ACTIVE_EPISODE', id: ep.id })}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-hover)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      {/* ── 주 행: 번호 + 제목 + 씬 수 + 액션 버튼 ── */}
      <div className="flex items-center gap-1">
        {!isSingle && (
          <span className={`shrink-0 select-none ${large ? 'text-sm' : 'text-xs'}`} style={{ color: isActive ? 'var(--c-accent2)' : 'var(--c-text6)' }}>
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

// ─── 작품 유형별 기본값 ────────────────────────────────────────────────────────
const PROJECT_TYPE_PRESETS = {
  single: { label: '단막',       desc: '70분 단편',        totalMins: 70,  climaxStart: 55, climaxEnd: 68 },
  series: { label: '미니시리즈', desc: '회차별 60분',       totalMins: 60,  climaxStart: 48, climaxEnd: 58 },
  movie:  { label: '영화',       desc: '장편 100분',        totalMins: 100, climaxStart: 78, climaxEnd: 95 },
  custom: { label: '기타',       desc: '직접 입력',         totalMins: 90,  climaxStart: 70, climaxEnd: 85 },
};

// ─── New project type picker ───────────────────────────────────────────────────
function NewProjectModal({ onCommit, onCancel }) {
  const [title, setTitle] = useState('');
  const [projectType, setProjectType] = useState(null);
  const [totalEpisodes, setTotalEpisodes] = useState(1);
  const [totalMins, setTotalMins] = useState(90);
  const [climaxStart, setClimaxStart] = useState(70);
  const [climaxEnd, setClimaxEnd] = useState(85);
  const step = projectType === null ? 'type' : 'name';

  const selectType = (type) => {
    const preset = PROJECT_TYPE_PRESETS[type];
    setProjectType(type);
    setTotalMins(preset.totalMins);
    setClimaxStart(preset.climaxStart);
    setClimaxEnd(preset.climaxEnd);
    setTotalEpisodes(type === 'series' ? 1 : 1);
  };

  const typeLabel = projectType ? PROJECT_TYPE_PRESETS[projectType]?.label : '';

  const handleCommit = () => {
    if (!title.trim()) return;
    onCommit(title.trim(), projectType, totalEpisodes, { totalMins, climaxStart, climaxEnd });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onCancel}>
      <div className="rounded-xl p-5 w-80 flex flex-col gap-3" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }} onClick={e => e.stopPropagation()}>
        {step === 'type' ? (
          <>
            <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>작품 형식 선택</div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PROJECT_TYPE_PRESETS).map(([type, { label, desc }]) => (
                <button
                  key={type}
                  onClick={() => selectType(type)}
                  className="py-3 rounded text-center"
                  style={{ border: '1px solid var(--c-border3)', background: 'var(--c-input)', cursor: 'pointer' }}
                >
                  <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{label}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--c-text6)' }}>{desc}</div>
                </button>
              ))}
            </div>
            <button onClick={onCancel} className="text-xs self-end" style={{ color: 'var(--c-text6)', background: 'none', border: 'none', cursor: 'pointer' }}>취소</button>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>새 작품</div>
            <div className="text-xs" style={{ color: 'var(--c-text5)' }}>{typeLabel}</div>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCommit(); if (e.key === 'Escape') onCancel(); }}
              placeholder="작품명 입력"
              className="w-full text-sm px-3 py-2 rounded outline-none"
              style={{ background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-border3)' }}
            />
            {projectType === 'series' && (
              <div className="flex items-center gap-2">
                <span className="text-xs shrink-0" style={{ color: 'var(--c-text5)' }}>몇 부작으로 시작할까요?</span>
                <input
                  type="number" min="1" max="200" step="1"
                  value={totalEpisodes}
                  onChange={e => setTotalEpisodes(Math.max(1, Math.min(200, Number(e.target.value))))}
                  className="text-xs px-2 py-1 rounded outline-none"
                  style={{ width: 56, background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-border3)', textAlign: 'center' }}
                />
              </div>
            )}
            {projectType === 'custom' && (
              <div className="flex flex-col gap-2">
                {[
                  { label: '총 분량(분)', val: totalMins, set: setTotalMins, min: 10, max: 300 },
                  { label: '클라이막스 시작(분)', val: climaxStart, set: setClimaxStart, min: 1, max: 299 },
                  { label: '클라이막스 끝(분)', val: climaxEnd, set: setClimaxEnd, min: 2, max: 300 },
                ].map(({ label, val, set, min, max }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-xs shrink-0" style={{ color: 'var(--c-text5)', width: 130 }}>{label}</span>
                    <input
                      type="number" min={min} max={max} step="1"
                      value={val}
                      onChange={e => set(Math.max(min, Math.min(max, Number(e.target.value))))}
                      className="text-xs px-2 py-1 rounded outline-none"
                      style={{ width: 56, background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-border3)', textAlign: 'center' }}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setProjectType(null)} className="text-xs px-3 py-1.5 rounded" style={{ color: 'var(--c-text5)', border: '1px solid var(--c-border3)', background: 'transparent', cursor: 'pointer' }}>이전</button>
              <button onClick={handleCommit} className="text-xs px-3 py-1.5 rounded" style={{ color: '#fff', background: 'var(--c-accent)', border: 'none', cursor: 'pointer' }}>만들기</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const DELIVERY_KEY = 'director_deliveries_received';
function getDeliveries() {
  try { return JSON.parse(localStorage.getItem(DELIVERY_KEY) || '[]'); } catch { return []; }
}

function FeedbackPanel({ activeDoc, dispatch }) {
  const [expanded, setExpanded] = useState(false);
  const [deliveries, setDeliveries] = useState(() => getDeliveries());
  const [activeId, setActiveId] = useState(() => localStorage.getItem('drama_active_delivery_id') || null);

  // 외부에서 전송 목록이 바뀌면 동기화
  useEffect(() => {
    const handler = () => {
      setDeliveries(getDeliveries());
      setActiveId(localStorage.getItem('drama_active_delivery_id'));
    };
    window.addEventListener('drama_delivery_changed', handler);
    return () => window.removeEventListener('drama_delivery_changed', handler);
  }, []);

  const handleSelect = (d) => {
    localStorage.setItem('drama_active_delivery_id', d.id);
    setActiveId(d.id);
    window.dispatchEvent(new Event('drama_delivery_changed'));
    dispatch({ type: 'SET_ACTIVE_DOC', payload: 'director_notes' });
  };

  const handleDelete = (e, id) => {
    e.stopPropagation();
    const next = deliveries.filter(d => d.id !== id);
    localStorage.setItem(DELIVERY_KEY, JSON.stringify(next));
    if (activeId === id) {
      const fallback = next[0]?.id || null;
      if (fallback) localStorage.setItem('drama_active_delivery_id', fallback);
      else localStorage.removeItem('drama_active_delivery_id');
      setActiveId(fallback);
    }
    setDeliveries(next);
    window.dispatchEvent(new Event('drama_delivery_changed'));
  };

  return (
    <div style={{ flexShrink: 0, borderTop: '1px solid var(--c-border)', paddingTop: 4 }}>
      {/* 피드백 노트 — 클릭 시 목록 펼침 + 페이지 이동 */}
      <div
        onClick={() => { setExpanded(true); dispatch({ type: 'SET_ACTIVE_DOC', payload: 'director_notes' }); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '5px 8px 5px 12px', cursor: 'pointer',
          borderRadius: 4, margin: '0 4px',
          background: activeDoc === 'director_notes' ? 'var(--c-active)' : 'transparent',
          color: activeDoc === 'director_notes' ? 'var(--c-accent)' : 'var(--c-text4)',
          WebkitTapHighlightColor: 'transparent',
          fontSize: 13,
        }}
        onMouseEnter={e => { if (activeDoc !== 'director_notes') e.currentTarget.style.background = 'var(--c-hover)'; }}
        onMouseLeave={e => { if (activeDoc !== 'director_notes') e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ flex: 1 }}>피드백 노트</span>
        {deliveries.length > 0 && (
          <span style={{ fontSize: 9, color: 'var(--c-text6)', background: 'var(--c-tag)', borderRadius: 8, padding: '1px 5px' }}>{deliveries.length}</span>
        )}
        {expanded && (
          <span
            onClick={e => { e.stopPropagation(); setExpanded(false); }}
            style={{ fontSize: 9, color: 'var(--c-text6)', userSelect: 'none', padding: '0 2px' }}
          >▾</span>
        )}
      </div>

      {/* 전송 목록 — 아코디언 */}
      {expanded && (
        <div style={{ maxHeight: 200, overflowY: 'auto', paddingBottom: 6 }}>
          {deliveries.length === 0 && (
            <div style={{ paddingLeft: 24, paddingBottom: 8, fontSize: 10, color: 'var(--c-text6)' }}>받은 노트 없음</div>
          )}
          {deliveries.map(d => {
            const isActive = d.id === activeId;
            const date = new Date(d.savedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
            return (
              <div
                key={d.id}
                style={{
                  display: 'flex', alignItems: 'center',
                  borderLeft: isActive ? '2px solid var(--c-accent)' : '2px solid transparent',
                  background: isActive ? 'var(--c-active)' : 'transparent',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-hover)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <div
                  onClick={() => handleSelect(d)}
                  style={{ flex: 1, padding: '6px 6px 6px 20px', cursor: 'pointer', minWidth: 0 }}
                >
                  <div style={{
                    fontSize: 11, fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--c-accent)' : 'var(--c-text4)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginBottom: 1,
                  }}>{d.title}</div>
                  <div style={{ fontSize: 9, color: 'var(--c-text6)' }}>
                    코멘트 {d.notes?.length || 0}개 · {date}
                  </div>
                </div>
                <button
                  onClick={e => handleDelete(e, d.id)}
                  style={{
                    flexShrink: 0, marginRight: 6,
                    width: 18, height: 18, borderRadius: 3,
                    border: '1px solid var(--c-border)', background: 'transparent',
                    color: 'var(--c-text5)', fontSize: 11, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1,
                  }}
                  title="삭제"
                >×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* 하단 여백 */}
      <div style={{ paddingBottom: 8 }} />
    </div>
  );
}

export default function LeftPanel({ section = 'all' }) {
  const { state, dispatch } = useApp();
  const { projects, activeDoc, activeProjectId } = state;
  const [addingProject, setAddingProject] = useState(false);
  const [expandedId, setExpandedId] = useState(() => activeProjectId || null);

  // 외부에서 activeProjectId 변경 시(예: 에피소드 클릭) 해당 프로젝트 자동 펼침
  useEffect(() => {
    if (activeProjectId) setExpandedId(activeProjectId);
  }, [activeProjectId]);

  // forceOpen=true 이면 무조건 열기, false/undefined 이면 토글
  const handleToggle = useCallback((id, forceOpen) => {
    setExpandedId(prev => forceOpen ? id : (prev === id ? null : id));
  }, []);

  const handleAddProject = (title, projectType, totalEpisodes = 1, climaxSettings = {}) => {
    const { totalMins = 70, climaxStart = 55, climaxEnd = 68 } = climaxSettings;
    const p = { id: genId(), title, genre: '', status: 'draft', projectType, totalEpisodes, totalMins, climaxStart, climaxEnd, createdAt: now(), updatedAt: now() };
    dispatch({ type: 'ADD_PROJECT', payload: p });
    dispatch({ type: 'SET_ACTIVE_PROJECT', id: p.id });

    const count = projectType === 'series' ? (totalEpisodes || 1) : 1;
    const episodes = Array.from({ length: count }, (_, i) => ({
      id: genId(), projectId: p.id, number: i + 1,
      title: '', majorEpisodes: '', summaryItems: [],
      status: 'draft', createdAt: now(), updatedAt: now(),
    }));
    episodes.forEach(ep => dispatch({ type: 'ADD_EPISODE', payload: ep }));
    dispatch({ type: 'SET_ACTIVE_EPISODE', id: episodes[0].id });

    setAddingProject(false);
  };

  return (
    <div className="h-full flex flex-col select-none" style={{ background: 'var(--c-panel)', borderRight: '1px solid var(--c-border)' }}>
      {addingProject && <NewProjectModal onCommit={handleAddProject} onCancel={() => setAddingProject(false)} />}
      {section !== 'script' && (
        <div className="px-3 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text6)' }}>대본 작업실</span>
          <button onClick={() => setAddingProject(true)} className="text-lg leading-none font-light" style={{ color: 'var(--c-text5)' }} title="새 작품">+</button>
        </div>
      )}
      {section === 'script' && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => setAddingProject(true)} style={{ fontSize: 22, lineHeight: 1, color: 'var(--c-text5)', background: 'none', border: 'none', cursor: 'pointer' }} title="새 작품">+</button>
        </div>
      )}

      {/* 작품 목록 — 최신순(역순), 최대 70% 높이로 캡핑 → 피드백 메뉴 항상 30% 이상 위에 */}
      <div style={{ flex: '1 1 0', maxHeight: '70%', overflowY: 'auto', paddingTop: 8, paddingBottom: 8, minHeight: 0 }}>
        {[...projects].reverse().map(p => (
          <ProjectItem
            key={p.id}
            project={p}
            section={section}
            expanded={expandedId === p.id}
            onToggle={handleToggle}
          />
        ))}
        {projects.length === 0 && (
          <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--c-text6)' }}>
            + 버튼으로 첫 작품을 만들어보세요
          </div>
        )}
      </div>

      {/* 피드백 메뉴 — 스크롤 영역 밖 하단 고정 */}
      {section !== 'script' && (
        <FeedbackPanel activeDoc={activeDoc} dispatch={dispatch} />
      )}

    </div>
  );
}
