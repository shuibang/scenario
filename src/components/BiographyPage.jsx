import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { charDisplayName, charFullName } from './CharacterPanel';
import { genId, now } from '../store/db';

const ROLE_LABELS = { lead: '주인공', support: '조연', extra: '단역' };

// ─── BiographyPage — 인물이력서 ────────────────────────────────────────────────
// 인물별 자유형식 이력서 (추가 필드 + 타임라인 형식)
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

  // biographyItems: [{id, year, event}] stored in char.biographyItems
  const items = char?.biographyItems || [];

  const updateChar = (patch) => dispatch({ type: 'UPDATE_CHARACTER', payload: { id: selectedId, ...patch } });

  const addItem = () => {
    const newItems = [...items, { id: genId(), year: '', event: '' }];
    updateChar({ biographyItems: newItems });
  };

  const updateItem = (id, field, val) => {
    updateChar({ biographyItems: items.map(it => it.id === id ? { ...it, [field]: val } : it) });
  };

  const removeItem = (id) => updateChar({ biographyItems: items.filter(it => it.id !== id) });

  if (!activeProjectId) return null;

  const inputStyle = {
    background: 'var(--c-input)', color: 'var(--c-text)',
    border: '1px solid var(--c-border3)', borderRadius: '0.375rem',
    outline: 'none', padding: '0.25rem 0.5rem', fontSize: '0.875rem',
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
              <div style={{ position: 'absolute', top: '20px', left: 0, zIndex: 200, background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '10px 14px', width: 220, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--c-text3)' }}>인물이력서 안내</div>
                {['인물의 외형·성격·배경을 자유롭게 기록하세요.', '이력서 내용은 출력물에 포함되지 않습니다.'].map((t, i) => (
                  <div key={i} className="text-[11px] leading-relaxed" style={{ color: 'var(--c-text5)' }}>· {t}</div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1 space-y-0.5" style={{ paddingLeft: 6, paddingRight: 4 }}>
          {projectChars.map(c => {
            const isSelected = selectedId === c.id;
            const roleColor = { lead: 'var(--c-accent)', support: 'var(--c-accent2)', extra: 'var(--c-text5)' }[c.role] || 'var(--c-text5)';
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
                <div className="text-[10px] truncate" style={{ color: roleColor }}>{ROLE_LABELS[c.role] || ''}</div>
              </div>
            );
          })}
          {projectChars.length === 0 && (
            <div className="text-[10px] text-center py-4" style={{ color: 'var(--c-text6)' }}>인물 없음</div>
          )}
        </div>
      </div>

      {/* Right: biography editor */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 10 }}>
        {!char ? (
          <div className="text-center py-16 text-sm" style={{ color: 'var(--c-text5)' }}>인물을 선택하세요</div>
        ) : (
          <>
            <div className="mb-6">
              <div className="text-lg font-bold mb-1.5" style={{ color: 'var(--c-text)' }}>{charFullName(char) || charDisplayName(char)}</div>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--c-text5)' }}>인물이 살아온 일생을 떠올리며 주요 사건과 감정을 기록해보세요.</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {items.map(it => (
                <div key={it.id} className="flex gap-2 items-start">
                  <input value={it.year} onChange={e => updateItem(it.id, 'year', e.target.value)}
                    placeholder="연도/시기" style={{ ...inputStyle, width: '7em', flexShrink: 0 }} />
                  <input value={it.event} onChange={e => updateItem(it.id, 'event', e.target.value)}
                    placeholder="사건 / 이력" style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={() => removeItem(it.id)} className="text-xs mt-0.5 shrink-0"
                    style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </div>

            <button onClick={addItem} className="mt-4 w-full py-2 rounded text-sm"
              style={{ color: 'var(--c-text4)', border: '1px dashed var(--c-border3)', background: 'transparent', cursor: 'pointer' }}>
              + 항목 추가
            </button>
          </>
        )}
      </div>
    </div>
  );
}
