/**
 * SnapshotPanel — 스냅샷 목록 조회 및 복원 UI
 *
 * 사용:
 *   <SnapshotPanel onClose={() => setOpen(false)} />
 *
 * 복원 흐름:
 *   1) 현재 상태를 "복원 전 자동저장" 스냅샷으로 저장
 *   2) 선택한 스냅샷 데이터 로드
 *   3) loadFromDriveData()로 앱 상태 교체
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '../store/AppContext';
import {
  loadSnapshots,
  saveSnapshot,
  loadSnapshotData,
  deleteSnapshot,
  isTokenValid,
} from '../store/googleDrive';

// ── 날짜 포맷 ────────────────────────────────────────────────────────────────
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

// ── 라벨 뱃지 ────────────────────────────────────────────────────────────────
function LabelBadge({ label }) {
  const isAuto = label?.includes('자동저장');
  return (
    <span style={{
      fontSize: 10, padding: '2px 6px', borderRadius: 4,
      background: isAuto ? 'rgba(246,173,85,0.15)' : 'rgba(154,230,180,0.15)',
      color: isAuto ? '#f6ad55' : '#68d391',
    }}>
      {label}
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
  const { state, loadFromDriveData } = useApp();
  const [snapshots, setSnapshots]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [confirm, setConfirm]       = useState(null);  // snap entry
  const [restoring, setRestoring]   = useState(false);
  const [deleting, setDeleting]     = useState(null);  // snap id
  const [toast, setToast]           = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await loadSnapshots();
      setSnapshots(list);
    } catch {
      setError('스냅샷 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleRestore = async () => {
    if (!confirm) return;
    setRestoring(true);
    try {
      // 1) 현재 상태 백업
      await saveSnapshot({
        projects:       state.projects,
        episodes:       state.episodes,
        characters:     state.characters,
        scenes:         state.scenes,
        scriptBlocks:   state.scriptBlocks,
        coverDocs:      state.coverDocs,
        synopsisDocs:   state.synopsisDocs,
        resources:      state.resources,
        workTimeLogs:   state.workTimeLogs,
        checklistItems: state.checklistItems,
        stylePreset:    state.stylePreset,
      }, '복원 전 자동저장');

      // 2) 선택 스냅샷 로드
      const data = await loadSnapshotData(confirm.id);
      if (!data) throw new Error('스냅샷 데이터를 찾을 수 없습니다.');

      // 3) 앱 상태 교체
      loadFromDriveData(data);
      showToast('복원 완료');
      setConfirm(null);
      onClose();
    } catch (e) {
      setError(e.message || '복원 중 오류가 발생했습니다.');
      setConfirm(null);
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = async (snap) => {
    setDeleting(snap.id);
    try {
      await deleteSnapshot(snap.id);
      setSnapshots(prev => prev.filter(s => s.id !== snap.id));
      showToast('삭제 완료');
    } catch {
      setError('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(null);
    }
  };

  const notLoggedIn = !isTokenValid();

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>백업 / 복원</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--c-text5)', lineHeight: 1 }}
          >×</button>
        </div>

        {/* 안내 */}
        <div style={{ fontSize: 12, color: 'var(--c-text5)', marginBottom: 16, lineHeight: 1.6 }}>
          저장 버튼을 누를 때마다 스냅샷이 생성됩니다. 최대 {10}개 보관.
          {notLoggedIn && <span style={{ color: '#f6ad55' }}> (Drive 로그인 필요)</span>}
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
                    <LabelBadge label={snap.label} />
                    <DeviceBadge label={snap.device} />
                    {i === 0 && <span style={{ fontSize: 10, color: 'var(--c-accent)' }}>최신</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>{fmtDate(snap.savedAt)}</div>
                  <div style={{ fontSize: 11, color: 'var(--c-text6)' }}>작품 {snap.projectCount}개</div>
                </div>

                {/* 액션 */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => setConfirm(snap)}
                    disabled={notLoggedIn || !!deleting}
                    style={{
                      padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      background: 'var(--c-accent)', color: '#fff', border: 'none',
                      cursor: notLoggedIn ? 'not-allowed' : 'pointer',
                      opacity: notLoggedIn ? 0.5 : 1,
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
            pointerEvents: 'none',
          }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
