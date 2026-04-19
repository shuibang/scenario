import React, { useState, useEffect } from 'react';
import Modal, { ModalBtn } from './Modal';
import { loadFromDrive } from '../../store/googleDrive';
import { supabase } from '../../store/supabaseClient';
import { isMultiEpisode, getTypeLabel } from '../../utils/projectTypes';

const TAB_LOCAL = 'local';
const TAB_DRIVE = 'drive';
const TAB_FILE  = 'file';

export default function OpenProjectModal({ open, onClose, projects = [], activeProjectId, onSelect }) {
  const [tab,      setTab]      = useState(TAB_LOCAL);
  const [selected, setSelected] = useState(null);
  const [query,    setQuery]    = useState('');

  const [driveProjects, setDriveProjects] = useState([]);
  const [driveLoading,  setDriveLoading]  = useState(false);
  const [driveError,    setDriveError]    = useState(null);
  const [driveAuthed,   setDriveAuthed]   = useState(false);

  useEffect(() => {
    if (open) { setTab(TAB_LOCAL); setSelected(null); setQuery(''); }
  }, [open]);

  useEffect(() => {
    if (!open || tab !== TAB_DRIVE) return;
    (async () => {
      setDriveLoading(true);
      setDriveError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.provider_token) { setDriveAuthed(false); setDriveLoading(false); return; }
        setDriveAuthed(true);
        const workspace = await loadFromDrive();
        setDriveProjects(workspace?.projects || []);
      } catch (err) {
        setDriveError('Drive에서 불러오기 실패: ' + (err?.message || err));
      } finally {
        setDriveLoading(false);
      }
    })();
  }, [open, tab]);

  const handleOpen = () => { onSelect?.(selected); onClose(); };

  const handleFileOpen = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.djs,.json';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          console.log('[stub] file import', data);
          onClose();
        } catch { alert('파일을 읽을 수 없습니다.'); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const filteredLocal = [...projects]
    .reverse()
    .filter(p => !query || (p.title || '').toLowerCase().includes(query.toLowerCase()));

  const filteredDrive = driveProjects
    .filter(p => !query || (p.title || '').toLowerCase().includes(query.toLowerCase()));

  const isOpen = selected !== null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="열기"
      size="md"
      description="작품을 선택해 여세요."
      footer={
        tab === TAB_FILE ? (
          <>
            <ModalBtn variant="secondary" onClick={onClose}>취소</ModalBtn>
            <ModalBtn variant="primary" onClick={handleFileOpen}>파일 선택…</ModalBtn>
          </>
        ) : (
          <>
            <ModalBtn variant="secondary" onClick={onClose}>취소</ModalBtn>
            <ModalBtn variant="primary" onClick={handleOpen} disabled={!isOpen}>열기</ModalBtn>
          </>
        )
      }
    >
      {/* 탭 */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 14, borderBottom: '1px solid var(--c-border)' }}>
        {[{ id: TAB_LOCAL, label: '내 작품' }, { id: TAB_DRIVE, label: 'Google Drive' }, { id: TAB_FILE, label: '파일에서 열기' }]
          .map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelected(null); }}
              style={{
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: tab === t.id ? 600 : 400,
                color: tab === t.id ? 'var(--c-accent)' : 'var(--c-text4)',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t.id ? '2px solid var(--c-accent)' : '2px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
                borderRadius: 0,
                transition: 'color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
      </div>

      {tab !== TAB_FILE && (
        <div style={{ marginBottom: 10 }}>
          <input
            placeholder="작품 검색…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '7px 10px', borderRadius: 6,
              border: '1px solid var(--c-border3)',
              background: 'var(--c-input)', color: 'var(--c-text)',
              fontSize: 13, outline: 'none',
            }}
          />
        </div>
      )}

      {tab === TAB_LOCAL && (
        <ProjectList
          items={filteredLocal}
          selected={selected}
          onSelect={setSelected}
          onOpen={handleOpen}
          emptyMsg="저장된 작품이 없습니다."
        />
      )}

      {tab === TAB_DRIVE && (
        driveLoading ? (
          <Empty>Drive에서 불러오는 중…</Empty>
        ) : !driveAuthed ? (
          <Empty>Google Drive 연동이 필요합니다.<br />설정에서 로그인해 주세요.</Empty>
        ) : driveError ? (
          <Empty style={{ color: 'var(--c-danger, #e53e3e)' }}>{driveError}</Empty>
        ) : (
          <ProjectList
            items={filteredDrive}
            selected={selected}
            onSelect={setSelected}
            onOpen={handleOpen}
            emptyMsg="Drive에 저장된 작품이 없습니다."
          />
        )
      )}

      {tab === TAB_FILE && (
        <Empty style={{ padding: '24px 0' }}>
          .djs 또는 .json 형식의 내보내기 파일을 선택하세요.
        </Empty>
      )}
    </Modal>
  );
}

function Empty({ children, style }) {
  return (
    <div style={{ padding: '16px 0', fontSize: 13, color: 'var(--c-text5)', textAlign: 'center', lineHeight: 1.7, ...style }}>
      {children}
    </div>
  );
}

function ProjectList({ items, selected, onSelect, onOpen, emptyMsg }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 280, overflowY: 'auto' }}>
      {items.length === 0 ? (
        <Empty>{emptyMsg}</Empty>
      ) : items.map(p => {
        const isActive = selected === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            onDoubleClick={onOpen}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              width: '100%', textAlign: 'left',
              padding: '8px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: isActive ? 'var(--c-active)' : 'transparent',
              outline: isActive ? '1px solid var(--c-accent)' : '1px solid transparent',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-hover)'; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)', marginBottom: 2 }}>
              {p.title || '(제목 없음)'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-text5)' }}>
              {getTypeLabel(p.projectType)}{isMultiEpisode(p.projectType) && p.totalEpisodes ? ` · ${p.totalEpisodes}회` : ''}
              {p.updatedAt ? ` · ${new Date(p.updatedAt).toLocaleDateString('ko-KR')}` : ''}
            </div>
          </button>
        );
      })}
    </div>
  );
}
