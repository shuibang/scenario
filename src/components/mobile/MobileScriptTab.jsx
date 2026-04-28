import React, { useState, useRef } from 'react';
import { useApp } from '../../store/AppContext';
import { genId, now } from '../../store/db';
import { isMultiEpisode } from '../../utils/projectTypes';
import DeleteConfirmModal from '../Modals/DeleteConfirmModal';

export default function MobileScriptTab({ onClose }) {
  const { state, dispatch } = useApp();
  const { projects, episodes, activeProjectId, activeEpisodeId, activeDoc } = state;
  const [addingProject, setAddingProject] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjType, setNewProjType] = useState('series');

  const [swipedId, setSwipedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, type: 'project'|'episode' }
  const [editingEpId, setEditingEpId] = useState(null);
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
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'project') {
      dispatch({ type: 'MOVE_PROJECT_TO_TRASH', id: deleteTarget.id });
    } else {
      dispatch({ type: 'DELETE_EPISODE', id: deleteTarget.id });
    }
    setDeleteTarget(null);
  };

  // 모달 표시용 — 삭제 대상 메타
  const targetMeta = (() => {
    if (!deleteTarget) return null;
    if (deleteTarget.type === 'project') {
      const p = projects.find(p => p.id === deleteTarget.id);
      return {
        title: p?.title || '제목 없음',
        description: '30일간 휴지통에 보관됩니다.',
      };
    }
    const ep = episodes.find(e => e.id === deleteTarget.id);
    const epTitle = ep ? (ep.title?.trim() || `${ep.number}회`) : '회차';
    return { title: epTitle, description: '이 작업은 되돌릴 수 없습니다.' };
  })();

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
      {/* 삭제 확인 모달 (공통) */}
      <DeleteConfirmModal
        open={!!deleteTarget}
        title={targetMeta?.title}
        description={targetMeta?.description}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

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
                onClick={() => { dispatch({ type: 'SET_ACTIVE_PROJECT', id: project.id }); dispatch({ type: 'SET_ACTIVE_DOC', payload: 'cover' }); onClose?.(); }}
              >표지</div>
              <div className={`m-item sub${activeDoc === 'synopsis' ? ' active' : ''}`}
                onClick={() => { dispatch({ type: 'SET_ACTIVE_DOC', payload: 'synopsis' }); onClose?.(); }}
              >작품 시놉시스</div>

              {epList.map(ep => {
                const isEpActive = activeEpisodeId === ep.id && activeDoc === 'script';
                const isEditing = editingEpId === ep.id;
                return (
                  <div key={ep.id} style={{ position: 'relative', overflow: 'hidden' }}>
                    <div
                      className={`m-item sub${isEpActive ? ' active' : ''}`}
                      style={{ gap: 6, transform: swipedId === ep.id ? 'translateX(-80px)' : 'translateX(0)', transition: 'transform 0.2s' }}
                      onClick={() => { if (swipedId === ep.id) { setSwipedId(null); return; } dispatch({ type: 'SET_ACTIVE_EPISODE', id: ep.id }); onClose?.(); }}
                      onTouchStart={e => handleTouchStart(ep.id, e)}
                      onTouchEnd={e => handleTouchEnd(ep.id, e)}
                    >
                      {isMultiEpisode(project.projectType) && (
                        <span className="m-text-xs" style={{ flexShrink: 0 }}>{ep.number}회</span>
                      )}
                      {isEditing ? (
                        <input
                          autoFocus
                          className="m-input"
                          style={{ flex: 1, padding: '2px 6px', fontSize: 'inherit' }}
                          value={ep.title}
                          placeholder="제목 없음"
                          onClick={e => e.stopPropagation()}
                          onChange={e => dispatch({ type: 'UPDATE_EPISODE', payload: { id: ep.id, title: e.target.value } })}
                          onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); setEditingEpId(null); } }}
                          onBlur={() => setEditingEpId(null)}
                        />
                      ) : (
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ep.title || <span className="m-text-xs" style={{ fontStyle: 'italic' }}>제목 없음</span>}
                        </span>
                      )}
                      {!isEditing && (
                        <button
                          onClick={e => { e.stopPropagation(); setEditingEpId(ep.id); }}
                          style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--c-text6)', fontSize: 13, cursor: 'pointer', padding: '0 2px', lineHeight: 1, WebkitTapHighlightColor: 'transparent' }}
                        >✎</button>
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
              >{isMultiEpisode(project.projectType) ? '+ 회차 추가' : '+ 추가'}</div>
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
