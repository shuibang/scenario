import React from 'react';
import Modal, { ModalBtn } from './Modal';
import { SceneHeaderTab, BlockStyleTab } from './UserSettingsModal';

const STORAGE_KEY = 'drama_styleOnboarded';

export default function InitialUserSettingsModal({ open, onClose }) {
  const finish = () => {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
    // OnboardingTour가 모달 닫힘을 감지해 투어를 시작할 수 있도록 알림
    try { window.dispatchEvent(new CustomEvent('drama:styleOnboarded')); } catch {}
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={finish}
      title="처음 사용자 설정"
      size="md"
      description="씬 헤더와 블록 스타일을 정해두면 편하게 시작할 수 있습니다."
      footer={
        <>
          <ModalBtn variant="secondary" onClick={finish}>건너뛰기 (기본값으로 시작)</ModalBtn>
          <ModalBtn variant="primary" onClick={finish}>이대로 시작</ModalBtn>
        </>
      }
    >
      <div className="space-y-6">
        <div
          className="text-xs px-3 py-2 rounded"
          style={{
            color: 'var(--c-text4)',
            background: 'var(--c-input)',
            border: '1px solid var(--c-border3)',
          }}
        >
          기본값으로 시작해도 됩니다. 건너뛰기 후 메뉴 › 서식에서 변경 가능합니다.
        </div>

        <section>
          <div
            className="text-xs font-semibold mb-3"
            style={{ color: 'var(--c-accent2)' }}
          >
            씬 헤더
          </div>
          <SceneHeaderTab />
        </section>

        <section>
          <div
            className="text-xs font-semibold mb-3"
            style={{ color: 'var(--c-accent2)' }}
          >
            블록 스타일
          </div>
          <BlockStyleTab />
        </section>
      </div>
    </Modal>
  );
}
