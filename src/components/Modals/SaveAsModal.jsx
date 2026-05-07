import React, { useState, useEffect } from 'react';
import Modal, { ModalBtn } from './Modal';

// Windows 등 OS의 파일명 금지 문자 + 제어문자 제거. 빈 문자열은 호출자가 처리.
function sanitizeFilename(raw) {
  return (raw || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '')
    .trim();
}

export default function SaveAsModal({ open, onClose, projectTitle = '', onExport }) {
  const [filename, setFilename] = useState(projectTitle || '대본');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  // 모달 열릴 때 작품 제목으로 초기화
  useEffect(() => {
    if (open) {
      setFilename(projectTitle || '대본');
      setError(null);
      setExporting(false);
    }
  }, [open, projectTitle]);

  const safeName = sanitizeFilename(filename);
  const canExport = !!safeName && !exporting;

  const handleExport = async () => {
    if (!canExport) return;
    setExporting(true);
    setError(null);
    try {
      await onExport?.(safeName);
      onClose();
    } catch (err) {
      setError('내보내기 실패: ' + (err?.message || err));
    } finally {
      setExporting(false);
    }
  };

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
          <ModalBtn variant="primary" onClick={handleExport} disabled={!canExport}>
            {exporting ? '내보내는 중…' : '내보내기'}
          </ModalBtn>
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
          onKeyDown={e => { if (e.key === 'Enter' && canExport) handleExport(); }}
          placeholder="파일 이름 입력"
        />
      </div>

      <div className="modal-filename-preview">
        저장될 파일명: <strong>{safeName || '대본'}.djs</strong>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: 'var(--c-danger, #e53e3e)', marginTop: 8 }}>{error}</p>
      )}

      <p className="modal-hint" style={{ marginTop: 12 }}>
        ※ HWP·DOCX·PDF로 내보내려면 [파일 → 내보내기] 메뉴를 사용하세요.
      </p>
    </Modal>
  );
}
