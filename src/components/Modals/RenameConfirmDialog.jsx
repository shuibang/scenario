import React, { useState } from 'react';
import Modal, { ModalBtn } from './Modal';

const SCOPE_OPTIONS = [
  {
    value: 'character',
    label: '인물 블록만',
    desc: '대사 라벨의 이름만 변경',
  },
  {
    value: 'character_dialogue',
    label: '인물 + 대사',
    desc: '대사 안에 언급된 이름도 변경',
  },
  {
    value: 'all',
    label: '전체',
    desc: '지문까지 포함한 모든 위치 변경',
  },
];

export default function RenameConfirmDialog({ open, onClose, oldName, newName, onConfirm }) {
  const [scope, setScope] = useState('all');

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="인물 이름 변경"
      size="sm"
      description="본문의 인물 이름을 일괄 변경합니다"
      footer={
        <>
          <ModalBtn variant="secondary" onClick={onClose}>건너뛰기</ModalBtn>
          <ModalBtn variant="primary" onClick={() => onConfirm(scope)}>미리보기</ModalBtn>
        </>
      }
    >
      {/* 변경 요약 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
        padding: '10px 12px', borderRadius: 6, background: 'var(--c-tag)',
        fontSize: 14, fontWeight: 600,
      }}>
        <span style={{ color: 'var(--c-text)' }}>{oldName}</span>
        <span style={{ color: 'var(--c-text4)', fontSize: 12 }}>→</span>
        <span style={{ color: 'var(--c-accent)' }}>{newName}</span>
      </div>

      <div style={{ fontSize: 13, color: 'var(--c-text3)', marginBottom: 14 }}>
        본문에도 반영하시겠습니까? 어떤 범위까지 바꿀까요?
      </div>

      {/* 범위 라디오 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {SCOPE_OPTIONS.map(opt => (
          <label
            key={opt.value}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '9px 12px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${scope === opt.value ? 'var(--c-accent)' : 'var(--c-border3)'}`,
              background: scope === opt.value ? 'var(--c-active)' : 'var(--c-input)',
              transition: 'border-color 80ms, background 80ms',
            }}
          >
            <input
              type="radio"
              name="rename-scope"
              value={opt.value}
              checked={scope === opt.value}
              onChange={() => setScope(opt.value)}
              style={{ accentColor: 'var(--c-accent)', marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: 13, color: 'var(--c-text)', fontWeight: 500 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: 'var(--c-text4)', marginTop: 2 }}>
                {opt.desc.replace('이름', oldName)}
              </div>
            </div>
          </label>
        ))}
      </div>

      {/* 경고 문구 */}
      <div style={{
        padding: '9px 12px', borderRadius: 6,
        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
        fontSize: 11, color: '#ef9999', lineHeight: 1.6,
      }}>
        ⚠ '{oldName}이', '{oldName}의' 같은 조합도 변경될 수 있습니다.
        미리보기에서 개별 항목을 확인하고 선택 해제하세요.
      </div>
    </Modal>
  );
}
