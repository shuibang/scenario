import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useApp } from '../store/AppContext';
import { charDisplayName, charFullName, getRoleColor, getRoleLabel, getCharRoles } from './CharacterPanel';
import { genId } from '../store/db';

// Auto-grow textarea — height matches content (no scrollbar)
// box-sizing: border-box 가정 — scrollHeight(=padding+content)에 border(2px) 보정
function AutoTextarea({ value, onChange, placeholder }) {
  const ref = useRef(null);
  const adjust = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight + 2) + 'px';
  };
  useLayoutEffect(adjust, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      style={{
        background: 'var(--c-input)', color: 'var(--c-text)',
        border: '1px solid var(--c-border3)', borderRadius: '0.375rem',
        outline: 'none', width: '100%',
        padding: '0.5rem 0.75rem', fontSize: '0.875rem',
        lineHeight: 1.6, fontFamily: 'inherit',
        boxSizing: 'border-box',
        resize: 'none', overflow: 'hidden',
      }}
    />
  );
}

// ─── BiographyPage — 인물이력서 ────────────────────────────────────────────────
// 두 섹션 구조: 특성(자유 라벨 + 멀티라인) / 시기별 이력(period + 멀티라인 + ↑↓ 순서)
export default function BiographyPage() {
  const { state, dispatch } = useApp();
  const { characters, activeProjectId } = state;

  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef(null);
  useEffect(() => {
    if (!helpOpen) return;
    const handler = (e) => { if (!helpRef.current?.contains(e.target)) setHelpOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [helpOpen]);

  const projectChars = characters.filter(c => c.projectId === activeProjectId)
    .sort((a, b) => { const o = { lead: 0, support: 1, extra: 2 }; return (o[a.role] ?? 3) - (o[b.role] ?? 3); });

  const [selectedId, setSelectedId] = useState(projectChars[0]?.id || null);
  const char = projectChars.find(c => c.id === selectedId);

  // Read with backward-compat: legacy {year, event} → {period, content}
  const traits = char?.bioTraits || [];
  const items  = (char?.biographyItems || []).map(it => ({
    id:      it.id,
    period:  it.period  ?? it.year  ?? '',
    content: it.content ?? it.event ?? '',
  }));

  const updateChar = (patch) => dispatch({ type: 'UPDATE_CHARACTER', payload: { id: selectedId, ...patch } });

  // Traits CRUD
  const addTrait    = () => updateChar({ bioTraits: [...traits, { id: genId(), label: '', content: '' }] });
  const updateTrait = (id, field, val) => updateChar({ bioTraits: traits.map(t => t.id === id ? { ...t, [field]: val } : t) });
  const removeTrait = (id) => updateChar({ bioTraits: traits.filter(t => t.id !== id) });

  // Items CRUD (write new keys; old keys dropped on next write — read-side fallback covers untouched data)
  const writeItems = (next) => updateChar({ biographyItems: next });
  const addItem    = () => writeItems([...items, { id: genId(), period: '', content: '' }]);
  const updateItem = (id, field, val) => writeItems(items.map(it => it.id === id ? { ...it, [field]: val } : it));
  const removeItem = (id) => writeItems(items.filter(it => it.id !== id));
  const moveItem   = (id, dir) => {
    const idx = items.findIndex(it => it.id === id);
    const tgt = idx + dir;
    if (idx < 0 || tgt < 0 || tgt >= items.length) return;
    const next = [...items];
    [next[idx], next[tgt]] = [next[tgt], next[idx]];
    writeItems(next);
  };

  if (!activeProjectId) return null;

  // textarea와 동일한 padding/lineHeight/box-sizing — 좌우 배치 시 baseline 일치
  const inputStyle = {
    background: 'var(--c-input)', color: 'var(--c-text)',
    border: '1px solid var(--c-border3)', borderRadius: '0.375rem',
    outline: 'none',
    padding: '0.5rem 0.75rem', fontSize: '0.875rem',
    lineHeight: 1.6, fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const iconBtn = (disabled, danger) => ({
    width: 24, height: 24, borderRadius: 4,
    border: '1px solid var(--c-border3)', background: 'transparent',
    color: danger ? '#f87171' : (disabled ? 'var(--c-text6)' : 'var(--c-text4)'),
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 12, lineHeight: 1, padding: 0, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: disabled ? 0.4 : 1,
  });

  const sectionLabel = {
    fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
    color: 'var(--c-text5)', textTransform: 'uppercase',
    marginBottom: 10,
  };

  const addBtnStyle = {
    marginTop: 12, width: '100%', padding: '8px 0', borderRadius: 4,
    color: 'var(--c-text4)', border: '1px dashed var(--c-border3)',
    background: 'transparent', cursor: 'pointer', fontSize: 13,
  };

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--c-bg)' }}>
      {/* Left: char index — same style as CharacterPanel */}
      <div className="flex flex-col shrink-0" style={{ width: 110, borderRight: '1px solid var(--c-border2)' }}>
        <div className="shrink-0" style={{ padding: '8px 8px 6px', borderBottom: '1px solid var(--c-border2)' }}>
          <span className="text-xs" style={{ color: 'var(--c-text5)' }}>인물이력서</span>
          <div ref={helpRef} style={{ position: 'relative', display: 'inline-flex' }}>
            <button onClick={() => setHelpOpen(v => !v)} title="도움말" style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--c-border3)', background: helpOpen ? 'var(--c-active)' : 'transparent', color: 'var(--c-text5)', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}>?</button>
            {helpOpen && (
              <div style={{ position: 'absolute', top: '20px', left: 0, zIndex: 200, background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '10px 14px', width: 240, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--c-text3)' }}>인물이력서 안내</div>
                {['특성에 성격·말투·습관 등을 자유롭게 기록하세요.', '시기별 이력은 ↑↓ 으로 순서를 바꿀 수 있어요.', '이력서 내용은 출력에도 포함됩니다.'].map((t, i) => (
                  <div key={i} className="text-[11px] leading-relaxed" style={{ color: 'var(--c-text5)' }}>· {t}</div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1 space-y-0.5" style={{ paddingLeft: 6, paddingRight: 4 }}>
          {projectChars.map(c => {
            const isSelected = selectedId === c.id;
            const roles = getCharRoles(c);
            const primaryRole = roles[0];
            const extraRoleCount = Math.max(0, roles.length - 1);
            return (
              <div
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="px-2 py-2 rounded cursor-pointer"
                style={{
                  background: isSelected ? 'var(--c-active)' : 'transparent',
                  borderLeft: `2px solid ${isSelected ? 'var(--c-accent)' : 'transparent'}`,
                }}
              >
                <div className="text-sm font-medium truncate" style={{ color: isSelected ? 'var(--c-text)' : 'var(--c-text3)' }}>
                  {charFullName(c) || charDisplayName(c)}
                </div>
                {primaryRole && (
                  <div className="text-[10px] truncate" style={{ color: getRoleColor(primaryRole) }}>
                    {getRoleLabel(primaryRole)}
                    {extraRoleCount > 0 && <span style={{ color: 'var(--c-text6)', marginLeft: 4 }}>+{extraRoleCount}</span>}
                  </div>
                )}
              </div>
            );
          })}
          {projectChars.length === 0 && (
            <div className="text-[10px] text-center py-4" style={{ color: 'var(--c-text6)' }}>인물 없음</div>
          )}
        </div>
      </div>

      {/* Right: editor */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 12 }}>
        {!char ? (
          <div className="text-center py-16 text-sm" style={{ color: 'var(--c-text5)' }}>인물을 선택하세요</div>
        ) : (
          <>
            <div className="mb-6">
              <div className="text-lg font-bold mb-1.5" style={{ color: 'var(--c-text)' }}>{charFullName(char) || charDisplayName(char)}</div>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--c-text5)' }}>인물이 살아온 일생을 떠올리며 주요 사건과 감정을 기록해보세요.</div>
            </div>

            {/* ─── 특성 ─── */}
            <div style={{ marginBottom: 28 }}>
              <div style={sectionLabel}>특성</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {traits.map(t => (
                  <div key={t.id} className="flex flex-wrap md:flex-nowrap items-start gap-2 md:gap-3">
                    <input
                      value={t.label}
                      onChange={e => updateTrait(t.id, 'label', e.target.value)}
                      placeholder="성격, 특징, 말투…"
                      className="flex-1 md:flex-none md:w-[150px] md:order-1"
                      style={inputStyle}
                    />
                    <div className="w-full md:w-auto md:flex-1 order-3 md:order-2">
                      <AutoTextarea
                        value={t.content}
                        onChange={v => updateTrait(t.id, 'content', v)}
                        placeholder="자유롭게 기록하세요"
                      />
                    </div>
                    <div className="flex gap-1 order-2 md:order-3 md:shrink-0">
                      <button onClick={() => removeTrait(t.id)} title="삭제" style={iconBtn(false, true)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={addTrait} style={addBtnStyle}>+ 특성 항목 추가</button>
            </div>

            {/* ─── 시기별 이력 ─── */}
            <div>
              <div style={sectionLabel}>시기별 이력</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((it, i) => {
                  const upDisabled   = i === 0;
                  const downDisabled = i === items.length - 1;
                  return (
                    <div key={it.id} className="flex flex-wrap md:flex-nowrap items-start gap-2 md:gap-3">
                      <input
                        value={it.period}
                        onChange={e => updateItem(it.id, 'period', e.target.value)}
                        placeholder="연도/시기"
                        className="flex-1 md:flex-none md:w-[150px] md:order-1"
                        style={inputStyle}
                      />
                      <div className="w-full md:w-auto md:flex-1 order-3 md:order-2">
                        <AutoTextarea
                          value={it.content}
                          onChange={v => updateItem(it.id, 'content', v)}
                          placeholder="이 시기의 사건·감정·관계 변화를 자유롭게"
                        />
                      </div>
                      <div className="flex gap-1 order-2 md:order-3 md:shrink-0">
                        <button onClick={() => moveItem(it.id, -1)} disabled={upDisabled}   title="위로"   style={iconBtn(upDisabled, false)}>↑</button>
                        <button onClick={() => moveItem(it.id, +1)} disabled={downDisabled} title="아래로" style={iconBtn(downDisabled, false)}>↓</button>
                        <button onClick={() => removeItem(it.id)} title="삭제" style={iconBtn(false, true)}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={addItem} style={addBtnStyle}>+ 시기 추가</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
