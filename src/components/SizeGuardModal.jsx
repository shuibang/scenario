/**
 * SizeGuardModal — 데이터 급감 감지 시 사용자 확인 UI
 *
 * 표시 조건: state.guardPending !== null (persist effect가 70% 이상 감소를 감지한 경우)
 * 선택지:
 *   - "저장" → AppContext.acceptSizeGuard() 호출 → 다음 persist 사이클에서 저장 진행
 *   - "취소" → AppContext.cancelSizeGuard() 호출 → 편집 상태 유지, 저장은 보류
 *
 * 접근성은 Modal(Radix Dialog)의 기본 제공에 위임 (Esc=닫기, overlay 클릭=닫기, 포커스 트랩).
 * 기본 포커스는 "취소" — 파괴적 선택(저장) 방지.
 */
import React from 'react';
import { useApp } from '../store/AppContext';
import Modal, { ModalBtn } from './Modals/Modal';

function formatCategory(label, entry) {
  if (!entry) return { label, text: '변화 없음', highlight: false };
  const pct = Math.round(entry.dropRatio * 100);
  return {
    label,
    text: `${entry.prev}개 → ${entry.next}개 (${pct}% 감소)`,
    highlight: true,
  };
}

export default function SizeGuardModal() {
  const { state, acceptSizeGuard, cancelSizeGuard } = useApp();
  const pending = state.guardPending;
  if (!pending) return null;

  const rows = [
    formatCategory('씬 블록', pending.diff?.scriptBlocks),
    formatCategory('씬',      pending.diff?.scenes),
  ];

  return (
    <Modal
      open
      onClose={cancelSizeGuard}
      title="데이터 급감 감지"
      description="저장 직전 데이터 급감을 감지했습니다."
      size="sm"
      footer={
        <>
          <ModalBtn variant="secondary" onClick={cancelSizeGuard}>취소</ModalBtn>
          <ModalBtn variant="primary" onClick={acceptSizeGuard}>저장</ModalBtn>
        </>
      }
    >
      <div style={{ fontSize: 13, color: 'var(--c-text3)', lineHeight: 1.6 }}>
        최근 편집으로 다음 데이터가 크게 줄었습니다.
      </div>
      <ul style={{ margin: '12px 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(row => (
          <li
            key={row.label}
            style={{
              display: 'flex',
              gap: 12,
              fontSize: 13,
              color: row.highlight ? 'var(--c-text)' : 'var(--c-text6)',
              fontWeight: row.highlight ? 600 : 400,
            }}
          >
            <span style={{ width: 64, color: 'var(--c-text5)', fontWeight: 500 }}>{row.label}</span>
            <span>{row.text}</span>
          </li>
        ))}
      </ul>
      <div style={{ fontSize: 12, color: 'var(--c-text5)', lineHeight: 1.5 }}>
        실수로 인한 변경이라면 <b>취소</b>를 누른 후<br />
        에디터에서 Ctrl+Z로 되돌릴 수 있습니다.
      </div>
    </Modal>
  );
}
