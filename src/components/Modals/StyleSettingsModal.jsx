import React from 'react';
import Modal from './Modal';
import { useApp } from '../../store/AppContext';

const inputStyle = {
  background: 'var(--c-input)', color: 'var(--c-text3)',
  border: '1px solid var(--c-border3)', borderRadius: '0.25rem',
  padding: '3px 8px', fontSize: '12px', outline: 'none', width: '100%',
};
const labelStyle = { fontSize: '11px', color: 'var(--c-text5)', marginBottom: '2px', display: 'block' };

export default function StyleSettingsModal({ open, onClose }) {
  const { state, dispatch } = useApp();
  const preset  = state.stylePreset || {};
  const margins = preset.pageMargins || { top: 35, right: 30, bottom: 30, left: 30 };

  const setPreset = (key, val) => dispatch({ type: 'SET_STYLE_PRESET', payload: { [key]: val } });
  const setMargin = (side, val) =>
    dispatch({ type: 'SET_STYLE_PRESET', payload: { pageMargins: { ...margins, [side]: Number(val) } } });

  return (
    <Modal open={open} onClose={onClose} title="스타일 설정" size="md" description="기본 스타일, 여백, 태그 설정">
      <div className="space-y-5">
        <div className="text-xs px-2 py-1.5 rounded" style={{ color: '#ef4444', background: 'color-mix(in srgb, #ef4444 8%, transparent)', border: '1px solid color-mix(in srgb, #ef4444 20%, transparent)' }}>
          공모전 등 정확한 지침이 있는 경우, 규격에 맞는지 직접 확인하시길 권장합니다.
        </div>

        {/* 기본 스타일 */}
        <div>
          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--c-accent2)' }}>기본 스타일</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>글씨 크기 (pt)</label>
              <input type="number" min="8" max="20" value={preset.fontSize ?? 11}
                onChange={e => setPreset('fontSize', Number(e.target.value))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>줄간격 (%)</label>
              <input type="number" min="100" max="300" step="10"
                value={Math.round((preset.lineHeight ?? 1.6) * 100)}
                onChange={e => setPreset('lineHeight', Number(e.target.value) / 100)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>장평 (%)</label>
              <input type="number" min="50" max="200" step="5"
                value={preset.characterWidth ?? 100}
                onChange={e => setPreset('characterWidth', Number(e.target.value))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>인물/대사 간격 (em)</label>
              <input type="number" min="4" max="14" step="0.5"
                value={parseFloat(preset.dialogueGap ?? '7')}
                onChange={e => setPreset('dialogueGap', `${e.target.value}em`)} style={inputStyle} />
            </div>
          </div>
        </div>

        {/* 여백 */}
        <div>
          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--c-accent2)' }}>여백 (mm)</div>
          <div className="grid grid-cols-2 gap-3">
            {[['top','위'], ['bottom','아래'], ['left','왼쪽'], ['right','오른쪽']].map(([side, label]) => (
              <div key={side}>
                <label style={labelStyle}>{label}</label>
                <input type="number" min="5" max="60" value={margins[side] ?? 30}
                  onChange={e => setMargin(side, e.target.value)} style={inputStyle} />
              </div>
            ))}
          </div>
        </div>

      </div>
    </Modal>
  );
}
