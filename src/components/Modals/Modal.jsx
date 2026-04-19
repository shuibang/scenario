import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';

const sizeClass = {
  sm: 'modal-sm',
  md: 'modal-md',
  lg: 'modal-lg',
};

export default function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={`modal-content ${sizeClass[size]}`}>
          {/* 헤더 */}
          <div className="modal-header">
            <Dialog.Title className="modal-title">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="modal-close-btn" aria-label="닫기" onClick={onClose}>✕</button>
            </Dialog.Close>
          </div>

          {description && (
            <Dialog.Description className="sr-only">{description}</Dialog.Description>
          )}

          {/* 본문 */}
          <div className="modal-body">{children}</div>

          {/* 푸터 */}
          {footer && <div className="modal-footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// 재사용 버튼 컴포넌트
export function ModalBtn({ children, variant = 'secondary', onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`modal-btn modal-btn-${variant}`}
    >
      {children}
    </button>
  );
}
