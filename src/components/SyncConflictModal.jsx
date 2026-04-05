/**
 * SyncConflictModal — Drive 로그인 시 로컬 vs Drive 데이터 충돌 해결 UI
 *
 * 표시 조건:
 *   - Drive에 데이터가 있고
 *   - 로컬에도 의미 있는 데이터가 있고 (프로젝트 1개 이상)
 *   - 두 savedAt 타임스탬프가 다를 때
 *
 * 사용자가 선택:
 *   - "현재 기기 유지" → 로컬 데이터를 Drive에 업로드 (Drive 덮어씀)
 *   - "다른 기기 데이터 불러오기" → Drive 데이터를 로컬에 로드
 */
import React from 'react';

function fmtTs(isoStr) {
  if (!isoStr) return '알 수 없음';
  const d = new Date(isoStr);
  if (isNaN(d)) return '알 수 없음';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DataCard({ title, savedAt, projectCount, highlight, onClick, label }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1,
        border: `2px solid ${highlight ? 'var(--c-accent)' : 'var(--c-border)'}`,
        borderRadius: 10,
        padding: '16px 18px',
        background: highlight ? 'var(--c-active)' : 'var(--c-card)',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--c-text3)', marginBottom: 4 }}>
        마지막 저장
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: highlight ? 'var(--c-accent)' : 'var(--c-text)', marginBottom: 12 }}>
        {fmtTs(savedAt)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-text5)' }}>
        작품 {projectCount}개
      </div>
      <button
        onClick={e => { e.stopPropagation(); onClick(); }}
        style={{
          marginTop: 14,
          width: '100%',
          padding: '8px 0',
          borderRadius: 7,
          border: highlight ? 'none' : '1px solid var(--c-border3)',
          background: highlight ? 'var(--c-accent)' : 'transparent',
          color: highlight ? '#fff' : 'var(--c-text3)',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
    </div>
  );
}

export default function SyncConflictModal({ localSavedAt, driveData, onKeepLocal, onLoadDrive, onDismiss }) {
  const driveProjectCount = driveData?.projects?.length ?? 0;
  const localProjectCount = (() => {
    try {
      const raw = localStorage.getItem('drama_projects');
      return raw ? JSON.parse(raw).length : 0;
    } catch { return 0; }
  })();

  const localIsNewer = new Date(localSavedAt || 0) >= new Date(driveData?.savedAt || 0);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: 'var(--c-panel)',
          border: '1px solid var(--c-border)',
          borderRadius: 14,
          padding: '28px 24px',
          maxWidth: 480,
          width: '100%',
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)', marginBottom: 6 }}>
          기기 간 데이터가 다릅니다
        </div>
        <div style={{ fontSize: 13, color: 'var(--c-text5)', marginBottom: 22, lineHeight: 1.6 }}>
          로그인하면서 Drive에서 다른 기기의 저장 데이터를 감지했습니다.<br/>
          어느 데이터를 사용할지 선택해 주세요. 선택하지 않은 쪽은 덮어씌워집니다.
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <DataCard
            title="현재 기기"
            savedAt={localSavedAt}
            projectCount={localProjectCount}
            highlight={localIsNewer}
            label={localIsNewer ? '더 최신 — 이 기기 유지' : '이 기기 유지'}
            onClick={onKeepLocal}
          />
          <DataCard
            title="다른 기기 (Drive)"
            savedAt={driveData?.savedAt}
            projectCount={driveProjectCount}
            highlight={!localIsNewer}
            label={!localIsNewer ? '더 최신 — 불러오기' : 'Drive 데이터 불러오기'}
            onClick={onLoadDrive}
          />
        </div>

        <div style={{ fontSize: 11, color: 'var(--c-text6)', textAlign: 'center', lineHeight: 1.6 }}>
          선택 후 드라이브 자동 동기화가 시작됩니다.
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              display: 'block', margin: '12px auto 0', background: 'none',
              border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--c-text6)',
            }}
          >
            나중에 결정
          </button>
        )}
      </div>
    </div>
  );
}
