import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { genId, now } from '../store/db';

const ROLE_LABELS = { lead: '주인공', support: '조연', extra: '단역' };

// ─── Compat helpers ────────────────────────────────────────────────────────────
// Read the "given name / 호칭" used for script display
export function charDisplayName(char) {
  return char.givenName || char.name || '';
}
// Read the full name for listings
export function charFullName(char) {
  if (char.surname || char.givenName) {
    return [char.surname, char.givenName].filter(Boolean).join('');
  }
  return char.name || '';
}
// Read occupation (new) or job (old)
function charOccupation(char) { return char.occupation ?? char.job ?? ''; }
// Read intro (new) or description (old)
function charIntro(char) { return char.intro ?? char.description ?? ''; }
// Read extraFields (new) or customFields (old)
function charExtraFields(char) { return char.extraFields ?? char.customFields ?? []; }

// ─── Migrate existing char → form initial values ───────────────────────────────
function charToForm(char) {
  if (char) {
    return {
      surname:     char.surname     ?? '',
      givenName:   char.givenName   ?? char.name ?? '',
      gender:      char.gender      ?? '',
      age:         char.age         ?? '',
      occupation:  charOccupation(char),
      role:        char.role        ?? 'lead',
      intro:       charIntro(char),
      extraFields: charExtraFields(char),
    };
  }
  return { surname: '', givenName: '', gender: '', age: '', occupation: '', role: 'lead', intro: '', extraFields: [] };
}

// ─── CharacterForm ─────────────────────────────────────────────────────────────
function CharacterForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(() => charToForm(initial));
  const f = (field, val) => setForm(p => ({ ...p, [field]: val }));

  const addExtraField = () => {
    setForm(p => ({ ...p, extraFields: [...(p.extraFields || []), { id: genId(), label: '항목명', value: '' }] }));
  };
  const updateExtra = (id, key, val) => {
    setForm(p => ({ ...p, extraFields: (p.extraFields || []).map(cf => cf.id === id ? { ...cf, [key]: val } : cf) }));
  };
  const removeExtra = (id) => {
    setForm(p => ({ ...p, extraFields: (p.extraFields || []).filter(cf => cf.id !== id) }));
  };

  const inputStyle = {
    background: 'var(--c-input)',
    color: 'var(--c-text)',
    border: '1px solid var(--c-border3)',
    borderRadius: '0.375rem',
    outline: 'none',
    width: '100%',
    fontSize: '0.875rem',
    padding: '0.375rem 0.75rem',
  };

  const canSave = form.givenName.trim() || form.surname.trim();

  const handleSave = () => {
    if (!canSave) return;
    const fullName = [form.surname, form.givenName].filter(Boolean).join('') || form.givenName;
    onSave({
      ...form,
      // keep `name` for backward compat with script block charName lookups
      name: fullName,
    });
  };

  return (
    <div className="rounded-lg p-4 space-y-3" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      {/* Row 1: 성 + 이름/호칭 + 비중 */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>성</label>
          <input value={form.surname} onChange={e => f('surname', e.target.value)}
            onKeyDown={e => e.key === 'Escape' && onCancel()} style={inputStyle} placeholder="홍" />
        </div>
        <div>
          <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>이름 / 호칭 *</label>
          <input autoFocus value={form.givenName} onChange={e => f('givenName', e.target.value)}
            onKeyDown={e => e.key === 'Escape' && onCancel()} style={inputStyle} placeholder="길동" />
        </div>
        <div>
          <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>비중</label>
          <select value={form.role} onChange={e => f('role', e.target.value)} style={inputStyle}>
            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      {/* Row 2: 성별 + 나이 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>성별</label>
          <input value={form.gender} onChange={e => f('gender', e.target.value)} style={inputStyle} placeholder="남 / 여" />
        </div>
        <div>
          <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>나이</label>
          <input value={form.age} onChange={e => f('age', e.target.value)} style={inputStyle} placeholder="30대 초반 / 32" />
        </div>
      </div>
      {/* Row 3: 직업 */}
      <div>
        <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>직업</label>
        <input value={form.occupation} onChange={e => f('occupation', e.target.value)} style={inputStyle} placeholder="형사 / 배우 / 학생" />
      </div>
      {/* Row 4: 인물소개 */}
      <div>
        <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>인물소개</label>
        <textarea value={form.intro} onChange={e => f('intro', e.target.value)}
          rows={3} style={{ ...inputStyle, resize: 'none' }} placeholder="성격, 배경, 특징 등" />
      </div>

      {/* Extra fields */}
      {(form.extraFields || []).map(cf => (
        <div key={cf.id} className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <input value={cf.label} onChange={e => updateExtra(cf.id, 'label', e.target.value)}
              className="text-[10px] bg-transparent outline-none" style={{ color: 'var(--c-text5)', borderBottom: '1px solid var(--c-border3)', width: '100%' }} />
            <input value={cf.value} onChange={e => updateExtra(cf.id, 'value', e.target.value)} style={{ ...inputStyle, fontSize: '0.8rem' }} placeholder="내용" />
          </div>
          <button onClick={() => removeExtra(cf.id)} className="mt-5 w-6 h-6 rounded text-sm flex items-center justify-center shrink-0"
            style={{ color: 'var(--c-text5)', border: '1px solid var(--c-border3)', background: 'transparent' }}>−</button>
        </div>
      ))}
      <button onClick={addExtraField} className="w-full py-1.5 rounded text-xs"
        style={{ color: 'var(--c-text4)', border: '1px dashed var(--c-border3)', background: 'transparent', cursor: 'pointer' }}>
        + 추가 항목
      </button>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded" style={{ color: 'var(--c-text4)', border: '1px solid var(--c-border3)', background: 'transparent' }}>취소</button>
        <button onClick={handleSave} disabled={!canSave}
          className="px-3 py-1.5 text-sm rounded text-white"
          style={{ background: 'var(--c-accent)', opacity: canSave ? 1 : 0.4, cursor: canSave ? 'pointer' : 'not-allowed' }}>저장</button>
      </div>
    </div>
  );
}

// ─── CharacterUsage ────────────────────────────────────────────────────────────
function CharacterUsage({ char, episodes, scenes, scriptBlocks }) {
  const name = charDisplayName(char);
  const fullName = charFullName(char);

  const dialogueBlocks = scriptBlocks.filter(b =>
    b.type === 'dialogue' &&
    b.charName && (b.charName === name || b.charName === fullName)
  );
  const appearedEpIds = [...new Set(dialogueBlocks.map(b => b.episodeId).filter(Boolean))];
  const appearedSceneIds = [...new Set(
    scenes.filter(s => (s.characterIds || []).includes(char.id)).map(s => s.episodeId)
  )];
  const allEpIds = [...new Set([...appearedEpIds, ...appearedSceneIds])];

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--c-border)' }}>
      <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--c-text6)' }}>인물 현황</div>
      <div className="flex flex-wrap gap-3 text-xs">
        <span style={{ color: 'var(--c-text4)' }}>
          대사 <span style={{ color: 'var(--c-accent)', fontWeight: 600 }}>{dialogueBlocks.length}</span>개
        </span>
        <span style={{ color: 'var(--c-text4)' }}>
          등장 회차 <span style={{ color: 'var(--c-accent)', fontWeight: 600 }}>{allEpIds.length}</span>개
        </span>
      </div>
      {allEpIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {allEpIds.map(epId => {
            const ep = episodes.find(e => e.id === epId);
            if (!ep) return null;
            return (
              <span key={epId} className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: 'var(--c-tag)', color: 'var(--c-accent2)' }}>
                {ep.number}회{ep.title ? ' ' + ep.title : ''}
              </span>
            );
          })}
        </div>
      )}
      {allEpIds.length === 0 && (
        <div className="text-[10px] mt-1" style={{ color: 'var(--c-text6)' }}>등장 기록 없음</div>
      )}
    </div>
  );
}

// ─── CharacterCard ─────────────────────────────────────────────────────────────
function CharacterCard({ char, isSelected, onSelect, onEdit, onDelete, episodes, scenes, scriptBlocks }) {
  const [confirm, setConfirm] = useState(false);

  const roleColor = { lead: 'var(--c-accent)', support: 'var(--c-accent2)', extra: 'var(--c-text5)' }[char.role] || 'var(--c-text5)';
  const fullName = charFullName(char);
  const displayName = charDisplayName(char);
  const occupation = charOccupation(char);
  const intro = charIntro(char);
  const extraFields = charExtraFields(char);

  return (
    <div
      className="rounded-lg p-4 group cursor-pointer transition-all"
      style={{
        background: isSelected ? 'var(--c-active)' : 'var(--c-card)',
        border: `1px solid ${isSelected ? 'var(--c-accent)' : 'var(--c-border)'}`,
      }}
      onClick={() => onSelect(char.id)}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--c-border2)'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--c-border)'; }}
    >
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-baseline gap-2">
          {/* Full name (성+이름) in listing; if only givenName, show that */}
          <span className="font-semibold text-base" style={{ color: 'var(--c-text)' }}>{fullName || displayName}</span>
          {/* Show givenName badge if different from full name (i.e. has surname) */}
          {char.surname && char.givenName && (
            <span className="text-[10px] px-1 rounded" style={{ background: 'var(--c-tag)', color: 'var(--c-text5)' }}>호칭: {char.givenName}</span>
          )}
          {char.age && <span className="text-xs" style={{ color: 'var(--c-text5)' }}>{char.age}</span>}
          {char.gender && <span className="text-xs" style={{ color: 'var(--c-text5)' }}>{char.gender}</span>}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={e => { e.stopPropagation(); onEdit(char); }} className="p-1 text-xs" style={{ color: 'var(--c-text4)' }}>편집</button>
          {confirm ? (
            <span className="flex items-center gap-1">
              <button onClick={e => { e.stopPropagation(); onDelete(char.id); }} className="text-xs" style={{ color: '#f87171' }}>확인</button>
              <button onClick={e => { e.stopPropagation(); setConfirm(false); }} className="text-xs" style={{ color: 'var(--c-text5)' }}>취소</button>
            </span>
          ) : (
            <button onClick={e => { e.stopPropagation(); setConfirm(true); }} className="p-1 text-xs" style={{ color: 'var(--c-text5)' }}>삭제</button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium" style={{ color: roleColor }}>{ROLE_LABELS[char.role] || char.role}</span>
        {occupation && <span className="text-xs" style={{ color: 'var(--c-text5)' }}>· {occupation}</span>}
      </div>

      {intro && (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text4)' }}>{intro}</p>
      )}

      {/* Extra fields preview */}
      {extraFields.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {extraFields.map(cf => cf.value ? (
            <div key={cf.id} className="text-xs" style={{ color: 'var(--c-text5)' }}>
              <span style={{ color: 'var(--c-text6)' }}>{cf.label}: </span>{cf.value}
            </div>
          ) : null)}
        </div>
      )}

      {isSelected && (
        window.innerWidth < 768
          ? <div className="mt-2 text-[10px]" style={{ color: 'var(--c-text5)' }}>인물 현황은 데스크톱에서 확인하세요</div>
          : <CharacterUsage char={char} episodes={episodes} scenes={scenes} scriptBlocks={scriptBlocks} />
      )}
    </div>
  );
}

// ─── CharacterPanel ────────────────────────────────────────────────────────────
export default function CharacterPanel() {
  const { state, dispatch } = useApp();
  const { activeProjectId, characters, selectedCharacterId, episodes, scenes, scriptBlocks } = state;

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');

  const projectChars = characters
    .filter(c => c.projectId === activeProjectId)
    .sort((a, b) => {
      const order = { lead: 0, support: 1, extra: 2 };
      return (order[a.role] ?? 3) - (order[b.role] ?? 3);
    });

  const filtered = search
    ? projectChars.filter(c => {
        const full = charFullName(c);
        const occ  = charOccupation(c);
        const intr = charIntro(c);
        return full.includes(search) || intr.includes(search) || occ.includes(search);
      })
    : projectChars;

  const handleAdd = (form) => {
    const char = { id: genId(), projectId: activeProjectId, ...form, createdAt: now() };
    dispatch({ type: 'ADD_CHARACTER', payload: char });
    setAdding(false);
  };

  const handleEdit = (form) => {
    dispatch({ type: 'UPDATE_CHARACTER', payload: { id: editingId, ...form } });
    setEditingId(null);
  };

  const handleSelect = (charId) => {
    dispatch({ type: 'SET_SELECTED_CHARACTER', id: charId === selectedCharacterId ? null : charId });
  };

  if (!activeProjectId) return null;

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ background: 'var(--c-bg)' }}>
      <div className="px-6 py-3 flex items-center gap-3 shrink-0" style={{ borderBottom: '1px solid var(--c-border2)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--c-text2)' }}>인물 ({projectChars.length})</span>
        <div className="flex-1">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="이름 검색"
            className="w-full text-xs px-2 py-1 rounded outline-none t-input-field"
            style={{ border: '1px solid var(--c-border3)' }} />
        </div>
        <button onClick={() => { setAdding(true); setEditingId(null); }}
          className="px-3 py-1 text-sm rounded text-white" style={{ background: 'var(--c-accent)' }}>
          + 인물 추가
        </button>
      </div>


      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {adding && <CharacterForm onSave={handleAdd} onCancel={() => setAdding(false)} />}
        {filtered.map(char =>
          editingId === char.id ? (
            <CharacterForm key={char.id} initial={char} onSave={handleEdit} onCancel={() => setEditingId(null)} />
          ) : (
            <CharacterCard
              key={char.id}
              char={char}
              isSelected={selectedCharacterId === char.id}
              onSelect={handleSelect}
              onEdit={c => { setEditingId(c.id); setAdding(false); }}
              onDelete={id => dispatch({ type: 'DELETE_CHARACTER', id })}
              episodes={episodes.filter(e => e.projectId === activeProjectId)}
              scenes={scenes.filter(s => s.projectId === activeProjectId)}
              scriptBlocks={scriptBlocks.filter(b => b.projectId === activeProjectId)}
            />
          )
        )}
        {filtered.length === 0 && !adding && (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--c-text5)' }}>
            {search ? '검색 결과 없음' : '등록된 인물이 없습니다'}
          </div>
        )}
      </div>

    </div>
  );
}
