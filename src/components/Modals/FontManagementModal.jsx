import React, { useState, useRef } from 'react';
import Modal from './Modal';
import { storeFont, removeFont, loadFontMeta, saveFontMeta } from '../../print/fontStorage';

function formatBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FontManagementModal({ open, onClose }) {
  const [fonts, setFonts]     = useState(() => loadFontMeta());
  const [uploading, setUploading] = useState(false);
  const [error, setError]     = useState('');
  const fileRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!fileRef.current) return;
    fileRef.current.value = '';
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
      setError('TTF, OTF, WOFF, WOFF2 파일만 지원합니다.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('폰트 파일은 10MB 이하만 업로드할 수 있습니다.');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      if (buffer.byteLength > 10 * 1024 * 1024) {
        setError('폰트 파일은 10MB 이하만 업로드할 수 있습니다.');
        return;
      }
      const magic = new Uint8Array(buffer.slice(0, 4));
      const isTTF   = magic[0] === 0x00 && magic[1] === 0x01 && magic[2] === 0x00 && magic[3] === 0x00;
      const isTTF2  = magic[0] === 0x74 && magic[1] === 0x72 && magic[2] === 0x75 && magic[3] === 0x65;
      const isOTF   = magic[0] === 0x4F && magic[1] === 0x54 && magic[2] === 0x54 && magic[3] === 0x4F;
      const isWOFF  = magic[0] === 0x77 && magic[1] === 0x4F && magic[2] === 0x46 && magic[3] === 0x46;
      const isWOFF2 = magic[0] === 0x77 && magic[1] === 0x4F && magic[2] === 0x46 && magic[3] === 0x32;
      if (!isTTF && !isTTF2 && !isOTF && !isWOFF && !isWOFF2) {
        setError('올바른 폰트 파일이 아닙니다. (TTF/OTF/WOFF/WOFF2)');
        return;
      }
      const id   = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const name = file.name.replace(/\.[^.]+$/, '');
      await storeFont(id, name, buffer);
      const meta    = loadFontMeta();
      const updated = [...meta, { id, name, format: ext.toUpperCase(), sizeBytes: file.size, isDefault: meta.length === 0, addedAt: Date.now() }];
      saveFontMeta(updated);
      setFonts(updated);
    } catch (err) {
      setError(`업로드 실패: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSetDefault = (id) => {
    try {
      const updated = loadFontMeta().map(f => ({ ...f, isDefault: f.id === id }));
      saveFontMeta(updated);
      setFonts(updated);
    } catch (err) {
      setError(`기본 폰트 설정 실패: ${err.message}`);
    }
  };

  const handleDelete = async (id) => {
    try {
      await removeFont(id);
      const meta = loadFontMeta().filter(f => f.id !== id);
      if (meta.length > 0 && !meta.some(f => f.isDefault)) meta[0].isDefault = true;
      saveFontMeta(meta);
      setFonts(meta);
    } catch (err) {
      setError(`삭제 실패: ${err.message}`);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="사용자 폰트 관리" size="md" description="사용자 정의 폰트 추가 및 관리"
      footer={
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{ background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1, padding: '6px 18px', borderRadius: 6, fontSize: 13 }}>
          {uploading ? '업로드 중…' : '+ 폰트 추가'}
        </button>
      }
    >
      <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" style={{ display: 'none' }} onChange={handleFileChange} />

      <div className="text-xs mb-3" style={{ color: 'var(--c-text5)', lineHeight: 1.6 }}>
        TTF·OTF 파일을 추가하면 PDF·DOCX 출력 시 폰트 선택 메뉴에 표시됩니다.
        폰트 파일은 이 브라우저에만 저장됩니다.
      </div>

      {error && (
        <div className="text-xs mb-3 px-2 py-1 rounded" style={{ color: '#c00', background: '#fee' }}>
          {error}
        </div>
      )}

      {fonts.length === 0 ? (
        <div className="text-xs py-6 text-center" style={{ color: 'var(--c-text6)' }}>
          등록된 폰트 없음
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {fonts.map(f => (
            <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded"
              style={{ background: 'var(--c-input)', border: '1px solid var(--c-border3)' }}>
              <span className="text-xs px-1 rounded"
                style={{ background: '#e8e8f8', color: '#5555aa', fontWeight: 600, fontSize: '9px' }}>
                {f.format}
              </span>
              <span className="flex-1 text-xs truncate" style={{ color: 'var(--c-text2)' }}>{f.name}</span>
              <span className="text-xs" style={{ color: 'var(--c-text6)', flexShrink: 0 }}>{formatBytes(f.sizeBytes)}</span>
              {f.isDefault ? (
                <span className="text-xs px-1 rounded"
                  style={{ background: '#e6f4ea', color: '#2d7a3d', fontWeight: 600, fontSize: '9px', flexShrink: 0 }}>
                  기본
                </span>
              ) : (
                <button onClick={() => handleSetDefault(f.id)} className="text-xs px-1.5 py-0.5 rounded"
                  style={{ border: '1px solid var(--c-border3)', background: 'transparent', color: 'var(--c-text4)', cursor: 'pointer', flexShrink: 0, fontSize: '10px' }}>
                  기본
                </button>
              )}
              <button onClick={() => handleDelete(f.id)} className="text-xs px-1.5 py-0.5 rounded"
                style={{ border: '1px solid #f99', background: 'transparent', color: '#c55', cursor: 'pointer', flexShrink: 0, fontSize: '10px' }}>
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
