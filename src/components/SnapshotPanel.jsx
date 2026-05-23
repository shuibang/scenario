/**
 * SnapshotPanel — 스냅샷 목록 조회 및 복원 UI
 *
 * 사용:
 *   <SnapshotPanel onClose={() => setOpen(false)} />
 *
 * 복원 흐름:
 *   1) 현재 상태를 "복원 전 자동저장" 스냅샷으로 저장
 *   2) 선택한 스냅샷 데이터 로드
 *   3) REPLACE_PROJECT_DATA dispatch로 대본 교체
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '../store/AppContext';
import {
  loadSnapshots,
  saveSnapshot,
  loadSnapshotData,
  deleteSnapshot,
  listDriveBackups,
  loadDriveBackupData,
  deleteDriveBackup,
  sanitizeFolderName,
} from '../store/googleDrive';
import { serializeProject } from '../utils/projectSerializer';
import { formatSnapshotMetaLine } from '../utils/snapshotMeta';
import { reportError } from '../utils/errorTracker';

// ── 날짜 포맷 ─────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '알 수 없음';
  const d = new Date(iso);
  if (isNaN(d)) return '알 수 없음';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


// ── 기기 뱃지 색 ─────────────────────────────────────────────────────────────
function DeviceBadge({ label }) {
  const isMobile = label?.startsWith('모바일') || label?.startsWith('태블릿');
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
      background: isMobile ? 'rgba(99,179,237,0.15)' : 'rgba(154,230,180,0.15)',
      color: isMobile ? '#63b3ed' : '#68d391',
      whiteSpace: 'nowrap',
    }}>
      {label ?? '알 수 없음'}
    </span>
  );
}

// ── 타입 뱃지 ────────────────────────────────────────────────────────────────
const TYPE_STYLE = {
  auto:          { bg: 'rgba(246,173,85,0.15)',  color: '#f6ad55', text: '자동저장' },
  manual:        { bg: 'rgba(154,230,180,0.15)', color: '#68d391', text: '수동저장' },
  backup:        { bg: 'rgba(183,148,246,0.15)', color: '#b794f4', text: '백업'     },
  restore:       { bg: 'rgba(160,174,192,0.15)', color: '#a0aec0', text: '복원 전'  },
  device_switch: { bg: 'rgba(99,179,237,0.15)',  color: '#63b3ed', text: '기기 전환' },
  drive_backup:  { bg: 'rgba(99,179,237,0.15)',  color: '#63b3ed', text: 'Drive 백업' },
};
function TypeBadge({ type, label }) {
  const s = TYPE_STYLE[type] ?? TYPE_STYLE.manual;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
      background: s.bg, color: s.color, whiteSpace: 'nowrap',
    }}>
      {s.text}{label && label !== s.text ? ` — ${label}` : ''}
    </span>
  );
}

// ── 출처 배지 ────────────────────────────────────────────────────────────────
function SourceBadge({ source }) {
  const isDrive = source === 'drive';
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
      background: isDrive ? 'rgba(99,179,237,0.15)' : 'rgba(160,174,192,0.12)',
      color:      isDrive ? '#63b3ed'               : '#a0aec0',
      whiteSpace: 'nowrap',
    }}>
      {isDrive ? 'Drive' : '브라우저'}
    </span>
  );
}

// ── 확인 다이얼로그 ──────────────────────────────────────────────────────────
function ConfirmDialog({ snap, onConfirm, onCancel, loading }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1, borderRadius: 14,
    }}>
      <div style={{
        background: 'var(--c-panel)', border: '1px solid var(--c-border)',
        borderRadius: 12, padding: '24px 22px', maxWidth: 320, width: '90%',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 8 }}>
          이 시점으로 복원할까요?
        </div>
        <div style={{ fontSize: 12, color: 'var(--c-text5)', lineHeight: 1.7, marginBottom: 18 }}>
          <b style={{ color: 'var(--c-text3)' }}>{fmtDate(snap.savedAt)}</b> ({snap.device})<br />
          현재 상태는 <b style={{ color: 'var(--c-accent)' }}>복원 전 자동저장</b>으로 보존됩니다.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 7,
              border: '1px solid var(--c-border3)', background: 'transparent',
              color: 'var(--c-text4)', fontSize: 13, cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 7,
              border: 'none', background: 'var(--c-accent)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? '복원 중…' : '복원'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
export default function SnapshotPanel({ onClose }) {
  const { state, dispatch } = useApp();
  const activeProject = state.projects?.find(p => p.id === state.activeProjectId) ?? null;
  const safeProjectName = activeProject ? sanitizeFolderName(activeProject.title) : null;
  const [snapshots, setSnapshots]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [confirm, setConfirm]         = useState(null);
  const [restoring, setRestoring]     = useState(false);
  const [deleting, setDeleting]       = useState(null);
  const [backing, setBacking]         = useState(false);
  const [toast, setToast]             = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const refresh = useCallback(async ({ silent = false, projectFolderName = safeProjectName } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [idbList, driveList] = await Promise.all([
        loadSnapshots(),
        listDriveBackups(projectFolderName),
      ]);
      const merged = [
        ...idbList.map(s => ({ ...s, source: 'idb' })),
        ...driveList,
      ].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      setSnapshots(merged);
    } catch {
      if (!silent) setError('스냅샷 목록을 불러오지 못했습니다.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [safeProjectName]);

  useEffect(() => { refresh(); }, [refresh]);

  const currentProjectPayload = () =>
    state.activeProjectId ? serializeProject(state, state.activeProjectId) : null;

  const handleRestore = async () => {
    if (!confirm) return;
    setRestoring(true);
    try {
      // 1) 현재 프로젝트 상태 사전 백업
      const pre = currentProjectPayload();
      if (pre) await saveSnapshot(pre, '복원 전 자동저장', 'restore');

      // 2) 선택 스냅샷 로드 (출처별 분기)
      const data = confirm.source === 'drive'
        ? await loadDriveBackupData(confirm.id)
        : await loadSnapshotData(confirm.id);
      if (!data) throw new Error('스냅샷 데이터를 찾을 수 없습니다.');

      // 3) 대본 단위 교체 (전체 워크스페이스 덮어쓰기 없음)
      dispatch({ type: 'REPLACE_PROJECT_DATA', payload: data });
      showToast('복원 완료');
      setConfirm(null);
      onClose();
    } catch (e) {
      reportError({ source: 'manual', message: e?.message || String(e), stack: e?.stack });
      setError('복원 중 문제가 발생했어요.');
      setConfirm(null);
    } finally {
      setRestoring(false);
    }
  };

  const handleBackup = async () => {
    const payload = currentProjectPayload();
    if (!payload) { showToast('대본을 먼저 선택해주세요'); return; }
    setBacking(true);
    setError(null);
    try {
      await saveSnapshot(payload, '백업', 'backup');
      await refresh({ silent: true });
      showToast('백업 완료');
    } catch {
      setError('백업 중 오류가 발생했습니다.');
    } finally {
      setBacking(false);
    }
  };

  const handleDelete = async (snap) => {
    setDeleting(snap.id);
    try {
      if (snap.source === 'drive') {
        await deleteDriveBackup(snap.id);
      } else {
        await deleteSnapshot(snap.id);
      }
      setSnapshots(prev => prev.filter(s => s.id !== snap.id));
      showToast('삭제 완료');
    } catch {
      setError('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--c-panel)', border: '1px solid var(--c-border)',
          borderRadius: 14, padding: '24px 20px',
          maxWidth: 520, width: '100%',
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        {confirm && (
          <ConfirmDialog
            snap={confirm}
            onConfirm={handleRestore}
            onCancel={() => setConfirm(null)}
            loading={restoring}
          />
        )}

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>백업 / 복원</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--c-text5)', lineHeight: 1 }}
          >×</button>
        </div>

        {/* 백업 버튼 */}
        <div style={{ marginBottom: 14 }}>
          <button
            onClick={handleBackup}
            disabled={backing}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 8,
              background: backing ? 'transparent' : 'rgba(183,148,246,0.2)',
              border: '1px solid rgba(183,148,246,0.4)',
              color: '#b794f4', fontSize: 13, fontWeight: 700,
              cursor: backing ? 'not-allowed' : 'pointer',
            }}
          >
            {backing ? '백업 중…' : '지금 백업하기'}
          </button>
        </div>

        {/* 안내 */}
        <div style={{ fontSize: 11, color: 'var(--c-text6)', marginBottom: 10, lineHeight: 1.7 }}>
          <b style={{ color: 'var(--c-text5)' }}>자동저장</b> 10분마다 &nbsp;|&nbsp;
          <b style={{ color: 'var(--c-text5)' }}>수동저장</b> 저장 버튼 시 &nbsp;|&nbsp;
          <b style={{ color: 'var(--c-text5)' }}>백업</b> 직접 생성 &nbsp;·&nbsp; 최대 30개 보관
        </div>

        {/* 브라우저 저장 경고 박스 */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          background: '#fff8e1', borderRadius: 7, padding: '9px 12px', marginBottom: 14,
          border: '1px solid #ffe082',
        }}>
          <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>⚠</span>
          <div style={{ fontSize: 11, color: '#795548', lineHeight: 1.6 }}>
            자동 백업은 <b>이 브라우저에만</b> 저장됩니다.<br />
            브라우저 캐시를 삭제하거나 다른 기기에서는 복원할 수 없어요.<br />
            중요한 대본은 Ctrl+S → Drive 저장으로 별도 보관하세요.
          </div>
        </div>

        {/* 오류 */}
        {error && (
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 12, padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 6 }}>
            {error}
          </div>
        )}

        {/* 목록 */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--c-text5)', fontSize: 13 }}>
              불러오는 중…
            </div>
          ) : snapshots.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--c-text6)', fontSize: 13 }}>
              스냅샷이 없습니다.<br />
              <span style={{ fontSize: 11 }}>저장 버튼을 누르면 스냅샷이 생성됩니다.</span>
            </div>
          ) : (
            snapshots.map((snap, i) => (
              <div
                key={snap.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8,
                  background: i === 0 ? 'var(--c-active)' : 'transparent',
                  border: '1px solid ' + (i === 0 ? 'var(--c-accent)' : 'var(--c-border)'),
                  marginBottom: 8,
                }}
              >
                {/* 정보 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                    {snap.source !== 'drive' && <TypeBadge type={snap.type} label={snap.label} />}
                    {snap.source !== 'drive' && snap.device && <DeviceBadge label={snap.device} />}
                    <SourceBadge source={snap.source} />
                    {i === 0 && <span style={{ fontSize: 10, color: 'var(--c-accent)' }}>최신</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>{fmtDate(snap.savedAt)}</div>
                  {snap.source === 'drive'
                    ? <div style={{ fontSize: 11, color: 'var(--c-text6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{snap.name}</div>
                    : <div style={{ fontSize: 11, color: 'var(--c-text6)' }}>{formatSnapshotMetaLine(snap)}</div>
                  }
                </div>

                {/* 액션 */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => setConfirm(snap)}
                    disabled={!!deleting}
                    style={{
                      padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      background: 'var(--c-accent)', color: '#fff', border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    복원
                  </button>
                  <button
                    onClick={() => handleDelete(snap)}
                    disabled={deleting === snap.id}
                    style={{
                      padding: '5px 8px', borderRadius: 6, fontSize: 12,
                      background: 'transparent', color: 'var(--c-text6)',
                      border: '1px solid var(--c-border3)',
                      cursor: deleting === snap.id ? 'not-allowed' : 'pointer',
                    }}
                    title="삭제"
                  >
                    {deleting === snap.id ? '…' : '×'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 토스트 */}
        {toast && (
          <div style={{
            position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--c-accent)', color: '#fff',
            padding: '6px 16px', borderRadius: 8, fontSize: 13,
            pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
