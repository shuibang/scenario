import React, { useState } from 'react';
import Modal, { ModalBtn } from './Modal';

export default function SaveAsModal({ open, onClose, projectTitle = '', onExport }) {
  const [filename, setFilename] = useState(projectTitle || '대본');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="대본 작업실 파일로 내보내기"
      size="sm"
      description=".djs 형식으로 내보내기"
      footer={
        <>
          <ModalBtn variant="secondary" onClick={onClose}>취소</ModalBtn>
          <ModalBtn variant="primary" disabled>준비 중</ModalBtn>
        </>
      }
    >
      <p className="modal-desc">
        현재 작품을 <strong>.djs</strong> 파일로 저장합니다.<br />
        다른 기기에서 열거나 백업용으로 사용하세요.
      </p>

      <div className="modal-form" style={{ marginTop: 12 }}>
        <label className="modal-label">파일 이름</label>
        <input
          className="modal-input"
          value={filename}
          onChange={e => setFilename(e.target.value)}
          placeholder="파일 이름 입력"
        />
      </div>

      <div className="modal-filename-preview">
        저장될 파일명: <strong>{filename}.djs</strong>
      </div>

      <p className="modal-hint" style={{ marginTop: 12 }}>
        ※ HWP·DOCX·PDF로 내보내려면 [파일 → 내보내기] 메뉴를 사용하세요.
      </p>
    </Modal>
  );
}
