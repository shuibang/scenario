import React, { useState, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { genId, now } from '../store/db';

// ─── ResourceCard ──────────────────────────────────────────────────────────────
function ResourceCard({ resource, onUpdate, onDelete }) {
  const [editingMemo, setEditingMemo] = useState(false);
  const [memo, setMemo] = useState(resource.memo || '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(resource.title || '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveMemo = () => {
    onUpdate({ memo });
    setEditingMemo(false);
  };

  const saveTitle = () => {
    onUpdate({ title });
    setEditingTitle(false);
  };

  return (
    <div
      className="rounded-lg overflow-hidden group"
      style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
    >
      {/* Image thumbnail */}
      {resource.imageData && (
        <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden', background: 'var(--c-bg)' }}>
          <img
            src={resource.imageData}
            alt={resource.title || '이미지'}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}
      {!resource.imageData && (
        <div
          className="flex items-center justify-center text-xs"
          style={{ aspectRatio: '16/9', background: 'var(--c-bg)', color: 'var(--c-text6)', border: 'none' }}
        >
          이미지 없음
        </div>
      )}

      <div className="p-3">
        {/* Title */}
        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitle(resource.title || ''); setEditingTitle(false); } }}
            className="w-full text-sm font-medium outline-none mb-1 rounded px-1"
            style={{ background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-accent)' }}
          />
        ) : (
          <div
            className="text-sm font-medium mb-1 cursor-text"
            style={{ color: resource.title ? 'var(--c-text)' : 'var(--c-text6)', fontStyle: resource.title ? 'normal' : 'italic' }}
            onClick={() => setEditingTitle(true)}
          >
            {resource.title || '제목 없음 (클릭해서 수정)'}
          </div>
        )}

        {/* Memo */}
        {editingMemo ? (
          <textarea
            autoFocus
            value={memo}
            onChange={e => setMemo(e.target.value)}
            onBlur={saveMemo}
            rows={3}
            className="w-full text-xs rounded p-1 outline-none resize-none"
            style={{ background: 'var(--c-input)', color: 'var(--c-text3)', border: '1px solid var(--c-border3)' }}
          />
        ) : (
          <div
            className="text-xs leading-relaxed cursor-text min-h-[2rem]"
            style={{ color: resource.memo ? 'var(--c-text4)' : 'var(--c-text6)', fontStyle: resource.memo ? 'normal' : 'italic' }}
            onClick={() => setEditingMemo(true)}
          >
            {resource.memo || '메모 클릭해서 입력…'}
          </div>
        )}

        {/* Actions */}
        <div className="mt-2 flex justify-between items-center">
          <span className="text-[10px]" style={{ color: 'var(--c-text6)' }}>
            {new Date(resource.createdAt).toLocaleDateString('ko-KR')}
          </span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {confirmDelete ? (
              <>
                <button onClick={() => onDelete()} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: '#f87171', background: 'transparent', border: '1px solid #f87171', cursor: 'pointer' }}>삭제 확인</button>
                <button onClick={() => setConfirmDelete(false)} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--c-text5)', background: 'transparent', border: '1px solid var(--c-border3)', cursor: 'pointer' }}>취소</button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--c-text5)', background: 'transparent', border: '1px solid var(--c-border3)', cursor: 'pointer' }}>삭제</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ResourcePanel ─────────────────────────────────────────────────────────────
export default function ResourcePanel() {
  const { state, dispatch } = useApp();
  const { activeProjectId, resources } = state;
  const fileInputRef = useRef(null);
  const [memoOnly, setMemoOnly] = useState(false);

  const projectResources = resources
    .filter(r => r.projectId === activeProjectId)
    .sort((a, b) => b.createdAt - a.createdAt);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const resource = {
          id: genId(),
          projectId: activeProjectId,
          type: 'image',
          title: file.name.replace(/\.[^.]+$/, ''),
          memo: '',
          imageData: ev.target.result,
          createdAt: now(),
        };
        dispatch({ type: 'ADD_RESOURCE', payload: resource });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const addMemoResource = () => {
    const resource = {
      id: genId(),
      projectId: activeProjectId,
      type: 'memo',
      title: '',
      memo: '',
      imageData: null,
      createdAt: now(),
    };
    dispatch({ type: 'ADD_RESOURCE', payload: resource });
  };

  if (!activeProjectId) return null;

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ background: 'var(--c-bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0" style={{ padding: '10px', borderBottom: '1px solid var(--c-border2)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--c-text2)' }}>자료수집 ({projectResources.length})</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1 text-sm rounded"
            style={{ color: 'var(--c-text3)', border: '1px solid var(--c-border3)', background: 'transparent', cursor: 'pointer' }}
          >
            + 이미지 추가
          </button>
          <button
            onClick={addMemoResource}
            className="px-3 py-1 text-sm rounded text-white"
            style={{ background: 'var(--c-accent)', cursor: 'pointer', border: 'none' }}
          >
            + 메모 추가
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 10 }}>
        {projectResources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="text-4xl" style={{ color: 'var(--c-border3)' }}>🖼</div>
            <p className="text-sm" style={{ color: 'var(--c-text5)' }}>이미지나 메모를 추가해 자료를 수집하세요</p>
            <div className="flex gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-sm rounded"
                style={{ color: 'var(--c-text3)', border: '1px solid var(--c-border3)', background: 'transparent', cursor: 'pointer' }}
              >
                이미지 업로드
              </button>
              <button
                onClick={addMemoResource}
                className="px-4 py-2 text-sm rounded text-white"
                style={{ background: 'var(--c-accent)', border: 'none', cursor: 'pointer' }}
              >
                메모 추가
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {projectResources.map(r => (
              <ResourceCard
                key={r.id}
                resource={r}
                onUpdate={(updates) => dispatch({ type: 'UPDATE_RESOURCE', payload: { id: r.id, ...updates } })}
                onDelete={() => dispatch({ type: 'DELETE_RESOURCE', id: r.id })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
