import React, { useState, useEffect, useRef } from 'react';
import Modal, { ModalBtn } from './Modal';
import { PROJECT_TYPE_PRESETS } from '../../utils/projectTypes';

/**
 * @param {boolean}   open
 * @param {function}  onClose
 * @param {function}  onCommit  - ({ title, projectType, totalEpisodes, createEpisodes, totalMins, climaxStart, climaxEnd }) => void
 */
export default function NewProjectModal({ open, onClose, onCommit }) {
  const [title,          setTitle]          = useState('');
  const [selectedType,   setSelectedType]   = useState(null);
  const [totalMins,      setTotalMins]      = useState(60);
  const [climaxStart,    setClimaxStart]    = useState(48);
  const [climaxEnd,      setClimaxEnd]      = useState(58);
  const [totalEpisodes,  setTotalEpisodes]  = useState(16);
  const [createEpisodes, setCreateEpisodes] = useState(1);
  const titleRef = useRef(null);

  // 타입 선택 시 프리셋 자동 적용
  const selectType = (preset) => {
    setSelectedType(preset.id);
    setTotalMins(preset.totalMins);
    setClimaxStart(preset.climaxStart);
    setClimaxEnd(preset.climaxEnd);
    if (!preset.isMulti) {
      setTotalEpisodes(1);
      setCreateEpisodes(1);
    } else {
      setTotalEpisodes(prev => prev < 2 ? 16 : prev);
      setCreateEpisodes(1);
    }
  };

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setTitle('');
      setSelectedType(null);
      setTotalMins(60);
      setClimaxStart(48);
      setClimaxEnd(58);
      setTotalEpisodes(16);
      setCreateEpisodes(1);
      setTimeout(() => titleRef.current?.focus(), 80);
    }
  }, [open]);

  const preset = PROJECT_TYPE_PRESETS.find(p => p.id === selectedType);
  const isMulti = preset?.isMulti ?? false;
  const canCommit = title.trim() && selectedType;

  const handleCommit = () => {
    if (!canCommit) return;
    onCommit({
      title: title.trim(),
      projectType: selectedType,
      totalEpisodes: isMulti ? totalEpisodes : 1,
      createEpisodes: isMulti ? Math.min(createEpisodes, totalEpisodes) : 1,
      totalMins,
      climaxStart,
      climaxEnd,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="새 작품"
      size="sm"
      description="새 작품 정보를 입력하세요."
      footer={
        <>
          <ModalBtn variant="secondary" onClick={onClose}>취소</ModalBtn>
          <ModalBtn variant="primary" onClick={handleCommit} disabled={!canCommit}>만들기</ModalBtn>
        </>
      }
    >
      {/* 작품명 */}
      <div className="modal-form">
        <label className="modal-label">작품명</label>
        <input
          ref={titleRef}
          className="modal-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCommit(); }}
          placeholder="제목 없는 작품"
        />
      </div>

      {/* 작품 유형 */}
      <div className="modal-form" style={{ marginTop: 14 }}>
        <label className="modal-label">작품 유형</label>
        <div className="new-project-type-grid">
          {PROJECT_TYPE_PRESETS.map(p => (
            <button
              key={p.id}
              className={`new-project-type-btn${selectedType === p.id ? ' new-project-type-btn-active' : ''}`}
              onClick={() => selectType(p)}
            >
              <span className="new-project-type-label">{p.label}</span>
              <span className="new-project-type-mins">{p.totalMins}분</span>
            </button>
          ))}
        </div>
      </div>

      {/* 회당 분량 */}
      {selectedType && (
        <div className="modal-form" style={{ marginTop: 14 }}>
          <label className="modal-label">회당 분량 (분)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="modal-input"
              type="number"
              min={1}
              max={300}
              value={totalMins}
              onChange={e => setTotalMins(Math.max(1, Math.min(300, Number(e.target.value))))}
              style={{ width: 80 }}
            />
            {selectedType !== 'custom' && (
              <span style={{ fontSize: 11, color: 'var(--c-text5)' }}>
                {preset?.label} 기본값
              </span>
            )}
          </div>
        </div>
      )}

      {/* 회차 설정 — 다회차 유형만 표시 */}
      {isMulti && (
        <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          <div className="modal-form" style={{ flex: 1 }}>
            <label className="modal-label">전체 회차</label>
            <input
              className="modal-input"
              type="number"
              min={1}
              max={200}
              value={totalEpisodes}
              onChange={e => {
                const v = Math.max(1, Math.min(200, Number(e.target.value)));
                setTotalEpisodes(v);
                setCreateEpisodes(c => Math.min(c, v));
              }}
            />
          </div>
          <div className="modal-form" style={{ flex: 1 }}>
            <label className="modal-label">
              생성 회차
              <span style={{ fontSize: 10, color: 'var(--c-text5)', marginLeft: 4 }}>지금 만들 회차 수</span>
            </label>
            <input
              className="modal-input"
              type="number"
              min={1}
              max={totalEpisodes}
              value={createEpisodes}
              onChange={e => setCreateEpisodes(Math.max(1, Math.min(totalEpisodes, Number(e.target.value))))}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
