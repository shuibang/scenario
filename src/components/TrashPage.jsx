import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import DeleteConfirmModal from './Modals/DeleteConfirmModal';

// ─── TrashPage — 휴지통 ───────────────────────────────────────────────────────
// 30일 보관 후 자동 만료. 복원/영구 삭제 액션.
// ⚠️ 향후 업데이트에서 기능 종료 예정 — 전체 내보내기로 데이터 보호 필요.

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const TYPE_LABEL = { series: '시리즈', single: '단막' };
const DJS_README = '이 파일은 대본작업실(daejak.kr) 전용 파일입니다. 일반 텍스트 편집기로 열지 마세요. daejak.kr에 접속한 후 파일 열기 메뉴에서 불러올 수 있습니다.';

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

function serializeTrashProject(trash, projectId) {
  const project = (trash?.projects || []).find(p => p.id === projectId);
  if (!project) return null;
  const filter = (arr) => (arr || []).filter(it => it.projectId === projectId);
  return {
    format: 'djs',
    version: 1,
    exportedAt: new Date().toISOString(),
    app: { name: '대본 작업실', version: import.meta.env?.VITE_BUILD_VERSION || 'dev' },
    project,
    episodes:       filter(trash.episodes),
    characters:     filter(trash.characters),
    scenes:         filter(trash.scenes),
    scriptBlocks:   filter(trash.scriptBlocks),
    coverDocs:      filter(trash.coverDocs),
    synopsisDocs:   filter(trash.synopsisDocs),
    resources:      filter(trash.resources),
    workTimeLogs:   filter(trash.workTimeLogs),
    checklistItems: filter(trash.checklistItems),
    trash: {},
  };
}

function downloadDjs(data, filename) {
  const blob = new Blob([JSON.stringify({ _readme: DJS_README, ...data }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TrashPage() {
  const { state, dispatch } = useApp();
  const [purgeTarget, setPurgeTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const [exporting, setExporting] = useState(false);

  const showToast = (msg, duration = 2500) => {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  };

  // 페이지 진입 시 만료 정리 1회
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

  const handleExportAll = async () => {
    if (items.length === 0 || exporting) return;
    setExporting(true);
    try {
      for (let i = 0; i < items.length; i++) {
        const p = items[i];
        const data = serializeTrashProject(state.trash, p.id);
        if (!data) continue;
        const safeName = (p.title || '대본').replace(/[/\\:*?"<>|]/g, '_').trim() || '대본';
        downloadDjs(data, `${safeName}_휴지통복원.djs`);
        if (i < items.length - 1) await new Promise(r => setTimeout(r, 250));
      }
      showToast('휴지통 대본을 .djs 파일로 내보냈어요.\n파일을 보관한 후 휴지통을 비워주세요.', 4500);
    } finally {
      setExporting(false);
    }
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

      {/* 종료 예정 안내 배너 */}
      <div style={{
        background: 'rgba(234,179,8,0.08)',
        borderBottom: '1px solid rgba(234,179,8,0.3)',
        padding: '10px 20px',
        display: 'flex', alignItems: 'flex-start', gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1.6 }}>⚠️</span>
        <div style={{ fontSize: 12, color: 'var(--c-text3)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--c-text2)' }}>대본 저장 방식이 개선되었습니다.</strong>
          {' '}휴지통의 대본은 아래 <strong style={{ color: 'var(--c-text)' }}>전체 내보내기</strong>로 저장해두세요.
          {' '}향후 업데이트에서 휴지통 기능이 종료될 예정입니다.
        </div>
      </div>

      {/* Header */}
      <div className="shrink-0" style={{ padding: '16px 20px', borderBottom: '1px solid var(--c-border2)' }}>
        <button
          onClick={goBack}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--c-text5)', fontSize: 12, padding: 0,
            marginBottom: 8,
          }}
        >← 대본 관리로 돌아가기</button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>휴지통</div>
          {items.length > 0 && (
            <button
              onClick={handleExportAll}
              disabled={exporting}
              style={{
                height: 30, padding: '0 14px', borderRadius: 6,
                border: '1px solid var(--c-accent)',
                background: exporting ? 'var(--c-card)' : 'var(--c-accent)',
                color: exporting ? 'var(--c-text4)' : '#fff',
                fontSize: 12, fontWeight: 600, cursor: exporting ? 'default' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
                flexShrink: 0, transition: 'opacity 0.15s',
                opacity: exporting ? 0.6 : 1,
              }}
            >
              <span>💾</span>
              <span>{exporting ? '내보내는 중…' : `전체 내보내기 (${items.length}개)`}</span>
            </button>
          )}
        </div>

        <div className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--c-text5)' }}>
          삭제된 대본은 30일간 보관 후 자동 삭제됩니다. 복원하면 회차·씬·인물 등 모든 데이터가 함께 돌아옵니다.
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
          padding: '10px 20px', borderRadius: 8, fontSize: 13,
          pointerEvents: 'none', zIndex: 100,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          whiteSpace: 'pre-line', textAlign: 'center', lineHeight: 1.6,
          minWidth: 200,
        }}>{toast}</div>
      )}
    </div>
  );
}
