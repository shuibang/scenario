/**
 * DirectorNotesPage — 작가 대본작업실 내 연출노트 페이지
 * - 연출자에게 받은 전송본을 버전별로 목록 표시
 * - 선택 시 DirectorScriptViewer(readOnly) + 우측 코멘트 패널
 * - 코멘트 위치 뱃지 클릭 → 해당 블록으로 스크롤
 */
import { useState } from 'react';
import { getReceivedDeliveries } from './DirectorDeliveryView';
import DirectorScriptViewer from './director/DirectorScriptViewer';
import { getBlockPosition, scrollToBlock } from '../utils/blockPosition';

const DELIVERY_STORAGE_KEY = 'director_deliveries_received';

export default function DirectorNotesPage() {
  const [deliveries, setDeliveries] = useState(() => getReceivedDeliveries());
  const [selected,   setSelected]   = useState(deliveries[0] || null);
  const [panelOpen,  setPanelOpen]  = useState(true);

  const handleDelete = (id) => {
    const next = deliveries.filter(d => d.id !== id);
    localStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify(next));
    setDeliveries(next);
    if (selected?.id === id) setSelected(next[0] || null);
  };

  if (deliveries.length === 0) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center', color: 'var(--c-text5)', fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.4 }}>🎬</div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>받은 연출노트가 없습니다</div>
        <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--c-text6)' }}>
          연출자에게 검토 링크를 공유하고,<br />
          연출자가 연출노트를 전송하면 여기에 표시됩니다.
        </div>
      </div>
    );
  }

  const notes      = selected?.notes || [];
  const appState   = selected ? { ...(selected.appState || {}), initialized: true } : null;
  const selections = selected?.appState?.selections || { cover: true, synopsis: true, episodes: {}, chars: true };
  const panelW     = panelOpen ? 260 : 44;

  // notes_snapshot 배열 → { [block_id]: note } 맵 (DirectorScriptViewer initialNotes 형식)
  const notesMap = {};
  notes.forEach(n => { if (n.block_id) notesMap[n.block_id] = n; });

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--c-bg)' }}>

      {/* 좌: 버전 목록 */}
      <div style={{
        width: 220, flexShrink: 0,
        borderRight: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid var(--c-border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text5)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>받은 연출노트</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {deliveries.map(d => {
            const date   = new Date(d.savedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
            const active = selected?.id === d.id;
            return (
              <div key={d.id}
                style={{
                  display: 'flex', alignItems: 'center',
                  borderLeft: active ? '2px solid var(--c-accent)' : '2px solid transparent',
                  background: active ? 'var(--c-active)' : 'transparent',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--c-hover)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <div onClick={() => setSelected(d)}
                  style={{ flex: 1, padding: '9px 8px 9px 16px', cursor: 'pointer', minWidth: 0 }}
                >
                  <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? 'var(--c-accent)' : 'var(--c-text)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.title}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--c-text5)' }}>
                    코멘트 {d.notes?.length || 0}개 · {date}
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(d.id); }}
                  style={{
                    flexShrink: 0, marginRight: 8,
                    width: 22, height: 22, borderRadius: 4,
                    border: '1px solid var(--c-border)', background: 'transparent',
                    color: 'var(--c-text5)', fontSize: 12, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1,
                  }}
                  title="삭제"
                >×</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 중: 대본 뷰어 (readOnly, 코멘트 인라인 표시) */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', background: '#d8d8d8' }}>
        {appState ? (
          <DirectorScriptViewer
            appState={appState}
            selections={selections}
            readOnly={true}
            initialNotes={notesMap}
          />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>
            좌측에서 버전을 선택하세요
          </div>
        )}
      </div>

      {/* 코멘트 패널 */}
      <div style={{
        width: panelW, flexShrink: 0,
        background: '#fff', borderLeft: '1px solid #ddd',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s ease', overflow: 'hidden',
      }}>
        <div style={{ height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid #eee', gap: 8 }}>
          {panelOpen && <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#222' }}>코멘트 <span style={{ fontSize: 11, fontWeight: 400, color: '#999' }}>({notes.length})</span></span>}
          <button onClick={() => setPanelOpen(v => !v)}
            style={{ background: 'none', border: '1px solid #e0e0e0', borderRadius: 5, cursor: 'pointer', fontSize: 11, color: '#888', padding: '3px 8px' }}>
            {panelOpen ? '접기 ▾' : '▴'}
          </button>
        </div>
        {panelOpen && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {notes.length === 0 && (
              <div style={{ textAlign: 'center', color: '#bbb', fontSize: 12, marginTop: 24 }}>코멘트가 없습니다.</div>
            )}
            {notes.map((n, i) => {
              const pos = getBlockPosition(n.block_id, appState?.scriptBlocks);
              return (
                <div key={n.id || i} style={{
                  background: n.color || '#fef08a', borderRadius: 6, padding: '8px 10px',
                  boxShadow: '1px 2px 6px rgba(0,0,0,0.08)',
                }}>
                  {pos && (
                    <div
                      onClick={() => scrollToBlock(n.block_id)}
                      title="클릭하면 해당 위치로 이동"
                      style={{
                        fontSize: 10, fontWeight: 700, color: '#2563eb', marginBottom: 6,
                        background: 'rgba(37,99,235,0.08)', borderRadius: 4,
                        padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: 3,
                        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        cursor: 'pointer', border: '1px solid rgba(37,99,235,0.2)',
                      }}
                    >📍 {pos}</div>
                  )}
                  <div style={{ fontSize: 13, color: '#111', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {n.content}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
