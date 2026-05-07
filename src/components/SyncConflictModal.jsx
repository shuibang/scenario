/**
 * SyncConflictModal — Drive 로그인 시 로컬 vs Drive 데이터 충돌 해결 UI
 *
 * 두 가지 모드:
 *   1) conflicts !== null (신 형식, Phase 2.2b) — 작품별 시간 라디오. onApply(decisions).
 *   2) conflicts === null (구 형식 fallback) — 두 카드. onKeepLocal / onLoadDrive.
 *
 * 결정 모델:
 *   decisions: { [projectId]: 'local' | 'drive' }
 *   - conflict + 'local' → 이 기기 데이터 유지(Drive에 덮어쓰기)
 *   - conflict + 'drive' → Drive 데이터로 교체
 *   - localOnly + 'local' → 유지 + Drive에 새로 push
 *   - localOnly + 'drive' → 이 기기에서 휴지통으로 + Drive 정리
 *   - driveOnly + 'local' → 무시(이 기기에서 안 가져옴 + Drive 파일/인덱스 정리)
 *   - driveOnly + 'drive' → 이 기기에 가져오기
 */
import React, { useMemo, useState } from 'react';

function fmtTs(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d)) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── 작품별 시간 라디오 행 (Phase 2.2b 본 작업) ─────────────────────────────────

function ConflictRow({ conflict, decision, onChange, busy }) {
  const { projectId, title, kind } = conflict;
  const localTs = conflict.local?.updatedAt;
  const driveTs = conflict.drive?.updatedAt || conflict.drive?.savedAt;
  const localFmt = fmtTs(localTs);
  const driveFmt = fmtTs(driveTs);
  const sameMoment = !!localTs && !!driveTs && new Date(localTs).getTime() === new Date(driveTs).getTime();

  // 더 최신 쪽 자동 표시 — 사용자가 가만히 있어도 합리적인 기본값
  let newerSide = null;
  if (localTs && driveTs) {
    newerSide = new Date(localTs) >= new Date(driveTs) ? 'local' : 'drive';
  }

  const kindBadge = kind === 'conflict'
    ? { label: '양쪽 다 변경', color: 'var(--c-accent2)' }
    : kind === 'localOnly'
      ? { label: '이 기기에만', color: 'var(--c-accent)' }
      : { label: 'Drive에만', color: 'var(--c-text5)' };

  // 행별 라벨 — kind에 따라 의미가 다름
  const localLabel = kind === 'driveOnly'
    ? '이 기기에 없음 (선택 시 가져오지 않음)'
    : (kind === 'localOnly' ? '이 기기 버전 유지' : '현재 이 기기 버전');
  const driveLabel = kind === 'localOnly'
    ? 'Drive에는 없음 (선택 시 이 기기에서 삭제)'
    : (kind === 'driveOnly' ? 'Drive 저장본 가져오기' : 'Drive에 저장된 버전');

  const Row = ({ side, ts, fmt, label }) => {
    const checked = decision === side;
    const isNewer = !sameMoment && newerSide === side;
    const inputId = `conflict-${projectId}-${side}`;
    return (
      <label
        htmlFor={inputId}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px',
          borderRadius: 7,
          background: checked ? 'var(--c-active)' : 'transparent',
          border: `1px solid ${checked ? 'var(--c-accent)' : 'var(--c-border3)'}`,
          cursor: busy ? 'default' : 'pointer',
          transition: 'background 0.12s, border-color 0.12s',
        }}
      >
        <input
          id={inputId}
          type="radio"
          name={`conflict-${projectId}`}
          value={side}
          checked={checked}
          disabled={busy}
          onChange={() => onChange(projectId, side)}
          style={{ flexShrink: 0, accentColor: 'var(--c-accent)' }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: checked ? 'var(--c-accent)' : 'var(--c-text2)', minWidth: 110 }}>
          {fmt || '—'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--c-text5)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {side === 'local' ? '이 기기 버전' : 'Drive 저장본'} · {label}
        </span>
        {isNewer && fmt && (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-accent)', flexShrink: 0 }}>
            더 최신
          </span>
        )}
      </label>
    );
  };

  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: 8,
      background: 'var(--c-input)',
      border: '1px solid var(--c-border3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title || '제목없음'}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: kindBadge.color, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {kindBadge.label}
        </span>
      </div>
      {kind === 'conflict' && sameMoment && (
        <div style={{ fontSize: 11, color: 'var(--c-text5)', marginBottom: 8, lineHeight: 1.5 }}>
          저장 시각은 같지만 실제 작품 내용이 달라서 충돌로 감지되었습니다.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Row side="local" ts={localTs} fmt={localFmt} label={localLabel} />
        <Row side="drive" ts={driveTs} fmt={driveFmt} label={driveLabel} />
      </div>
    </div>
  );
}

function defaultDecisions(conflicts) {
  const out = {};
  for (const c of conflicts || []) {
    if (c.kind === 'conflict') {
      const lt = c.local?.updatedAt;
      const dt = c.drive?.updatedAt || c.drive?.savedAt;
      out[c.projectId] = (new Date(lt || 0) >= new Date(dt || 0)) ? 'local' : 'drive';
    } else if (c.kind === 'localOnly') {
      out[c.projectId] = 'local';
    } else {
      out[c.projectId] = 'drive';
    }
  }
  return out;
}

function ConflictResolver({ conflicts, onApply, onDismiss, busy, busyMessage }) {
  const [decisions, setDecisions] = useState(() => defaultDecisions(conflicts));

  const setOne = (projectId, side) => {
    if (busy) return;
    setDecisions(prev => ({ ...prev, [projectId]: side }));
  };

  const applyBulk = (mode) => {
    if (busy) return;
    if (mode === 'newest') return setDecisions(defaultDecisions(conflicts));
    const target = mode === 'allLocal' ? 'local' : 'drive';
    const next = {};
    for (const c of conflicts) next[c.projectId] = target;
    setDecisions(next);
  };

  const counts = useMemo(() => {
    let local = 0, drive = 0;
    for (const v of Object.values(decisions)) {
      if (v === 'local') local++; else if (v === 'drive') drive++;
    }
    return { local, drive };
  }, [decisions]);

  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)', marginBottom: 6 }}>
        기기 간 데이터가 다릅니다
      </div>
      <div style={{ fontSize: 13, color: 'var(--c-text5)', marginBottom: 16, lineHeight: 1.6 }}>
        작품별로 어느 버전을 남길지 선택해 주세요.<br/>
        Drive는 다른 기기가 아니라 현재 Drive에 저장된 버전입니다.<br/>
        선택 전 양쪽 데이터가 자동으로 스냅샷에 보존됩니다.
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <BulkBtn onClick={() => applyBulk('newest')}  busy={busy}>전부 최신순</BulkBtn>
        <BulkBtn onClick={() => applyBulk('allLocal')} busy={busy}>전부 이 기기</BulkBtn>
        <BulkBtn onClick={() => applyBulk('allDrive')} busy={busy}>전부 Drive</BulkBtn>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        marginBottom: 16,
        maxHeight: 320, overflowY: 'auto',
        opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto',
      }}>
        {conflicts.map(c => (
          <ConflictRow
            key={c.projectId}
            conflict={c}
            decision={decisions[c.projectId]}
            onChange={setOne}
            busy={busy}
          />
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--c-text6)', marginBottom: 12, textAlign: 'center' }}>
        이 기기 {counts.local}개 · Drive 저장본 {counts.drive}개 적용 예정
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onDismiss && !busy && (
          <button
            onClick={onDismiss}
            style={{
              padding: '9px 14px', borderRadius: 7,
              background: 'transparent',
              border: '1px solid var(--c-border3)',
              color: 'var(--c-text5)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            나중에 결정
          </button>
        )}
        <button
          onClick={() => onApply(decisions)}
          disabled={busy}
          style={{
            padding: '9px 18px', borderRadius: 7,
            background: 'var(--c-accent)',
            border: 'none',
            color: '#fff',
            fontSize: 13, fontWeight: 700,
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? (busyMessage || '적용 중…') : '선택대로 적용'}
        </button>
      </div>
    </>
  );
}

function BulkBtn({ children, onClick, busy }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        padding: '6px 11px', borderRadius: 6,
        border: '1px solid var(--c-border3)',
        background: 'var(--c-card)',
        color: 'var(--c-text3)',
        fontSize: 12, fontWeight: 600,
        cursor: busy ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ── 구 형식 fallback (두 카드) ────────────────────────────────────────────────

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
        {fmtTs(savedAt) || '알 수 없음'}
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

function LegacyChooser({ localSavedAt, driveData, localProjectCount, onKeepLocal, onLoadDrive, busy, busyMessage }) {
  const driveProjectCount = driveData?.projects?.length ?? 0;
  const localIsNewer = new Date(localSavedAt || 0) >= new Date(driveData?.savedAt || 0);
  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)', marginBottom: 6 }}>
        기기 간 데이터가 다릅니다
      </div>
      <div style={{ fontSize: 13, color: 'var(--c-text5)', marginBottom: 18, lineHeight: 1.6 }}>
        로그인하면서 Drive에 저장된 데이터를 감지했습니다.<br/>
        어느 데이터를 사용할지 선택해 주세요. 선택하지 않은 쪽은 덮어씌워집니다.<br/>
        선택 전 현재 데이터가 자동으로 스냅샷에 보존됩니다.
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
        <DataCard
          title="이 기기"
          savedAt={localSavedAt}
          projectCount={localProjectCount}
          highlight={localIsNewer}
          label={localIsNewer ? '더 최신 — 이 기기 유지' : '이 기기 유지'}
          onClick={onKeepLocal}
        />
        <DataCard
          title="Drive 저장본"
          savedAt={driveData?.savedAt}
          projectCount={driveProjectCount}
          highlight={!localIsNewer}
          label={!localIsNewer ? '더 최신 — 불러오기' : 'Drive 저장본 불러오기'}
          onClick={onLoadDrive}
        />
      </div>
      <div style={{ fontSize: 11, color: busy ? 'var(--c-accent)' : 'var(--c-text6)', textAlign: 'center', lineHeight: 1.6, fontWeight: busy ? 600 : 400 }}>
        {busy ? (busyMessage || '동기화 중…') : '선택 후 드라이브 자동 동기화가 시작됩니다.'}
      </div>
    </>
  );
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

export default function SyncConflictModal({
  localSavedAt,
  driveData,
  localProjectCount = 0,
  conflicts = null,
  onKeepLocal,    // legacy fallback
  onLoadDrive,    // legacy fallback
  onApply,        // 신: decisions => Promise<void>
  onDismiss,
  busy = false,
  busyMessage = '동기화 중…',
}) {
  const useNewUI = Array.isArray(conflicts) && conflicts.length > 0 && typeof onApply === 'function';

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
          padding: '24px 22px',
          maxWidth: useNewUI ? 540 : 480,
          width: '100%',
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        }}
      >
        {useNewUI ? (
          <ConflictResolver
            conflicts={conflicts}
            onApply={onApply}
            onDismiss={onDismiss && !busy ? onDismiss : null}
            busy={busy}
            busyMessage={busyMessage}
          />
        ) : (
          <LegacyChooser
            localSavedAt={localSavedAt}
            driveData={driveData}
            localProjectCount={localProjectCount}
            onKeepLocal={onKeepLocal}
            onLoadDrive={onLoadDrive}
            busy={busy}
            busyMessage={busyMessage}
          />
        )}

        {onDismiss && !busy && !useNewUI && (
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
