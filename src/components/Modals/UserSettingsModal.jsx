import React, { useState, useRef } from 'react';
import Modal from './Modal';
import { useApp } from '../../store/AppContext';
import { storeFont, removeFont, loadFontMeta, saveFontMeta } from '../../print/fontStorage';
import { supabase } from '../../store/supabaseClient';
import { SCENE_PREFIX_OPTIONS, getScenePrefix, setScenePrefix } from '../../utils/scenePrefix';
import {
  getSceneFormat, setSceneFormat,
  LOC_SEP_PRESETS, TIME_FMT_PRESETS,
  isCustomLocSep, previewFormat,
} from '../../utils/sceneFormat';
import { reportError } from '../../utils/errorTracker';

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Shared sub-components ────────────────────────────────────────────────────
function Divider() {
  return <div style={{ height: 1, background: 'var(--c-border3)', margin: '14px 0' }} />;
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32, marginBottom: 8 }}>
      <div style={{ width: 72, fontSize: 12, color: 'var(--c-text5)', flexShrink: 0 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

function Toggle({ on, onClick, children, title }) {
  return (
    <button onClick={onClick} title={title} style={{
      height: 28, padding: '0 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
      border: `1px solid ${on ? 'var(--c-accent)' : 'var(--c-border3)'}`,
      background: on ? 'var(--c-accent)' : 'transparent',
      color: on ? '#fff' : 'var(--c-text4)',
      fontWeight: 700, display: 'flex', alignItems: 'center',
    }}>{children}</button>
  );
}

function TabWidthBtn({ value, onChange }) {
  const current = Math.max(1, Math.min(4, Math.round(Number(value) || 2)));
  const next = current >= 4 ? 1 : current + 1;
  return (
    <button
      onClick={() => onChange(next)}
      title={`탭 간격 ${current * 2}em — 클릭 시 ${next * 2}em`}
      style={{
        height: 28, padding: '0 8px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
        border: '1px solid var(--c-accent)',
        background: 'var(--c-accent)',
        color: '#fff',
        display: 'flex', alignItems: 'center', gap: 3, fontWeight: 700,
      }}
    >
      <span style={{ fontSize: 11 }}>⇥ {current * 2}em</span>
    </button>
  );
}

function IndentBtn({ value, onChange }) {
  const current = Math.max(0, Math.min(3, Math.round(Number(value) || 0)));
  const next = (current + 1) % 4;
  const active = current > 0;
  return (
    <button
      onClick={() => onChange(next)}
      title={`들여쓰기 ${current}단계 (${current * 8}mm) — 클릭 시 ${next}단계`}
      style={{
        height: 28, padding: '0 8px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
        border: `1px solid ${active ? 'var(--c-accent)' : 'var(--c-border3)'}`,
        background: active ? 'var(--c-accent)' : 'transparent',
        color: active ? '#fff' : 'var(--c-text4)',
        display: 'flex', alignItems: 'center', gap: 3, fontWeight: 700,
      }}
    >
      <span style={{ fontSize: 13 }}>⇥</span>
      <span style={{ fontSize: 11 }}>{current}</span>
    </button>
  );
}

function PreviewBox({ children, style }) {
  return (
    <div style={{
      padding: '8px 14px', borderRadius: 6,
      background: 'var(--c-input)', border: '1px solid var(--c-border3)',
      marginBottom: 10, fontSize: 12, minHeight: 36,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Block style row (B/I/U + Indent) ────────────────────────────────────────
function BlockStyleRow({ label, blockKey, showIndent = true }) {
  const { state, dispatch } = useApp();
  const blockStyles = state.stylePreset?.blockStyles || {};
  const bs  = blockStyles[blockKey] || {};
  const bold      = bs.bold      ?? (blockKey === 'sceneNumber' || blockKey === 'charName');
  const italic    = bs.italic    ?? false;
  const underline = bs.underline ?? false;
  const indent    = bs.indent    ?? (blockKey === 'action' ? 1 : 0);

  const set = (key, val) =>
    dispatch({ type: 'SET_STYLE_PRESET', payload: { blockStyles: { ...blockStyles, [blockKey]: { ...bs, [key]: val } } } });

  return (
    <Row label={label}>
      <Toggle on={bold}      onClick={() => set('bold', !bold)}           title="굵게"><b>B</b></Toggle>
      <Toggle on={italic}    onClick={() => set('italic', !italic)}       title="기울임"><i>I</i></Toggle>
      <Toggle on={underline} onClick={() => set('underline', !underline)} title="밑줄"><u>U</u></Toggle>
      {showIndent && <IndentBtn value={indent} onChange={(v) => set('indent', v)} />}
    </Row>
  );
}

// ─── Tab 1: 씬 헤더 스타일 ───────────────────────────────────────────────────
export function SceneHeaderTab() {
  const { state, dispatch } = useApp();
  const blockStyles  = state.stylePreset?.blockStyles || {};
  const snBs         = blockStyles.sceneNumber || {};
  const bold         = snBs.bold      !== false;
  const italic       = !!snBs.italic;
  const underline    = !!snBs.underline;
  const indent       = snBs.indent ?? 0;

  const sceneHeaderLayout   = state.stylePreset?.sceneHeaderLayout   ?? 'inline';
  const sceneHeaderTabWidth = state.stylePreset?.sceneHeaderTabWidth ?? 2;
  const setSceneHeaderLayout   = (val) =>
    dispatch({ type: 'SET_STYLE_PRESET', payload: { sceneHeaderLayout: val } });
  const setSceneHeaderTabWidth = (val) =>
    dispatch({ type: 'SET_STYLE_PRESET', payload: { sceneHeaderTabWidth: val } });

  const [scenePrefix,   setScenePrefixState]   = useState(() => getScenePrefix());
  const [sceneFormat,   setSceneFormatState]   = useState(() => getSceneFormat());
  const [customLocSep,  setCustomLocSep]        = useState(() => {
    const fmt = getSceneFormat();
    return isCustomLocSep(fmt.locSep) ? fmt.locSep : '';
  });
  const [customTimeOpen,  setCustomTimeOpen]  = useState(() => getSceneFormat().customTimeOpen  ?? ' ');
  const [customTimeClose, setCustomTimeClose] = useState(() => getSceneFormat().customTimeClose ?? '');

  const handlePrefix = (val) => { setScenePrefixState(val); setScenePrefix(val, supabase || null); };
  const handleFormat = (patch) => {
    const next = { ...sceneFormat, ...patch };
    setSceneFormatState(next);
    setSceneFormat(next);
  };

  const prefixExample = SCENE_PREFIX_OPTIONS.find(o => o.value === scenePrefix)?.example ?? 'S#1.';
  const previewBody   = previewFormat(sceneFormat) || '거실 - 안방 (낮)';
  const previewText   = `${prefixExample} ${previewBody}`;
  const previewStyle  = {
    fontWeight: bold ? 700 : 400,
    fontStyle:  italic ? 'italic' : 'normal',
    textDecoration: underline ? 'underline' : 'none',
    marginLeft: `${indent * 8}mm`,
    color: 'var(--c-accent)',
    fontSize: 13,
  };

  return (
    <div>
      {/* 씬 헤더 미리보기 */}
      <PreviewBox>
        {sceneHeaderLayout === 'tabbed' ? (
          <span style={{ ...previewStyle, display: 'block', paddingLeft: `${sceneHeaderTabWidth * 2}em`, textIndent: 0 }}>
            <span style={{ display: 'inline-block', minWidth: `${sceneHeaderTabWidth * 2}em`, marginLeft: `-${sceneHeaderTabWidth * 2}em`, verticalAlign: 'top' }}>{prefixExample}</span>
            <span>{previewBody}</span>
          </span>
        ) : (
          <span style={previewStyle}>{previewText}</span>
        )}
      </PreviewBox>

      {/* 씬번호 형식 */}
      <div style={{ fontSize: 11, color: 'var(--c-text5)', marginBottom: 6 }}>씬번호 형식</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {SCENE_PREFIX_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => handlePrefix(opt.value)} style={{
            height: 28, padding: '0 10px', fontSize: 12, borderRadius: 14, cursor: 'pointer',
            border: `1px solid ${scenePrefix === opt.value ? 'var(--c-accent)' : 'var(--c-border3)'}`,
            background: scenePrefix === opt.value ? 'var(--c-accent)' : 'transparent',
            color: scenePrefix === opt.value ? '#fff' : 'var(--c-text4)',
          }}>{opt.example}</button>
        ))}
      </div>

      {/* 씬헤더 서식 */}
      <BlockStyleRow label="씬헤더" blockKey="sceneNumber" />

      {/* 씬헤더 레이아웃 */}
      <Row label="레이아웃">
        {[
          { value: 'inline', label: '일반', title: '씬번호와 장소가 나란히 표시됩니다' },
          { value: 'tabbed', label: '탭 간격', title: '씬번호 뒤에 고정 간격을 두고 장소가 시작됩니다' },
        ].map(opt => (
          <Toggle
            key={opt.value}
            on={sceneHeaderLayout === opt.value}
            onClick={() => setSceneHeaderLayout(opt.value)}
            title={opt.title}
          >{opt.label}</Toggle>
        ))}
        {sceneHeaderLayout === 'tabbed' && (
          <TabWidthBtn value={sceneHeaderTabWidth} onChange={setSceneHeaderTabWidth} />
        )}
      </Row>

      <Divider />

      {/* 장소·세부장소 구분자 */}
      <div style={{ fontSize: 11, color: 'var(--c-text5)', marginBottom: 5 }}>장소 ↔ 세부장소 구분자</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {LOC_SEP_PRESETS.map(opt => (
          <button key={opt.value} onClick={() => handleFormat({ locSep: opt.value })} style={{
            height: 28, padding: '0 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
            border: `1px solid ${sceneFormat.locSep === opt.value ? 'var(--c-accent)' : 'var(--c-border3)'}`,
            background: sceneFormat.locSep === opt.value ? 'var(--c-accent)' : 'transparent',
            color: sceneFormat.locSep === opt.value ? '#fff' : 'var(--c-text4)',
            fontFamily: 'monospace',
          }}>{opt.example}</button>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => handleFormat({ locSep: customLocSep || ' ' })}
            style={{
              height: 28, padding: '0 8px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
              border: `1px solid ${isCustomLocSep(sceneFormat.locSep) ? 'var(--c-accent)' : 'var(--c-border3)'}`,
              background: isCustomLocSep(sceneFormat.locSep) ? 'var(--c-accent)' : 'transparent',
              color: isCustomLocSep(sceneFormat.locSep) ? '#fff' : 'var(--c-text4)',
            }}>직접</button>
          <input value={customLocSep}
            onChange={e => { setCustomLocSep(e.target.value); if (isCustomLocSep(sceneFormat.locSep)) handleFormat({ locSep: e.target.value || ' ' }); }}
            onFocus={() => { if (!isCustomLocSep(sceneFormat.locSep)) handleFormat({ locSep: customLocSep || ' ' }); }}
            placeholder="구분자"
            style={{ width: 60, height: 28, fontSize: 12, padding: '0 6px', borderRadius: 4, background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-border3)', outline: 'none', fontFamily: 'monospace' }}
          />
        </div>
      </div>

      {/* 시간대 표기 방식 */}
      <div style={{ fontSize: 11, color: 'var(--c-text5)', marginBottom: 5 }}>시간대 표기 방식</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {TIME_FMT_PRESETS.map(opt => (
          <button key={opt.value} onClick={() => handleFormat({ timeFmt: opt.value })} style={{
            height: 28, padding: '0 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
            border: `1px solid ${sceneFormat.timeFmt === opt.value ? 'var(--c-accent)' : 'var(--c-border3)'}`,
            background: sceneFormat.timeFmt === opt.value ? 'var(--c-accent)' : 'transparent',
            color: sceneFormat.timeFmt === opt.value ? '#fff' : 'var(--c-text4)',
            fontFamily: 'monospace',
          }}>{opt.example}</button>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => handleFormat({ timeFmt: 'custom', customTimeOpen: customTimeOpen ?? ' ', customTimeClose: customTimeClose ?? '' })}
            style={{
              height: 28, padding: '0 8px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
              border: `1px solid ${sceneFormat.timeFmt === 'custom' ? 'var(--c-accent)' : 'var(--c-border3)'}`,
              background: sceneFormat.timeFmt === 'custom' ? 'var(--c-accent)' : 'transparent',
              color: sceneFormat.timeFmt === 'custom' ? '#fff' : 'var(--c-text4)',
            }}>직접</button>
          <input value={customTimeOpen}
            onChange={e => { setCustomTimeOpen(e.target.value); if (sceneFormat.timeFmt === 'custom') handleFormat({ timeFmt: 'custom', customTimeOpen: e.target.value, customTimeClose: customTimeClose ?? '' }); }}
            onFocus={() => { if (sceneFormat.timeFmt !== 'custom') handleFormat({ timeFmt: 'custom', customTimeOpen: customTimeOpen ?? ' ', customTimeClose: customTimeClose ?? '' }); }}
            placeholder="앞"
            style={{ width: 36, height: 28, fontSize: 12, padding: '0 4px', borderRadius: 4, background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-border3)', outline: 'none', fontFamily: 'monospace', textAlign: 'center' }}
          />
          <span style={{ fontSize: 11, color: 'var(--c-text5)' }}>시간대</span>
          <input value={customTimeClose}
            onChange={e => { setCustomTimeClose(e.target.value); if (sceneFormat.timeFmt === 'custom') handleFormat({ timeFmt: 'custom', customTimeOpen: customTimeOpen ?? ' ', customTimeClose: e.target.value }); }}
            onFocus={() => { if (sceneFormat.timeFmt !== 'custom') handleFormat({ timeFmt: 'custom', customTimeOpen: customTimeOpen ?? ' ', customTimeClose: customTimeClose ?? '' }); }}
            placeholder="뒤"
            style={{ width: 36, height: 28, fontSize: 12, padding: '0 4px', borderRadius: 4, background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-border3)', outline: 'none', fontFamily: 'monospace', textAlign: 'center' }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Tab 2: 블록 스타일 ───────────────────────────────────────────────────────
export function BlockStyleTab() {
  const { state, dispatch } = useApp();
  const blockStyles = state.stylePreset?.blockStyles || {};
  const dialogueGap = state.stylePreset?.dialogueGap || '7em';

  const acBs = blockStyles.action   || {};
  const cnBs = blockStyles.charName || {};
  const dgBs = blockStyles.dialogue || {};

  const actionPreviewStyle = {
    fontWeight:    acBs.bold    ? 700 : 400,
    fontStyle:     acBs.italic  ? 'italic' : 'normal',
    textDecoration: acBs.underline ? 'underline' : 'none',
    marginLeft:    `${(acBs.indent ?? 1) * 8}mm`,
  };
  const charPreviewStyle = {
    fontWeight:    cnBs.bold !== false ? 700 : 400,
    fontStyle:     cnBs.italic  ? 'italic' : 'normal',
    textDecoration: cnBs.underline ? 'underline' : 'none',
  };
  const diagPreviewStyle = {
    fontWeight:    dgBs.bold    ? 700 : 400,
    fontStyle:     dgBs.italic  ? 'italic' : 'normal',
    textDecoration: dgBs.underline ? 'underline' : 'none',
    marginLeft: `${(dgBs.indent ?? 0) * 8}mm`,
  };

  return (
    <div>
      {/* 지문 */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text4)', marginBottom: 6 }}>지문</div>
      <PreviewBox>
        <span style={actionPreviewStyle}>지문 스타일 예시 텍스트</span>
      </PreviewBox>
      <BlockStyleRow label="지문" blockKey="action" />

      <Divider />

      {/* 대사 */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text4)', marginBottom: 6 }}>대사</div>
      <PreviewBox>
        <span style={{ ...charPreviewStyle, marginLeft: `${(cnBs.indent ?? 0) * 8}mm` }}>인물명</span>
        <span style={{ display: 'inline-block', width: dialogueGap }} />
        <span style={diagPreviewStyle}>대사 스타일 예시</span>
      </PreviewBox>
      <BlockStyleRow label="인물명" blockKey="charName" />
      <BlockStyleRow label="대사"   blockKey="dialogue" showIndent={false} />

      <Divider />

      {/* 인물·대사 여백 슬라이더 */}
      <Row label="인물 여백">
        <input type="range" min="1" max="14" step="0.5"
          value={parseFloat(dialogueGap)}
          onChange={e => dispatch({ type: 'SET_STYLE_PRESET', payload: { dialogueGap: `${e.target.value}em` } })}
          style={{ width: 120, accentColor: 'var(--c-accent)', cursor: 'pointer' }}
        />
        <span style={{ fontSize: 11, color: 'var(--c-text4)', minWidth: '2.5rem' }}>{dialogueGap}</span>
      </Row>

      <Divider />

      {/* 폰트 추가 */}
      <FontSection />
    </div>
  );
}

// ─── 폰트 섹션 ───────────────────────────────────────────────────────────────
function FontSection() {
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
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) { setError('TTF, OTF, WOFF, WOFF2 파일만 지원합니다.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('폰트 파일은 10MB 이하만 업로드할 수 있습니다.'); return; }
    setError('');
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const magic = new Uint8Array(buffer.slice(0, 4));
      const ok = (magic[0] === 0x00 && magic[1] === 0x01) || (magic[0] === 0x74 && magic[1] === 0x72)
               || (magic[0] === 0x4F && magic[1] === 0x54) || (magic[0] === 0x77 && magic[1] === 0x4F);
      if (!ok) { setError('올바른 폰트 파일이 아닙니다. (TTF/OTF/WOFF/WOFF2)'); return; }
      const id   = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const name = file.name.replace(/\.[^.]+$/, '');
      await storeFont(id, name, buffer);
      const meta    = loadFontMeta();
      const updated = [...meta, { id, name, format: ext.toUpperCase(), sizeBytes: file.size, isDefault: meta.length === 0, addedAt: Date.now() }];
      saveFontMeta(updated);
      setFonts(updated);
    } catch (err) {
      reportError({ source: 'manual', message: err?.message || String(err), stack: err?.stack });
      setError('폰트 업로드에 실패했어요. 잠시 후 다시 시도해주세요.');
    }
    finally { setUploading(false); }
  };

  const handleSetDefault = (id) => {
    try {
      const updated = loadFontMeta().map(f => ({ ...f, isDefault: f.id === id }));
      saveFontMeta(updated);
      setFonts(updated);
    } catch (err) {
      reportError({ source: 'manual', message: err?.message || String(err), stack: err?.stack });
      setError('기본 폰트 설정에 실패했어요. 잠시 후 다시 시도해주세요.');
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
      reportError({ source: 'manual', message: err?.message || String(err), stack: err?.stack });
      setError('폰트 삭제에 실패했어요. 잠시 후 다시 시도해주세요.');
    }
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text4)', marginBottom: 6 }}>사용자 폰트</div>
      <div className="text-xs" style={{ color: 'var(--c-text5)', lineHeight: 1.6, marginBottom: 8 }}>
        TTF·OTF 파일을 추가하면 PDF·DOCX 출력 시 폰트 선택 메뉴에 표시됩니다.
      </div>
      <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" style={{ display: 'none' }} onChange={handleFileChange} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{ alignSelf: 'flex-start', background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1, padding: '5px 14px', borderRadius: 6, fontSize: 12 }}
      >{uploading ? '업로드 중…' : '+ 폰트 추가'}</button>
      {error && <div className="text-xs" style={{ color: '#c00', background: '#fee', padding: '4px 8px', borderRadius: 4, marginTop: 6 }}>{error}</div>}
      {fonts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
          {fonts.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 6, background: 'var(--c-input)', border: '1px solid var(--c-border3)' }}>
              <span style={{ background: '#e8e8f8', color: '#5555aa', fontWeight: 600, fontSize: 9, padding: '1px 4px', borderRadius: 3 }}>{f.format}</span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--c-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span style={{ fontSize: 11, color: 'var(--c-text6)', flexShrink: 0 }}>{formatBytes(f.sizeBytes)}</span>
              {f.isDefault
                ? <span style={{ background: '#e6f4ea', color: '#2d7a3d', fontWeight: 600, fontSize: 9, padding: '1px 4px', borderRadius: 3, flexShrink: 0 }}>기본</span>
                : <button onClick={() => handleSetDefault(f.id)} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, border: '1px solid var(--c-border3)', background: 'transparent', color: 'var(--c-text4)', cursor: 'pointer', flexShrink: 0 }}>기본</button>
              }
              <button onClick={() => handleDelete(f.id)} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, border: '1px solid #f99', background: 'transparent', color: '#c55', cursor: 'pointer', flexShrink: 0 }}>삭제</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 메인 모달 ───────────────────────────────────────────────────────────────
export default function UserSettingsModal({ open, onClose, initialTab = 'sceneHeader' }) {
  const [tab, setTab] = useState(initialTab);

  // initialTab 변경 시 탭 동기화 (sceneFormatOpen → sceneHeader로 열리는 경우)
  React.useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);

  return (
    <Modal open={open} onClose={onClose} title="스타일 설정" size="md" description="씬 헤더 및 블록 스타일 설정">
      <div style={{ display: 'flex', borderBottom: '1px solid var(--c-border)', marginBottom: 14, marginTop: -4 }}>
        <button style={tabStyle(tab === 'sceneHeader')} onClick={() => setTab('sceneHeader')}>씬 헤더</button>
        <button style={tabStyle(tab === 'blockStyle')}  onClick={() => setTab('blockStyle')}>블록 스타일</button>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 460, paddingRight: 2 }}>
        {tab === 'sceneHeader' && <SceneHeaderTab />}
        {tab === 'blockStyle'  && <BlockStyleTab />}
      </div>
    </Modal>
  );
}
