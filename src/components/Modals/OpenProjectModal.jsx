import React, { useState, useEffect, useRef } from 'react';
import Modal, { ModalBtn } from './Modal';
import { listAllBackupFiles, loadDriveBackupData, setAccessToken, isTokenValid } from '../../store/googleDrive';
import { supabase, refreshDriveToken, signInWithGoogle } from '../../store/supabaseClient';
import { isDropboxTokenValid, connectDropbox, listDropboxBackupFiles, loadDropboxBackupData } from '../../store/dropbox';
import { isMultiEpisode, getTypeLabel } from '../../utils/projectTypes';
import { deserializeProject } from '../../utils/projectSerializer';
import { KakaoAdBanner } from '../AdBanner';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  isFsaSupported,
  getLocalFolderHandle,
  setLocalFolderHandle,
  clearLocalFolderHandle,
  verifyReadPermission,
  listDjsFiles,
} from '../../store/localFolderHandle';

const TAB_DRIVE   = 'drive';
const TAB_DROPBOX = 'dropbox';
const TAB_LOCAL   = 'local';
const TAB_FILE    = 'file';

/** Google 로그인(구글 계정) 여부 — provider_token 만료여도 세션이 있으면 true */
async function isGoogleUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return !!(session?.user?.app_metadata?.provider === 'google' || session?.provider_token);
  } catch {
    return false;
  }
}

/** Dropbox를 한 번이라도 연결한 적 있는지 (localStorage refresh token 기준) */
function hasDropboxHistory() {
  try { return !!localStorage.getItem('dropbox_refresh_token'); } catch { return false; }
}

export default function OpenProjectModal({ open, onClose, projects = [], activeProjectId, onSelect, onFileImport, onSaveToDriveLocal }) {
  const isMobile = useIsMobile();

  // 사용 가능한 탭 목록 (연결 이력 기반, 비동기 결정)
  const [tabs,        setTabs]        = useState(null); // null = 아직 결정 중
  const [tab,         setTab]         = useState(null);

  // 내 대본 탭
  const [selected,    setSelected]    = useState(null);
  const [query,       setQuery]       = useState('');

  // Drive 탭
  const [driveState,  setDriveState]  = useState('idle'); // idle | loading | authed | unauthed | error
  const [driveLoadKey, setDriveLoadKey] = useState(0); // 재시도 트리거
  const [driveFiles,  setDriveFiles]  = useState([]);
  const [driveSelected, setDriveSelected] = useState(null);
  const [driveBusy,   setDriveBusy]   = useState(false);

  // Dropbox 탭
  const [dropboxState, setDropboxState] = useState('idle'); // idle | loading | authed | unauthed | error
  const [dropboxFiles, setDropboxFiles] = useState([]);
  const [dropboxSelected, setDropboxSelected] = useState(null);
  const [dropboxBusy,  setDropboxBusy]  = useState(false);

  // 로컬 폴더 탭 (내 컴퓨터)
  // localFsState: 'idle' | 'loading' | 'nohandle' | 'noperm' | 'ready' | 'unsupported'
  const [localFsState,    setLocalFsState]    = useState('idle');
  const [localFsFiles,    setLocalFsFiles]    = useState([]);
  const [localFsSelected, setLocalFsSelected] = useState(null); // { name, handle }
  const [localFsBusy,     setLocalFsBusy]     = useState(false);
  const localFsDirRef = useRef(null); // 현재 로드된 dirHandle

  const [importError, setImportError] = useState(null);

  // 모달 열릴 때마다 탭 목록 결정 + 상태 초기화
  useEffect(() => {
    if (!open) return;
    setSelected(null); setQuery(''); setImportError(null);
    setDriveSelected(null); setDropboxSelected(null);
    setDriveState('idle'); setDropboxState('idle');
    setDriveFiles([]); setDropboxFiles([]);
    setDriveLoadKey(0);
    setLocalFsState('idle'); setLocalFsFiles([]); setLocalFsSelected(null);
    localFsDirRef.current = null;

    (async () => {
      const [googleUser, dropboxHistory] = await Promise.all([isGoogleUser(), Promise.resolve(hasDropboxHistory())]);
      const newTabs = [TAB_LOCAL];
      if (googleUser)     newTabs.push(TAB_DRIVE);
      if (dropboxHistory) newTabs.push(TAB_DROPBOX);
      newTabs.push(TAB_FILE);
      setTabs(newTabs);
      setTab(newTabs[0]);
    })();
  }, [open]);

  // 내 컴퓨터 탭 진입 시 폴더 핸들 확인 + 파일 목록 로드
  useEffect(() => {
    if (!open || tab !== TAB_LOCAL) return;
    if (!isFsaSupported()) { setLocalFsState('unsupported'); return; }
    (async () => {
      setLocalFsState('loading');
      const handle = await getLocalFolderHandle();
      if (!handle) { setLocalFsState('nohandle'); return; }
      const ok = await verifyReadPermission(handle);
      if (!ok) { setLocalFsState('noperm'); return; }
      localFsDirRef.current = handle;
      try {
        const files = await listDjsFiles(handle);
        setLocalFsFiles(files);
        setLocalFsState('ready');
      } catch {
        setLocalFsState('noperm');
      }
    })();
  }, [open, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drive 탭 진입 시 파일 목록 로드 (driveLoadKey 변경 시에도 재실행)
  useEffect(() => {
    if (!open || tab !== TAB_DRIVE) return;
    (async () => {
      setDriveState('loading');
      setImportError(null);
      try {
        // 1) 이미 유효한 토큰이 있으면 바로, 없으면 갱신 시도
        if (!isTokenValid()) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.provider_token) {
            setAccessToken(session.provider_token, session.expires_in ?? 3600);
          } else {
            await refreshDriveToken();
          }
        }

        if (!isTokenValid()) { setDriveState('unauthed'); return; }

        const files = await listAllBackupFiles();
        setDriveFiles(files);
        setDriveState('authed');
      } catch {
        setDriveState('error');
      }
    })();
  }, [open, tab, driveLoadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dropbox 탭 진입 시 파일 목록 로드
  useEffect(() => {
    if (!open || tab !== TAB_DROPBOX) return;
    (async () => {
      setDropboxState('loading');
      setImportError(null);
      try {
        if (!isDropboxTokenValid()) { setDropboxState('unauthed'); return; }
        const files = await listDropboxBackupFiles();
        setDropboxFiles(files);
        setDropboxState('authed');
      } catch {
        setDropboxState('error');
      }
    })();
  }, [open, tab]);

  // Drive 파일 열기
  const handleDriveOpen = async () => {
    if (!driveSelected || driveBusy) return;
    setDriveBusy(true); setImportError(null);
    try {
      const raw = await loadDriveBackupData(driveSelected);
      let imported;
      try { imported = deserializeProject(raw); }
      catch (err) {
        setImportError(err?.name === 'ZodError' ? '올바른 .djs 파일이 아닙니다.' : '파일을 읽을 수 없습니다.');
        setDriveBusy(false); return;
      }
      onFileImport?.(imported, 'replace');
      onClose();
    } catch (err) {
      setImportError('Drive 파일 열기 실패: ' + (err?.message || err));
    } finally {
      setDriveBusy(false);
    }
  };

  // Dropbox 파일 열기
  const handleDropboxOpen = async () => {
    if (!dropboxSelected || dropboxBusy) return;
    setDropboxBusy(true); setImportError(null);
    try {
      const raw = await loadDropboxBackupData(dropboxSelected);
      let imported;
      try { imported = deserializeProject(raw); }
      catch (err) {
        setImportError(err?.name === 'ZodError' ? '올바른 .djs 파일이 아닙니다.' : '파일을 읽을 수 없습니다.');
        setDropboxBusy(false); return;
      }
      onFileImport?.(imported, 'replace');
      onClose();
    } catch (err) {
      setImportError('Dropbox 파일 열기 실패: ' + (err?.message || err));
    } finally {
      setDropboxBusy(false);
    }
  };

  // 내 컴퓨터 — 폴더 선택
  const handlePickFolder = async () => {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      await setLocalFolderHandle(dirHandle);
      localFsDirRef.current = dirHandle;
      setLocalFsState('loading');
      setLocalFsSelected(null);
      const files = await listDjsFiles(dirHandle);
      setLocalFsFiles(files);
      setLocalFsState('ready');
    } catch (e) {
      // 사용자가 취소하면 AbortError — 무시
      if (e?.name !== 'AbortError') setImportError('폴더를 열 수 없습니다.');
    }
  };

  // 내 컴퓨터 — 선택된 .djs 파일 열기
  const handleLocalFsOpen = async () => {
    if (!localFsSelected || localFsBusy) return;
    setLocalFsBusy(true); setImportError(null);
    try {
      const file = await localFsSelected.handle.getFile();
      const text = await file.text();
      let imported;
      try { imported = deserializeProject(JSON.parse(text)); }
      catch (err) {
        setImportError(err?.name === 'ZodError' ? '올바른 .djs 파일이 아닙니다.' : '파일을 읽을 수 없습니다.');
        setLocalFsBusy(false); return;
      }
      onFileImport?.(imported, 'replace');
      onClose();
    } catch (err) {
      setImportError('파일을 읽을 수 없습니다: ' + (err?.message || err));
    } finally {
      setLocalFsBusy(false);
    }
  };

  // 내 컴퓨터 — 폴더 연결 해제
  const handleClearFolder = async () => {
    await clearLocalFolderHandle();
    localFsDirRef.current = null;
    setLocalFsFiles([]); setLocalFsSelected(null);
    setLocalFsState('nohandle');
  };

  // 파일에서 열기
  const handleFileOpen = () => {
    setImportError(null);
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.djs,.json';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        let imported;
        try { imported = deserializeProject(JSON.parse(ev.target.result)); }
        catch (err) {
          setImportError(err?.name === 'ZodError' ? '올바른 .djs 파일이 아닙니다.' : '파일을 읽을 수 없습니다.');
          return;
        }
        onFileImport?.(imported, 'replace'); onClose();
      };
      reader.onerror = () => setImportError('파일을 읽을 수 없습니다.');
      reader.readAsText(file);
    };
    input.click();
  };

  const filteredLocal = [...projects].reverse()
    .filter(p => !query || (p.title || '').toLowerCase().includes(query.toLowerCase()));
  const filteredDrive = driveFiles
    .filter(f => !query || (f.name || '').toLowerCase().includes(query.toLowerCase()) || (f.projectFolder || '').toLowerCase().includes(query.toLowerCase()));
  const filteredDropbox = dropboxFiles
    .filter(f => !query || (f.name || '').toLowerCase().includes(query.toLowerCase()));

  const TAB_LABELS = { [TAB_DRIVE]: 'Google Drive', [TAB_DROPBOX]: 'Dropbox', [TAB_LOCAL]: '내 컴퓨터', [TAB_FILE]: '파일에서 열기' };

  const footer = tab === TAB_FILE ? (
    <><ModalBtn variant="secondary" onClick={onClose}>취소</ModalBtn><ModalBtn variant="primary" onClick={handleFileOpen}>파일 선택…</ModalBtn></>
  ) : tab === TAB_DRIVE ? (
    <><ModalBtn variant="secondary" onClick={onClose}>취소</ModalBtn><ModalBtn variant="primary" onClick={handleDriveOpen} disabled={!driveSelected || driveBusy}>{driveBusy ? '불러오는 중…' : '열기'}</ModalBtn></>
  ) : tab === TAB_DROPBOX ? (
    <><ModalBtn variant="secondary" onClick={onClose}>취소</ModalBtn><ModalBtn variant="primary" onClick={handleDropboxOpen} disabled={!dropboxSelected || dropboxBusy}>{dropboxBusy ? '불러오는 중…' : '열기'}</ModalBtn></>
  ) : (
    // TAB_LOCAL: localFsSelected 우선, 없으면 IndexedDB selected
    <><ModalBtn variant="secondary" onClick={onClose}>취소</ModalBtn>
    <ModalBtn variant="primary"
      onClick={() => { localFsSelected ? handleLocalFsOpen() : (onSelect?.(selected), onClose()); }}
      disabled={(localFsSelected === null && selected === null) || localFsBusy}
    >{localFsBusy ? '불러오는 중…' : '열기'}</ModalBtn></>
  );

  // 탭 목록 결정 전 로딩
  if (!tabs) return (
    <Modal open={open} onClose={onClose} title="열기" size="md" description="대본을 선택해 여세요." footer={<ModalBtn variant="secondary" onClick={onClose}>취소</ModalBtn>}>
      <Empty>불러오는 중…</Empty>
    </Modal>
  );

  return (
    <Modal open={open} onClose={onClose} title="열기" size="md" description="대본을 선택해 여세요." footer={footer}>
      {/* 탭 */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 14, borderBottom: '1px solid var(--c-border)' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => { setTab(t); setSelected(null); setDriveSelected(null); setDropboxSelected(null); setLocalFsSelected(null); setImportError(null); }}
            style={{
              padding: '6px 14px', fontSize: 13,
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--c-accent)' : 'var(--c-text4)',
              background: 'transparent', border: 'none',
              borderBottom: tab === t ? '2px solid var(--c-accent)' : '2px solid transparent',
              marginBottom: -1, cursor: 'pointer', borderRadius: 0, transition: 'color 0.15s',
            }}
          >{TAB_LABELS[t]}</button>
        ))}
      </div>

      {/* 검색 (파일 탭 제외) */}
      {tab !== TAB_FILE && (
        <div style={{ marginBottom: 10 }}>
          <input placeholder="대본 검색…" value={query} onChange={e => setQuery(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--c-border3)', background: 'var(--c-input)', color: 'var(--c-text)', fontSize: 13, outline: 'none' }} />
        </div>
      )}

      {/* Drive 탭 */}
      {tab === TAB_DRIVE && (
        driveState === 'loading' ? <Empty>Drive에서 불러오는 중…</Empty>
        : driveState === 'unauthed' ? (
          <CloudUnauthed
            message="Google Drive 연결이 끊겼어요."
            sub="다시 연결하면 Drive에 저장된 파일을 여기서 바로 열 수 있어요."
            onConnect={async () => {
              const newToken = await refreshDriveToken();
              if (newToken) {
                // 토큰 갱신 성공 → 파일 목록 재로드
                setDriveLoadKey(k => k + 1);
              } else {
                // 갱신 불가 → 전체 Google OAuth 재인증
                await signInWithGoogle();
              }
            }}
            connectLabel="다시 연결"
          />
        ) : driveState === 'error' ? <Empty style={{ color: 'var(--c-danger, #e53e3e)' }}>Drive 파일을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</Empty>
        : <>
            <DriveFileList items={filteredDrive} selected={driveSelected} onSelect={setDriveSelected} onOpen={handleDriveOpen} />
            {importError && <p style={{ fontSize: 12, color: 'var(--c-danger, #e53e3e)', textAlign: 'center', margin: '8px 0 0' }}>{importError}</p>}
          </>
      )}

      {/* Dropbox 탭 */}
      {tab === TAB_DROPBOX && (
        dropboxState === 'loading' ? <Empty>Dropbox에서 불러오는 중…</Empty>
        : dropboxState === 'unauthed' ? (
          <CloudUnauthed
            message="Dropbox 연결이 끊겼어요."
            sub="다시 연결하면 Dropbox에 저장된 파일을 여기서 바로 열 수 있어요."
            onConnect={connectDropbox}
            connectLabel="Dropbox 다시 연결"
          />
        ) : dropboxState === 'error' ? <Empty style={{ color: 'var(--c-danger, #e53e3e)' }}>Dropbox 파일을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</Empty>
        : <>
            <DriveFileList items={filteredDropbox} selected={dropboxSelected} onSelect={setDropboxSelected} onOpen={handleDropboxOpen} />
            {importError && <p style={{ fontSize: 12, color: 'var(--c-danger, #e53e3e)', textAlign: 'center', margin: '8px 0 0' }}>{importError}</p>}
          </>
      )}

      {/* 내 대본 탭 */}
      {tab === TAB_LOCAL && (
        <>
          {/* ── 내 컴퓨터 파일 섹션 (상단·메인) ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text4)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              내 컴퓨터 파일
            </div>
            {localFsState === 'ready' && (
              <button
                onClick={handleClearFolder}
                style={{ fontSize: 11, color: 'var(--c-text5)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}
                title="폴더 연결 해제"
              >연결 해제</button>
            )}
          </div>

          {localFsState === 'unsupported' && (
            <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border2)', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: 'var(--c-text4)', lineHeight: 1.7, marginBottom: 4 }}>
              이 환경에서는 폴더 직접 접근이 지원되지 않습니다.<br />
              아래 '파일에서 열기' 탭에서 .djs 파일을 직접 가져오세요.
            </div>
          )}

          {localFsState === 'loading' && (
            <Empty>폴더를 불러오는 중…</Empty>
          )}

          {localFsState === 'nohandle' && (
            <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border2)', borderRadius: 6, padding: '14px 16px', marginBottom: 4, textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--c-text4)', lineHeight: 1.7, marginBottom: 12 }}>
                폴더를 지정하면 .djs 파일 목록을 바로 볼 수 있어요.<br />
                한 번 설정하면 다음에도 자동으로 열립니다.
              </p>
              <button
                onClick={handlePickFolder}
                style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid var(--c-accent)', background: 'var(--c-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >폴더 선택…</button>
            </div>
          )}

          {localFsState === 'noperm' && (
            <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border2)', borderRadius: 6, padding: '14px 16px', marginBottom: 4, textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--c-text4)', marginBottom: 12 }}>
                폴더 접근 권한이 필요합니다. 다시 시도하거나 폴더를 새로 선택하세요.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button
                  onClick={async () => {
                    const handle = await getLocalFolderHandle();
                    if (!handle) { setLocalFsState('nohandle'); return; }
                    const ok = await verifyReadPermission(handle);
                    if (!ok) return;
                    localFsDirRef.current = handle;
                    setLocalFsState('loading');
                    const files = await listDjsFiles(handle);
                    setLocalFsFiles(files);
                    setLocalFsState('ready');
                  }}
                  style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--c-border3)', background: 'transparent', color: 'var(--c-text3)', fontSize: 13, cursor: 'pointer' }}
                >권한 허용</button>
                <button
                  onClick={handlePickFolder}
                  style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--c-accent)', background: 'var(--c-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >폴더 다시 선택</button>
              </div>
            </div>
          )}

          {localFsState === 'ready' && (
            <>
              <FolderFileList
                items={localFsFiles.filter(f => !query || f.name.toLowerCase().includes(query.toLowerCase()))}
                selected={localFsSelected}
                onSelect={(f) => { setLocalFsSelected(f); setSelected(null); }}
                onOpen={handleLocalFsOpen}
              />
              <div style={{ marginTop: 6, textAlign: 'right' }}>
                <button
                  onClick={handlePickFolder}
                  style={{ fontSize: 11, color: 'var(--c-text5)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}
                >폴더 변경…</button>
              </div>
            </>
          )}

          {importError && localFsSelected && (
            <p style={{ fontSize: 12, color: 'var(--c-danger, #e53e3e)', textAlign: 'center', margin: '6px 0 0' }}>{importError}</p>
          )}

          {/* ── 백업 데이터 섹션 (하단) ── */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text4)', letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 20, marginBottom: 4 }}>
            백업 데이터
          </div>
          <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border2)', borderRadius: 6, padding: '7px 12px', marginBottom: 8, fontSize: 11.5, color: 'var(--c-text4)', lineHeight: 1.65 }}>
            브라우저에만 저장된 이전 데이터입니다. 파일로 내보내기를 권장합니다.
          </div>
          <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, padding: '8px 12px', marginBottom: 8, fontSize: 11.5, color: '#7a6200', lineHeight: 1.65 }}>
            <span style={{ fontWeight: 600 }}>⚠ 이 대본들은 이 브라우저에만 저장되어 있어요.</span><br />
            브라우저 캐시 삭제 시 사라질 수 있습니다. 파일로 저장해주세요.
          </div>
          <ProjectList
            items={filteredLocal}
            selected={selected}
            onSelect={(id) => { setSelected(id); setLocalFsSelected(null); }}
            onOpen={() => { onSelect?.(selected); onClose(); }}
            onDriveSave={onSaveToDriveLocal}
            emptyMsg="저장된 대본이 없습니다."
          />
        </>
      )}

      {/* 파일에서 열기 탭 */}
      {tab === TAB_FILE && (
        <>
          <Empty style={{ padding: '24px 0 8px' }}>.djs 형식의 백업 파일을 선택하세요.</Empty>
          {importError && <p style={{ fontSize: 12, color: 'var(--c-danger, #e53e3e)', textAlign: 'center', margin: '8px 0 0' }}>{importError}</p>}
        </>
      )}

      {/* 카카오 애드핏 */}
      {isMobile && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--c-border3)' }}>
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

function CloudUnauthed({ message, sub, onConnect, connectLabel }) {
  return (
    <div style={{ padding: '20px 0', textAlign: 'center' }}>
      <p style={{ fontSize: 13, color: 'var(--c-text4)', marginBottom: 6 }}>{message}</p>
      <p style={{ fontSize: 12, color: 'var(--c-text5)', marginBottom: 16, lineHeight: 1.6 }}>{sub}</p>
      <button onClick={onConnect} style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid var(--c-accent)', background: 'var(--c-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        {connectLabel}
      </button>
    </div>
  );
}

function DriveFileList({ items, selected, onSelect, onOpen }) {
  if (items.length === 0) return <Empty>저장된 파일이 없어요.</Empty>;
  const fmtDate = (ts) => ts ? new Date(ts).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 280, overflowY: 'auto' }}>
      {items.map(f => {
        const isActive = selected === f.id;
        return (
          <button key={f.id} onClick={() => onSelect(f.id)} onDoubleClick={onOpen}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: isActive ? 'var(--c-active)' : 'transparent', outline: isActive ? '1px solid var(--c-accent)' : '1px solid transparent', transition: 'background 0.1s' }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-hover)'; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)', marginBottom: 2 }}>{f.projectFolder || f.name}</div>
            <div style={{ fontSize: 11, color: 'var(--c-text5)' }}>{f.name}{f.savedAt ? ` · ${fmtDate(f.savedAt)}` : ''}</div>
          </button>
        );
      })}
    </div>
  );
}

function FolderFileList({ items, selected, onSelect, onOpen }) {
  if (items.length === 0) return <Empty>폴더에 .djs 파일이 없어요.</Empty>;
  const fmtDate = (ts) => ts ? new Date(ts).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto' }}>
      {items.map(f => {
        const isActive = selected?.name === f.name;
        return (
          <button key={f.name} onClick={() => onSelect(f)} onDoubleClick={onOpen}
            style={{ display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: isActive ? 'var(--c-active)' : 'transparent', outline: isActive ? '1px solid var(--c-accent)' : '1px solid transparent', transition: 'background 0.1s' }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-hover)'; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name.replace(/\.djs$/i, '')}</div>
              <div style={{ fontSize: 11, color: 'var(--c-text5)', marginTop: 1 }}>{fmtDate(f.lastModified)}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ProjectList({ items, selected, onSelect, onOpen, onDriveSave, emptyMsg }) {
  if (items.length === 0) return <Empty>{emptyMsg}</Empty>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 260, overflowY: 'auto' }}>
      {items.map(p => {
        const isActive = selected === p.id;
        return (
          <div key={p.id} onClick={() => onSelect(p.id)} onDoubleClick={onOpen}
            role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') { onSelect(p.id); onOpen(); } }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6, cursor: 'pointer', background: isActive ? 'var(--c-active)' : 'transparent', outline: isActive ? '1px solid var(--c-accent)' : '1px solid transparent', transition: 'background 0.1s', userSelect: 'none', boxSizing: 'border-box' }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-hover)'; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || '(제목 없음)'}</div>
              <div style={{ fontSize: 11, color: 'var(--c-text5)' }}>
                {getTypeLabel(p.projectType)}{isMultiEpisode(p.projectType) && p.totalEpisodes ? ` · ${p.totalEpisodes}회` : ''}
                {p.updatedAt ? ` · ${new Date(p.updatedAt).toLocaleDateString('ko-KR')}` : ''}
              </div>
            </div>
            {onDriveSave && (
              <button onClick={(e) => { e.stopPropagation(); onDriveSave(p); }}
                title="Drive에 저장"
                style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--c-border3)', background: 'var(--c-card)', color: 'var(--c-text4)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.5 }}
              >☁ Drive</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
