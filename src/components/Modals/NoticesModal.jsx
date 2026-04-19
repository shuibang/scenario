import React from 'react';
import Modal from './Modal';
import { NoticesTab } from '../MyPage';

export default function NoticesModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="공지사항" size="md" description="공지 및 업데이트 내역">
      <div style={{ overflowY: 'auto', maxHeight: 480, paddingRight: 2 }}>
        <NoticesTab />
      </div>
    </Modal>
  );
}
