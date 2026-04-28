import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import DeleteConfirmModal from './Modals/DeleteConfirmModal';

// ─── TrashPage — 휴지통 (Phase X.2) ─────────────────────────────────────────
// 30일 보관 후 자동 만료. 복원/영구 삭제 액션. orphan 데이터는 자동 청소 X.

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const TYPE_LABEL = { series: '시리즈', single: '단막' };

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function expireBadge(deletedAt) {
  if (!deletedAt) return { text: '만료일 미상', color: 'var(--c-text5)' };
  const ms = (deletedAt + RETENTION_MS) - Date.now();
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days < 1) return { text: '오늘 삭제', color: '#dc2626' };
  if (days < 7) return { text: `${days}일 후 삭제`, color: '#ea580c' };
  return { text: `${days}일 후 삭제`, color: 'var(--c-text5)' };
}

export default function TrashPage() {
  const { state, dispatch } = useApp();
  const [purgeTarget, setPurgeTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // 페이지 진입 시 만료 정리 1회 (부팅 시 1회와 별개 — 진입 시점에도 보장)
  useEffect(() => {
    dispatch({ type: 'PURGE_EXPIRED_TRASH' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => {
    const list = state.trash?.projects || [];
    return [...list].sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  }, [state.trash]);

  const handleRestore = (p) => {
    dispatch({ type: 'RESTORE_PROJECT', id: p.id });
    showToast(`${p.title || '제목 없음'} 복원되었습니다.`);
  };

  const confirmPurge = () => {
    if (!purgeTarget) return;
    const t = purgeTarget;
    dispatch({ type: 'PURGE_PROJECT', id: t.id });
    setPurgeTarget(null);
    showToast(`${t.title || '제목 없음'} 영구 삭제되었습니다.`);
  };

  const goBack = () => dispatch({ type: 'SET_ACTIVE_DOC', payload: 'projects' });

  const iconBtnStyle = {
    height: 28, padding: '0 10px', borderRadius: 4,
    border: '1px solid var(--c-border3)', background: 'transparent',
    color: 'var(--c-text4)', fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
    flexShrink: 0,
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--c-bg)', position: 'relative' }}>
      {/* 영구 삭제 확인 모달 */}
      <DeleteConfirmModal
        open={!!purgeTarget}
        title={purgeTarget?.title || '제목 없음'}
        description="이 작업은 되돌릴 수 없습니다."
        onConfirm={confirmPurge}
        onCancel={() => setPurgeTarget(null)}
      />

      {/* Header */}
      <div className="shrink-0" style={{ padding: '16px 20px', borderBottom: '1px solid var(--c-border2)' }}>
        <button
          onClick={goBack}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--c-text5)', fontSize: 12, padding: 0,
            marginBottom: 8,
          }}
        >← 작품 관리로 돌아가기</button>
        <div className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>휴지통</div>
        <div className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--c-text5)' }}>
          삭제된 작품은 30일간 보관 후 자동 삭제됩니다. 복원하면 회차·씬·인물 등 모든 데이터가 함께 돌아옵니다.
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '12px 16px' }}>
        {items.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-sm" style={{ color: 'var(--c-text5)' }}>휴지통이 비어있습니다.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map(p => {
              const badge = expireBadge(p.deletedAt);
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-4"
                  style={{
                    padding: '6px 10px',
                    background: 'var(--c-card)',
                    border: '1px solid var(--c-border2)',
                    borderRadius: 6,
                  }}
                >
                  {/* 제목 + 메타 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>
                      {p.title || '제목 없음'}
                    </div>
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--c-text5)' }}>
                      {p.genre || '장르 없음'}
                      {p.projectType ? ` · ${TYPE_LABEL[p.projectType] || p.projectType}` : ''}
                    </div>
                  </div>

                  {/* 시각 + 만료 뱃지 */}
                  <div className="text-[11px] shrink-0 md:text-right" style={{ color: 'var(--c-text5)', lineHeight: 1.5 }}>
                    <div>삭제: {formatDateTime(p.deletedAt)}</div>
                    <div style={{ color: badge.color, fontWeight: 500 }}>{badge.text}</div>
                  </div>

                  {/* 액션 */}
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => handleRestore(p)} style={iconBtnStyle} title="복원">
                      <span>↩</span><span>복원</span>
                    </button>
                    <button
                      onClick={() => setPurgeTarget(p)}
                      style={{ ...iconBtnStyle, color: '#dc2626', borderColor: '#dc2626' }}
                      title="영구 삭제"
                    >
                      <span>🗑</span><span>영구 삭제</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 토스트 */}
      {toast && (
        <div style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--c-accent)', color: '#fff',
          padding: '8px 18px', borderRadius: 8, fontSize: 13,
          pointerEvents: 'none', zIndex: 100,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>{toast}</div>
      )}
    </div>
  );
}
