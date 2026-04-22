import { useEffect, useMemo, useState } from 'react';
import DirectorScriptViewer from './director/DirectorScriptViewer';
import { getBlockPosition, scrollToBlock } from '../utils/blockPosition';
import { buildFeedbackNoteMeta } from '../utils/feedbackNoteMeta';
import { useApp } from '../store/AppContext';
import {
  buildFeedbackNotesByBlock,
  buildFeedbackViewerState,
  clearFeedbackFocus,
  readFeedbackFocus,
  sortFeedbackCommentsByDocumentOrder,
} from '../utils/feedbackVersions';
import {
  deleteFeedbackVersion,
  listFeedbackComments,
  listFeedbackSessionsForVersions,
  listFeedbackVersions,
  markFeedbackSessionRead,
  renameFeedbackVersion,
} from '../utils/reviewShare';

const ACTIVE_VERSION_KEY = 'drama_active_feedback_version_id';
const ACTIVE_SESSION_KEY = 'drama_active_feedback_session_id';

function getUnreadCountByVersion(sessions) {
  return (sessions || []).reduce((map, session) => {
    if (!session?.version_id || session.is_read) return map;
    map.set(session.version_id, (map.get(session.version_id) || 0) + 1);
    return map;
  }, new Map());
}

function FeedbackDeleteModal({ open, versionName, sessionCount, commentCount, onClose, onConfirm, deleting }) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#fff',
          borderRadius: 14,
          boxShadow: '0 20px 50px rgba(0,0,0,0.24)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>버전을 삭제할까요?</div>
        <div style={{ fontSize: 13, color: '#555', lineHeight: 1.7 }}>
          <strong>{versionName}</strong> 버전과 여기에 달린 피드백 {commentCount}건, 세션 {sessionCount}개,
          Drive 스냅샷이 모두 삭제됩니다.
          <br />
          복구할 수 없습니다.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            disabled={deleting}
            style={{
              padding: '9px 14px',
              borderRadius: 8,
              border: '1px solid #ddd',
              background: '#fff',
              color: '#666',
              cursor: deleting ? 'default' : 'pointer',
              fontSize: 13,
            }}
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: 'none',
              background: deleting ? '#fca5a5' : '#dc2626',
              color: '#fff',
              cursor: deleting ? 'default' : 'pointer',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {deleting ? '삭제 중...' : '영구 삭제'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DirectorNotesPage() {
  const { state } = useApp();
  const activeProjectId = state.activeProjectId;
  const [versions, setVersions] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [comments, setComments] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState(() => localStorage.getItem(ACTIVE_VERSION_KEY) || null);
  const [activeSessionId, setActiveSessionId] = useState(() => localStorage.getItem(ACTIVE_SESSION_KEY) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);
  const [renameVersionId, setRenameVersionId] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteVersionId, setDeleteVersionId] = useState('');

  useEffect(() => {
    if (!activeProjectId) {
      setVersions([]);
      setAllSessions([]);
      setComments([]);
      setSelectedVersionId(null);
      setActiveSessionId(null);
      return;
    }

    let mounted = true;
    const focus = readFeedbackFocus();

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const nextVersions = await listFeedbackVersions(activeProjectId);
        const nextSessions = await listFeedbackSessionsForVersions(nextVersions.map((version) => version.id));
        if (!mounted) return;

        setVersions(nextVersions);
        setAllSessions(nextSessions);

        const storedVersionId = localStorage.getItem(ACTIVE_VERSION_KEY);
        const preferredVersionId =
          (focus?.scriptId === activeProjectId && focus?.versionId) ||
          storedVersionId ||
          selectedVersionId ||
          nextVersions[0]?.id ||
          null;
        const resolvedVersionId =
          nextVersions.find((version) => version.id === preferredVersionId)?.id || nextVersions[0]?.id || null;
        setSelectedVersionId(resolvedVersionId);
        if (resolvedVersionId) localStorage.setItem(ACTIVE_VERSION_KEY, resolvedVersionId);
        else localStorage.removeItem(ACTIVE_VERSION_KEY);
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError.message || '피드백 노트를 불러오지 못했습니다.');
        setVersions([]);
        setAllSessions([]);
        setComments([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [activeProjectId]);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) || versions[0] || null,
    [selectedVersionId, versions]
  );

  const versionSessions = useMemo(
    () =>
      allSessions
        .filter((session) => session.version_id === selectedVersion?.id)
        .sort(
          (left, right) =>
            new Date(right?.submitted_at || 0).getTime() - new Date(left?.submitted_at || 0).getTime()
        ),
    [allSessions, selectedVersion]
  );

  useEffect(() => {
    if (!selectedVersion) {
      setComments([]);
      setActiveSessionId(null);
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return;
    }

    let mounted = true;
    const focus = readFeedbackFocus();

    const loadComments = async () => {
      try {
        setComments([]);
        const nextComments = await listFeedbackComments(versionSessions.map((session) => session.id));
        if (!mounted) return;
        setComments(nextComments);

        const storedSessionId = localStorage.getItem(ACTIVE_SESSION_KEY);
        const preferredSessionId =
          (focus?.scriptId === activeProjectId && focus?.versionId === selectedVersion.id && focus?.sessionId) ||
          storedSessionId ||
          activeSessionId ||
          versionSessions.find((session) => !session.is_read)?.id ||
          versionSessions[0]?.id ||
          null;
        const resolvedSessionId =
          versionSessions.find((session) => session.id === preferredSessionId)?.id ||
          versionSessions[0]?.id ||
          null;

        setActiveSessionId(resolvedSessionId);
        if (resolvedSessionId) localStorage.setItem(ACTIVE_SESSION_KEY, resolvedSessionId);
        else localStorage.removeItem(ACTIVE_SESSION_KEY);

        if (focus?.scriptId === activeProjectId && focus?.versionId === selectedVersion.id) {
          clearFeedbackFocus();
        }
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError.message || '피드백 코멘트를 불러오지 못했습니다.');
        setComments([]);
      }
    };

    loadComments();
    return () => {
      mounted = false;
    };
  }, [activeProjectId, selectedVersion, versionSessions]);

  useEffect(() => {
    if (!activeSessionId) return;
    const activeSession = versionSessions.find((session) => session.id === activeSessionId);
    if (!activeSession || activeSession.is_read) return;

    markFeedbackSessionRead(activeSessionId)
      .then((updated) => {
        if (!updated) return;
        setAllSessions((current) =>
          current.map((session) =>
            session.id === activeSessionId
              ? { ...session, is_read: true, read_at: updated.read_at || new Date().toISOString() }
              : session
          )
        );
      })
      .catch(() => {});
  }, [activeSessionId, versionSessions]);

  const viewer = useMemo(
    () => buildFeedbackViewerState(selectedVersion?.snapshot_content || null),
    [selectedVersion]
  );

  const sortedComments = useMemo(
    () => sortFeedbackCommentsByDocumentOrder(comments, viewer.appState, versionSessions),
    [comments, versionSessions, viewer.appState]
  );

  const notesMap = useMemo(
    () => buildFeedbackNotesByBlock(sortedComments, versionSessions),
    [sortedComments, versionSessions]
  );

  const unreadCountByVersion = useMemo(
    () => getUnreadCountByVersion(allSessions),
    [allSessions]
  );

  const deleteTarget = useMemo(
    () => versions.find((version) => version.id === deleteVersionId) || null,
    [deleteVersionId, versions]
  );

  const deleteTargetSessionCount = useMemo(
    () => allSessions.filter((session) => session.version_id === deleteTarget?.id).length,
    [allSessions, deleteTarget]
  );

  const deleteTargetCommentCount = useMemo(() => {
    if (!deleteTarget) return 0;
    const sessionIds = new Set(
      allSessions.filter((session) => session.version_id === deleteTarget.id).map((session) => session.id)
    );
    return comments.filter((comment) => sessionIds.has(comment.session_id)).length;
  }, [allSessions, comments, deleteTarget]);

  const handleSelectVersion = (versionId) => {
    setSelectedVersionId(versionId);
    if (versionId) localStorage.setItem(ACTIVE_VERSION_KEY, versionId);
    else localStorage.removeItem(ACTIVE_VERSION_KEY);
  };

  const handleSelectSession = (sessionId, blockId = '') => {
    setActiveSessionId(sessionId);
    if (sessionId) localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    if (blockId) scrollToBlock(blockId);
  };

  const handleRenameSubmit = async (versionId) => {
    const nextName = String(renameValue || '').trim();
    if (!nextName) return;
    try {
      const updated = await renameFeedbackVersion(versionId, nextName);
      setVersions((current) =>
        current.map((version) =>
          version.id === versionId ? { ...version, version_name: updated.version_name } : version
        )
      );
      setRenameVersionId('');
      setRenameValue('');
    } catch (renameError) {
      setError(renameError.message || '버전 이름을 바꾸지 못했습니다.');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteFeedbackVersion(deleteTarget);
      const nextVersions = versions.filter((version) => version.id !== deleteTarget.id);
      const nextSessions = allSessions.filter((session) => session.version_id !== deleteTarget.id);
      const remainingSessionIds = new Set(nextSessions.map((session) => session.id));
      setVersions(nextVersions);
      setAllSessions(nextSessions);
      setComments((current) => current.filter((comment) => remainingSessionIds.has(comment.session_id)));
      const nextSelectedVersionId = nextVersions[0]?.id || null;
      setSelectedVersionId(nextSelectedVersionId);
      if (nextSelectedVersionId) localStorage.setItem(ACTIVE_VERSION_KEY, nextSelectedVersionId);
      else localStorage.removeItem(ACTIVE_VERSION_KEY);
      setDeleteVersionId('');
    } catch (deleteError) {
      setError(deleteError.message || '버전을 삭제하지 못했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  if (!activeProjectId) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center', color: 'var(--c-text5)', fontSize: 13 }}>
        프로젝트를 먼저 선택해 주세요.
      </div>
    );
  }

  if (loading && versions.length === 0) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center', color: 'var(--c-text5)', fontSize: 13 }}>
        피드백 노트를 불러오는 중...
      </div>
    );
  }

  if (error && versions.length === 0) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center', color: '#dc2626', fontSize: 13, lineHeight: 1.7 }}>
        {error}
        <br />
        새 피드백 구조용 Supabase 마이그레이션이 아직 적용되지 않았다면 먼저 반영해 주세요.
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center', color: 'var(--c-text5)', fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.4 }}>메모</div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>아직 버전 피드백이 없습니다</div>
        <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--c-text6)' }}>
          공유 링크를 만들면 버전이 생성되고,
          <br />
          연출이 회신한 피드백이 여기에 쌓입니다.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--c-bg)' }}>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', background: '#d8d8d8' }}>
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '10px 14px',
            borderBottom: '1px solid #d7d7d7',
            background: 'rgba(250,250,250,0.96)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto' }}>
            {versions.map((version) => {
              const unreadCount = unreadCountByVersion.get(version.id) || 0;
              const active = version.id === selectedVersion?.id;
              const editing = renameVersionId === version.id;
              return editing ? (
                <div
                  key={version.id}
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: '#fff',
                    border: '1px solid #2563eb',
                  }}
                >
                  <input
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleRenameSubmit(version.id);
                      if (event.key === 'Escape') {
                        setRenameVersionId('');
                        setRenameValue('');
                      }
                    }}
                    style={{
                      width: 90,
                      border: 'none',
                      outline: 'none',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  />
                  <button
                    onClick={() => handleRenameSubmit(version.id)}
                    style={{ border: 'none', background: 'none', color: '#2563eb', fontSize: 11, cursor: 'pointer' }}
                  >
                    저장
                  </button>
                </div>
              ) : (
                <button
                  key={version.id}
                  onClick={() => handleSelectVersion(version.id)}
                  onDoubleClick={() => {
                    setRenameVersionId(version.id);
                    setRenameValue(version.version_name);
                  }}
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
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>{version.version_name}</span>
                  {unreadCount > 0 && (
                    <span
                      style={{
                        minWidth: 18,
                        height: 18,
                        padding: '0 5px',
                        borderRadius: 999,
                        background: '#dc2626',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}

            {selectedVersion && (
              <>
                <button
                  onClick={() => {
                    setRenameVersionId(selectedVersion.id);
                    setRenameValue(selectedVersion.version_name);
                  }}
                  style={{
                    flexShrink: 0,
                    padding: '7px 12px',
                    borderRadius: 999,
                    border: '1px solid #d7d7d7',
                    background: '#fff',
                    color: '#555',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  이름 변경
                </button>
                <button
                  onClick={() => setDeleteVersionId(selectedVersion.id)}
                  style={{
                    flexShrink: 0,
                    padding: '7px 12px',
                    borderRadius: 999,
                    border: '1px solid #fecaca',
                    background: '#fff5f5',
                    color: '#b91c1c',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  버전 삭제
                </button>
              </>
            )}
          </div>

          {versionSessions.length > 0 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
              {versionSessions.map((session) => {
                const active = session.id === activeSessionId;
                const meta =
                  buildFeedbackNoteMeta({
                    sender_display_name: session.sender_display_name,
                    submitted_at: session.submitted_at,
                  }) || session.sender_display_name;
                return (
                  <button
                    key={session.id}
                    onClick={() => handleSelectSession(session.id)}
                    style={{
                      flexShrink: 0,
                      padding: '6px 11px',
                      borderRadius: 999,
                      border: active ? '1px solid #2563eb' : '1px solid #e5e7eb',
                      background: active ? '#eff6ff' : '#fff',
                      color: active ? '#1d4ed8' : '#666',
                      fontSize: 11,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>{meta}</span>
                    {!session.is_read && (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: '#dc2626',
                          display: 'inline-block',
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {error && (
            <div style={{ fontSize: 12, color: '#dc2626' }}>
              {error}
            </div>
          )}
        </div>

        <DirectorScriptViewer
          appState={viewer.appState}
          selections={viewer.selections}
          readOnly={true}
          initialNotes={notesMap}
          highlightSessionId={activeSessionId}
        />
      </div>

      <div
        style={{
          width: panelOpen ? 280 : 44,
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
              코멘트 <span style={{ fontSize: 11, fontWeight: 400, color: '#999' }}>({sortedComments.length})</span>
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
            {sortedComments.length === 0 && (
              <div style={{ textAlign: 'center', color: '#bbb', fontSize: 12, marginTop: 24 }}>
                코멘트가 없습니다.
              </div>
            )}

            {sortedComments.map((comment, index) => {
              const blockId = comment?.line_ref?.block_id || '';
              const session = versionSessions.find((item) => item.id === comment.session_id) || null;
              const meta = buildFeedbackNoteMeta({
                sender_display_name: session?.sender_display_name,
                submitted_at: session?.submitted_at,
              });
              const active = comment.session_id === activeSessionId;
              const position = getBlockPosition(blockId, viewer.appState?.scriptBlocks);
              return (
                <button
                  key={comment.id || `${blockId}_${index}`}
                  onClick={() => handleSelectSession(comment.session_id, blockId)}
                  style={{
                    textAlign: 'left',
                    background: comment?.line_ref?.color || '#fef08a',
                    borderRadius: 6,
                    padding: '8px 10px',
                    boxShadow: '1px 2px 6px rgba(0,0,0,0.08)',
                    border: active ? '1px solid rgba(37,99,235,0.35)' : '1px solid transparent',
                    cursor: 'pointer',
                    opacity: activeSessionId && !active ? 0.72 : 1,
                  }}
                >
                  {position && (
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
                      {position}
                    </div>
                  )}
                  {meta && (
                    <div style={{ fontSize: 10, color: '#666', fontWeight: 600, marginBottom: 6 }}>
                      {meta}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: '#111', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {comment.comment_text}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <FeedbackDeleteModal
        open={!!deleteTarget}
        versionName={deleteTarget?.version_name || ''}
        sessionCount={deleteTargetSessionCount}
        commentCount={deleteTargetCommentCount}
        onClose={() => setDeleteVersionId('')}
        onConfirm={handleDeleteConfirm}
        deleting={deleting}
      />
    </div>
  );
}
