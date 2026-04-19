import React, { useState } from 'react';
import Modal from './Modal';
import { supabase } from '../../store/supabaseClient';
import { SCENE_PREFIX_OPTIONS, getScenePrefix, setScenePrefix } from '../../utils/scenePrefix';
import {
  getSceneFormat, setSceneFormat,
  LOC_SEP_PRESETS, TIME_FMT_PRESETS,
  isCustomLocSep, previewFormat,
} from '../../utils/sceneFormat';

const tabStyle = (active) => ({
  padding: '6px 16px', fontSize: 13, cursor: 'pointer', border: 'none', background: 'none',
  borderBottom: active ? '2px solid var(--c-accent)' : '2px solid transparent',
  color: active ? 'var(--c-accent)' : 'var(--c-text5)',
  fontWeight: active ? 600 : 400,
});

export default function SceneFormatModal({ open, onClose }) {
  const [tab, setTab] = useState('prefix');
  const [scenePrefix, setScenePrefixState] = useState(() => getScenePrefix());
  const [sceneFormat, setSceneFormatState] = useState(() => getSceneFormat());
  const [customLocSepInput, setCustomLocSepInput] = useState(() => {
    const fmt = getSceneFormat();
    return isCustomLocSep(fmt.locSep) ? fmt.locSep : '';
  });
  const [customTimeOpenInput,  setCustomTimeOpenInput]  = useState(() => getSceneFormat().customTimeOpen  ?? ' ');
  const [customTimeCloseInput, setCustomTimeCloseInput] = useState(() => getSceneFormat().customTimeClose ?? '');

  const handleScenePrefix = (val) => {
    setScenePrefixState(val);
    setScenePrefix(val, supabase || null);
  };

  const handleSceneFormat = (patch) => {
    const next = { ...sceneFormat, ...patch };
    setSceneFormatState(next);
    setSceneFormat(next);
  };

  return (
    <Modal open={open} onClose={onClose} title="씬헤더 형식" size="md" description="씬번호 형식 및 씬 헤더 형식 설정">
      {/* 탭 */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--c-border)', marginBottom: 16, marginTop: -4 }}>
        <button style={tabStyle(tab === 'prefix')} onClick={() => setTab('prefix')}>씬번호 형식</button>
        <button style={tabStyle(tab === 'header')} onClick={() => setTab('header')}>씬 헤더 형식</button>
      </div>

      {/* 씬번호 형식 탭 */}
      {tab === 'prefix' && (
        <div>
          <div className="text-xs mb-3" style={{ color: 'var(--c-text5)' }}>
            새로 입력하는 씬번호에 적용됩니다. 기존 씬번호는 변경되지 않습니다.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SCENE_PREFIX_OPTIONS.map(opt => (
              <label key={opt.value} style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                padding: '7px 10px', borderRadius: 7,
                border: `1px solid ${scenePrefix === opt.value ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                background: scenePrefix === opt.value ? 'color-mix(in srgb, var(--c-accent) 8%, transparent)' : 'transparent',
              }}>
                <input type="radio" name="scenePrefix" value={opt.value}
                  checked={scenePrefix === opt.value}
                  onChange={() => handleScenePrefix(opt.value)}
                  style={{ accentColor: 'var(--c-accent)', cursor: 'pointer' }} />
                <span style={{ fontSize: 12, color: 'var(--c-text)', flex: 1 }}>{opt.label}</span>
                <span style={{
                  fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
                  color: scenePrefix === opt.value ? 'var(--c-accent)' : 'var(--c-text5)',
                  background: 'var(--c-input)', borderRadius: 4, padding: '1px 7px',
                }}>{opt.example}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 씬 헤더 형식 탭 */}
      {tab === 'header' && (
        <div>
          <div className="text-xs mb-3" style={{ color: 'var(--c-text5)', lineHeight: 1.6 }}>
            씬리스트와 대본 씬 헤더의 장소·시간대 구분 방식을 설정합니다.<br />
            <span style={{ color: 'var(--c-accent2)' }}>씬리스트 자동감지 시 이 형식을 기준으로 파싱됩니다.</span><br />
            씬번호 줄에서 스페이스를 두 번 누르면 구분자가 순서대로 자동 입력됩니다.
          </div>

          {/* 미리보기 */}
          <div style={{ marginBottom: 14, padding: '7px 12px', borderRadius: 6, background: 'var(--c-input)', border: '1px solid var(--c-border3)', fontSize: 13, fontWeight: 600, color: 'var(--c-accent)', letterSpacing: '0.01em' }}>
            {previewFormat(sceneFormat) || <span style={{ color: 'var(--c-text6)', fontWeight: 400 }}>미리보기</span>}
          </div>

          {/* 장소↔세부장소 구분자 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--c-text5)', marginBottom: 5 }}>장소 ↔ 세부장소 구분자</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {LOC_SEP_PRESETS.map(opt => (
                <label key={opt.value} style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '6px 10px', borderRadius: 6,
                  border: `1px solid ${sceneFormat.locSep === opt.value ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                  background: sceneFormat.locSep === opt.value ? 'color-mix(in srgb, var(--c-accent) 8%, transparent)' : 'transparent',
                }}>
                  <input type="radio" name="locSep" value={opt.value}
                    checked={sceneFormat.locSep === opt.value}
                    onChange={() => handleSceneFormat({ locSep: opt.value })}
                    style={{ accentColor: 'var(--c-accent)', cursor: 'pointer' }} />
                  <span style={{ fontSize: 12, color: 'var(--c-text)', flex: 1 }}>{opt.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--c-text5)', fontFamily: 'monospace' }}>{opt.example}</span>
                </label>
              ))}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                padding: '6px 10px', borderRadius: 6,
                border: `1px solid ${isCustomLocSep(sceneFormat.locSep) ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                background: isCustomLocSep(sceneFormat.locSep) ? 'color-mix(in srgb, var(--c-accent) 8%, transparent)' : 'transparent',
              }}>
                <input type="radio" name="locSep" value="custom"
                  checked={isCustomLocSep(sceneFormat.locSep)}
                  onChange={() => handleSceneFormat({ locSep: customLocSepInput || ' ' })}
                  style={{ accentColor: 'var(--c-accent)', cursor: 'pointer' }} />
                <span style={{ fontSize: 12, color: 'var(--c-text)' }}>직접 입력</span>
                <input value={customLocSepInput}
                  onChange={e => {
                    const v = e.target.value;
                    setCustomLocSepInput(v);
                    if (isCustomLocSep(sceneFormat.locSep)) handleSceneFormat({ locSep: v || ' ' });
                  }}
                  onFocus={() => { if (!isCustomLocSep(sceneFormat.locSep)) handleSceneFormat({ locSep: customLocSepInput || ' ' }); }}
                  placeholder="구분자 입력"
                  style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '2px 7px', borderRadius: 4, background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-border3)', outline: 'none', fontFamily: 'monospace' }}
                />
              </label>
            </div>
          </div>

          {/* 시간대 표기 방식 */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--c-text5)', marginBottom: 5 }}>시간대 표기 방식</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {TIME_FMT_PRESETS.map(opt => (
                <label key={opt.value} style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '6px 10px', borderRadius: 6,
                  border: `1px solid ${sceneFormat.timeFmt === opt.value ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                  background: sceneFormat.timeFmt === opt.value ? 'color-mix(in srgb, var(--c-accent) 8%, transparent)' : 'transparent',
                }}>
                  <input type="radio" name="timeFmt" value={opt.value}
                    checked={sceneFormat.timeFmt === opt.value}
                    onChange={() => handleSceneFormat({ timeFmt: opt.value })}
                    style={{ accentColor: 'var(--c-accent)', cursor: 'pointer' }} />
                  <span style={{ fontSize: 12, color: 'var(--c-text)', flex: 1 }}>{opt.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--c-text5)', fontFamily: 'monospace' }}>{opt.example}</span>
                </label>
              ))}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                padding: '6px 10px', borderRadius: 6,
                border: `1px solid ${sceneFormat.timeFmt === 'custom' ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                background: sceneFormat.timeFmt === 'custom' ? 'color-mix(in srgb, var(--c-accent) 8%, transparent)' : 'transparent',
              }}>
                <input type="radio" name="timeFmt" value="custom"
                  checked={sceneFormat.timeFmt === 'custom'}
                  onChange={() => handleSceneFormat({ timeFmt: 'custom', customTimeOpen: customTimeOpenInput ?? ' ', customTimeClose: customTimeCloseInput ?? '' })}
                  style={{ accentColor: 'var(--c-accent)', cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--c-text)', flexShrink: 0 }}>직접 입력</span>
                <input value={customTimeOpenInput}
                  onChange={e => {
                    const v = e.target.value;
                    setCustomTimeOpenInput(v);
                    if (sceneFormat.timeFmt === 'custom') handleSceneFormat({ timeFmt: 'custom', customTimeOpen: v, customTimeClose: customTimeCloseInput ?? '' });
                  }}
                  onFocus={() => { if (sceneFormat.timeFmt !== 'custom') handleSceneFormat({ timeFmt: 'custom', customTimeOpen: customTimeOpenInput ?? ' ', customTimeClose: customTimeCloseInput ?? '' }); }}
                  placeholder="앞"
                  style={{ width: 44, fontSize: 12, padding: '2px 6px', borderRadius: 4, background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-border3)', outline: 'none', fontFamily: 'monospace', textAlign: 'center' }}
                />
                <span style={{ fontSize: 11, color: 'var(--c-text5)', flexShrink: 0 }}>시간대</span>
                <input value={customTimeCloseInput}
                  onChange={e => {
                    const v = e.target.value;
                    setCustomTimeCloseInput(v);
                    if (sceneFormat.timeFmt === 'custom') handleSceneFormat({ timeFmt: 'custom', customTimeOpen: customTimeOpenInput ?? ' ', customTimeClose: v });
                  }}
                  onFocus={() => { if (sceneFormat.timeFmt !== 'custom') handleSceneFormat({ timeFmt: 'custom', customTimeOpen: customTimeOpenInput ?? ' ', customTimeClose: customTimeCloseInput ?? '' }); }}
                  placeholder="뒤"
                  style={{ width: 44, fontSize: 12, padding: '2px 6px', borderRadius: 4, background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-border3)', outline: 'none', fontFamily: 'monospace', textAlign: 'center' }}
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
