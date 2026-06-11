import { useEffect, useMemo, useRef, useState } from 'react';
import DirectorScriptViewer from './director/DirectorScriptViewer';
import HandwritingCanvas from './director/HandwritingCanvas';
import { getBlockPosition, scrollToBlock } from '../utils/blockPosition';
import { buildFeedbackNoteMeta } from '../utils/feedbackNoteMeta';
import { loadFeedbackLinkBundle } from '../utils/reviewShare';
import {
  buildFeedbackNotesByBlock,
  buildFeedbackViewerState,
  saveFeedbackFocus,
  sortFeedbackCommentsByDocumentOrder,
} from '../utils/feedbackVersions';

const LAST_ACTIVE_KEY = 'drama_last_active';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function DirectorDeliveryView() {
  const [bundle, setBundle] = useState(null);
  const [bad, setBad] = useState(false);
  const [expired, setExpired] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [handwritingMode, setHandwritingMode] = useState(false);
  const [activeTool, setActiveTool] = useState('pen');
  const scrollContainerRef = useRef(null);

  const deliveryId = window.location.hash.slice('#delivery='.length);

  useEffect(() => {
    if (!deliveryId || !UUID_RE.test(deliveryId)) {
      setBad(true);
      return;
    }

    loadFeedbackLinkBundle(deliveryId)
      .then((data) => {
        if (data?.link?.link_role !== 'reply') {
          setBad(true);
          return;
        }
        setBundle(data);
      })
      .catch((error) => {
        if (error?.message === 'EXPIRED') setExpired(true);
        else setBad(true);
      });
  }, [deliveryId]);

  const viewer = useMemo(
    () => buildFeedbackViewerState(bundle?.version?.snapshot_content || null),
    [bundle]
  );
  const sessions = useMemo(() => (bundle?.session ? [bundle.session] : []), [bundle]);
  const comments = useMemo(() => bundle?.comments || [], [bundle]);
  const notesMap = useMemo(() => buildFeedbackNotesByBlock(comments, sessions), [comments, sessions]);
  const sortedComments = useMemo(
    () => sortFeedbackCommentsByDocumentOrder(comments, viewer.appState, sessions),
    [comments, sessions, viewer.appState]
  );
  const panelWidth = panelOpen ? 280 : 44;

  const openFeedbackNotes = () => {
    const focus = {
      scriptId: bundle?.version?.script_id || '',
      versionId: bundle?.version?.id || '',
      sessionId: bundle?.session?.id || '',
    };
    saveFeedbackFocus(focus);
    try {
      localStorage.setItem(
        LAST_ACTIVE_KEY,
        JSON.stringify({
          activeProjectId: focus.scriptId,
          activeEpisodeId: null,
          activeDoc: 'director_notes',
        })
      );
    } catch {}
    window.location.hash = '';
  };

  if (expired) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 14 }}>
        링크가 만료되었습니다. 연출에게 새 링크를 요청해 주세요.
      </div>
    );
  }

  if (bad) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 14 }}>
        링크가 올바르지 않거나 만료되었습니다.
      </div>
    );
  }

  if (!bundle) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13 }}>
        불러오는 중...
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif" }}>
      <header
        style={{
          height: 52,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 12,
          borderBottom: '1px solid #e0e0e0',
          background: '#fafafa',
        }}
      >
        <button
          onClick={() => {
            window.location.hash = '';
          }}
          style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          ← 대본 작업실
        </button>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>
          {viewer.title} 피드백 링크
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingRight: 8, borderRight: '1px solid #e0e0e0' }}>
            {handwritingMode && (
              <>
                {[['pen', '펜'], ['highlighter', '형광펜'], ['eraser', '지우개']].map(([tool, label]) => (
                  <button key={tool} onClick={() => setActiveTool(tool)} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: activeTool === tool ? 600 : 400, background: activeTool === tool ? 'var(--color-background-info)' : 'transparent', color: activeTool === tool ? 'var(--color-text-info)' : 'var(--color-text-secondary)' }}>
                    {label}
                  </button>
                ))}
              </>
            )}
            <button onClick={() => setHandwritingMode(prev => !prev)} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer', background: handwritingMode ? 'var(--color-background-info)' : 'transparent', color: handwritingMode ? 'var(--color-text-info)' : 'var(--color-text-secondary)' }}>
              ✏️ {handwritingMode ? '필기 중' : '필기'}
            </button>
          </div>
          <button
            onClick={openFeedbackNotes}
            style={{
              padding: '5px 14px',
              borderRadius: 6,
              border: 'none',
              background: '#1a1a2e',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            피드백 노트에서 열기
          </button>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div ref={scrollContainerRef} style={{ flex: 1, minWidth: 0, overflow: 'auto', background: '#d8d8d8', position: 'relative' }}>
          <DirectorScriptViewer
            appState={viewer.appState}
            selections={viewer.selections}
            readOnly={true}
            initialNotes={notesMap}
            highlightSessionId={bundle?.session?.id || null}
          />
          <HandwritingCanvas
            scriptLinkId={deliveryId}
            isActive={handwritingMode}
            containerRef={scrollContainerRef}
            activeTool={activeTool}
          />
        </div>

        <div
          style={{
            width: panelWidth,
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
                const position = getBlockPosition(blockId, viewer.appState?.scriptBlocks);
                const meta = buildFeedbackNoteMeta({
                  sender_display_name: bundle?.session?.sender_display_name,
                  submitted_at: bundle?.session?.submitted_at,
                });
                return (
                  <button
                    key={comment.id || `${blockId}_${index}`}
                    onClick={() => {
                      if (blockId) scrollToBlock(blockId);
                    }}
                    style={{
                      textAlign: 'left',
                      background: comment?.line_ref?.color || '#fef08a',
                      borderRadius: 6,
                      padding: '8px 10px',
                      boxShadow: '1px 2px 6px rgba(0,0,0,0.08)',
                      border: '1px solid transparent',
                      cursor: blockId ? 'pointer' : 'default',
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
      </div>
    </div>
  );
}
