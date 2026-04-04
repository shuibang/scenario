import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { genId, now } from '../store/db';

const ROLE_LABELS = { lead: '주인공', support: '조연', extra: '단역' };

// ─── Compat helpers ────────────────────────────────────────────────────────────
export function charDisplayName(char) {
  return char.givenName || char.name || '';
}
export function charFullName(char) {
  if (char.surname || char.givenName) {
    return [char.surname, char.givenName].filter(Boolean).join('');
  }
  return char.name || '';
}
function charOccupation(char) { return char.occupation ?? char.job ?? ''; }
function charIntro(char) { return char.intro ?? char.description ?? ''; }
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
    onSave({ ...form, name: fullName });
  };

  return (
    <div className="rounded-lg p-4 space-y-3" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
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
      <div>
        <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>직업</label>
        <input value={form.occupation} onChange={e => f('occupation', e.target.value)} style={inputStyle} placeholder="형사 / 배우 / 학생" />
      </div>
      <div>
        <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>인물소개</label>
        <textarea value={form.intro} onChange={e => f('intro', e.target.value)}
          rows={3} style={{ ...inputStyle, resize: 'none' }} placeholder="성격, 배경, 특징 등" />
      </div>

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

  // Dialogue blocks for this character
  const dialogueBlocks = scriptBlocks.filter(b =>
    b.type === 'dialogue' &&
    b.charName && (b.charName === name || b.charName === fullName)
  );

  // Scene number blocks (for label lookup)
  const sceneNumberBlocks = scriptBlocks.filter(b => b.type === 'scene_number');

  // Scenes where character appears via characterIds
  const appearedScenes = scenes.filter(s => (s.characterIds || []).includes(char.id));

  // Build dialogue list: group by episode
  const dialoguesByEp = {};
  for (const b of dialogueBlocks) {
    const epId = b.episodeId || '__none__';
    if (!dialoguesByEp[epId]) dialoguesByEp[epId] = [];
    dialoguesByEp[epId].push(b);
  }

  const epMap = {};
  for (const ep of episodes) epMap[ep.id] = ep;

  const sceneBlockMap = {};
  for (const b of sceneNumberBlocks) {
    if (b.sceneId) sceneBlockMap[b.sceneId] = b;
  }

  const sceneObjMap = {};
  for (const s of scenes) sceneObjMap[s.id] = s;

  const hasDialogues = dialogueBlocks.length > 0;
  const hasScenes = appearedScenes.length > 0;

  if (!hasDialogues && !hasScenes) {
    return (
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--c-border)' }}>
        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--c-text6)' }}>인물 현황</div>
        <div className="text-[10px]" style={{ color: 'var(--c-text6)' }}>등장 기록 없음</div>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 space-y-4" style={{ borderTop: '1px solid var(--c-border)' }}>
      <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--c-text6)' }}>인물 현황</div>

      {/* Dialogues */}
      {hasDialogues && (
        <div>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--c-text4)' }}>
            대사 <span style={{ color: 'var(--c-accent)' }}>{dialogueBlocks.length}</span>개
          </div>
          <div className="space-y-3">
            {Object.entries(dialoguesByEp).map(([epId, blocks]) => {
              const ep = epId !== '__none__' ? epMap[epId] : null;
              return (
                <div key={epId}>
                  {ep && (
                    <div className="text-[10px] mb-1 font-medium" style={{ color: 'var(--c-accent2)' }}>
                      {ep.number}회{ep.title ? ' ' + ep.title : ''}
                    </div>
                  )}
                  <div className="space-y-1">
                    {blocks.map(b => {
                      const sceneBlock = b.sceneId ? sceneBlockMap[b.sceneId] : null;
                      const sceneLabel = sceneBlock
                        ? ((sceneBlock.label || '') + ' ' + (sceneBlock.content || '').replace(/^S#\d+\.?\s*/i, '')).trim()
                        : '';
                      const text = (b.content || '').trim();
                      return (
                        <div key={b.id} className="text-xs rounded px-3 py-2"
                          style={{ background: 'var(--c-tag)', borderLeft: '2px solid var(--c-accent)' }}>
                          {sceneLabel && (
                            <div className="text-[10px] mb-0.5" style={{ color: 'var(--c-text5)' }}>{sceneLabel.trim()}</div>
                          )}
                          <div style={{ color: 'var(--c-text3)' }}>
                            {text ? (text.length > 60 ? text.slice(0, 60) + '…' : text) : <span style={{ color: 'var(--c-text6)' }}>(내용 없음)</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Appeared scenes */}
      {hasScenes && (
        <div>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--c-text4)' }}>
            등장 씬 <span style={{ color: 'var(--c-accent)' }}>{appearedScenes.length}</span>개
          </div>
          <div className="space-y-1">
            {appearedScenes.map(s => {
              const ep = s.episodeId ? epMap[s.episodeId] : null;
              const sceneBlock = sceneNumberBlocks.find(b => b.sceneId === s.id);
              const label = sceneBlock
                ? ((sceneBlock.label || '') + ' ' + (sceneBlock.content || '').replace(/^S#\d+\.?\s*/i, '')).trim()
                : s.location || '';
              return (
                <div key={s.id} className="text-xs rounded px-3 py-2"
                  style={{ background: 'var(--c-tag)', borderLeft: '2px solid var(--c-accent2)' }}>
                  {ep && (
                    <span className="text-[10px] mr-1.5" style={{ color: 'var(--c-accent2)' }}>
                      {ep.number}회
                    </span>
                  )}
                  <span style={{ color: 'var(--c-text3)' }}>{label.trim()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CharacterIndexItem ────────────────────────────────────────────────────────
function CharacterIndexItem({ char, isSelected, onClick }) {
  const fullName = charFullName(char);
  const displayName = charDisplayName(char);
  const roleColor = { lead: 'var(--c-accent)', support: 'var(--c-accent2)', extra: 'var(--c-text5)' }[char.role] || 'var(--c-text5)';

  return (
    <div
      onClick={onClick}
      className="px-2 py-2 rounded cursor-pointer"
      style={{
        background: isSelected ? 'var(--c-active)' : 'transparent',
        borderLeft: `2px solid ${isSelected ? 'var(--c-accent)' : 'transparent'}`,
      }}
    >
      <div className="text-sm font-medium truncate" style={{ color: isSelected ? 'var(--c-text)' : 'var(--c-text3)' }}>
        {fullName || displayName}
      </div>
      <div className="text-[10px] truncate" style={{ color: roleColor }}>{ROLE_LABELS[char.role] || ''}</div>
    </div>
  );
}

// ─── CharacterDetail ───────────────────────────────────────────────────────────
function CharacterDetail({ char, onEdit, onDelete, episodes, scenes, scriptBlocks }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fullName = charFullName(char);
  const displayName = charDisplayName(char);
  const roleColor = { lead: 'var(--c-accent)', support: 'var(--c-accent2)', extra: 'var(--c-text5)' }[char.role] || 'var(--c-text5)';

  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--c-card)', border: '1px solid var(--c-accent)' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-base" style={{ color: 'var(--c-text)' }}>{fullName || displayName}</span>
          {char.surname && char.givenName && (
            <span className="text-[10px] px-1 rounded" style={{ background: 'var(--c-tag)', color: 'var(--c-text5)' }}>호칭: {char.givenName}</span>
          )}
          {char.age && <span className="text-xs" style={{ color: 'var(--c-text5)' }}>{char.age}</span>}
          {char.gender && <span className="text-xs" style={{ color: 'var(--c-text5)' }}>{char.gender}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="px-2 py-1 text-xs rounded"
            style={{ color: 'var(--c-text4)', border: '1px solid var(--c-border3)', background: 'transparent' }}>편집</button>
          {confirmDelete ? (
            <span className="flex items-center gap-1">
              <button onClick={onDelete} className="text-xs px-1" style={{ color: '#f87171' }}>확인</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs px-1" style={{ color: 'var(--c-text5)' }}>취소</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="px-2 py-1 text-xs rounded"
              style={{ color: 'var(--c-text5)', border: '1px solid var(--c-border3)', background: 'transparent' }}>삭제</button>
          )}
        </div>
      </div>

      {/* Role + occupation */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium" style={{ color: roleColor }}>{ROLE_LABELS[char.role] || char.role}</span>
        {charOccupation(char) && <span className="text-xs" style={{ color: 'var(--c-text5)' }}>· {charOccupation(char)}</span>}
      </div>

      {/* Intro */}
      {charIntro(char) && (
        <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--c-text4)' }}>{charIntro(char)}</p>
      )}

      {/* Extra fields */}
      {charExtraFields(char).length > 0 && (
        <div className="space-y-0.5 mb-2">
          {charExtraFields(char).map(cf => cf.value ? (
            <div key={cf.id} className="text-xs" style={{ color: 'var(--c-text5)' }}>
              <span style={{ color: 'var(--c-text6)' }}>{cf.label}: </span>{cf.value}
            </div>
          ) : null)}
        </div>
      )}

      <CharacterUsage char={char} episodes={episodes} scenes={scenes} scriptBlocks={scriptBlocks} />
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
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef(null);
  useEffect(() => {
    if (!helpOpen) return;
    const handler = (e) => { if (!helpRef.current?.contains(e.target)) setHelpOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [helpOpen]);

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
    setAdding(false);
    setEditingId(null);
    dispatch({ type: 'SET_SELECTED_CHARACTER', id: charId === selectedCharacterId ? null : charId });
  };

  if (!activeProjectId) return null;

  const selectedChar = selectedCharacterId ? projectChars.find(c => c.id === selectedCharacterId) : null;
  const epList    = episodes.filter(e => e.projectId === activeProjectId);
  const sceneList = scenes.filter(s => s.projectId === activeProjectId);
  const blockList = scriptBlocks.filter(b => b.projectId === activeProjectId);

  return (
    <div className="flex-1 min-h-0 flex" style={{ background: 'var(--c-bg)' }}>
      {/* ── Left: index column ── */}
      <div className="flex flex-col shrink-0" style={{ width: 110, borderRight: '1px solid var(--c-border2)' }}>
        {/* Title + Help */}
        <div className="shrink-0 flex items-center gap-1" style={{ padding: '6px 8px', borderBottom: '1px solid var(--c-border2)' }}>
          <span className="text-xs" style={{ color: 'var(--c-text5)' }}>인물</span>
          <div ref={helpRef} style={{ position: 'relative', display: 'inline-flex' }}>
            <button onClick={() => setHelpOpen(v => !v)} title="도움말" style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--c-border3)', background: helpOpen ? 'var(--c-active)' : 'transparent', color: 'var(--c-text5)', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}>?</button>
            {helpOpen && (
              <div style={{ position: 'absolute', top: '20px', left: 0, zIndex: 200, background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '10px 14px', width: 220, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--c-text3)' }}>인물 안내</div>
                {['인물을 추가하고 역할·직업·소개를 입력하세요.', '대사·등장 씬은 대본과 자동동기화 됩니다.'].map((t, i) => (
                  <div key={i} className="text-[11px] leading-relaxed" style={{ color: 'var(--c-text5)' }}>· {t}</div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Search */}
        <div className="shrink-0" style={{ padding: '8px 8px 6px', borderBottom: '1px solid var(--c-border2)' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="검색"
            className="w-full text-xs px-2 py-1 rounded outline-none t-input-field"
            style={{ border: '1px solid var(--c-border3)' }}
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-1 space-y-0.5" style={{ paddingLeft: 6, paddingRight: 4 }}>
          {filtered.map(char => (
            <CharacterIndexItem
              key={char.id}
              char={char}
              isSelected={!adding && !editingId && selectedCharacterId === char.id}
              onClick={() => handleSelect(char.id)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="text-[10px] text-center py-4" style={{ color: 'var(--c-text6)' }}>
              {search ? '없음' : '인물 없음'}
            </div>
          )}
        </div>

        {/* Add button */}
        <div className="shrink-0" style={{ padding: '6px 8px', borderTop: '1px solid var(--c-border2)' }}>
          <button
            onClick={() => { setAdding(true); setEditingId(null); dispatch({ type: 'SET_SELECTED_CHARACTER', id: null }); }}
            className="w-full py-1.5 text-xs rounded text-white"
            style={{ background: adding ? 'var(--c-accent2)' : 'var(--c-accent)', cursor: 'pointer' }}
          >+ 추가</button>
        </div>
      </div>

      {/* ── Right: detail / form / placeholder ── */}
      <div className="flex-1 min-w-0 overflow-y-auto" style={{ padding: 10 }}>
        {adding && (
          <CharacterForm onSave={handleAdd} onCancel={() => setAdding(false)} />
        )}

        {!adding && editingId && selectedChar && (
          <CharacterForm initial={selectedChar} onSave={handleEdit} onCancel={() => setEditingId(null)} />
        )}

        {!adding && !editingId && selectedChar && (
          <CharacterDetail
            char={selectedChar}
            onEdit={() => setEditingId(selectedChar.id)}
            onDelete={() => dispatch({ type: 'DELETE_CHARACTER', id: selectedChar.id })}
            episodes={epList}
            scenes={sceneList}
            scriptBlocks={blockList}
          />
        )}

        {!adding && !editingId && !selectedChar && (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--c-text6)' }}>
            인물을 선택하세요
          </div>
        )}
      </div>
    </div>
  );
}
