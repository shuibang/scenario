import React, { useState, useEffect } from 'react';
import Modal, { ModalBtn } from './Modal';
import { listAllBackupFiles, loadDriveBackupData, setAccessToken } from '../../store/googleDrive';
import { supabase } from '../../store/supabaseClient';
import { isMultiEpisode, getTypeLabel } from '../../utils/projectTypes';
import { deserializeProject } from '../../utils/projectSerializer';
import { KakaoAdBanner } from '../AdBanner';
import { useIsMobile } from '../../hooks/useIsMobile';

const TAB_LOCAL = 'local';
const TAB_DRIVE = 'drive';
const TAB_FILE  = 'file';

export default function OpenProjectModal({ open, onClose, projects = [], activeProjectId, onSelect, onFileImport, onSaveToDriveLocal }) {
  const [tab,      setTab]      = useState(TAB_LOCAL);
  const [selected, setSelected] = useState(null);
  const [query,    setQuery]    = useState('');
  const isMobile = useIsMobile();

  const [driveFiles,    setDriveFiles]    = useState([]);
  const [driveLoading,  setDriveLoading]  = useState(false);
  const [driveError,    setDriveError]    = useState(null);
  const [driveAuthed,   setDriveAuthed]   = useState(false);
  const [driveSelected, setDriveSelected] = useState(null);
  const [driveOpenBusy, setDriveOpenBusy] = useState(false);
  const [importError,   setImportError]   = useState(null);

  useEffect(() => {
    if (open) {
      setTab(TAB_LOCAL); setSelected(null); setQuery('');
      setImportError(null); setDriveSelected(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || tab !== TAB_DRIVE) return;
    (async () => {
      setDriveLoading(true);
      setDriveError(null);
      setDriveSelected(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.provider_token) { setDriveAuthed(false); setDriveLoading(false); return; }
        setAccessToken(session.provider_token, session.expires_in ?? 3600);
        setDriveAuthed(true);
        const files = await listAllBackupFiles();
        setDriveFiles(files);
      } catch (err) {
        setDriveError('Drive에서 불러오기 실패: ' + (err?.message || err));
      } finally {
        setDriveLoading(false);
      }
    })();
  }, [open, tab]);

  const handleOpen = () => { onSelect?.(selected); onClose(); };

  // Drive 파일 열기 — 충돌 확인 없이 바로 덮어쓰기
  const handleDriveOpen = async () => {
    if (!driveSelected || driveOpenBusy) return;
    setDriveOpenBusy(true);
    setImportError(null);
    try {
      const raw = await loadDriveBackupData(driveSelected);
      let imported;
      try {
        imported = deserializeProject(raw);
      } catch (err) {
        setImportError(
          err?.name === 'ZodError'
            ? '올바른 .djs 파일이 아닙니다. 형식이 손상되었거나 지원하지 않는 버전입니다.'
            : '파일을 읽을 수 없습니다.'
        );
        setDriveOpenBusy(false);
        return;
      }
      onFileImport?.(imported, 'replace');
      onClose();
    } catch (err) {
      setImportError('Drive 파일 열기 실패: ' + (err?.message || err));
    } finally {
      setDriveOpenBusy(false);
    }
  };

  // 파일에서 열기 — 충돌 확인 없이 바로 덮어쓰기
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
        onFileImport?.(imported, 'replace');
        onClose();
      };
      reader.onerror = () => setImportError('파일을 읽을 수 없습니다.');
      reader.readAsText(file);
    };
    input.click();
  };

  const filteredLocal = [...projects]
    .reverse()
    .filter(p => !query || (p.title || '').toLowerCase().includes(query.toLowerCase()));

  const filteredDrive = driveFiles
    .filter(f => !query || (f.name || '').toLowerCase().includes(query.toLowerCase()) || (f.projectFolder || '').toLowerCase().includes(query.toLowerCase()));

  const isOpen = selected !== null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="열기"
      size="md"
      description="대본을 선택해 여세요."
      footer={
        tab === TAB_FILE ? (
          <>
            <ModalBtn variant="secondary" onClick={onClose}>취소</ModalBtn>
            <ModalBtn variant="primary" onClick={handleFileOpen}>파일 선택…</ModalBtn>
          </>
        ) : tab === TAB_DRIVE ? (
          <>
            <ModalBtn variant="secondary" onClick={onClose}>취소</ModalBtn>
            <ModalBtn variant="primary" onClick={handleDriveOpen} disabled={!driveSelected || driveOpenBusy}>
              {driveOpenBusy ? '불러오는 중…' : '열기'}
            </ModalBtn>
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
        {[{ id: TAB_LOCAL, label: '내 대본' }, { id: TAB_DRIVE, label: 'Google Drive' }, { id: TAB_FILE, label: '파일에서 열기' }]
          .map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelected(null); setDriveSelected(null); }}
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
        <>
          {/* 로컬 저장 안내 배너 */}
          <div style={{
            background: '#fff8e1',
            border: '1px solid #ffe082',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 10,
            fontSize: 11.5,
            color: '#7a6200',
            lineHeight: 1.65,
          }}>
            <span style={{ fontWeight: 600 }}>⚠ 이 대본들은 이 브라우저에만 저장되어 있어요.</span><br />
            브라우저 캐시 삭제 시 사라질 수 있습니다. Drive에 저장하면 다른 기기에서도 열 수 있어요.
          </div>
          <ProjectList
            items={filteredLocal}
            selected={selected}
            onSelect={setSelected}
            onOpen={handleOpen}
            onDriveSave={onSaveToDriveLocal}
            emptyMsg="저장된 대본이 없습니다."
          />
        </>
      )}

      {tab === TAB_DRIVE && (
        driveLoading ? (
          <Empty>Drive에서 불러오는 중…</Empty>
        ) : !driveAuthed ? (
          <Empty>Google Drive 연동이 필요합니다.<br />설정에서 로그인해 주세요.</Empty>
        ) : driveError ? (
          <Empty style={{ color: 'var(--c-danger, #e53e3e)' }}>{driveError}</Empty>
        ) : (
          <>
            <DriveFileList
              items={filteredDrive}
              selected={driveSelected}
              onSelect={setDriveSelected}
              onOpen={handleDriveOpen}
            />
            {importError && (
              <p style={{ fontSize: 12, color: 'var(--c-danger, #e53e3e)', textAlign: 'center', margin: '8px 0 0' }}>
                {importError}
              </p>
            )}
          </>
        )
      )}

      {tab === TAB_FILE && (
        <>
          <Empty style={{ padding: '24px 0 8px' }}>
            .djs 형식의 백업 파일을 선택하세요.
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

function DriveFileList({ items, selected, onSelect, onOpen }) {
  if (items.length === 0) return <Empty>Drive에 저장된 백업 파일이 없습니다.</Empty>;
  const fmtDate = (ts) => ts ? new Date(ts).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 280, overflowY: 'auto' }}>
      {items.map(f => {
        const isActive = selected === f.id;
        return (
          <button
            key={f.id}
            onClick={() => onSelect(f.id)}
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
              {f.projectFolder || f.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-text5)' }}>
              {f.name}{f.savedAt ? ` · ${fmtDate(f.savedAt)}` : ''}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// 내 대본 탭 전용 — 각 항목에 "Drive에 저장" 버튼 포함
// button 안에 button이 불가하므로 div 기반으로 구현
function ProjectList({ items, selected, onSelect, onOpen, onDriveSave, emptyMsg }) {
  if (items.length === 0) return <Empty>{emptyMsg}</Empty>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 260, overflowY: 'auto' }}>
      {items.map(p => {
        const isActive = selected === p.id;
        return (
          <div
            key={p.id}
            onClick={() => onSelect(p.id)}
            onDoubleClick={onOpen}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') { onSelect(p.id); onOpen(); } }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', textAlign: 'left',
              padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
              background: isActive ? 'var(--c-active)' : 'transparent',
              outline: isActive ? '1px solid var(--c-accent)' : '1px solid transparent',
              transition: 'background 0.1s',
              userSelect: 'none', boxSizing: 'border-box',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-hover)'; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
          >
            {/* 제목 + 메타 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.title || '(제목 없음)'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--c-text5)' }}>
                {getTypeLabel(p.projectType)}{isMultiEpisode(p.projectType) && p.totalEpisodes ? ` · ${p.totalEpisodes}회` : ''}
                {p.updatedAt ? ` · ${new Date(p.updatedAt).toLocaleDateString('ko-KR')}` : ''}
              </div>
            </div>
            {/* Drive에 저장 버튼 */}
            {onDriveSave && (
              <button
                onClick={(e) => { e.stopPropagation(); onDriveSave(p); }}
                title="Drive에 저장"
                style={{
                  flexShrink: 0,
                  padding: '3px 8px', borderRadius: 4,
                  border: '1px solid var(--c-border3)',
                  background: 'var(--c-card)', color: 'var(--c-text4)',
                  fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                  lineHeight: 1.5,
                }}
              >
                ☁ Drive
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
