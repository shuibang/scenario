import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../store/AppContext';
import { genId, now } from '../../store/db';

export default function MobileMemoTab() {
  const { state, dispatch } = useApp();
  const { checklistItems, activeProjectId, activeDoc, activeEpisodeId } = state;
  const [inputVal, setInputVal] = useState('');

  const docKey = activeEpisodeId ? `ep-${activeEpisodeId}` : (activeDoc || 'default');
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
  // cleanup on unmount
  useEffect(() => () => clearTimeout(memoTimer.current), []);

  const items = checklistItems.filter(it => it.projectId === activeProjectId && !it.docId);
  const pending = items.filter(it => !it.done);
  const done    = items.filter(it => it.done);

  const addItem = () => {
    const text = inputVal.trim();
    if (!text || !activeProjectId) return;
    dispatch({ type: 'ADD_CHECKLIST_ITEM', payload: { id: genId(), projectId: activeProjectId, docId: null, text, done: false, createdAt: now() } });
    setInputVal('');
  };

  if (!activeProjectId) return <div className="m-empty">작품을 선택하세요</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '4px var(--m-pad-x)', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <input
            className="m-input"
            style={{ padding: '5px 10px' }}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') addItem(); }}
            placeholder="항목 추가..."
          />
          <button onClick={addItem} className="m-btn primary" style={{ flexShrink: 0, fontSize: 15, padding: '0 12px' }}>+</button>
        </div>
        {[...pending, ...done].map(it => (
          <div key={it.id} className="m-checklist-row" style={{ padding: '6px 0' }}>
            <button
              className={`m-check-box${it.done ? ' done' : ''}`}
              onClick={() => dispatch({ type: 'UPDATE_CHECKLIST_ITEM', payload: { id: it.id, done: !it.done } })}
            >{it.done && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}</button>
            <span className="m-text-base" style={{ flex: 1, textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--c-text6)' : undefined }}>{it.text}</span>
            <button onClick={() => dispatch({ type: 'DELETE_CHECKLIST_ITEM', id: it.id })} style={{ background: 'none', border: 'none', color: 'var(--c-text6)', cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>×</button>
          </div>
        ))}
        {items.length === 0 && <div className="m-text-xs" style={{ padding: '4px 0' }}>항목이 없습니다</div>}
      </div>
    </div>
  );
}
