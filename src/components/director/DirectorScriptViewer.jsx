/**
 * DirectorScriptViewer
 * - 메모 타입 2가지:
 *   'script' → 작가 전달용 (Supabase director_notes)
 *   'private' → 내 연출노트 (localStorage)
 * - 상단 탭으로 타입 전환
 */
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../store/supabaseClient';

const NOTE_COLORS = ['#fef08a', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74'];

function getPrivateKey(sharedScriptId) {
  return `director_private_notes_${sharedScriptId}`;
}
function loadPrivateNotes(sharedScriptId) {
  try { return JSON.parse(localStorage.getItem(getPrivateKey(sharedScriptId)) || '{}'); }
  catch { return {}; }
}
function savePrivateNotes(sharedScriptId, map) {
  localStorage.setItem(getPrivateKey(sharedScriptId), JSON.stringify(map));
}

// ─── 블록 타입별 스타일 ────────────────────────────────────────────────────────
function blockStyle(type) {
  switch (type) {
    case 'scene_number':  return { fontWeight: 700, fontSize: 13, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '28px 0 6px' };
    case 'action':        return { fontSize: 13, color: '#222', lineHeight: 1.8, margin: '4px 0' };
    case 'dialogue':      return { fontSize: 13, color: '#111', lineHeight: 1.8, margin: '4px 0 4px 60px' };
    case 'character':     return { fontSize: 13, fontWeight: 600, color: '#333', textTransform: 'uppercase', margin: '12px 0 0 120px' };
    case 'parenthetical': return { fontSize: 12, color: '#444', fontStyle: 'italic', margin: '0 0 0 80px' };
    case 'transition':    return { fontSize: 12, color: '#555', textAlign: 'right', textTransform: 'uppercase', margin: '12px 0' };
    default:              return { fontSize: 13, color: '#333', lineHeight: 1.8, margin: '2px 0' };
  }
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
}

// ─── 메모 팝업 ────────────────────────────────────────────────────────────────
function NotePopup({ existing, noteType, onSave, onClose }) {
  const [text,  setText]  = useState(existing?.content || '');
  const [color, setColor] = useState(existing?.color   || NOTE_COLORS[0]);
  const ref = useRef();

  useEffect(() => {
    ref.current?.focus();
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isScript = noteType === 'script';

  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, zIndex: 50,
      width: 230, background: '#fff', borderRadius: 8,
      boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
      border: `2px solid ${isScript ? '#e8b84b' : '#93c5fd'}`, padding: 12,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: isScript ? '#a07820' : '#3b82f6', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {isScript ? '✉ 작가 전달 메모' : '📋 내 연출노트'}
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="메모를 입력하세요…"
        style={{
          width: '100%', minHeight: 80, resize: 'vertical',
          border: '1px solid #ddd', borderRadius: 6,
          padding: '6px 8px', fontSize: 12, lineHeight: 1.6,
          fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
          color: '#111', background: '#fff',
        }}
      />
      <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
        {NOTE_COLORS.map(c => (
          <div key={c} onClick={() => setColor(c)} style={{
            width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer',
            border: color === c ? '2px solid #333' : '2px solid transparent',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => text.trim() && onSave({ content: text.trim(), color })}
          disabled={!text.trim()}
          style={{
            flex: 1, padding: '6px 0', borderRadius: 6, border: 'none',
            background: text.trim() ? (isScript ? '#e8b84b' : '#93c5fd') : '#ccc',
            color: text.trim() ? '#1a1a1a' : '#fff',
            fontSize: 12, fontWeight: 600, cursor: text.trim() ? 'pointer' : 'default',
          }}
        >저장</button>
        <button onClick={onClose} style={{
          padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd',
          background: '#fff', color: '#666', fontSize: 12, cursor: 'pointer',
        }}>취소</button>
      </div>
    </div>
  );
}

// ─── 포스트잇 ─────────────────────────────────────────────────────────────────
function StickyNote({ note, noteType, onEdit, onDelete }) {
  const [menu, setMenu] = useState(false);
  const isScript = noteType === 'script';
  return (
    <div
      style={{
        position: 'absolute', right: 0, top: 0,
        width: 160, minHeight: 48, background: note.color,
        borderRadius: 4, padding: '6px 8px',
        boxShadow: '2px 2px 6px rgba(0,0,0,0.12)',
        fontSize: 13, lineHeight: 1.6, color: '#111',
        cursor: 'pointer', zIndex: 10,
        borderTop: `3px solid ${isScript ? '#e8b84b' : '#93c5fd'}`,
      }}
      onClick={() => setMenu(v => !v)}
    >
      <div style={{ fontSize: 9, color: isScript ? '#a07820' : '#3b82f6', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase' }}>
        {isScript ? '✉ 작가 전달' : '📋 연출노트'}
      </div>
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{note.content}</div>
      {menu && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          background: '#fff', border: '1px solid #ddd', borderRadius: 6,
          boxShadow: '0 2px 10px rgba(0,0,0,0.12)', zIndex: 20, overflow: 'hidden',
        }}>
          <div onClick={e => { e.stopPropagation(); setMenu(false); onEdit(); }}
            style={{ padding: '7px 14px', fontSize: 12, cursor: 'pointer', color: '#333' }}
            onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >수정</div>
          <div onClick={e => { e.stopPropagation(); setMenu(false); onDelete(); }}
            style={{ padding: '7px 14px', fontSize: 12, cursor: 'pointer', color: '#c00' }}
            onMouseEnter={e => e.currentTarget.style.background = '#fff5f5'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >삭제</div>
        </div>
      )}
    </div>
  );
}

// ─── 단일 블록 행 ─────────────────────────────────────────────────────────────
function BlockRow({ block, scriptNote, privateNote, noteType, onAdd, onEdit, onDelete, readOnly }) {
  const [hovered,   setHovered]   = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);

  const activeNote = noteType === 'script' ? scriptNote : privateNote;

  const handleSave = (data) => {
    setPopupOpen(false);
    if (activeNote) onEdit(activeNote.id ?? activeNote._localId, data, noteType);
    else            onAdd(block.id, data, noteType);
  };

  const text = stripHtml(block.content);
  if (!text && block.type !== 'scene_number') return null;

  const hasAnyNote = scriptNote || privateNote;
  const noteBarColor = activeNote?.color || (hasAnyNote ? (scriptNote || privateNote).color : null);

  return (
    <div
      style={{ position: 'relative', paddingRight: activeNote ? 176 : (hovered && !readOnly ? 36 : 0) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 왼쪽 색상 바 */}
      {noteBarColor && (
        <div style={{
          position: 'absolute', left: -16, top: 2, bottom: 2,
          width: 4, borderRadius: 2, background: noteBarColor,
        }} />
      )}

      {/* 블록 텍스트 */}
      <div style={blockStyle(block.type)}>
        {block.type === 'dialogue' && block.charName && (
          <span style={{ display: 'block', fontWeight: 600, fontSize: 12, color: '#444', marginLeft: -60, marginBottom: 2, textTransform: 'uppercase' }}>
            {block.charName}
          </span>
        )}
        {text || (block.type === 'scene_number' ? '──' : '')}
      </div>

      {/* + 버튼 */}
      {hovered && !activeNote && !popupOpen && !readOnly && (
        <button onClick={() => setPopupOpen(true)} style={{
          position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
          width: 24, height: 24, borderRadius: '50%',
          background: noteType === 'script' ? '#e8b84b' : '#93c5fd',
          color: '#1a1a1a', border: 'none',
          fontSize: 16, lineHeight: 1, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>+</button>
      )}

      {/* 팝업 */}
      {popupOpen && (
        <NotePopup existing={activeNote} noteType={noteType} onSave={handleSave} onClose={() => setPopupOpen(false)} />
      )}

      {/* 포스트잇 */}
      {activeNote && !popupOpen && (
        <StickyNote note={activeNote} noteType={noteType} onEdit={() => setPopupOpen(true)} onDelete={() => onDelete(activeNote.id ?? activeNote._localId, noteType)} />
      )}
    </div>
  );
}

// ─── 메인 뷰어 ────────────────────────────────────────────────────────────────
export default function DirectorScriptViewer({ appState, selections, sharedScriptId, readOnly = false, initialNotes = null }) {
  const [scriptNotes,  setScriptNotes]  = useState(initialNotes || {});
  const [privateNotes, setPrivateNotes] = useState(() => sharedScriptId ? loadPrivateNotes(sharedScriptId) : {});
  const [noteType,     setNoteType]     = useState('script'); // 'script' | 'private'
  const [session,      setSession]      = useState(null);

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => setSession(data?.session ?? null));
  }, []);

  useEffect(() => {
    if (!supabase || !sharedScriptId || readOnly) return;
    supabase.from('director_notes').select('*').eq('shared_script_id', sharedScriptId)
      .then(({ data }) => {
        if (!data) return;
        const map = {};
        data.forEach(n => { map[n.block_id] = n; });
        setScriptNotes(map);
      });
  }, [sharedScriptId, readOnly]);

  // ─── 작가 전달 메모 CRUD ──────────────────────────────────────────────────
  const addScript = async (blockId, { content, color }) => {
    if (!supabase || !session) return;
    const { data, error } = await supabase.from('director_notes').insert({
      director_id: session.user.id, shared_script_id: sharedScriptId, block_id: blockId, content, color,
    }).select().single();
    if (!error && data) setScriptNotes(prev => ({ ...prev, [blockId]: data }));
  };

  const editScript = async (noteId, { content, color }) => {
    if (!supabase) return;
    const { data, error } = await supabase.from('director_notes')
      .update({ content, color, updated_at: new Date().toISOString() }).eq('id', noteId).select().single();
    if (!error && data) setScriptNotes(prev => ({ ...prev, [data.block_id]: data }));
  };

  const deleteScript = async (noteId) => {
    if (!supabase) return;
    const target = Object.values(scriptNotes).find(n => n.id === noteId);
    if (!target) return;
    const { error } = await supabase.from('director_notes').delete().eq('id', noteId);
    if (!error) setScriptNotes(prev => { const next = { ...prev }; delete next[target.block_id]; return next; });
  };

  // ─── 개인 연출노트 CRUD (localStorage) ────────────────────────────────────
  const addPrivate = (blockId, { content, color }) => {
    const note = { _localId: `${Date.now()}`, block_id: blockId, content, color };
    const next = { ...privateNotes, [blockId]: note };
    setPrivateNotes(next);
    if (sharedScriptId) savePrivateNotes(sharedScriptId, next);
  };

  const editPrivate = (localId, { content, color }) => {
    const entry = Object.values(privateNotes).find(n => n._localId === localId);
    if (!entry) return;
    const updated = { ...entry, content, color };
    const next = { ...privateNotes, [entry.block_id]: updated };
    setPrivateNotes(next);
    if (sharedScriptId) savePrivateNotes(sharedScriptId, next);
  };

  const deletePrivate = (localId) => {
    const entry = Object.values(privateNotes).find(n => n._localId === localId);
    if (!entry) return;
    const next = { ...privateNotes };
    delete next[entry.block_id];
    setPrivateNotes(next);
    if (sharedScriptId) savePrivateNotes(sharedScriptId, next);
  };

  const handleAdd    = (blockId, data, type) => type === 'script' ? addScript(blockId, data)   : addPrivate(blockId, data);
  const handleEdit   = (id,      data, type) => type === 'script' ? editScript(id, data)        : editPrivate(id, data);
  const handleDelete = (id,            type) => type === 'script' ? deleteScript(id)            : deletePrivate(id);

  // ─── 블록 렌더 ────────────────────────────────────────────────────────────
  // null 방어: 데이터가 배열이 아닌 경우 대비
  const rawBlocks   = appState?.scriptBlocks;
  const rawEpisodes = appState?.episodes;
  const rawSynopsis = appState?.synopsisDocs;
  const activeProjectId = appState?.activeProjectId;

  const scriptBlocks = Array.isArray(rawBlocks)   ? rawBlocks.filter(Boolean)   : [];
  const episodes     = Array.isArray(rawEpisodes)  ? rawEpisodes.filter(Boolean)  : [];
  const synopsisDocs = Array.isArray(rawSynopsis)  ? rawSynopsis.filter(Boolean)  : [];

  const projectEpisodes = episodes.filter(e => e && e.projectId === activeProjectId);
  const selEpisodes = selections?.episodes || {};

  const rows = [];

  // 시놉시스 블록 (선택된 경우)
  if (selections?.synopsis !== false) {
    const synopsisDoc = synopsisDocs.find(d => d && d.projectId === activeProjectId);
    const rawSyn = synopsisDoc?.blocks ?? synopsisDoc?.content;
    const synBlocks = Array.isArray(rawSyn) ? rawSyn.filter(Boolean) : [];
    if (synBlocks.length > 0) {
      rows.push({ type: 'section_header', id: 'synopsis_header', title: '시놉시스' });
      synBlocks.forEach(b => rows.push({ type: 'block', block: b }));
    }
  }

  // 에피소드 대본 블록
  projectEpisodes.forEach((ep, idx) => {
    if (selEpisodes[ep.id] === false) return;
    const epBlocks = scriptBlocks.filter(b => b && b.episodeId === ep.id);
    if (epBlocks.length === 0) return;
    const num = ep.number ?? (idx + 1);
    rows.push({ type: 'ep_header', id: `ep_${ep.id}`, title: `#${num}${ep.title ? `  ${ep.title}` : ''}` });
    epBlocks.forEach(b => rows.push({ type: 'block', block: b }));
  });

  if (rows.length === 0) return (
    <div style={{ padding: '60px 32px', textAlign: 'center', color: '#999', fontSize: 13 }}>
      표시할 대본 내용이 없습니다.
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* 메모 타입 탭 */}
      {!readOnly && (
        <div style={{ position: 'sticky', top: 0, zIndex: 30, background: '#f5f5f5', borderBottom: '1px solid #ddd', padding: '8px 48px', display: 'flex', gap: 8 }}>
          {[['script', '✉ 작가 전달 메모', '#e8b84b'], ['private', '📋 내 연출노트', '#93c5fd']].map(([type, label, color]) => (
            <button key={type} onClick={() => setNoteType(type)} style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600,
              background: noteType === type ? color : '#e8e8e8',
              color: noteType === type ? '#1a1a1a' : '#666',
              cursor: 'pointer',
            }}>{label}</button>
          ))}
          <span style={{ fontSize: 11, color: '#999', marginLeft: 8, alignSelf: 'center' }}>
            {noteType === 'script' ? '작가에게 전송됩니다' : '나만 볼 수 있는 메모입니다'}
          </span>
        </div>
      )}

      {/* 대본 본문 */}
      <div style={{ padding: '32px 48px 80px', maxWidth: 700, margin: '0 auto', background: '#fff', width: '100%', boxSizing: 'border-box' }}>
        {rows.map(row => {
          if (row.type === 'section_header') return (
            <div key={row.id} style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid #ddd', paddingBottom: 6, margin: '32px 0 16px' }}>
              {row.title}
            </div>
          );
          if (row.type === 'ep_header') return (
            <div key={row.id} style={{ fontSize: 15, fontWeight: 700, color: '#111', borderBottom: '2px solid #333', paddingBottom: 8, margin: '40px 0 20px', fontFamily: 'monospace', letterSpacing: '-0.01em' }}>
              {row.title}
            </div>
          );
          const { block } = row;
          if (!block?.id) return null;
          return (
            <BlockRow
              key={block.id}
              block={block}
              scriptNote={scriptNotes[block.id] || null}
              privateNote={privateNotes[block.id] || null}
              noteType={noteType}
              onAdd={handleAdd}
              onEdit={handleEdit}
              onDelete={handleDelete}
              readOnly={readOnly}
            />
          );
        })}
      </div>
    </div>
  );
}
