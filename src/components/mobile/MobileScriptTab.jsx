import React, { useState, useRef } from 'react';
import { useApp } from '../../store/AppContext';
import { genId, now } from '../../store/db';

export default function MobileScriptTab() {
  const { state, dispatch } = useApp();
  const { projects, episodes, activeProjectId, activeEpisodeId, activeDoc } = state;
  const [addingProject, setAddingProject] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjType, setNewProjType] = useState('series');

  const [swipedId, setSwipedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, type: 'project'|'episode' }
  const [deleteText, setDeleteText] = useState('');
  const touchStartX = useRef({});

  const handleTouchStart = (id, e) => {
    touchStartX.current[id] = e.touches[0].clientX;
  };

  const handleTouchEnd = (id, e) => {
    const startX = touchStartX.current[id];
    if (startX === undefined) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (dx < -60) {
      setSwipedId(id);
    } else if (dx > 20 && swipedId === id) {
      setSwipedId(null);
    }
    delete touchStartX.current[id];
  };

  const openDeleteConfirm = (id, type, e) => {
    e.stopPropagation();
    setSwipedId(null);
    setDeleteTarget({ id, type });
    setDeleteText('');
  };

  const confirmDelete = () => {
    if (deleteText !== '삭제' || !deleteTarget) return;
    if (deleteTarget.type === 'project') dispatch({ type: 'DELETE_PROJECT', id: deleteTarget.id });
    else dispatch({ type: 'DELETE_EPISODE', id: deleteTarget.id });
    setDeleteTarget(null);
    setDeleteText('');
  };

  const submitNewProject = () => {
    if (!newProjName.trim()) return;
    const p = { id: genId(), title: newProjName.trim(), genre: '', status: 'draft', projectType: newProjType, createdAt: now(), updatedAt: now() };
    dispatch({ type: 'ADD_PROJECT', payload: p });
    dispatch({ type: 'SET_ACTIVE_PROJECT', id: p.id });
    setAddingProject(false);
    setNewProjName('');
    setNewProjType('series');
  };

  return (
    <div style={{ paddingBottom: 16 }}>
      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}
          onClick={() => { setDeleteTarget(null); setDeleteText(''); }}
        >
          <div
            style={{ background: 'var(--c-panel)', borderRadius: 12, padding: 20, width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>정말 삭제하시겠어요?</div>
            <div style={{ fontSize: 13, color: 'var(--c-text4)' }}>아래에 <strong>삭제</strong>를 입력하면 삭제됩니다</div>
            <input
              autoFocus
              className="m-input"
              value={deleteText}
              onChange={e => setDeleteText(e.target.value)}
              placeholder="삭제"
              onKeyDown={e => {
                if (e.key === 'Enter') confirmDelete();
                if (e.key === 'Escape') { setDeleteTarget(null); setDeleteText(''); }
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="m-btn" style={{ flex: 1 }} onClick={() => { setDeleteTarget(null); setDeleteText(''); }}>취소</button>
              <button
                className="m-btn"
                style={{
                  flex: 1,
                  background: deleteText === '삭제' ? '#e53935' : 'var(--c-border3)',
                  color: deleteText === '삭제' ? '#fff' : 'var(--c-text6)',
                  cursor: deleteText === '삭제' ? 'pointer' : 'not-allowed',
                  border: 'none',
                }}
                onClick={confirmDelete}
              >삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 새 작품 */}
      <div className="m-item accent" onClick={() => { setAddingProject(true); setNewProjName(''); setNewProjType('series'); }}>+ 새 작품</div>

      {addingProject && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-panel)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            autoFocus
            placeholder="작품명 입력"
            className="m-input"
            value={newProjName}
            onChange={e => setNewProjName(e.target.value)}
            onKeyDown={e => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') submitNewProject();
              if (e.key === 'Escape') setAddingProject(false);
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ v: 'series', label: '미니시리즈' }, { v: 'single', label: '단막' }].map(({ v, label }) => (
              <button
                key={v}
                onClick={() => setNewProjType(v)}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 'clamp(11px, 3vw, 13px)',
                  border: `1px solid ${newProjType === v ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                  background: newProjType === v ? 'var(--c-accent)' : 'transparent',
                  color: newProjType === v ? '#fff' : 'var(--c-text4)',
                  cursor: 'pointer',
                }}
              >{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="m-btn primary" style={{ flex: 1 }} onClick={submitNewProject}>만들기</button>
            <button className="m-btn" onClick={() => setAddingProject(false)}>취소</button>
          </div>
        </div>
      )}

      {projects.map(project => {
        const isActive = project.id === activeProjectId;
        const epList = episodes.filter(e => e.projectId === project.id).sort((a, b) => a.number - b.number);
        const projActive = isActive && !activeEpisodeId && activeDoc !== 'cover' && activeDoc !== 'synopsis';
        return (
          <div key={project.id}>
            <div style={{ position: 'relative', overflow: 'hidden' }}>
              <div
                className={`m-item${projActive ? ' active' : ''}`}
                style={{ transform: swipedId === project.id ? 'translateX(-80px)' : 'translateX(0)', transition: 'transform 0.2s' }}
                onClick={() => { if (swipedId === project.id) { setSwipedId(null); return; } dispatch({ type: 'SET_ACTIVE_PROJECT', id: project.id }); }}
                onTouchStart={e => handleTouchStart(project.id, e)}
                onTouchEnd={e => handleTouchEnd(project.id, e)}
              >
                <span className="m-text-xs">📁</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.title}</span>
              </div>
              {swipedId === project.id && (
                <button
                  style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 80, background: '#e53935', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  onClick={e => openDeleteConfirm(project.id, 'project', e)}
                >삭제</button>
              )}
            </div>

            {isActive && <>
              <div className={`m-item sub${activeDoc === 'cover' && !activeEpisodeId ? ' active' : ''}`}
                onClick={() => { dispatch({ type: 'SET_ACTIVE_PROJECT', id: project.id }); dispatch({ type: 'SET_ACTIVE_DOC', payload: 'cover' }); }}
              >표지</div>
              <div className={`m-item sub${activeDoc === 'synopsis' ? ' active' : ''}`}
                onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'synopsis' })}
              >작품 시놉시스</div>

              {epList.map(ep => {
                const isEpActive = activeEpisodeId === ep.id && activeDoc === 'script';
                return (
                  <div key={ep.id} style={{ position: 'relative', overflow: 'hidden' }}>
                    <div
                      className={`m-item sub${isEpActive ? ' active' : ''}`}
                      style={{ gap: 6, transform: swipedId === ep.id ? 'translateX(-80px)' : 'translateX(0)', transition: 'transform 0.2s' }}
                      onClick={() => { if (swipedId === ep.id) { setSwipedId(null); return; } dispatch({ type: 'SET_ACTIVE_EPISODE', id: ep.id }); }}
                      onTouchStart={e => handleTouchStart(ep.id, e)}
                      onTouchEnd={e => handleTouchEnd(ep.id, e)}
                    >
                      {project.projectType !== 'single' && (
                        <span className="m-text-xs" style={{ flexShrink: 0 }}>{ep.number}회</span>
                      )}
                      {isEpActive ? (
                        <input
                          className="m-input"
                          style={{ flex: 1, padding: '2px 6px', fontSize: 'inherit' }}
                          value={ep.title}
                          placeholder="제목 없음"
                          onClick={e => e.stopPropagation()}
                          onChange={e => dispatch({ type: 'UPDATE_EPISODE', payload: { id: ep.id, title: e.target.value } })}
                          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                        />
                      ) : (
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ep.title || <span className="m-text-xs" style={{ fontStyle: 'italic' }}>제목 없음</span>}
                        </span>
                      )}
                    </div>
                    {swipedId === ep.id && (
                      <button
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 80, background: '#e53935', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                        onClick={e => openDeleteConfirm(ep.id, 'episode', e)}
                      >삭제</button>
                    )}
                  </div>
                );
              })}

              <div className="m-item sub m-text-xs"
                onClick={() => {
                  const num = epList.length + 1;
                  const ep = { id: genId(), projectId: project.id, number: num, title: '', majorEpisodes: '', summaryItems: [], status: 'draft', createdAt: now(), updatedAt: now() };
                  dispatch({ type: 'ADD_EPISODE', payload: ep });
                  dispatch({ type: 'SET_ACTIVE_EPISODE', id: ep.id });
                }}
              >{project.projectType === 'single' ? '+ 추가' : '+ 회차 추가'}</div>
            </>}
          </div>
        );
      })}

      {projects.length === 0 && !addingProject && (
        <div className="m-empty">위 버튼으로 첫 작품을 만들어보세요</div>
      )}
    </div>
  );
}
