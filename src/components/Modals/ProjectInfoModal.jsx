import React, { useState, useEffect } from 'react';
import Modal, { ModalBtn } from './Modal';
import { KakaoAdBanner } from '../AdBanner';
import { useIsMobile } from '../../hooks/useIsMobile';

/**
 * @param {boolean}  open
 * @param {function} onClose
 * @param {object}   project  - 현재 활성 프로젝트
 * @param {function} onSave   - (patch: object) => void  [stub]
 */
export default function ProjectInfoModal({ open, onClose, project, onSave }) {
  const [form, setForm] = useState({ title: '', genre: '', status: 'draft', totalEpisodes: 1, totalMins: 70 });
  const isMobile = useIsMobile();

  useEffect(() => {
    if (project) {
      setForm({
        title:         project.title || '',
        genre:         project.genre || '',
        status:        project.status || 'draft',
        totalEpisodes: project.totalEpisodes || 1,
        totalMins:     project.totalMins || 70,
      });
    }
  }, [project, open]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = () => {
    console.log('[stub] ProjectInfoModal: save project info', form);
    onSave?.(form);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="대본 정보"
      size="sm"
      footer={
        <>
          <ModalBtn variant="secondary" onClick={onClose}>취소</ModalBtn>
          <ModalBtn variant="primary" onClick={handleSave}>저장</ModalBtn>
        </>
      }
    >
      <div className="modal-form-grid">
        <div className="modal-form">
          <label className="modal-label">제목</label>
          <input className="modal-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="대본 제목" />
        </div>

        <div className="modal-form">
          <label className="modal-label">장르</label>
          <input className="modal-input" value={form.genre} onChange={e => set('genre', e.target.value)} placeholder="로맨스, 스릴러…" />
        </div>

        <div className="modal-form">
          <label className="modal-label">상태</label>
          <select className="modal-input" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="draft">초고 작업 중</option>
            <option value="revision">수정 중</option>
            <option value="final">탈고</option>
          </select>
        </div>

        <div className="modal-form">
          <label className="modal-label">총 분량 (분)</label>
          <input className="modal-input" type="number" min="1" max="999"
            value={form.totalMins} onChange={e => set('totalMins', Number(e.target.value))} />
        </div>
      </div>

      {project && (
        <div className="modal-meta">
          <span>생성일: {project.createdAt ? new Date(project.createdAt).toLocaleDateString('ko-KR') : '-'}</span>
          <span>최종 수정: {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString('ko-KR') : '-'}</span>
        </div>
      )}

      {/* 카카오 애드핏 — 모달 폭(sm 360px)이 좁아 모바일 단위만 노출 */}
      {isMobile && (
        <div style={{
          display: 'flex', justifyContent: 'center',
          marginTop: 12, paddingTop: 10,
          borderTop: '1px solid var(--c-border3)',
        }}>
          <KakaoAdBanner unitId="DAN-LACmX7j4f8ZyVZ79" width={320} height={100} />
        </div>
      )}
    </Modal>
  );
}
