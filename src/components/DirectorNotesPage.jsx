import { useEffect, useMemo, useState } from 'react';
import DirectorScriptViewer from './director/DirectorScriptViewer';
import { getBlockPosition, scrollToBlock } from '../utils/blockPosition';
import { buildFeedbackNoteMeta } from '../utils/feedbackNoteMeta';
import { useApp } from '../store/AppContext';
import { getReceivedDeliveries } from '../utils/receivedFeedback';

const ACTIVE_PAGE_KEY = 'drama_active_delivery_id';
const ACTIVE_SESSION_KEY = 'drama_active_feedback_session_id';

function getFilteredDeliveries(projectId) {
  return getReceivedDeliveries().filter((delivery) => !delivery.projectId || delivery.projectId === projectId);
}

function sortSessionsByRecent(sessions) {
  return [...(sessions || [])].sort(
    (a, b) =>
      new Date(b?.savedAt || b?.submittedAt || 0).getTime() -
      new Date(a?.savedAt || a?.submittedAt || 0).getTime()
  );
}

function buildBlockOrderMap(appState) {
  const orderMap = new Map();
  const activeProjectId = appState?.activeProjectId;
  const synopsisDocs = Array.isArray(appState?.synopsisDocs) ? appState.synopsisDocs.filter(Boolean) : [];
  const episodes = Array.isArray(appState?.episodes) ? appState.episodes.filter(Boolean) : [];
  const scriptBlocks = Array.isArray(appState?.scriptBlocks) ? appState.scriptBlocks.filter(Boolean) : [];
  let cursor = 0;

  const synopsisDoc = synopsisDocs.find((doc) => doc?.projectId === activeProjectId);
  const rawSynopsisBlocks = synopsisDoc?.blocks ?? synopsisDoc?.content;
  if (Array.isArray(rawSynopsisBlocks)) {
    rawSynopsisBlocks.filter(Boolean).forEach((block) => {
      if (block?.id && !orderMap.has(block.id)) orderMap.set(block.id, cursor++);
    });
  }

  episodes
    .filter((episode) => episode?.projectId === activeProjectId)
    .forEach((episode) => {
      scriptBlocks
        .filter((block) => block?.episodeId === episode.id)
        .forEach((block) => {
          if (block?.id && !orderMap.has(block.id)) orderMap.set(block.id, cursor++);
        });
    });

  scriptBlocks.forEach((block) => {
    if (block?.id && !orderMap.has(block.id)) orderMap.set(block.id, cursor++);
  });

  return orderMap;
}

function sortNotesByDocumentOrder(notes, sessions) {
  const sessionMap = new Map();
  const orderMapBySession = new Map();

  (sessions || []).forEach((session) => {
    sessionMap.set(session.id, session);
    orderMapBySession.set(session.id, buildBlockOrderMap(session.appState));
  });

  return [...(notes || [])]
    .map((note, index) => {
      const sessionId = note.received_session_id;
      const session = sessionMap.get(sessionId);
      const orderMap = orderMapBySession.get(sessionId);
      const blockOrder = orderMap?.has(note.block_id) ? orderMap.get(note.block_id) : Number.MAX_SAFE_INTEGER;
      const submittedAt = new Date(note.submitted_at || session?.submittedAt || 0).getTime() || 0;
      return { note, index, blockOrder, submittedAt, session };
    })
    .sort((a, b) => {
      if (a.blockOrder !== b.blockOrder) return a.blockOrder - b.blockOrder;
      if (a.submittedAt !== b.submittedAt) return a.submittedAt - b.submittedAt;
      return a.index - b.index;
    });
}

export default function DirectorNotesPage() {
  const { state } = useApp();
  const activeProjectId = state.activeProjectId;
  const [deliveries, setDeliveries] = useState(() => getFilteredDeliveries(activeProjectId));
  const [selectedId, setSelectedId] = useState(() => {
    const id = localStorage.getItem(ACTIVE_PAGE_KEY);
    const list = getFilteredDeliveries(activeProjectId);
    return (id && list.find((delivery) => delivery.id === id)?.id) || list[0]?.id || null;
  });
  const [activeSessionId, setActiveSessionId] = useState(
    () => localStorage.getItem(ACTIVE_SESSION_KEY) || null
  );
  const [panelOpen, setPanelOpen] = useState(true);
  const [pendingScrollBlockId, setPendingScrollBlockId] = useState('');

  useEffect(() => {
    const next = getFilteredDeliveries(activeProjectId);
    setDeliveries(next);
    const savedId = localStorage.getItem(ACTIVE_PAGE_KEY);
    const nextSelectedId =
      (savedId && next.find((delivery) => delivery.id === savedId)?.id) ||
      next[0]?.id ||
      null;
    setSelectedId(nextSelectedId);
  }, [activeProjectId]);

  useEffect(() => {
    const handler = () => {
      const next = getFilteredDeliveries(activeProjectId);
      setDeliveries(next);
      const savedId = localStorage.getItem(ACTIVE_PAGE_KEY);
      const nextSelectedId =
        (savedId && next.find((delivery) => delivery.id === savedId)?.id) ||
        next[0]?.id ||
        null;
      setSelectedId(nextSelectedId);
    };
    window.addEventListener('drama_delivery_changed', handler);
    return () => window.removeEventListener('drama_delivery_changed', handler);
  }, [activeProjectId]);

  const selected = useMemo(
    () => deliveries.find((delivery) => delivery.id === selectedId) || deliveries[0] || null,
    [deliveries, selectedId]
  );

  const sessions = useMemo(
    () => sortSessionsByRecent(selected?.sessions || []),
    [selected]
  );

  useEffect(() => {
    if (!selected) {
      setActiveSessionId(null);
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return;
    }

    const nextSessionId =
      (activeSessionId && sessions.find((session) => session.id === activeSessionId)?.id) ||
      sessions[0]?.id ||
      null;

    setActiveSessionId(nextSessionId);
    if (nextSessionId) {
      localStorage.setItem(ACTIVE_SESSION_KEY, nextSessionId);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  }, [activeSessionId, selected, sessions]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || sessions[0] || null,
    [activeSessionId, sessions]
  );

  const sortedNotes = useMemo(
    () => sortNotesByDocumentOrder(selected?.notes || [], sessions),
    [selected, sessions]
  );

  useEffect(() => {
    if (!pendingScrollBlockId) return;
    const raf = window.requestAnimationFrame(() => {
      scrollToBlock(pendingScrollBlockId);
      setPendingScrollBlockId('');
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeSessionId, pendingScrollBlockId]);

  const handleSelectSession = (sessionId) => {
    setActiveSessionId(sessionId);
    if (sessionId) localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
  };

  if (deliveries.length === 0) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center', color: 'var(--c-text5)', fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.4 }}>🗒</div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>받은 피드백 노트가 없습니다</div>
        <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--c-text6)' }}>
          연출에게 검토 링크를 공유하고,<br />
          연출이 피드백 노트를 전송하면 여기에 표시됩니다
        </div>
      </div>
    );
  }

  const sessionNotes = activeSession?.notes || [];
  const appState = activeSession ? { ...(activeSession.appState || {}), initialized: true } : null;
  const selections =
    activeSession?.appState?.selections || { cover: true, synopsis: true, episodes: {}, chars: true };
  const panelW = panelOpen ? 280 : 44;
  const notesMap = {};

  sessionNotes.forEach((note) => {
    if (!note?.block_id) return;
    if (!notesMap[note.block_id]) notesMap[note.block_id] = [];
    notesMap[note.block_id].push(note);
  });

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--c-bg)' }}>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', background: '#d8d8d8' }}>
        {selected && sessions.length > 1 && (
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 20,
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              padding: '10px 14px',
              borderBottom: '1px solid #d7d7d7',
              background: 'rgba(250,250,250,0.96)',
              backdropFilter: 'blur(10px)',
            }}
          >
            {sessions.map((session, index) => {
              const meta =
                buildFeedbackNoteMeta({
                  sender_display_name: session.senderDisplayName,
                  submitted_at: session.submittedAt,
                }) || `회신 ${sessions.length - index}`;
              const active = session.id === activeSession?.id;
              return (
                <button
                  key={session.id}
                  onClick={() => handleSelectSession(session.id)}
                  style={{
                    flexShrink: 0,
                    padding: '7px 12px',
                    borderRadius: 999,
                    border: active ? '1px solid #2563eb' : '1px solid #d7d7d7',
                    background: active ? '#eff6ff' : '#fff',
                    color: active ? '#1d4ed8' : '#555',
                    fontSize: 11,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {meta}
                </button>
              );
            })}
          </div>
        )}

        {appState ? (
          <DirectorScriptViewer
            appState={appState}
            selections={selections}
            readOnly={true}
            initialNotes={notesMap}
          />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>
            왼쪽 피드백 메뉴에서 항목을 선택해주세요
          </div>
        )}
      </div>

      <div
        style={{
          width: panelW,
          flexShrink: 0,
          background: '#fff',
          borderLeft: '1px solid #ddd',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s ease',
          overflow: 'hidden',
        }}
      >
        <div style={{ height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid #eee', gap: 8 }}>
          {panelOpen && (
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#222' }}>
              코멘트
              <span style={{ fontSize: 11, fontWeight: 400, color: '#999' }}>({sortedNotes.length})</span>
            </span>
          )}
          <button
            onClick={() => setPanelOpen((value) => !value)}
            style={{ background: 'none', border: '1px solid #e0e0e0', borderRadius: 5, cursor: 'pointer', fontSize: 11, color: '#888', padding: '3px 8px' }}
          >
            {panelOpen ? '접기' : '열기'}
          </button>
        </div>

        {panelOpen && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedNotes.length === 0 && (
              <div style={{ textAlign: 'center', color: '#bbb', fontSize: 12, marginTop: 24 }}>
                코멘트가 없습니다.
              </div>
            )}

            {sortedNotes.map(({ note, session, index }) => {
              const pos = getBlockPosition(note.block_id, session?.appState?.scriptBlocks);
              const meta = buildFeedbackNoteMeta(note);
              const active = note.received_session_id === activeSession?.id;
              return (
                <button
                  key={note.feedback_session_key || note.submitted_at || note.id || `${note.block_id}_${index}`}
                  onClick={() => {
                    if (note.received_session_id && note.received_session_id !== activeSession?.id) {
                      handleSelectSession(note.received_session_id);
                      setPendingScrollBlockId(note.block_id);
                      return;
                    }
                    scrollToBlock(note.block_id);
                  }}
                  style={{
                    textAlign: 'left',
                    background: note.color || '#fef08a',
                    borderRadius: 6,
                    padding: '8px 10px',
                    boxShadow: '1px 2px 6px rgba(0,0,0,0.08)',
                    border: active ? '1px solid rgba(37,99,235,0.35)' : '1px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  {pos && (
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#2563eb',
                        marginBottom: 6,
                        background: 'rgba(37,99,235,0.08)',
                        borderRadius: 4,
                        padding: '2px 7px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        border: '1px solid rgba(37,99,235,0.2)',
                      }}
                    >
                      ↳ {pos}
                    </div>
                  )}
                  {meta && (
                    <div style={{ fontSize: 10, color: '#666', fontWeight: 600, marginBottom: 6 }}>
                      {meta}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: '#111', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {note.content}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
