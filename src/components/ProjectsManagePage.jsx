import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import DeleteConfirmModal from './Modals/DeleteConfirmModal';

// ─── ProjectsManagePage — 작품 관리 (Phase X.1) ────────────────────────────
// 카드 클릭 = 작품 진입(SET_ACTIVE_PROJECT → activeDoc 'cover')
// ✏️ = 인라인 이름 변경. Enter 확정 / Esc 취소 / blur 시 비어있으면 원복

const TYPE_LABEL = { series: '시리즈', single: '단막' };

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ProjectsManagePage({ onNewProject }) {
  const { state, dispatch } = useApp();
  const [editingId, setEditingId]     = useState(null);
  const [draft, setDraft]             = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null); // project 객체
  const inputRef = useRef(null);

  const projects = [...(state.projects || [])]
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  const trashCount = (state.trash?.projects || []).length;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const enterProject = (project) => {
    dispatch({ type: 'SET_ACTIVE_PROJECT', id: project.id });
  };

  const startEdit = (project) => {
    setEditingId(project.id);
    setDraft(project.title || '');
  };

  const finishEdit = () => {
    setEditingId(null);
    setDraft('');
  };

  const saveDraft = (project) => {
    const trimmed = draft.trim();
    if (!trimmed) return false;
    if (trimmed !== (project.title || '')) {
      dispatch({ type: 'UPDATE_PROJECT', payload: { id: project.id, title: trimmed } });
    }
    return true;
  };

  // Enter: 확정 (빈값이면 편집 모드 유지)
  // Esc:   취소 (원복)
  const handleKeyDown = (e, project) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (saveDraft(project)) finishEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finishEdit();
    }
  };

  // blur: 비어있지 않으면 확정 / 비어있으면 원복(편집 종료)
  const handleBlur = (project) => {
    saveDraft(project);
    finishEdit();
  };

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const cardStyle = {
    padding: '10px 14px',
    background: 'var(--c-card)',
    border: '1px solid var(--c-border2)',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background 0.12s',
  };

  const editInputStyle = {
    width: '100%',
    background: 'var(--c-input)',
    color: 'var(--c-text)',
    border: '1px solid var(--c-accent)',
    borderRadius: 4,
    outline: 'none',
    padding: '4px 8px',
    fontSize: 14,
    fontWeight: 500,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const iconBtnStyle = {
    width: 28, height: 28, borderRadius: 4,
    border: '1px solid var(--c-border3)', background: 'transparent',
    color: 'var(--c-text4)', fontSize: 13, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0, flexShrink: 0,
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--c-bg)' }}>
      {/* 삭제 확정 모달 */}
      <DeleteConfirmModal
        open={!!deleteTarget}
        title={deleteTarget?.title || '제목 없음'}
        onConfirm={() => {
          if (deleteTarget) dispatch({ type: 'MOVE_PROJECT_TO_TRASH', id: deleteTarget.id });
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Header */}
      <div className="shrink-0" style={{ padding: '16px 20px', borderBottom: '1px solid var(--c-border2)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>작품 관리</div>
          <button
            onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'trash' })}
            title="휴지통"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: trashCount > 0 ? 'var(--c-text4)' : 'var(--c-text6)',
              fontSize: 12, padding: 0,
            }}
          >🗑 휴지통{trashCount > 0 ? ` (${trashCount})` : ''}</button>
        </div>
        <div className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--c-text5)' }}>
          작품 카드를 누르면 해당 작품으로 이동합니다. ✏️ 버튼으로 이름을 바꿀 수 있어요.
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '12px 16px' }}>
        {projects.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-sm" style={{ color: 'var(--c-text5)' }}>아직 작품이 없습니다.</div>
            <div className="mt-2 text-xs" style={{ color: 'var(--c-text6)' }}>
              새 작품을 만들어 첫 회차를 시작해보세요.
            </div>
            <button
              onClick={() => onNewProject?.()}
              style={{
                marginTop: 16, padding: '8px 18px', borderRadius: 6,
                border: '1px solid var(--c-border3)', background: 'var(--c-card)',
                color: 'var(--c-text)', fontSize: 13, cursor: 'pointer',
              }}
            >+ 새 작품 만들기</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projects.map(p => {
              const isEditing = editingId === p.id;
              return (
                <div
                  key={p.id}
                  className="group flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-4"
                  style={cardStyle}
                  onClick={() => { if (!isEditing) enterProject(p); }}
                  onMouseEnter={e => { if (!isEditing) e.currentTarget.style.background = 'var(--c-hover)'; }}
                  onMouseLeave={e => { if (!isEditing) e.currentTarget.style.background = 'var(--c-card)'; }}
                >
                  {/* 제목 + 메타 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => handleKeyDown(e, p)}
                        onBlur={() => handleBlur(p)}
                        onClick={e => e.stopPropagation()}
                        placeholder="작품 제목"
                        style={editInputStyle}
                      />
                    ) : (
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>
                        {p.title || '제목 없음'}
                      </div>
                    )}
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--c-text5)' }}>
                      {p.genre || '장르 없음'}
                      {p.projectType ? ` · ${TYPE_LABEL[p.projectType] || p.projectType}` : ''}
                    </div>
                  </div>

                  {/* 작성 / 수정 시각 */}
                  <div className="text-[11px] shrink-0 md:text-right" style={{ color: 'var(--c-text5)', lineHeight: 1.5 }}>
                    <div>작성: {formatDateTime(p.createdAt)}</div>
                    <div>수정: {formatDateTime(p.updatedAt || p.createdAt)}</div>
                  </div>

                  {/* 액션 버튼 — 데스크톱 호버 강조 / 모바일 항상 노출 */}
                  <div
                    className="flex gap-1 shrink-0"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => startEdit(p)}
                      title="이름 변경"
                      className="md:opacity-50 md:group-hover:opacity-100 transition-opacity"
                      style={iconBtnStyle}
                    >✏️</button>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      title="삭제"
                      className="md:opacity-50 md:group-hover:opacity-100 transition-opacity"
                      style={iconBtnStyle}
                    >🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
