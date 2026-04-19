import React, { useState, useRef } from 'react';
import Modal from './Modal';
import { useApp } from '../../store/AppContext';
import { storeFont, removeFont, loadFontMeta, saveFontMeta } from '../../print/fontStorage';

function formatBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const tabStyle = (active) => ({
  padding: '6px 16px', fontSize: 13, cursor: 'pointer', border: 'none', background: 'none',
  borderBottom: active ? '2px solid var(--c-accent)' : '2px solid transparent',
  color: active ? 'var(--c-accent)' : 'var(--c-text5)',
  fontWeight: active ? 600 : 400,
  flexShrink: 0,
});

// ─── 폰트 관리 탭 ────────────────────────────────────────────────────────────
function FontTab() {
  const [fonts, setFonts] = useState(() => loadFontMeta());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="text-xs" style={{ color: 'var(--c-text5)', lineHeight: 1.6 }}>
        TTF·OTF 파일을 추가하면 PDF·DOCX 출력 시 폰트 선택 메뉴에 표시됩니다. 폰트 파일은 이 브라우저에만 저장됩니다.
      </div>
      <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" style={{ display: 'none' }} onChange={handleFileChange} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{ alignSelf: 'flex-start', background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1, padding: '6px 16px', borderRadius: 6, fontSize: 12 }}
      >
        {uploading ? '업로드 중…' : '+ 폰트 추가'}
      </button>

      {error && (
        <div className="text-xs" style={{ color: '#c00', background: '#fee', padding: '4px 8px', borderRadius: 4 }}>{error}</div>
      )}

      {fonts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: 'var(--c-text6)' }}>등록된 폰트 없음</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fonts.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--c-input)', border: '1px solid var(--c-border3)' }}>
              <span style={{ background: '#e8e8f8', color: '#5555aa', fontWeight: 600, fontSize: 9, padding: '1px 4px', borderRadius: 3 }}>{f.format}</span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--c-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span style={{ fontSize: 11, color: 'var(--c-text6)', flexShrink: 0 }}>{formatBytes(f.sizeBytes)}</span>
              {f.isDefault ? (
                <span style={{ background: '#e6f4ea', color: '#2d7a3d', fontWeight: 600, fontSize: 9, padding: '1px 4px', borderRadius: 3, flexShrink: 0 }}>기본</span>
              ) : (
                <button onClick={() => handleSetDefault(f.id)} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, border: '1px solid var(--c-border3)', background: 'transparent', color: 'var(--c-text4)', cursor: 'pointer', flexShrink: 0 }}>기본</button>
              )}
              <button onClick={() => handleDelete(f.id)} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, border: '1px solid #f99', background: 'transparent', color: '#c55', cursor: 'pointer', flexShrink: 0 }}>삭제</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 블록 스타일 탭 ──────────────────────────────────────────────────────────
function Toggle({ on, onClick, children, title }) {
  return (
    <button onClick={onClick} title={title} style={{
      padding: '4px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
      border: `1px solid ${on ? 'var(--c-accent)' : 'var(--c-border3)'}`,
      background: on ? 'var(--c-accent)' : 'transparent',
      color: on ? '#fff' : 'var(--c-text4)',
      fontWeight: 700,
    }}>{children}</button>
  );
}

function BlockRow({ label, blockKey, showUppercase }) {
  const { state, dispatch } = useApp();
  const blockStyles = state.stylePreset?.blockStyles || {};
  const bs = blockStyles[blockKey] || {};
  const bold      = bs.bold      ?? (blockKey === 'sceneNumber');
  const italic    = bs.italic    ?? false;
  const underline = bs.underline ?? false;
  const uppercase = bs.uppercase ?? false;

  const set = (key, val) =>
    dispatch({ type: 'SET_STYLE_PRESET', payload: { blockStyles: { ...blockStyles, [blockKey]: { ...bs, [key]: val } } } });

  const preview = {
    fontSize: 12, color: 'var(--c-text2)',
    fontWeight: bold ? 'bold' : 'normal',
    fontStyle: italic ? 'italic' : 'normal',
    textDecoration: underline ? 'underline' : 'none',
    textTransform: uppercase ? 'uppercase' : 'none',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--c-input)', border: '1px solid var(--c-border3)' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text3)', minWidth: 44, flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        <Toggle on={bold}      onClick={() => set('bold', !bold)}      title="굵게"><b>B</b></Toggle>
        <Toggle on={italic}    onClick={() => set('italic', !italic)}   title="기울임"><i>I</i></Toggle>
        <Toggle on={underline} onClick={() => set('underline', !underline)} title="밑줄"><u>U</u></Toggle>
        {showUppercase && <Toggle on={uppercase} onClick={() => set('uppercase', !uppercase)} title="대문자">AA</Toggle>}
      </div>
      <span style={{ ...preview, marginLeft: 4, flex: 1 }}>미리보기 텍스트</span>
    </div>
  );
}

function DialogueLayoutRow() {
  const { state, dispatch } = useApp();
  const layout = state.stylePreset?.dialogueLayout || 'korean';
  const set = (val) => dispatch({ type: 'SET_STYLE_PRESET', payload: { dialogueLayout: val } });

  const opts = [
    { val: 'korean',    label: '현 스타일',     desc: '인물명 좌측 고정 · 대사 들여쓰기' },
    { val: 'hollywood', label: '헐리웃 스타일', desc: '인물명 위 중앙 · 대사 아래 정렬' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 12px', borderRadius: 8, background: 'var(--c-input)', border: '1px solid var(--c-border3)' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text3)' }}>대사 레이아웃</span>
      <div style={{ display: 'flex', gap: 8 }}>
        {opts.map(opt => (
          <button key={opt.val} onClick={() => set(opt.val)} style={{
            flex: 1, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
            border: `1px solid ${layout === opt.val ? 'var(--c-accent)' : 'var(--c-border3)'}`,
            background: layout === opt.val ? 'color-mix(in srgb, var(--c-accent) 12%, transparent)' : 'var(--c-bg)',
            color: layout === opt.val ? 'var(--c-accent)' : 'var(--c-text4)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</div>
            <div style={{ fontSize: 10, color: layout === opt.val ? 'var(--c-accent)' : 'var(--c-text6)', marginTop: 2 }}>{opt.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockStyleTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="text-xs" style={{ color: 'var(--c-text5)', lineHeight: 1.6, marginBottom: 4 }}>
        에디터에서 씬헤더·지문·대사 블록의 글자 스타일과 레이아웃을 지정합니다.
      </div>
      <BlockRow label="씬헤더" blockKey="sceneNumber" showUppercase />
      <BlockRow label="지문"   blockKey="action" />
      <BlockRow label="대사"   blockKey="dialogue" />
      <DialogueLayoutRow />
    </div>
  );
}

// ─── 메인 모달 ───────────────────────────────────────────────────────────────
export default function UserSettingsModal({ open, onClose }) {
  const [tab, setTab] = useState('blockStyle');

  return (
    <Modal open={open} onClose={onClose} title="사용자 설정" size="md" description="블록 스타일 및 폰트 관리">
      <div style={{ display: 'flex', borderBottom: '1px solid var(--c-border)', marginBottom: 16, marginTop: -4 }}>
        <button style={tabStyle(tab === 'blockStyle')} onClick={() => setTab('blockStyle')}>블록 스타일</button>
        <button style={tabStyle(tab === 'font')}       onClick={() => setTab('font')}>폰트 관리</button>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 420, paddingRight: 2 }}>
        {tab === 'blockStyle' && <BlockStyleTab />}
        {tab === 'font'       && <FontTab />}
      </div>
    </Modal>
  );
}
