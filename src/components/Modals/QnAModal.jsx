import React from 'react';
import Modal from './Modal';
import QnATab from '../QnATab';

export default function QnAModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Q&A" size="md" description="자주 묻는 질문">
      <div style={{ overflowY: 'auto', maxHeight: 480, paddingRight: 2 }}>
        <QnATab />
      </div>
    </Modal>
  );
}
