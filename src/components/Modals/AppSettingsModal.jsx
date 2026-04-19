import React from 'react';
import Modal from './Modal';
import { SettingsTab } from '../MyPage';

export default function AppSettingsModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="설정" size="md" description="앱 설정">
      <div style={{ overflowY: 'auto', maxHeight: 480, paddingRight: 2 }}>
        <SettingsTab />
      </div>
    </Modal>
  );
}
