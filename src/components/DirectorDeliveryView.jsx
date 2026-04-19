/**
 * DirectorDeliveryView
 * 작가가 연출 전송 링크(#delivery=UUID)를 열었을 때 보이는 화면
 * - DirectorScriptViewer(readOnly)로 코멘트 인라인 표시
 * - 우측 패널: 코멘트 목록 (위치 뱃지 클릭 → 해당 블록 스크롤)
 * - "연출노트로 저장" → localStorage에 버전 누적 저장
 */
import { useState, useEffect } from 'react';
import { supabase } from '../store/supabaseClient';
import DirectorScriptViewer from './director/DirectorScriptViewer';
import { getBlockPosition, scrollToBlock } from '../utils/blockPosition';
import { getAll } from '../store/db';

const DELIVERY_STORAGE_KEY = 'director_deliveries_received';

export function getReceivedDeliveries() {
  try { return JSON.parse(localStorage.getItem(DELIVERY_STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveReceived(list) {
  localStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify(list));
}

export default function DirectorDeliveryView() {
  const [delivery,     setDelivery]     = useState(null);
  const [bad,          setBad]          = useState(false);
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [panelOpen,    setPanelOpen]    = useState(true);

  // 작품 선택 다이얼로그
  const [pickerOpen,   setPickerOpen]   = useState(false);
  const [projects,     setProjects]     = useState([]);
  const [pickedProjId, setPickedProjId] = useState('');

  const deliveryId = window.location.hash.slice('#delivery='.length);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  useEffect(() => {
    if (!supabase || !deliveryId || !UUID_RE.test(deliveryId)) { setBad(true); return; }
    supabase
      .from('director_deliveries')
      .select('*')
      .eq('id', deliveryId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setBad(true); return; }
        setDelivery(data);
        const existing = getReceivedDeliveries();
        if (existing.some(d => d.id === data.id)) setAlreadySaved(true);
      });
  }, [deliveryId]);

  const openPicker = async () => {
    if (!delivery) return;
    const existing = getReceivedDeliveries();
    if (existing.some(d => d.id === delivery.id)) { setAlreadySaved(true); return; }
    const list = await getAll('projects');
    setProjects(list || []);
    setPickedProjId(list?.[0]?.id || '');
    setPickerOpen(true);
  };

  const handleConfirmSave = () => {
    if (!delivery) return;
    const existing = getReceivedDeliveries();
    if (existing.some(d => d.id === delivery.id)) { setAlreadySaved(true); setPickerOpen(false); return; }
    saveReceived([{
      id:        delivery.id,
      title:     delivery.script_snapshot?.projects?.[0]?.title || '연출노트',
      savedAt:   new Date().toISOString(),
      createdAt: delivery.created_at,
      appState:  delivery.script_snapshot,
      notes:     delivery.notes_snapshot || [],
      projectId: pickedProjId || null,
    }, ...existing]);
    window.dispatchEvent(new Event('drama_delivery_changed'));
    setSaved(true);
    setAlreadySaved(true);
    setPickerOpen(false);
  };

  if (bad) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 14 }}>
      링크가 올바르지 않거나 만료되었습니다.
    </div>
  );
  if (!delivery) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13 }}>
      불러오는 중…
    </div>
  );

  const appState   = { ...(delivery.script_snapshot || {}), initialized: true };
  const selections = delivery.script_snapshot?.selections || { cover: true, synopsis: true, episodes: {}, chars: true };
  const title      = delivery.script_snapshot?.projects?.[0]?.title || '연출노트';
  const notes      = delivery.notes_snapshot || [];
  const panelW     = panelOpen ? 280 : 44;

  // notes_snapshot → { [block_id]: note } 맵
  const notesMap = {};
  notes.forEach(n => { if (n.block_id) notesMap[n.block_id] = n; });

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif" }}>

      {/* 헤더 */}
      <header style={{
        height: 52, flexShrink: 0,
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
        borderBottom: '1px solid #e0e0e0', background: '#fafafa',
      }}>
        <button onClick={() => { window.location.hash = ''; }}
          style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          ← 대본 작업실
        </button>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{title} — 연출노트</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {saved && <span style={{ fontSize: 12, color: '#4caf50' }}>저장됨 ✓</span>}
          <button onClick={openPicker} disabled={alreadySaved}
            style={{
              padding: '5px 14px', borderRadius: 6, border: 'none',
              background: alreadySaved ? '#ccc' : '#1a1a2e',
              color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: alreadySaved ? 'default' : 'pointer',
            }}>
            {alreadySaved ? '이미 저장됨' : '연출노트로 저장'}
          </button>
        </div>
      </header>

      {/* 본문 */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>

        {/* 대본 뷰어 (readOnly, 코멘트 인라인) */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', background: '#d8d8d8' }}>
          <DirectorScriptViewer
            appState={appState}
            selections={selections}
            readOnly={true}
            initialNotes={notesMap}
          />
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

      {/* 작품 선택 다이얼로그 */}
      {pickerOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '24px 28px',
            minWidth: 320, maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>어떤 작품의 피드백으로 저장할까요?</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: -8 }}>
              선택한 작품의 씬리스트 아래 피드백 노트로 저장됩니다.
            </div>
            {projects.length === 0 ? (
              <div style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: '12px 0' }}>
                저장된 작품이 없습니다.<br />
                대본 작업실에서 작품을 먼저 만들어주세요.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {projects.map(p => (
                  <label key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${pickedProjId === p.id ? '#1a1a2e' : '#e0e0e0'}`,
                    background: pickedProjId === p.id ? '#f0f0f8' : '#fafafa',
                  }}>
                    <input
                      type="radio"
                      name="pick-project"
                      value={p.id}
                      checked={pickedProjId === p.id}
                      onChange={() => setPickedProjId(p.id)}
                      style={{ accentColor: '#1a1a2e' }}
                    />
                    <span style={{ fontSize: 13, color: '#111', fontWeight: pickedProjId === p.id ? 600 : 400 }}>
                      {p.title || '(제목 없음)'}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setPickerOpen(false)}
                style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#555' }}
              >취소</button>
              <button
                onClick={handleConfirmSave}
                disabled={projects.length === 0 || !pickedProjId}
                style={{
                  padding: '6px 16px', borderRadius: 6, border: 'none',
                  background: projects.length === 0 || !pickedProjId ? '#ccc' : '#1a1a2e',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: projects.length === 0 || !pickedProjId ? 'default' : 'pointer',
                }}
              >저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
