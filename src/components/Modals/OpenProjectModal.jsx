import React, { useState, useEffect } from 'react';
import Modal, { ModalBtn } from './Modal';
import { loadFromDrive } from '../../store/googleDrive';
import { supabase } from '../../store/supabaseClient';
import { isMultiEpisode, getTypeLabel } from '../../utils/projectTypes';
import { deserializeProject, findImportConflict } from '../../utils/projectSerializer';
import { KakaoAdBanner } from '../AdBanner';
import { useIsMobile } from '../../hooks/useIsMobile';

const TAB_LOCAL = 'local';
const TAB_DRIVE = 'drive';
const TAB_FILE  = 'file';

export default function OpenProjectModal({ open, onClose, projects = [], activeProjectId, onSelect, onFileImport }) {
  const [tab,      setTab]      = useState(TAB_LOCAL);
  const [selected, setSelected] = useState(null);
  const [query,    setQuery]    = useState('');
  const isMobile = useIsMobile();

  const [driveProjects, setDriveProjects] = useState([]);
  const [driveLoading,  setDriveLoading]  = useState(false);
  const [driveError,    setDriveError]    = useState(null);
  const [driveAuthed,   setDriveAuthed]   = useState(false);

  // 파일 import 흐름 상태
  const [importError,   setImportError]   = useState(null);
  const [pendingImport, setPendingImport] = useState(null); // { imported, conflictWith }

  useEffect(() => {
    if (open) {
      setTab(TAB_LOCAL); setSelected(null); setQuery('');
      setImportError(null); setPendingImport(null);
    }
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
    setImportError(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.djs,.json';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        let imported;
        try {
          const raw = JSON.parse(ev.target.result);
          imported = deserializeProject(raw);
        } catch (err) {
          setImportError(
            err?.name === 'ZodError'
              ? '올바른 .djs 파일이 아닙니다. 형식이 손상되었거나 지원하지 않는 버전입니다.'
              : '파일을 읽을 수 없습니다.'
          );
          return;
        }
        const conflictWith = findImportConflict({ projects }, imported);
        if (conflictWith) {
          // 같은 ID 대본이 이미 있음 — 정책 선택으로 진입
          setPendingImport({ imported, conflictWith });
        } else {
          // 충돌 없음 — 새 대본으로 그대로 추가
          onFileImport?.(imported, 'newId');
          onClose();
        }
      };
      reader.onerror = () => setImportError('파일을 읽을 수 없습니다.');
      reader.readAsText(file);
    };
    input.click();
  };

  const handleApplyImport = (policy) => {
    if (!pendingImport) return;
    onFileImport?.(pendingImport.imported, policy);
    setPendingImport(null);
    onClose();
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
      description="대본을 선택해 여세요."
      footer={
        pendingImport ? (
          <>
            <ModalBtn variant="secondary" onClick={() => setPendingImport(null)}>취소</ModalBtn>
            <ModalBtn variant="secondary" onClick={() => handleApplyImport('newId')}>사본으로 추가</ModalBtn>
            <ModalBtn variant="primary" onClick={() => handleApplyImport('replace')}>덮어쓰기</ModalBtn>
          </>
        ) : tab === TAB_FILE ? (
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
      {pendingImport ? (
        <ImportConflictView
          imported={pendingImport.imported}
          conflictWith={pendingImport.conflictWith}
        />
      ) : <>
      {/* 탭 */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 14, borderBottom: '1px solid var(--c-border)' }}>
        {[{ id: TAB_LOCAL, label: '내 대본' }, { id: TAB_DRIVE, label: 'Google Drive' }, { id: TAB_FILE, label: '파일에서 열기' }]
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
            placeholder="대본 검색…"
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
          emptyMsg="저장된 대본이 없습니다."
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
            emptyMsg="Drive에 저장된 대본이 없습니다."
          />
        )
      )}

      {tab === TAB_FILE && (
        <>
          <Empty style={{ padding: '24px 0 8px' }}>
            .djs 또는 .json 형식의 내보내기 파일을 선택하세요.
          </Empty>
          {importError && (
            <p style={{ fontSize: 12, color: 'var(--c-danger, #e53e3e)', textAlign: 'center', margin: '8px 0 0' }}>
              {importError}
            </p>
          )}
        </>
      )}

      {/* 카카오 애드핏 — 모달 폭(md 480px)이 좁아 모바일 단위만 노출 */}
      {isMobile && (
        <div style={{
          display: 'flex', justifyContent: 'center',
          marginTop: 12, paddingTop: 10,
          borderTop: '1px solid var(--c-border3)',
        }}>
          <KakaoAdBanner unitId="DAN-DCImro84Aqn4N89r" width={320} height={100} />
        </div>
      )}
      </>}
    </Modal>
  );
}

function ImportConflictView({ imported, conflictWith }) {
  const importedTitle = imported?.project?.title || '제목없음';
  const fmtTs = (ts) => ts ? new Date(ts).toLocaleString('ko-KR') : '—';
  const importedTs = imported?.project?.updatedAt || imported?.exportedAt;
  const localTs    = conflictWith?.updatedAt;
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', marginBottom: 6 }}>
        같은 ID의 대본이 이미 있습니다
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-text5)', marginBottom: 12, lineHeight: 1.6 }}>
        <strong>"{importedTitle}"</strong> 대본이 이미 이 기기에 저장되어 있습니다.<br />
        어떻게 추가할지 선택해 주세요.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <div style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--c-card)', border: '1px solid var(--c-border3)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text2)', marginBottom: 2 }}>이 기기 (현재)</div>
          <div style={{ fontSize: 11, color: 'var(--c-text5)' }}>최근 수정: {fmtTs(localTs)}</div>
        </div>
        <div style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--c-card)', border: '1px solid var(--c-border3)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text2)', marginBottom: 2 }}>가져올 파일</div>
          <div style={{ fontSize: 11, color: 'var(--c-text5)' }}>최근 수정: {fmtTs(importedTs)}</div>
        </div>
      </div>
      <ul style={{ fontSize: 11, color: 'var(--c-text5)', lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
        <li><strong>덮어쓰기</strong> — 이 기기의 대본 데이터를 파일 내용으로 교체</li>
        <li><strong>사본으로 추가</strong> — 새 ID로 별도의 대본을 만들어 추가 (제목 끝에 "(사본)")</li>
      </ul>
    </div>
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
