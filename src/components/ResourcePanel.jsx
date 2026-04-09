import React, { useState, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { genId, now } from '../store/db';

const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB — 1차: file.size
const IMAGE_MAX_B64   = Math.ceil(IMAGE_MAX_BYTES * 4 / 3) + 100; // 2차: base64 결과 크기

// ─── ResourceCard ──────────────────────────────────────────────────────────────
function ResourceCard({ resource, onUpdate, onDelete }) {
  const [editingMemo, setEditingMemo] = useState(false);
  const [memo, setMemo] = useState(resource.memo || '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(resource.title || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const imgInputRef = useRef(null);

  const isMemo = resource.type === 'memo';

  const saveMemo  = () => { onUpdate({ memo });  setEditingMemo(false); };
  const saveTitle = () => { onUpdate({ title }); setEditingTitle(false); };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    // 1차: file.size 즉각 검사
    if (file.size > IMAGE_MAX_BYTES) {
      alert('이미지 파일은 5MB 이하만 업로드할 수 있습니다.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      // 2차: base64 결과 크기 재확인 (file.size 조작 우회 방지)
      if (ev.target.result.length > IMAGE_MAX_B64) {
        alert('이미지 파일이 너무 큽니다. (5MB 초과)');
        return;
      }
      onUpdate({ imageData: ev.target.result });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="rounded-lg overflow-hidden group" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>

      {/* 이미지 영역 — 이미지 타입만 표시 */}
      {!isMemo && (
        <>
          {resource.imageData ? (
            <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden', background: 'var(--c-bg)' }}>
              <img src={resource.imageData} alt={resource.title || '이미지'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                onClick={() => imgInputRef.current?.click()}
                className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer' }}
              >교체</button>
            </div>
          ) : (
            <div
              onClick={() => imgInputRef.current?.click()}
              className="flex items-center justify-center text-xs cursor-pointer"
              style={{ aspectRatio: '16/9', background: 'var(--c-bg)', color: 'var(--c-text5)' }}
            >+ 이미지 업로드</div>
          )}
          <input ref={imgInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
        </>
      )}

      <div className="p-3">
        {/* 제목 / 이미지 설명 */}
        {editingTitle ? (
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitle(resource.title || ''); setEditingTitle(false); } }}
            className="w-full text-sm font-medium outline-none mb-1 rounded px-1"
            style={{ background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-accent)' }} />
        ) : (
          <div className="text-sm font-medium mb-1 cursor-text"
            style={{ color: resource.title ? 'var(--c-text)' : 'var(--c-text6)', fontStyle: resource.title ? 'normal' : 'italic' }}
            onClick={() => setEditingTitle(true)}>
            {resource.title || (isMemo ? '제목 없음 (클릭해서 수정)' : '설명 없음 (클릭해서 수정)')}
          </div>
        )}

        {/* 메모 / 이미지 부가 설명 */}
        {editingMemo ? (
          <textarea autoFocus value={memo} onChange={e => setMemo(e.target.value)} onBlur={saveMemo} rows={3}
            className="w-full text-xs rounded p-1 outline-none resize-none"
            style={{ background: 'var(--c-input)', color: 'var(--c-text3)', border: '1px solid var(--c-border3)' }} />
        ) : (
          <div className="text-xs leading-relaxed cursor-text min-h-[2rem]"
            style={{ color: resource.memo ? 'var(--c-text4)' : 'var(--c-text6)', fontStyle: resource.memo ? 'normal' : 'italic' }}
            onClick={() => setEditingMemo(true)}>
            {resource.memo || (isMemo ? '메모 클릭해서 입력…' : '설명 클릭해서 입력…')}
          </div>
        )}

        {/* 액션 */}
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

// ─── ResourceListRow ───────────────────────────────────────────────────────────
function ResourceListRow({ resource, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(resource.title || '');
  const [memo, setMemo] = useState(resource.memo || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const imgInputRef = useRef(null);
  const isMemo = resource.type === 'memo';

  const save = () => { onUpdate({ title, memo }); setEditing(false); };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    // 1차: file.size 즉각 검사
    if (file.size > IMAGE_MAX_BYTES) {
      alert('이미지 파일은 5MB 이하만 업로드할 수 있습니다.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      // 2차: base64 결과 크기 재확인 (file.size 조작 우회 방지)
      if (ev.target.result.length > IMAGE_MAX_B64) {
        alert('이미지 파일이 너무 큽니다. (5MB 초과)');
        return;
      }
      onUpdate({ imageData: ev.target.result });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="group flex items-start gap-3 px-3 py-2 rounded-lg"
      style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      {/* 썸네일 / 타입 표시 */}
      <div className="shrink-0 rounded overflow-hidden flex items-center justify-center"
        style={{ width: 48, height: 48, background: 'var(--c-bg)', cursor: isMemo ? 'default' : 'pointer' }}
        onClick={() => !isMemo && imgInputRef.current?.click()}>
        {!isMemo && resource.imageData
          ? <img src={resource.imageData} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 18, color: 'var(--c-border3)' }}>{isMemo ? '📝' : '🖼'}</span>
        }
      </div>
      {!isMemo && <input ref={imgInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />}

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex flex-col gap-1">
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder={isMemo ? '제목' : '설명'}
              className="w-full text-sm rounded px-1 outline-none"
              style={{ background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-accent)' }} />
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2}
              placeholder="메모"
              className="w-full text-xs rounded p-1 outline-none resize-none"
              style={{ background: 'var(--c-input)', color: 'var(--c-text3)', border: '1px solid var(--c-border3)' }} />
            <div className="flex gap-1">
              <button onClick={save} className="text-[10px] px-2 py-0.5 rounded"
                style={{ background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>저장</button>
              <button onClick={() => { setTitle(resource.title || ''); setMemo(resource.memo || ''); setEditing(false); }}
                className="text-[10px] px-2 py-0.5 rounded"
                style={{ background: 'transparent', color: 'var(--c-text5)', border: '1px solid var(--c-border3)', cursor: 'pointer' }}>취소</button>
            </div>
          </div>
        ) : (
          <div onClick={() => setEditing(true)} className="cursor-text">
            <div className="text-sm truncate" style={{ color: resource.title ? 'var(--c-text)' : 'var(--c-text6)', fontStyle: resource.title ? 'normal' : 'italic' }}>
              {resource.title || (isMemo ? '제목 없음' : '설명 없음')}
            </div>
            {resource.memo && (
              <div className="text-xs truncate mt-0.5" style={{ color: 'var(--c-text5)' }}>{resource.memo}</div>
            )}
          </div>
        )}
      </div>

      {/* 날짜 + 삭제 */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className="text-[10px]" style={{ color: 'var(--c-text6)' }}>
          {new Date(resource.createdAt).toLocaleDateString('ko-KR')}
        </span>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          {confirmDelete ? (
            <>
              <button onClick={() => onDelete()} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: '#f87171', background: 'transparent', border: '1px solid #f87171', cursor: 'pointer' }}>삭제</button>
              <button onClick={() => setConfirmDelete(false)} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--c-text5)', background: 'transparent', border: '1px solid var(--c-border3)', cursor: 'pointer' }}>취소</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--c-text5)', background: 'transparent', border: '1px solid var(--c-border3)', cursor: 'pointer' }}>삭제</button>
          )}
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
  const [viewMode, setViewMode] = useState(() => {
    try {
      const v = localStorage.getItem('drama_resource_view');
      return v === 'list' ? 'list' : 'grid'; // 화이트리스트: 'grid' | 'list'
    } catch { return 'grid'; }
  });
  const setView = (v) => {
    setViewMode(v);
    try { localStorage.setItem('drama_resource_view', v); } catch {}
  };

  const projectResources = resources
    .filter(r => r.projectId === activeProjectId)
    .sort((a, b) => b.createdAt - a.createdAt);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    let skipped = 0;
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      // 1차: file.size 즉각 검사
      if (file.size > IMAGE_MAX_BYTES) { skipped++; return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        // 2차: base64 결과 크기 재확인 (file.size 조작 우회 방지)
        if (ev.target.result.length > IMAGE_MAX_B64) { skipped++; return; }
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
    if (skipped > 0) alert(`${skipped}개 파일이 5MB를 초과하여 건너뛰었습니다.`);
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
        <div className="ml-auto flex items-center gap-2">
          {/* 뷰 토글 */}
          <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--c-border3)' }}>
            {[
              { id: 'grid', title: '그리드 보기', icon: (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <rect x="0" y="0" width="6" height="6" rx="1"/><rect x="8" y="0" width="6" height="6" rx="1"/>
                  <rect x="0" y="8" width="6" height="6" rx="1"/><rect x="8" y="8" width="6" height="6" rx="1"/>
                </svg>
              )},
              { id: 'list', title: '목록 보기', icon: (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <rect x="0" y="1" width="14" height="2" rx="1"/><rect x="0" y="6" width="14" height="2" rx="1"/>
                  <rect x="0" y="11" width="14" height="2" rx="1"/>
                </svg>
              )},
            ].map(({ id, title, icon }) => (
              <button key={id} onClick={() => setView(id)} title={title} style={{
                padding: '4px 7px', background: viewMode === id ? 'var(--c-active)' : 'transparent',
                color: viewMode === id ? 'var(--c-accent)' : 'var(--c-text5)',
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
              }}>{icon}</button>
            ))}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1 text-sm rounded"
            style={{ color: 'var(--c-text3)', border: '1px solid var(--c-border3)', background: 'transparent', cursor: 'pointer' }}
          >
            + 이미지
          </button>
          <button
            onClick={addMemoResource}
            className="px-3 py-1 text-sm rounded text-white"
            style={{ background: 'var(--c-accent)', cursor: 'pointer', border: 'none' }}
          >
            + 메모
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
        ) : viewMode === 'list' ? (
          <div className="flex flex-col gap-1">
            {projectResources.map(r => (
              <ResourceListRow
                key={r.id}
                resource={r}
                onUpdate={(updates) => dispatch({ type: 'UPDATE_RESOURCE', payload: { id: r.id, ...updates } })}
                onDelete={() => dispatch({ type: 'DELETE_RESOURCE', id: r.id })}
              />
            ))}
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
