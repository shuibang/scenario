import React from 'react';
import Modal, { ModalBtn } from './Modal';

export default function FindModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="찾기"
      size="sm"
      description="텍스트 검색 기능입니다."
      footer={<ModalBtn variant="secondary" onClick={onClose}>닫기</ModalBtn>}
    >
      <p className="modal-desc">찾기 기능은 준비 중입니다.</p>
    </Modal>
  );
}
