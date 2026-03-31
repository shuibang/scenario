/**
 * v2 SceneListPage — Phase 4
 * Shows all scenes for the active episode as a table.
 *
 * Columns:
 *   [Derived from Scene]    씬번호, 장소, 세부장소, 시간대, 등장인물
 *   [Editable SceneListRow] 내용, 비고
 *
 * Rule: scene number / location / time / chars are NEVER stored in SceneListRow.
 *       They are derived from Scene by sel.sceneListRowsByEpisode.
 */
import React, { useState, useCallback, useRef } from 'react';
import { useStore, genId, now } from '../store/StoreContext.jsx';
import { sel } from '../store/selectors.js';
import * as A from '../store/actions.js';

export default function V2SceneListPage() {
  const { state, dispatch } = useStore();
  const { ui } = state;

  if (!ui.activeEpisodeId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '100%', color: 'var(--c-text5)', fontSize: 13 }}>
        좌측에서 회차를 선택하세요
      </div>
    );
  }

  return <SceneListTable episodeId={ui.activeEpisodeId} state={state} dispatch={dispatch} />;
}

function SceneListTable({ episodeId, state, dispatch }) {
  const rows    = sel.sceneListRowsByEpisode(state, episodeId);
  const chars   = state.entities.characters.byId;

  if (rows.length === 0) {
    return (
      <div style={{ padding: '24px', color: 'var(--c-text5)', fontSize: 13, textAlign: 'center' }}>
        <div style={{ marginBottom: 8 }}>씬이 없습니다.</div>
        <div style={{ fontSize: 12, color: 'var(--c-text6)' }}>
          대본 탭에서 씬번호(S#) 블록을 추가하면 자동으로 여기에 나타납니다.
        </div>
      </div>
    );
  }

  const thStyle = {
    padding: '6px 10px', fontSize: 11, fontWeight: 600,
    color: 'var(--c-text5)', textAlign: 'left',
    borderBottom: '1px solid var(--c-border2)', whiteSpace: 'nowrap',
    background: 'var(--c-surface)',
    position: 'sticky', top: 0, zIndex: 1,
  };

  return (
    <div style={{ overflow: 'auto', height: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 50  }}>씬번호</th>
            <th style={{ ...thStyle, width: 80  }}>장소</th>
            <th style={{ ...thStyle, width: 60  }}>세부장소</th>
            <th style={{ ...thStyle, width: 50  }}>시간대</th>
            <th style={{ ...thStyle, width: 100 }}>등장인물</th>
            <th style={{ ...thStyle             }}>내용</th>
            <th style={{ ...thStyle, width: 80  }}>비고</th>
            <th style={{ ...thStyle, width: 50  }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <SceneListRow
              key={row.sceneId}
              row={row}
              index={idx}
              chars={chars}
              dispatch={dispatch}
              episodeId={episodeId}
              state={state}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SceneListRow({ row, index, chars, dispatch, episodeId, state }) {
  const [editingField, setEditingField] = useState(null);
  const [localContent, setLocalContent] = useState(row.content);
  const [localNote,    setLocalNote]    = useState(row.note);
  const saveTimer = useRef(null);

  const charNames = row.characterIds
    .map(id => chars[id])
    .filter(Boolean)
    .map(c => c.givenName || c.name || '')
    .filter(Boolean);

  const commitField = useCallback((field, value) => {
    setEditingField(null);
    clearTimeout(saveTimer.current);
    // Upsert SceneListRow
    const existing = sel.sceneListRowBySceneId(state, row.sceneId);
    const rowData = {
      id:        existing?.id || genId(),
      sceneId:   row.sceneId,
      episodeId,
      projectId: state.entities.scenes.byId[row.sceneId]?.projectId || '',
      content:   field === 'content' ? value : (existing?.content ?? row.content),
      note:      field === 'note'    ? value : (existing?.note    ?? row.note),
      updatedAt: now(),
    };
    dispatch({ type: A.SET_SCENE_LIST_ROW, payload: rowData });
  }, [dispatch, row.sceneId, row.content, row.note, state, episodeId]);

  // Scene metadata editing (direct UPDATE_SCENE dispatch)
  const commitSceneMeta = useCallback((field, value) => {
    dispatch({ type: A.UPDATE_SCENE, payload: { id: row.sceneId, [field]: value } });
  }, [dispatch, row.sceneId]);

  const tdStyle = {
    padding: '4px 10px',
    borderBottom: '1px solid var(--c-border)',
    verticalAlign: 'top',
    color: 'var(--c-text2)',
  };
  const altBg = index % 2 === 1 ? { background: 'color-mix(in srgb, var(--c-surface) 30%, transparent)' } : {};

  return (
    <tr style={altBg}>
      {/* 씬번호 (derived) */}
      <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--c-text3)', whiteSpace: 'nowrap' }}>
        {row.label}
      </td>

      {/* 장소 (Scene metadata - editable) */}
      <td style={tdStyle}>
        <InlineEditCell
          value={row.location}
          placeholder="장소"
          onCommit={v => commitSceneMeta('location', v)}
        />
      </td>

      {/* 세부장소 (Scene metadata - editable) */}
      <td style={tdStyle}>
        <InlineEditCell
          value={row.subLocation}
          placeholder="세부"
          onCommit={v => commitSceneMeta('subLocation', v)}
        />
      </td>

      {/* 시간대 (Scene metadata - select) */}
      <td style={tdStyle}>
        <TimeOfDayCell
          value={row.timeOfDay}
          onCommit={v => commitSceneMeta('timeOfDay', v)}
        />
      </td>

      {/* 등장인물 (derived from characterIds) */}
      <td style={tdStyle}>
        <CharacterCell
          characterIds={row.characterIds}
          charNames={charNames}
          sceneId={row.sceneId}
          projectChars={sel.charactersByProject(state, state.ui.activeProjectId)}
          dispatch={dispatch}
        />
      </td>

      {/* 내용 (editable SceneListRow.content) */}
      <td style={tdStyle}>
        <InlineEditCell
          value={localContent}
          placeholder="내용 메모"
          multiline
          onChange={setLocalContent}
          onCommit={v => commitField('content', v)}
        />
      </td>

      {/* 비고 (editable SceneListRow.note) */}
      <td style={tdStyle}>
        <InlineEditCell
          value={localNote}
          placeholder="비고"
          onChange={setLocalNote}
          onCommit={v => commitField('note', v)}
        />
      </td>

      {/* 상태 */}
      <td style={tdStyle}>
        <StatusSelect
          value={row.status}
          onCommit={v => commitSceneMeta('status', v)}
        />
      </td>
    </tr>
  );
}

// ─── Cell editors ─────────────────────────────────────────────────────────────

function InlineEditCell({ value, placeholder, multiline, onChange, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);

  // Sync external value changes (e.g. from undo)
  React.useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const handleBlur = () => {
    setEditing(false);
    onCommit(draft);
  };

  if (editing) {
    const props = {
      autoFocus: true,
      value: draft,
      onChange: e => { setDraft(e.target.value); onChange?.(e.target.value); },
      onBlur: handleBlur,
      onKeyDown: e => {
        if (!multiline && e.key === 'Enter') { e.preventDefault(); handleBlur(); }
        if (e.key === 'Escape') { setDraft(value); setEditing(false); }
      },
      style: {
        width: '100%', fontSize: 12, padding: '2px 4px',
        border: '1px solid var(--c-accent)', borderRadius: 2,
        background: 'var(--c-input)', color: 'var(--c-text)',
        outline: 'none', resize: 'vertical', minHeight: multiline ? 40 : 'auto',
        fontFamily: 'inherit',
      },
      placeholder,
    };
    return multiline ? <textarea {...props} rows={2} /> : <input {...props} />;
  }

  return (
    <div
      onClick={() => { setEditing(true); setDraft(value); }}
      style={{
        minHeight: 18, cursor: 'text', whiteSpace: 'pre-wrap',
        color: value ? 'var(--c-text2)' : 'var(--c-text6)',
        fontStyle: value ? 'normal' : 'italic',
      }}
    >
      {value || placeholder}
    </div>
  );
}

function TimeOfDayCell({ value, onCommit }) {
  const options = ['', '낮', '밤', '아침', '저녁', '새벽', '기타'];
  return (
    <select
      value={value || ''}
      onChange={e => onCommit(e.target.value)}
      style={{
        fontSize: 11, border: 'none', background: 'transparent',
        color: value ? 'var(--c-text2)' : 'var(--c-text6)',
        cursor: 'pointer', width: '100%', outline: 'none',
      }}
    >
      {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
    </select>
  );
}

function StatusSelect({ value, onCommit }) {
  const options = [
    { value: 'draft',   label: '미작성' },
    { value: 'writing', label: '작성중' },
    { value: 'done',    label: '완료'   },
  ];
  const color = { draft: 'var(--c-text6)', writing: '#f59e0b', done: '#22c55e' };
  return (
    <select
      value={value || 'draft'}
      onChange={e => onCommit(e.target.value)}
      style={{
        fontSize: 11, border: 'none', background: 'transparent',
        color: color[value] || 'var(--c-text6)',
        cursor: 'pointer', width: '100%', outline: 'none', fontWeight: 600,
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function CharacterCell({ characterIds, charNames, sceneId, projectChars, dispatch }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{ cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: 2, minHeight: 18 }}
        title="클릭하여 등장인물 편집"
      >
        {charNames.slice(0, 3).map(n => (
          <span key={n} style={{
            fontSize: 9, padding: '1px 4px', borderRadius: 2,
            background: 'var(--c-tag)', color: 'var(--c-text4)',
          }}>{n}</span>
        ))}
        {charNames.length > 3 && (
          <span style={{ fontSize: 9, color: 'var(--c-text6)' }}>+{charNames.length - 3}</span>
        )}
        {charNames.length === 0 && (
          <span style={{ fontSize: 10, color: 'var(--c-text6)', fontStyle: 'italic' }}>등장인물</span>
        )}
      </div>

      {open && (
        <CharacterDropdown
          sceneId={sceneId}
          selectedIds={characterIds}
          projectChars={projectChars}
          dispatch={dispatch}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function CharacterDropdown({ sceneId, selectedIds, projectChars, dispatch, onClose }) {
  const toggleChar = (charId) => {
    const next = selectedIds.includes(charId)
      ? selectedIds.filter(id => id !== charId)
      : [...selectedIds, charId];
    dispatch({ type: A.UPDATE_SCENE, payload: { id: sceneId, characterIds: next } });
  };

  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'absolute', top: '100%', left: 0, zIndex: 50,
        background: 'var(--c-surface)', border: '1px solid var(--c-border4)',
        borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        minWidth: 140, maxHeight: 200, overflowY: 'auto', padding: '4px 0',
      }}
    >
      {projectChars.length === 0 && (
        <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--c-text6)' }}>
          등록된 인물 없음
        </div>
      )}
      {projectChars.map(c => {
        const name = c.givenName || c.name || '';
        const sel  = selectedIds.includes(c.id);
        return (
          <div
            key={c.id}
            onMouseDown={e => { e.preventDefault(); toggleChar(c.id); }}
            style={{
              padding: '4px 10px', cursor: 'pointer', fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 6,
              background: sel ? 'var(--c-active)' : 'transparent',
              color: sel ? 'var(--c-accent)' : 'var(--c-text2)',
            }}
            onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--c-hover)'; }}
            onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 9 }}>{sel ? '✓' : '○'}</span>
            {name}
          </div>
        );
      })}
      <div
        style={{ borderTop: '1px solid var(--c-border2)', padding: '4px 10px',
                 fontSize: 10, color: 'var(--c-text6)', cursor: 'pointer', textAlign: 'center' }}
        onMouseDown={e => { e.preventDefault(); onClose(); }}
      >닫기</div>
    </div>
  );
}
