/**
 * DirectorScriptViewer
 * - 메모 타입 2가지:
 *   'script'  -> 작가 전달용 메모 (Supabase director_notes)
 *   'private' -> 개인 연출노트 (localStorage)
 * - 로그인 사용자는 작가 전달 메모를 쓸 수 있고, 최초 1회 표시 이름을 설정한다.
 * - 비로그인 상태에서는 둘러보기와 개인 노트만 가능하다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../store/supabaseClient';
import { guardedSignInWithGoogle } from '../../utils/guardedSignIn';
import RecipientDisplayNameModal from './RecipientDisplayNameModal';
import {
  getFeedbackDisplayNameChangeEventName,
  getStoredFeedbackDisplayName,
  getSuggestedFeedbackDisplayName,
  saveFeedbackDisplayName,
} from '../../utils/feedbackDisplayName';
import { buildFeedbackNoteMeta } from '../../utils/feedbackNoteMeta';

const NOTE_COLORS = ['#fef08a', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74'];
const RETURN_HASH_KEY = 'drama_pending_return_hash';

function requestDirectorLogin() {
  try {
    localStorage.setItem(RETURN_HASH_KEY, window.location.hash || '#director');
  } catch {}
  guardedSignInWithGoogle();
}

function getPrivateKey(sharedScriptId) {
  return `director_private_notes_${sharedScriptId}`;
}

function loadPrivateNotes(sharedScriptId) {
  try {
    return JSON.parse(localStorage.getItem(getPrivateKey(sharedScriptId)) || '{}');
  } catch {
    return {};
  }
}

function savePrivateNotes(sharedScriptId, map) {
  localStorage.setItem(getPrivateKey(sharedScriptId), JSON.stringify(map));
}

function toNoteList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function getNoteRenderKey(note, fallback) {
  return (
    note?.feedback_session_key ||
    note?.submitted_at ||
    note?.submittedAt ||
    note?.id ||
    note?._localId ||
    fallback
  );
}

function blockStyle(type) {
  switch (type) {
    case 'scene_number':
      return {
        fontWeight: 700,
        fontSize: 13,
        color: '#1a1a1a',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        margin: '28px 0 6px',
      };
    case 'action':
      return { fontSize: 13, color: '#222', lineHeight: 1.8, margin: '4px 0' };
    case 'dialogue':
      return { fontSize: 13, color: '#111', lineHeight: 1.8, margin: '4px 0 4px 60px' };
    case 'character':
      return {
        fontSize: 13,
        fontWeight: 600,
        color: '#333',
        textTransform: 'uppercase',
        margin: '12px 0 0 120px',
      };
    case 'parenthetical':
      return { fontSize: 12, color: '#444', fontStyle: 'italic', margin: '0 0 0 80px' };
    case 'transition':
      return {
        fontSize: 12,
        color: '#555',
        textAlign: 'right',
        textTransform: 'uppercase',
        margin: '12px 0',
      };
    default:
      return { fontSize: 13, color: '#333', lineHeight: 1.8, margin: '2px 0' };
  }
}

function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function NotePopup({ existing, noteType, onSave, onClose }) {
  const [text, setText] = useState(existing?.content || '');
  const [color, setColor] = useState(existing?.color || NOTE_COLORS[0]);
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isScript = noteType === 'script';

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        zIndex: 50,
        width: 230,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
        border: `2px solid ${isScript ? '#e8b84b' : '#93c5fd'}`,
        padding: 12,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: isScript ? '#a07820' : '#3b82f6',
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {isScript ? '작가 전달 메모' : '내 연출노트'}
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="메모를 입력해주세요."
        style={{
          width: '100%',
          minHeight: 80,
          resize: 'vertical',
          border: '1px solid #ddd',
          borderRadius: 6,
          padding: '6px 8px',
          fontSize: 12,
          lineHeight: 1.6,
          fontFamily: 'inherit',
          outline: 'none',
          boxSizing: 'border-box',
          color: '#111',
          background: '#fff',
        }}
      />
      <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
        {NOTE_COLORS.map((colorValue) => (
          <div
            key={colorValue}
            onClick={() => setColor(colorValue)}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: colorValue,
              cursor: 'pointer',
              border: color === colorValue ? '2px solid #333' : '2px solid transparent',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => text.trim() && onSave({ content: text.trim(), color })}
          disabled={!text.trim()}
          style={{
            flex: 1,
            padding: '6px 0',
            borderRadius: 6,
            border: 'none',
            background: text.trim() ? (isScript ? '#e8b84b' : '#93c5fd') : '#ccc',
            color: text.trim() ? '#1a1a1a' : '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: text.trim() ? 'pointer' : 'default',
          }}
        >
          저장
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #ddd',
            background: '#fff',
            color: '#666',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          취소
        </button>
      </div>
    </div>
  );
}

function StickyNote({
  note,
  noteType,
  onEdit,
  onDelete,
  readOnly,
  offsetIndex = 0,
  zIndexLevel = 10,
  onActivate,
  dimmed = false,
}) {
  const [menu, setMenu] = useState(false);
  const isScript = noteType === 'script';
  const meta = buildFeedbackNoteMeta(note);
  const collapsible = readOnly && !!meta;
  const [expanded, setExpanded] = useState(!collapsible);

  useEffect(() => {
    setExpanded(!collapsible);
  }, [collapsible, note?.id, note?.feedback_session_key]);

  const handleClick = () => {
    onActivate?.();
    if (readOnly) {
      if (collapsible) setExpanded((value) => !value);
      return;
    }
    setMenu((value) => !value);
  };

  return (
    <div
      style={{
        position: 'absolute',
        right: offsetIndex * 10,
        top: offsetIndex * 12,
        width: 160,
        minHeight: 48,
        background: note.color,
        borderRadius: 4,
        padding: '6px 8px',
        boxShadow: '2px 2px 6px rgba(0,0,0,0.12)',
        fontSize: 13,
        lineHeight: 1.6,
        color: '#111',
        cursor: 'pointer',
        zIndex: zIndexLevel,
        borderTop: `3px solid ${isScript ? '#e8b84b' : '#93c5fd'}`,
        opacity: dimmed ? 0.55 : 1,
        transform: `translate(${Number(note?.position_offset || 0)}px, ${Number(note?.position_offset || 0) * 0.4}px)`,
      }}
      onClick={handleClick}
    >
      <div
        style={{
          fontSize: 9,
          color: isScript ? '#a07820' : '#3b82f6',
          fontWeight: 700,
          marginBottom: 3,
          textTransform: 'uppercase',
        }}
      >
        {isScript ? '작가 전달' : '내 노트'}
      </div>
      {meta && (
        <div style={{ fontSize: 9, color: '#555', lineHeight: 1.4, marginBottom: expanded || !collapsible ? 4 : 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          {!note?.is_read && readOnly && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#dc2626',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
          )}
          <span>{meta}</span>
        </div>
      )}
      {(expanded || !collapsible) && (
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{note.content}</div>
      )}
      {menu && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 6,
            boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
            zIndex: 20,
            overflow: 'hidden',
          }}
        >
          <div
            onClick={(event) => {
              event.stopPropagation();
              setMenu(false);
              onEdit();
            }}
            style={{ padding: '7px 14px', fontSize: 12, cursor: 'pointer', color: '#333' }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = '#f5f5f5';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'transparent';
            }}
          >
            수정
          </div>
          <div
            onClick={(event) => {
              event.stopPropagation();
              setMenu(false);
              onDelete();
            }}
            style={{ padding: '7px 14px', fontSize: 12, cursor: 'pointer', color: '#c00' }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = '#fff5f5';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'transparent';
            }}
          >
            삭제
          </div>
        </div>
      )}
    </div>
  );
}

function BlockRow({
  block,
  scriptNote,
  privateNote,
  noteType,
  onAdd,
  onEdit,
  onDelete,
  readOnly,
  highlightSessionId,
}) {
  const [hovered, setHovered] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const scriptNoteList = toNoteList(scriptNote);
  const privateNoteList = toNoteList(privateNote);
  const activeNotes = noteType === 'script' ? scriptNoteList : privateNoteList;
  const activeNote = activeNotes[0] || null;
  const [raisedNoteKey, setRaisedNoteKey] = useState('');

  useEffect(() => {
    const nextKey = activeNotes.length > 0
      ? getNoteRenderKey(activeNotes[activeNotes.length - 1], `${block.id}_last`)
      : '';
    setRaisedNoteKey((current) => {
      if (!nextKey) return '';
      const stillExists = activeNotes.some((note, index) => getNoteRenderKey(note, `${block.id}_${index}`) === current);
      return stillExists ? current : nextKey;
    });
  }, [activeNotes, block.id]);

  const handleSave = (data) => {
    setPopupOpen(false);
    if (activeNote) onEdit(activeNote.id ?? activeNote._localId, data, noteType);
    else onAdd(block.id, data, noteType);
  };

  const text = stripHtml(block.content);
  if (!text && block.type !== 'scene_number') return null;

  const hasAnyNote = scriptNoteList.length > 0 || privateNoteList.length > 0;
  const noteBarColor =
    activeNote?.color ||
    scriptNoteList[0]?.color ||
    privateNoteList[0]?.color ||
    null;

  return (
    <div
      id={`dsv-${block.id}`}
      style={{ position: 'relative', paddingRight: activeNotes.length > 0 ? 196 : hovered && !readOnly ? 36 : 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {noteBarColor && (
        <div
          style={{
            position: 'absolute',
            left: -16,
            top: 2,
            bottom: 2,
            width: 4,
            borderRadius: 2,
            background: noteBarColor,
          }}
        />
      )}

      <div style={blockStyle(block.type)}>
        {block.type === 'dialogue' && block.charName && (
          <span
            style={{
              display: 'block',
              fontWeight: 600,
              fontSize: 12,
              color: '#444',
              marginLeft: -60,
              marginBottom: 2,
              textTransform: 'uppercase',
            }}
          >
            {block.charName}
          </span>
        )}
        {text || (block.type === 'scene_number' ? '장면' : '')}
      </div>

      {hovered && !activeNote && !popupOpen && !readOnly && (
        <button
          onClick={() => setPopupOpen(true)}
          style={{
            position: 'absolute',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: noteType === 'script' ? '#e8b84b' : '#93c5fd',
            color: '#1a1a1a',
            border: 'none',
            fontSize: 16,
            lineHeight: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          +
        </button>
      )}

      {popupOpen && (
        <NotePopup
          existing={activeNote}
          noteType={noteType}
          onSave={handleSave}
          onClose={() => setPopupOpen(false)}
        />
      )}

      {activeNotes.length > 0 && !popupOpen && (
        activeNotes.map((note, index) => (
          (() => {
            const noteKey = getNoteRenderKey(note, `${block.id}_${index}`);
            const isRaised = noteKey === raisedNoteKey;
            return (
          <StickyNote
            key={noteKey}
            note={note}
            noteType={noteType}
            readOnly={readOnly}
            offsetIndex={index}
            zIndexLevel={isRaised ? 40 : 10 + index}
            onActivate={() => setRaisedNoteKey(noteKey)}
            dimmed={!!highlightSessionId && note?.received_session_id !== highlightSessionId}
            onEdit={() => setPopupOpen(true)}
            onDelete={() => onDelete(note.id ?? note._localId, noteType)}
          />
            );
          })()
        ))
      )}
    </div>
  );
}

export default function DirectorScriptViewer({
  appState,
  selections,
  sharedScriptId,
  readOnly = false,
  initialNotes = null,
  localOnly = false,
  highlightSessionId = null,
}) {
  const [scriptNotes, setScriptNotes] = useState(initialNotes || {});
  const [privateNotes, setPrivateNotes] = useState(() =>
    sharedScriptId ? loadPrivateNotes(sharedScriptId) : {}
  );
  const [noteType, setNoteType] = useState(localOnly ? 'private' : 'script');
  const [session, setSession] = useState(null);
  const [displayName, setDisplayName] = useState(() => getStoredFeedbackDisplayName());
  const [displayNameModalOpen, setDisplayNameModalOpen] = useState(false);
  const [displayNameModalClosable, setDisplayNameModalClosable] = useState(false);

  const isLoggedIn = !!session?.user;
  const canUseScriptNotes = !readOnly && !localOnly && isLoggedIn && !!displayName;
  const rowReadOnly = readOnly || (noteType === 'script' && !canUseScriptNotes);
  const suggestedDisplayName = useMemo(
    () => getSuggestedFeedbackDisplayName(session),
    [session]
  );

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return undefined;
    }

    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setSession(data?.session ?? null);
      })
      .catch(() => {
        if (mounted) setSession(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!readOnly) return;
    setScriptNotes(initialNotes || {});
  }, [initialNotes, readOnly]);

  useEffect(() => {
    const eventName = getFeedbackDisplayNameChangeEventName();
    const syncDisplayName = () => setDisplayName(getStoredFeedbackDisplayName());
    window.addEventListener(eventName, syncDisplayName);
    return () => window.removeEventListener(eventName, syncDisplayName);
  }, []);

  useEffect(() => {
    if (readOnly || localOnly || !isLoggedIn || displayName) return;
    setDisplayNameModalClosable(false);
    setDisplayNameModalOpen(true);
  }, [displayName, isLoggedIn, localOnly, readOnly]);

  useEffect(() => {
    if (!supabase || !sharedScriptId || readOnly || localOnly || !isLoggedIn) return;
    supabase
      .from('director_notes')
      .select('*')
      .eq('shared_script_id', sharedScriptId)
      .then(({ data }) => {
        if (!data) return;
        const map = {};
        data.forEach((note) => {
          map[note.block_id] = note;
        });
        setScriptNotes(map);
      });
  }, [sharedScriptId, readOnly, localOnly, isLoggedIn]);

  const openDisplayNameModal = (allowClose = true) => {
    setDisplayNameModalClosable(allowClose);
    setDisplayNameModalOpen(true);
  };

  const ensureScriptNoteAccess = () => {
    if (readOnly || localOnly) return false;
    if (!isLoggedIn) {
      requestDirectorLogin();
      return false;
    }
    if (!displayName) {
      openDisplayNameModal(false);
      return false;
    }
    return true;
  };

  const addScript = async (blockId, { content, color }) => {
    if (!supabase || !ensureScriptNoteAccess()) return;
    const { data, error } = await supabase
      .from('director_notes')
      .insert({
        director_id: session.user.id,
        shared_script_id: sharedScriptId,
        block_id: blockId,
        content,
        color,
      })
      .select()
      .single();
    if (!error && data) setScriptNotes((prev) => ({ ...prev, [blockId]: data }));
  };

  const editScript = async (noteId, { content, color }) => {
    if (!supabase || !ensureScriptNoteAccess()) return;
    const { data, error } = await supabase
      .from('director_notes')
      .update({ content, color, updated_at: new Date().toISOString() })
      .eq('id', noteId)
      .select()
      .single();
    if (!error && data) setScriptNotes((prev) => ({ ...prev, [data.block_id]: data }));
  };

  const deleteScript = async (noteId) => {
    if (!supabase || !ensureScriptNoteAccess()) return;
    const target = Object.values(scriptNotes).find((note) => note.id === noteId);
    if (!target) return;
    const { error } = await supabase.from('director_notes').delete().eq('id', noteId);
    if (!error) {
      setScriptNotes((prev) => {
        const next = { ...prev };
        delete next[target.block_id];
        return next;
      });
    }
  };

  const addPrivate = (blockId, { content, color }) => {
    const note = { _localId: `${Date.now()}`, block_id: blockId, content, color };
    const next = { ...privateNotes, [blockId]: note };
    setPrivateNotes(next);
    if (sharedScriptId) savePrivateNotes(sharedScriptId, next);
  };

  const editPrivate = (localId, { content, color }) => {
    const entry = Object.values(privateNotes).find((note) => note._localId === localId);
    if (!entry) return;
    const updated = { ...entry, content, color };
    const next = { ...privateNotes, [entry.block_id]: updated };
    setPrivateNotes(next);
    if (sharedScriptId) savePrivateNotes(sharedScriptId, next);
  };

  const deletePrivate = (localId) => {
    const entry = Object.values(privateNotes).find((note) => note._localId === localId);
    if (!entry) return;
    const next = { ...privateNotes };
    delete next[entry.block_id];
    setPrivateNotes(next);
    if (sharedScriptId) savePrivateNotes(sharedScriptId, next);
  };

  const handleAdd = (blockId, data, type) =>
    type === 'script' ? addScript(blockId, data) : addPrivate(blockId, data);
  const handleEdit = (id, data, type) =>
    type === 'script' ? editScript(id, data) : editPrivate(id, data);
  const handleDelete = (id, type) =>
    type === 'script' ? deleteScript(id) : deletePrivate(id);

  const handleChangeNoteType = (type) => {
    if (type !== 'script') {
      setNoteType(type);
      return;
    }
    if (localOnly) return;
    if (!isLoggedIn) {
      requestDirectorLogin();
      return;
    }
    setNoteType('script');
    if (!displayName) openDisplayNameModal(false);
  };

  const handleDisplayNameSave = (value) => {
    const parsed = saveFeedbackDisplayName(value);
    if (!parsed.success) return;
    setDisplayName(parsed.data);
    setDisplayNameModalOpen(false);
    setDisplayNameModalClosable(false);
  };

  const rawBlocks = appState?.scriptBlocks;
  const rawEpisodes = appState?.episodes;
  const rawSynopsis = appState?.synopsisDocs;
  const activeProjectId = appState?.activeProjectId;

  const scriptBlocks = Array.isArray(rawBlocks) ? rawBlocks.filter(Boolean) : [];
  const episodes = Array.isArray(rawEpisodes) ? rawEpisodes.filter(Boolean) : [];
  const synopsisDocs = Array.isArray(rawSynopsis) ? rawSynopsis.filter(Boolean) : [];

  const projectEpisodes = episodes.filter((episode) => episode && episode.projectId === activeProjectId);
  const selEpisodes = selections?.episodes || {};

  const rows = [];

  if (selections?.synopsis !== false) {
    const synopsisDoc = synopsisDocs.find((doc) => doc && doc.projectId === activeProjectId);
    const rawSynopsisBlocks = synopsisDoc?.blocks ?? synopsisDoc?.content;
    const synopsisBlocks = Array.isArray(rawSynopsisBlocks) ? rawSynopsisBlocks.filter(Boolean) : [];
    if (synopsisBlocks.length > 0) {
      rows.push({ type: 'section_header', id: 'synopsis_header', title: '시놉시스' });
      synopsisBlocks.forEach((block) => rows.push({ type: 'block', block }));
    }
  }

  projectEpisodes.forEach((episode, index) => {
    if (selEpisodes[episode.id] === false) return;
    const episodeBlocks = scriptBlocks.filter((block) => block && block.episodeId === episode.id);
    if (episodeBlocks.length === 0) return;
    const episodeNumber = episode.number ?? index + 1;
    rows.push({
      type: 'ep_header',
      id: `ep_${episode.id}`,
      title: `에피소드 ${episodeNumber}${episode.title ? `  ${episode.title}` : ''}`,
    });
    episodeBlocks.forEach((block) => rows.push({ type: 'block', block }));
  });

  if (rows.length === 0) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center', color: '#999', fontSize: 13 }}>
        표시할 대본 내용이 없습니다.
      </div>
    );
  }

  const renderScriptToolbarStatus = () => {
    if (localOnly) return null;

    if (!isLoggedIn) {
      return (
        <>
          <span style={{ fontSize: 11, color: '#8b5e00', alignSelf: 'center' }}>
            둘러보기는 가능하지만 작가 전달 메모 작성은 로그인 후 사용할 수 있습니다.
          </span>
          <button
            onClick={requestDirectorLogin}
            style={{
              padding: '5px 12px',
              borderRadius: 999,
              border: '1px solid #d7b15a',
              background: '#fffaf0',
              color: '#8b5e00',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Google로 로그인
          </button>
        </>
      );
    }

    if (!displayName) {
      return (
        <>
          <span style={{ fontSize: 11, color: '#8b5e00', alignSelf: 'center' }}>
            작가에게 보일 표시 이름을 먼저 설정해주세요.
          </span>
          <button
            onClick={() => openDisplayNameModal(false)}
            style={{
              padding: '5px 12px',
              borderRadius: 999,
              border: '1px solid #d7b15a',
              background: '#fffaf0',
              color: '#8b5e00',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            표시 이름 설정
          </button>
        </>
      );
    }

    return (
      <>
        <span style={{ fontSize: 11, color: '#999', alignSelf: 'center' }}>
          작가에게 <strong style={{ color: '#444' }}>{displayName}</strong> 이름으로 전달됩니다.
        </span>
        <button
          onClick={() => openDisplayNameModal(true)}
          style={{
            padding: '5px 12px',
            borderRadius: 999,
            border: '1px solid #ddd',
            background: '#fff',
            color: '#666',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          표시 이름 변경
        </button>
      </>
    );
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        {!readOnly && (
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 30,
              background: '#f5f5f5',
              borderBottom: '1px solid #ddd',
              padding: '8px 20px',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                ['script', '작가 전달 메모', '#e8b84b'],
                ['private', '내 연출노트', '#93c5fd'],
              ]
                .filter(([type]) => !(localOnly && type === 'script'))
                .map(([type, label, color]) => (
                  <button
                    key={type}
                    onClick={() => handleChangeNoteType(type)}
                    style={{
                      padding: '5px 14px',
                      borderRadius: 20,
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 600,
                      background: noteType === type ? color : '#e8e8e8',
                      color: noteType === type ? '#1a1a1a' : '#666',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {noteType === 'script' ? (
                renderScriptToolbarStatus()
              ) : (
                <span style={{ fontSize: 11, color: '#999', alignSelf: 'center' }}>
                  나만 볼 수 있는 개인 메모입니다.
                </span>
              )}
            </div>
          </div>
        )}

        <div
          style={{
            padding: '32px 48px 80px',
            maxWidth: 700,
            margin: '0 auto',
            background: '#fff',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {rows.map((row) => {
            if (row.type === 'section_header') {
              return (
                <div
                  key={row.id}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#888',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    borderBottom: '1px solid #ddd',
                    paddingBottom: 6,
                    margin: '32px 0 16px',
                  }}
                >
                  {row.title}
                </div>
              );
            }

            if (row.type === 'ep_header') {
              return (
                <div
                  key={row.id}
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#111',
                    borderBottom: '2px solid #333',
                    paddingBottom: 8,
                    margin: '40px 0 20px',
                    fontFamily: 'monospace',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {row.title}
                </div>
              );
            }

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
                readOnly={rowReadOnly}
                highlightSessionId={highlightSessionId}
              />
            );
          })}
        </div>
      </div>

      <RecipientDisplayNameModal
        open={displayNameModalOpen}
        allowClose={displayNameModalClosable}
        initialValue={displayName}
        suggestedValue={suggestedDisplayName}
        onSubmit={handleDisplayNameSave}
        onClose={() => {
          if (!displayNameModalClosable) return;
          setDisplayNameModalOpen(false);
        }}
      />
    </>
  );
}
