import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../store/AppContext';
import { genId, now } from '../../store/db';

// ─── 코멘트(메모) 패널 — 왼쪽 ────────────────────────────────────────────────
export default function MobileMemoTab() {
  const { state } = useApp();
  const { activeProjectId, activeDoc, activeEpisodeId } = state;

  const docKey     = activeEpisodeId ? `ep-${activeEpisodeId}` : (activeDoc || 'default');
  const storageKey = `drama_docMemo_${activeProjectId}_${docKey}`;
  const [memo, setMemo] = useState(() => {
    try { return localStorage.getItem(storageKey) || ''; } catch { return ''; }
  });
  useEffect(() => {
    try { setMemo(localStorage.getItem(storageKey) || ''); } catch {}
  }, [storageKey]);

  const memoTimer = useRef(null);
  const saveMemo = (val) => {
    setMemo(val);
    clearTimeout(memoTimer.current);
    memoTimer.current = setTimeout(() => {
      try { localStorage.setItem(storageKey, val); } catch {}
    }, 400);
  };
  useEffect(() => () => clearTimeout(memoTimer.current), []);

  if (!activeProjectId) return <div className="m-empty">작품을 선택하세요</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '6px 8px', boxSizing: 'border-box' }}>
      <div className="m-text-xs" style={{ marginBottom: 4, color: 'var(--c-text5)', fontWeight: 600 }}>코멘트</div>
      <textarea
        value={memo}
        onChange={e => saveMemo(e.target.value)}
        placeholder="메모를 입력하세요…"
        style={{
          flex: 1, resize: 'none',
          border: '1px solid var(--c-border2)', borderRadius: 6,
          padding: '6px 8px', fontSize: 12, lineHeight: 1.6,
          background: 'var(--c-input)', color: 'var(--c-text)',
          outline: 'none', fontFamily: 'inherit',
        }}
      />
    </div>
  );
}

// ─── 체크리스트 패널 — 오른쪽 ────────────────────────────────────────────────
export function MobileChecklistPanel() {
  const { state, dispatch } = useApp();
  const { checklistItems, activeProjectId } = state;
  const [inputVal, setInputVal] = useState('');

  const items   = checklistItems.filter(it => it.projectId === activeProjectId && !it.docId);
  const pending = items.filter(it => !it.done);
  const done    = items.filter(it => it.done);

  const addItem = () => {
    const text = inputVal.trim();
    if (!text || !activeProjectId) return;
    dispatch({ type: 'ADD_CHECKLIST_ITEM', payload: { id: genId(), projectId: activeProjectId, docId: null, text, done: false, createdAt: now() } });
    setInputVal('');
  };

  if (!activeProjectId) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '6px 8px', boxSizing: 'border-box', borderLeft: '1px solid var(--c-border)' }}>
      <div className="m-text-xs" style={{ marginBottom: 4, color: 'var(--c-text5)', fontWeight: 600 }}>체크리스트</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <input
          className="m-input"
          style={{ padding: '4px 8px', fontSize: 12, flex: 1, minWidth: 0 }}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') addItem(); }}
          placeholder="추가…"
        />
        <button onClick={addItem} className="m-btn primary" style={{ flexShrink: 0, fontSize: 14, padding: '0 8px' }}>+</button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {[...pending, ...done].map(it => (
          <div key={it.id} className="m-checklist-row" style={{ padding: '4px 0' }}>
            <button
              className={`m-check-box${it.done ? ' done' : ''}`}
              onClick={() => dispatch({ type: 'UPDATE_CHECKLIST_ITEM', payload: { id: it.id, done: !it.done } })}
            >{it.done && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}</button>
            <span className="m-text-base" style={{ flex: 1, fontSize: 11, textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--c-text6)' : undefined }}>{it.text}</span>
            <button onClick={() => dispatch({ type: 'DELETE_CHECKLIST_ITEM', id: it.id })} style={{ background: 'none', border: 'none', color: 'var(--c-text6)', cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>×</button>
          </div>
        ))}
        {items.length === 0 && <div className="m-text-xs" style={{ color: 'var(--c-text6)' }}>항목 없음</div>}
      </div>
    </div>
  );
}
