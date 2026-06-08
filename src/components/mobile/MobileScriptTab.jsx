import React, { useState, useRef } from 'react';
import { useApp } from '../../store/AppContext';
import { genId, now } from '../../store/db';
import { isMultiEpisode } from '../../utils/projectTypes';
import DeleteConfirmModal from '../Modals/DeleteConfirmModal';

export default function MobileScriptTab({ onClose }) {
  const { state, dispatch } = useApp();
  const { projects, episodes, activeProjectId, activeEpisodeId } = state;

  const activeProject = projects.find(p => p.id === activeProjectId) ?? null;
  const epList = activeProject
    ? episodes.filter(e => e.projectId === activeProjectId).sort((a, b) => a.number - b.number)
    : [];

  const [swipedId, setSwipedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editingEpId, setEditingEpId] = useState(null);
  const touchStartX = useRef({});

  const handleTouchStart = (id, e) => {
    touchStartX.current[id] = e.touches[0].clientX;
  };

  const handleTouchEnd = (id, e) => {
    const startX = touchStartX.current[id];
    if (startX === undefined) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (dx < -60) setSwipedId(id);
    else if (dx > 20 && swipedId === id) setSwipedId(null);
    delete touchStartX.current[id];
  };

  const openDeleteConfirm = (id, e) => {
    e.stopPropagation();
    setSwipedId(null);
    setDeleteTarget({ id });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    dispatch({ type: 'DELETE_EPISODE', id: deleteTarget.id });
    setDeleteTarget(null);
  };

  const targetMeta = (() => {
    if (!deleteTarget) return null;
    const ep = episodes.find(e => e.id === deleteTarget.id);
    const epTitle = ep ? (ep.title?.trim() || `${ep.number}회`) : '회차';
    return { title: epTitle, description: '이 작업은 되돌릴 수 없습니다.' };
  })();

  if (!activeProject) {
    return (
      <div className="m-empty">파일 메뉴에서 대본을 선택하세요</div>
    );
  }

  return (
    <div style={{ paddingBottom: 16 }}>
      <DeleteConfirmModal
        open={!!deleteTarget}
        title={targetMeta?.title}
        description={targetMeta?.description}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <div
        className={`m-item sub${state.activeDoc === 'synopsis' ? ' active' : ''}`}
        onClick={() => { dispatch({ type: 'SET_ACTIVE_DOC', payload: 'synopsis' }); onClose?.(); }}
      >시놉시스</div>

      {epList.map(ep => {
        const isEpActive = activeEpisodeId === ep.id && state.activeDoc === 'script';
        const isEditing = editingEpId === ep.id;
        return (
          <div key={ep.id} style={{ position: 'relative', overflow: 'hidden' }}>
            <div
              className={`m-item sub${isEpActive ? ' active' : ''}`}
              style={{ gap: 6, transform: swipedId === ep.id ? 'translateX(-80px)' : 'translateX(0)', transition: 'transform 0.2s' }}
              onClick={() => {
                if (swipedId === ep.id) { setSwipedId(null); return; }
                dispatch({ type: 'SET_ACTIVE_EPISODE', id: ep.id });
                onClose?.();
              }}
              onTouchStart={e => handleTouchStart(ep.id, e)}
              onTouchEnd={e => handleTouchEnd(ep.id, e)}
            >
              {isMultiEpisode(activeProject.projectType) && (
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
                onClick={e => openDeleteConfirm(ep.id, e)}
              >삭제</button>
            )}
          </div>
        );
      })}

      <div
        className="m-item sub m-text-xs"
        onClick={() => {
          const num = epList.length + 1;
          const ep = { id: genId(), projectId: activeProject.id, number: num, title: '', majorEpisodes: '', summaryItems: [], status: 'draft', createdAt: now(), updatedAt: now() };
          dispatch({ type: 'ADD_EPISODE', payload: ep });
          dispatch({ type: 'SET_ACTIVE_EPISODE', id: ep.id });
        }}
      >{isMultiEpisode(activeProject.projectType) ? '+ 회차 추가' : '+ 추가'}</div>
    </div>
  );
}
