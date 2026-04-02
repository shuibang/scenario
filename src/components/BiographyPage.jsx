import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { charDisplayName, charFullName } from './CharacterPanel';
import { genId, now } from '../store/db';

// ─── BiographyPage — 인물이력서 ────────────────────────────────────────────────
// 인물별 자유형식 이력서 (추가 필드 + 타임라인 형식)
export default function BiographyPage() {
  const { state, dispatch } = useApp();
  const { characters, activeProjectId } = state;

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
      {/* Left: char list — 20% */}
      <div className="shrink-0 overflow-y-auto py-2" style={{ width: '20%', borderRight: '1px solid var(--c-border)', background: 'var(--c-panel)' }}>
        <div className="px-3 py-2 text-[10px] uppercase tracking-widest" style={{ color: 'var(--c-text6)' }}>인물</div>
        {projectChars.map(c => (
          <div
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className="px-3 py-2 cursor-pointer text-sm truncate"
            style={{
              background: selectedId === c.id ? 'var(--c-active)' : 'transparent',
              color: selectedId === c.id ? 'var(--c-accent)' : 'var(--c-text4)',
            }}
            onMouseEnter={e => { if (selectedId !== c.id) e.currentTarget.style.background = 'var(--c-hover)'; }}
            onMouseLeave={e => { if (selectedId !== c.id) e.currentTarget.style.background = 'transparent'; }}
          >
            {charDisplayName(c)}
          </div>
        ))}
        {projectChars.length === 0 && (
          <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--c-text6)' }}>인물 없음</div>
        )}
      </div>

      {/* Right: biography editor */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 10 }}>
        {!char ? (
          <div className="text-center py-16 text-sm" style={{ color: 'var(--c-text5)' }}>인물을 선택하세요</div>
        ) : (
          <>
            <div className="mb-6">
              <div className="text-lg font-bold mb-0.5" style={{ color: 'var(--c-text)' }}>{charFullName(char) || charDisplayName(char)}</div>
              <div className="text-xs" style={{ color: 'var(--c-text5)' }}>인물이력서</div>
            </div>

            <div className="space-y-2">
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
