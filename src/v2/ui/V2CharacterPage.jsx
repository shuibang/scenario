/**
 * v2 CharacterPage — Phase 4
 * Shows characters for the active project with aggregation stats.
 *
 * Data sources:
 *   - sel.charactersByProject  → character list
 *   - sel.characterAggregation → sceneCount, dialogueCount, scenes[]
 *
 * All counts are derived from Scene.characterIds and dialogue ScriptBlock.characterId.
 * No separate state for stats — pure selector computation.
 */
import React, { useState, useCallback } from 'react';
import { useStore, genId, now } from '../store/StoreContext.jsx';
import { sel } from '../store/selectors.js';
import * as A from '../store/actions.js';

const ROLE_LABEL = { lead: '주인공', support: '조연', extra: '단역' };
const ROLE_COLOR = { lead: '#f59e0b', support: 'var(--c-accent)', extra: 'var(--c-text6)' };

export default function V2CharacterPage() {
  const { state, dispatch } = useStore();
  const { activeProjectId } = state.ui;

  if (!activeProjectId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '100%', color: 'var(--c-text5)', fontSize: 13 }}>
        프로젝트를 선택하세요
      </div>
    );
  }

  const characters = sel.charactersByProject(state, activeProjectId);
  const [selectedId, setSelectedId] = useState(null);

  const addCharacter = () => {
    const id = genId();
    const ts = now();
    dispatch({
      type: A.ADD_CHARACTER,
      payload: {
        id, projectId: activeProjectId,
        surname: '', givenName: '', name: '',
        role: 'support', gender: '', age: '', occupation: '', intro: '',
        extraFields: [], relationships: [],
        createdAt: ts,
      },
    });
    setSelectedId(id);
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Character list */}
      <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--c-border2)',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      borderBottom: '1px solid var(--c-border2)', flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text5)',
                         textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            인물 ({characters.length})
          </span>
          <button
            onClick={addCharacter}
            style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3,
                     border: '1px solid var(--c-border3)', background: 'transparent',
                     color: 'var(--c-accent)', cursor: 'pointer' }}
          >+ 추가</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {characters.map(c => (
            <CharacterListItem
              key={c.id}
              char={c}
              isSelected={c.id === selectedId}
              onClick={() => setSelectedId(c.id)}
              state={state}
              projectId={activeProjectId}
            />
          ))}
          {characters.length === 0 && (
            <div style={{ padding: '12px', fontSize: 12, color: 'var(--c-text6)', textAlign: 'center' }}>
              + 버튼으로 인물을 추가하세요
            </div>
          )}
        </div>
      </div>

      {/* Detail pane */}
      {selectedId ? (
        <CharacterDetail
          key={selectedId}
          charId={selectedId}
          state={state}
          dispatch={dispatch}
          projectId={activeProjectId}
          onDelete={() => setSelectedId(null)}
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--c-text6)', fontSize: 12 }}>
          인물을 선택하세요
        </div>
      )}
    </div>
  );
}

// ─── Character list item ──────────────────────────────────────────────────────
function CharacterListItem({ char, isSelected, onClick, state, projectId }) {
  const agg = sel.characterAggregation(state, char.id, projectId);
  const name = char.givenName || char.name || '(이름 없음)';

  return (
    <div
      onClick={onClick}
      style={{
        padding: '6px 10px', cursor: 'pointer',
        background: isSelected ? 'var(--c-active)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--c-accent)' : '2px solid transparent',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--c-hover)'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600,
                       color: isSelected ? 'var(--c-accent)' : 'var(--c-text2)' }}>
          {name}
        </span>
        <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 2,
                       background: 'var(--c-tag)', color: ROLE_COLOR[char.role] || 'var(--c-text5)' }}>
          {ROLE_LABEL[char.role] || char.role}
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--c-text6)', marginTop: 1 }}>
        씬 {agg.sceneCount} · 대사 {agg.dialogueCount}줄
      </div>
    </div>
  );
}

// ─── Character detail pane ────────────────────────────────────────────────────
function CharacterDetail({ charId, state, dispatch, projectId, onDelete }) {
  const char = sel.characterById(state, charId);
  const agg  = sel.characterAggregation(state, charId, projectId);

  const [form, setForm] = useState({
    givenName:  char?.givenName  || '',
    surname:    char?.surname    || '',
    role:       char?.role       || 'support',
    gender:     char?.gender     || '',
    age:        char?.age        || '',
    occupation: char?.occupation || '',
    intro:      char?.intro      || '',
  });
  const saveTimer = React.useRef(null);

  const handleChange = (field, value) => {
    const next = { ...form, [field]: value };
    setForm(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      dispatch({ type: A.UPDATE_CHARACTER, payload: { id: charId, ...next } });
    }, 400);
  };

  const handleDelete = () => {
    if (window.confirm('이 인물을 삭제하시겠습니까?')) {
      dispatch({ type: A.DELETE_CHARACTER, id: charId });
      onDelete();
    }
  };

  if (!char) return null;

  const labelStyle = { fontSize: 11, color: 'var(--c-text5)', marginBottom: 2 };
  const inputStyle = {
    width: '100%', fontSize: 12, padding: '4px 8px', borderRadius: 3,
    border: '1px solid var(--c-border3)', background: 'var(--c-input)', color: 'var(--c-text)',
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>
            {form.givenName || '(이름 없음)'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-text5)', marginTop: 2 }}>
            등장 {agg.sceneCount}씬 · 대사 {agg.dialogueCount}줄
          </div>
        </div>
        <button
          onClick={handleDelete}
          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 3,
                   border: '1px solid var(--c-border3)', background: 'transparent',
                   color: '#f87171', cursor: 'pointer' }}
        >삭제</button>
      </div>

      {/* Basic info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <Field label="이름(이름만)" value={form.givenName} onChange={v => handleChange('givenName', v)} inputStyle={inputStyle} labelStyle={labelStyle} />
        <Field label="성" value={form.surname} onChange={v => handleChange('surname', v)} inputStyle={inputStyle} labelStyle={labelStyle} />
        <div>
          <div style={labelStyle}>역할</div>
          <select value={form.role} onChange={e => handleChange('role', e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="lead">주인공</option>
            <option value="support">조연</option>
            <option value="extra">단역</option>
          </select>
        </div>
        <Field label="성별" value={form.gender} onChange={v => handleChange('gender', v)} inputStyle={inputStyle} labelStyle={labelStyle} />
        <Field label="나이" value={form.age} onChange={v => handleChange('age', v)} inputStyle={inputStyle} labelStyle={labelStyle} />
        <Field label="직업" value={form.occupation} onChange={v => handleChange('occupation', v)} inputStyle={inputStyle} labelStyle={labelStyle} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={labelStyle}>소개</div>
        <textarea
          value={form.intro}
          onChange={e => handleChange('intro', e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          placeholder="인물 소개를 입력하세요"
        />
      </div>

      {/* Aggregation: scenes */}
      {agg.scenes.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text5)',
                        marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            등장 씬 ({agg.sceneCount})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {agg.scenes.map(s => (
              <div key={s.sceneId}
                style={{ fontSize: 11, color: 'var(--c-text3)', display: 'flex', gap: 6 }}>
                <span style={{ color: 'var(--c-text5)', flexShrink: 0 }}>
                  {s.episodeNumber}회
                </span>
                <span style={{ fontWeight: 600, flexShrink: 0 }}>{s.label}</span>
                <span style={{ color: 'var(--c-text4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.displayLabel.replace(s.label, '').trim() || '(미입력)'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, inputStyle, labelStyle }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}
