import { useState, useEffect, useRef, createContext, useContext, Component, memo } from 'react';
import { supabaseSignOut, extractUserData, supabase, signInWithGoogle } from '../../store/supabaseClient';
import { setAccessToken, isTokenValid, loadDirectorScript, deleteFileById } from '../../store/googleDrive';
import DirectorScriptViewer from './DirectorScriptViewer';
import PreviewRenderer from '../../print/PreviewRenderer';
import { parseFullScript, buildPanelsFromScenes, detectScenes } from '../../utils/parseExternalScript';

// OAuth 리디렉트 시 현재 hash 보존 → App.jsx onAuthStateChange에서 복원
const RETURN_HASH_KEY = 'drama_pending_return_hash';

// AppContext 없이 독립적으로 동작하는 광고 배너
const DirectorAdBanner = memo(function DirectorAdBanner({ height = 20 }) {
  const ref = useRef(null);
  const pushed = useRef(false);
  useEffect(() => {
    if (pushed.current || !ref.current) return;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); pushed.current = true; } catch {}
  }, []);
  return (
    <div ref={ref} style={{ height, overflow: 'hidden' }}>
      <ins className="adsbygoogle"
        style={{ display: 'block', width: '100%', height }}
        data-ad-client="ca-pub-5479563960989185"
        data-ad-slot="2569066048"
        data-ad-format="autorelaxed"
      />
    </div>
  );
});

// ─── Error Boundary — 뷰어 render crash 시 검정화면 방지 ──────────────────────
class ViewerErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, textAlign: 'center', color: '#c00', fontSize: 13 }}>
          대본을 표시하는 중 오류가 발생했습니다.<br />
          <span style={{ color: '#999', fontSize: 11 }}>{String(this.state.error)}</span>
        </div>
      );
    }
    return this.props.children;
  }
}
function loginWithReturnHash() {
  try { localStorage.setItem(RETURN_HASH_KEY, window.location.hash); } catch {}
  signInWithGoogle();
}

// ─── 연출 작업실 전용 디자인 토큰 ─────────────────────────────────────────────
const D_DARK = {
  bg:        '#0d0f14',
  panel:     '#13161d',
  sidebar:   '#0a0c10',
  card:      '#1a1e28',
  border:    '#252a38',
  accent:    '#e8b84b',
  accentDim: '#a07e28',
  text:      '#e8eaf0',
  text2:     '#9aa0b4',
  text3:     '#5a6077',
  active:    'rgba(232,184,75,0.12)',
  canvasBg:  '#1a1e28',
  canvasPen: '#e8eaf0',
};
const D_LIGHT = {
  bg:        '#f4f5f7',
  panel:     '#ffffff',
  sidebar:   '#f0f2f5',
  card:      '#ffffff',
  border:    '#dde1e8',
  accent:    '#c9922a',
  accentDim: '#a07820',
  text:      '#1a1a2e',
  text2:     '#444860',
  text3:     '#8890a8',
  active:    'rgba(201,146,42,0.10)',
  canvasBg:  '#f5f0e8',
  canvasPen: '#1a1a1a',
};

const ThemeCtx = createContext(D_DARK);
const useD = () => useContext(ThemeCtx);

// ─── 모바일 레이아웃 상수 (대본 작업실 MobileBottomPanel 동일 기준) ──────────────
const M_TAB_H    = 64;   // 탭바 고정 높이 (px)
const M_OPEN_H   = 320;  // 열렸을 때 전체 높이 (px)
const M_CONT_H   = M_OPEN_H - M_TAB_H; // 콘텐츠 영역 = 244px
const M_AD_W     = '25%';
const M_LIST_W   = '75%';
const NOTE_COLORS_M = ['#fdf6e3', '#fef08a', '#86efac', '#93c5fd', '#f9a8d4'];

// ─── 연출 작업실 모바일 전용 레이아웃 ─────────────────────────────────────────
function DirectorMobileView({ session, onBack, isGuest, D, loginWithReturnHash, handleLogout, loggingOut }) {
  const [tab,        setTab]        = useState(isGuest ? 'storyboard' : 'projects');
  const [panelOpen,  setPanelOpen]  = useState(false);

  // 키보드 감지 (App.jsx 동일 패턴 — 소프트 키보드 올라오면 레이아웃 조정)
  const [vvHeight,    setVvHeight]    = useState(() => window.visualViewport?.height ?? window.innerHeight);
  const [vvOffsetTop, setVvOffsetTop] = useState(0);
  useEffect(() => {
    if (!window.visualViewport) return;
    const handler = () => { setVvHeight(window.visualViewport.height); setVvOffsetTop(window.visualViewport.offsetTop); };
    window.visualViewport.addEventListener('resize', handler, { passive: true });
    window.visualViewport.addEventListener('scroll', handler, { passive: true });
    return () => { window.visualViewport.removeEventListener('resize', handler); window.visualViewport.removeEventListener('scroll', handler); };
  }, []);
  const keyboardUp = (window.innerHeight - vvHeight - vvOffsetTop) > 100;

  // 공통: 작품 목록 (projects + notes + storyboard 탭 공유)
  const [scripts,      setScripts]      = useState(null);
  const [localScripts, setLocalScripts] = useState(() => loadLocalScripts());
  const [importOpen,   setImportOpen]   = useState(false);

  // 작품 탭 state
  const [projSelected,  setProjSelected]  = useState(null);
  const [projViewing,   setProjViewing]   = useState(null);  // { appState, selections }
  const [projLoading,   setProjLoading]   = useState(false);

  // 연출 탭 state
  const [noteScript,  setNoteScript]  = useState(null);
  const [notes,       setNotes]       = useState([]);
  const [adding,      setAdding]      = useState(false);
  const [newText,     setNewText]     = useState('');
  const [newColor,    setNewColor]    = useState(NOTE_COLORS_M[0]);
  const addRef = useRef(null);

  // 스토리보드 탭 state
  const [boardScript, setBoardScript] = useState(isGuest ? DEMO_SCRIPT : null);

  // ── 데이터 로드 ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLocalScripts(loadLocalScripts());
    if (isGuest) { setScripts([]); return; }
    if (!supabase) { setScripts([]); return; }
    supabase.from('shared_scripts').select('id, title, imported_at, drive_file_id')
      .order('imported_at', { ascending: false })
      .then(({ data }) => setScripts(data || []));
  }, []);

  useEffect(() => {
    if (!noteScript) { setNotes([]); return; }
    try {
      const map = JSON.parse(localStorage.getItem(`director_private_notes_${noteScript.id}`) || '{}');
      setNotes(Object.values(map).sort((a, b) => (a._localId || '').localeCompare(b._localId || '')));
    } catch { setNotes([]); }
  }, [noteScript?.id]);

  useEffect(() => { if (adding) setTimeout(() => addRef.current?.focus(), 50); }, [adding]);

  // ── 작품 탭: 대본 로드 ─────────────────────────────────────────────────────
  const loadProjScript = async (script) => {
    if (projSelected?.id === script.id) { setPanelOpen(false); return; }
    setProjSelected(script); setProjViewing(null); setProjLoading(true); setPanelOpen(false);
    try {
      if (!isTokenValid()) {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s?.provider_token) setAccessToken(s.provider_token, 3600);
      }
      const saved = await loadDirectorScript(script.drive_file_id);
      const data  = saved?.data ?? saved;
      setProjViewing({
        appState: { projects: data.projects||[], episodes: data.episodes||[], characters: data.characters||[], scenes: data.scenes||[], scriptBlocks: data.scriptBlocks||[], coverDocs: data.coverDocs||[], synopsisDocs: data.synopsisDocs||[], activeProjectId: data.activeProjectId, stylePreset: data.stylePreset||{}, initialized: true },
        selections: data.selections || { cover: true, synopsis: true, episodes: {}, chars: true },
      });
    } catch (e) {
      setProjViewing({ error: e.message });
    } finally { setProjLoading(false); }
  };

  // ── 연출 탭: 노트 저장/삭제 ────────────────────────────────────────────────
  const noteKey = () => `director_private_notes_${noteScript?.id}`;
  const loadNoteMap = () => { try { return JSON.parse(localStorage.getItem(noteKey()) || '{}'); } catch { return {}; } };
  const saveNoteMap = (map) => {
    localStorage.setItem(noteKey(), JSON.stringify(map));
    setNotes(Object.values(map).sort((a, b) => (a._localId || '').localeCompare(b._localId || '')));
  };
  const handleAddNote = () => {
    if (!newText.trim()) { setAdding(false); return; }
    const map = loadNoteMap();
    const blockId = `standalone_${Date.now()}`;
    map[blockId] = { _localId: String(Date.now()), block_id: blockId, content: newText.trim(), color: newColor };
    saveNoteMap(map);
    setNewText(''); setNewColor(NOTE_COLORS_M[0]); setAdding(false);
  };
  const handleDeleteNote = (localId) => {
    const map = loadNoteMap();
    const entry = Object.values(map).find(n => n._localId === localId);
    if (!entry) return;
    delete map[entry.block_id];
    saveNoteMap(map);
  };
  const getNoteCount = (scriptId) => {
    try { return Object.keys(JSON.parse(localStorage.getItem(`director_private_notes_${scriptId}`) || '{}')).length; } catch { return 0; }
  };

  const handleMobileImport = ({ id, title, text }) => {
    const entry = { id, title, text, createdAt: new Date().toISOString(), _isLocal: true };
    const updated = [entry, ...loadLocalScripts()];
    saveLocalScripts(updated);
    setLocalScripts(updated);
    setImportOpen(false);
  };

  // ── 탭 항목 ───────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'projects',   icon: '📄', label: '작품' },
    { id: 'notes',      icon: '📝', label: '연출' },
    { id: 'storyboard', icon: '🎞',  label: '보드' },
  ];

  // ── 바텀 패널: 탭별 목록 콘텐츠 ────────────────────────────────────────────
  const listContent = (() => {
    if (tab === 'projects') return (
      <div style={{ padding: '6px 0' }}>
        <div style={{ padding: '4px 12px 8px' }}>
          <button onClick={() => setImportOpen(true)}
            style={{ width: '100%', padding: '7px 12px', borderRadius: 6, border: `1px solid ${D.accent}`, background: 'transparent', color: D.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            + 텍스트로 가져오기
          </button>
        </div>
        {localScripts.length > 0 && (
          <>
            <div style={{ padding: '2px 14px', fontSize: 10, color: D.text3, opacity: 0.7 }}>로컬</div>
            {localScripts.map(s => (
              <div key={s.id} onClick={() => { setProjSelected(s); setProjViewing({ localText: s.text || '' }); setPanelOpen(false); }}
                style={{ padding: '9px 14px', borderLeft: projSelected?.id === s.id ? `2px solid ${D.accent}` : '2px solid transparent', background: projSelected?.id === s.id ? D.active : 'transparent', cursor: 'pointer' }}>
                <div style={{ fontSize: 13, fontWeight: projSelected?.id === s.id ? 600 : 400, color: projSelected?.id === s.id ? D.accent : D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📁 {s.title}</div>
              </div>
            ))}
            {(scripts?.length ?? 0) > 0 && <div style={{ height: 1, background: D.border, margin: '4px 0' }} />}
          </>
        )}
        {scripts === null && <div style={{ padding: '16px', fontSize: 12, color: D.text3 }}>불러오는 중…</div>}
        {scripts?.length === 0 && localScripts.length === 0 && <div style={{ padding: '12px 14px', fontSize: 12, color: D.text3, textAlign: 'center' }}>가져온 작품이 없습니다</div>}
        {(scripts?.length ?? 0) > 0 && <div style={{ padding: '2px 14px', fontSize: 10, color: D.text3, opacity: 0.7 }}>클라우드</div>}
        {scripts?.map(s => (
          <div key={s.id} onClick={() => loadProjScript(s)}
            style={{ padding: '10px 14px', borderLeft: projSelected?.id === s.id ? `2px solid ${D.accent}` : '2px solid transparent', background: projSelected?.id === s.id ? D.active : 'transparent', cursor: 'pointer' }}>
            <div style={{ fontSize: 13, fontWeight: projSelected?.id === s.id ? 600 : 400, color: projSelected?.id === s.id ? D.accent : D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
          </div>
        ))}
      </div>
    );

    if (tab === 'notes') return (
      <div style={{ padding: '6px 0' }}>
        {localScripts.length > 0 && (
          <>
            <div style={{ padding: '2px 14px', fontSize: 10, color: D.text3, opacity: 0.7 }}>로컬</div>
            {localScripts.map(s => {
              const cnt = getNoteCount(s.id);
              const active = noteScript?.id === s.id;
              return (
                <div key={s.id} onClick={() => { setNoteScript(s); setAdding(false); setPanelOpen(false); }}
                  style={{ padding: '10px 14px', borderLeft: active ? `2px solid ${D.accent}` : '2px solid transparent', background: active ? D.active : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? D.accent : D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📁 {s.title}</div>
                    <div style={{ fontSize: 10, color: D.text3 }}>메모 {cnt}개 · 로컬</div>
                  </div>
                  {cnt > 0 && <div style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: '#93c5fd', color: '#1a1a2e', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cnt > 9 ? '9+' : cnt}</div>}
                </div>
              );
            })}
            {(scripts?.length ?? 0) > 0 && <div style={{ height: 1, background: D.border, margin: '4px 0' }} />}
          </>
        )}
        {scripts === null && <div style={{ padding: '16px', fontSize: 12, color: D.text3 }}>불러오는 중…</div>}
        {scripts?.length === 0 && localScripts.length === 0 && <div style={{ padding: '16px', fontSize: 12, color: D.text3, textAlign: 'center' }}>가져온 작품이 없습니다</div>}
        {scripts?.map(s => {
          const cnt = getNoteCount(s.id);
          const active = noteScript?.id === s.id;
          return (
            <div key={s.id} onClick={() => { setNoteScript(s); setAdding(false); setPanelOpen(false); }}
              style={{ padding: '10px 14px', borderLeft: active ? `2px solid ${D.accent}` : '2px solid transparent', background: active ? D.active : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? D.accent : D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                <div style={{ fontSize: 10, color: D.text3 }}>메모 {cnt}개</div>
              </div>
              {cnt > 0 && <div style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: '#93c5fd', color: '#1a1a2e', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cnt > 9 ? '9+' : cnt}</div>}
            </div>
          );
        })}
      </div>
    );

    if (tab === 'storyboard') return (
      <div style={{ padding: '8px 0' }}>
        <div style={{ padding: '4px 14px 10px' }}>
          <button
            onClick={() => { window.dispatchEvent(new CustomEvent('director:uploadOpen')); setPanelOpen(false); }}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: `1px solid ${D.accent}`, background: 'transparent', color: D.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            + 텍스트로 만들기
          </button>
        </div>
        {(() => {
          const localScripts = loadLocalScripts();
          const allScripts = [...localScripts, ...(scripts || [])];
          return allScripts.length === 0
            ? <div style={{ padding: '8px 14px', fontSize: 12, color: D.text3, textAlign: 'center' }}>작품이 없습니다</div>
            : allScripts.map(s => (
              <div key={s.id} onClick={() => { setBoardScript(s); setPanelOpen(false); }}
                style={{ padding: '9px 14px', borderLeft: boardScript?.id === s.id ? `2px solid ${D.accent}` : '2px solid transparent', background: boardScript?.id === s.id ? D.active : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: D.text3, flexShrink: 0 }}>{s._isLocal ? '📁' : '☁'}</span>
                <span style={{ fontSize: 13, fontWeight: boardScript?.id === s.id ? 600 : 400, color: boardScript?.id === s.id ? D.accent : D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.title}</span>
              </div>
            ));
        })()}
      </div>
    );
    return null;
  })();

  // ── 메인 콘텐츠 영역 ────────────────────────────────────────────────────────
  const mainContent = (() => {
    if (tab === 'projects') {
      if (!projSelected) return (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: D.text3 }}>
          <div style={{ fontSize: 32, opacity: 0.3 }}>📄</div>
          <div style={{ fontSize: 13 }}>아래 탭에서 작품을 선택하세요</div>
        </div>
      );
      if (projLoading) return (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.text3, fontSize: 13 }}>대본 불러오는 중…</div>
      );
      if (projViewing?.error) return (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e05c5c', fontSize: 13, padding: 16, textAlign: 'center' }}>{projViewing.error}</div>
      );
      if (projViewing?.localText !== undefined) return (
        <div style={{ height: '100%', overflowY: 'auto', padding: '16px', background: D.bg }}>
          <div style={{ fontSize: 11, color: D.text3, marginBottom: 10 }}>📁 {projSelected?.title} · 로컬</div>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, color: D.text, lineHeight: 1.9, fontFamily: 'inherit', margin: 0 }}>
            {projViewing.localText || '(내용 없음)'}
          </pre>
        </div>
      );
      if (projViewing) return (
        <div style={{ height: '100%', overflow: 'auto', background: '#d8d8d8' }}>
          <ViewerErrorBoundary>
            <DirectorScriptViewer appState={projViewing.appState} selections={projViewing.selections} readOnly />
          </ViewerErrorBoundary>
        </div>
      );
      return null;
    }

    if (tab === 'notes') {
      if (!noteScript) return (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: D.text3 }}>
          <div style={{ fontSize: 32, opacity: 0.3 }}>📋</div>
          <div style={{ fontSize: 13 }}>아래 탭에서 작품을 선택하세요</div>
        </div>
      );
      return (
        <div style={{ height: '100%', overflowY: 'auto', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: D.text }}>{noteScript.title}</div>
              <div style={{ fontSize: 11, color: D.text3 }}>📋 연출노트 {notes.length}개</div>
            </div>
            {!adding && (
              <button onClick={() => setAdding(true)} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: D.accent, color: '#1a1a1a', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>+ 새 노트</button>
            )}
          </div>
          {adding && (
            <div style={{ background: newColor, borderRadius: 10, padding: 14, marginBottom: 16, boxShadow: '2px 4px 16px rgba(0,0,0,0.18)', borderTop: '3px solid #93c5fd' }}>
              <textarea ref={addRef} value={newText} onChange={e => setNewText(e.target.value)} placeholder="연출노트 내용을 입력하세요…" rows={4}
                style={{ width: '100%', boxSizing: 'border-box', border: 'none', background: 'transparent', fontSize: 13, color: '#111', lineHeight: 1.7, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {NOTE_COLORS_M.map(c => (
                  <button key={c} onClick={() => setNewColor(c)} style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: newColor === c ? '2px solid #333' : 'none', outlineOffset: 2 }} />
                ))}
                <div style={{ flex: 1 }} />
                <button onClick={() => { setAdding(false); setNewText(''); }} style={{ fontSize: 12, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>취소</button>
                <button onClick={handleAddNote} disabled={!newText.trim()} style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: newText.trim() ? D.accent : '#999', color: newText.trim() ? '#1a1a1a' : '#eee', fontSize: 12, fontWeight: 700, cursor: newText.trim() ? 'pointer' : 'default' }}>저장</button>
              </div>
            </div>
          )}
          {notes.length === 0 && !adding && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: D.text3 }}>
              <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3 }}>📋</div>
              <div style={{ fontSize: 13 }}>연출노트가 없습니다</div>
            </div>
          )}
          {notes.map((n, i) => (
            <div key={n._localId || i} style={{ background: n.color || '#fef08a', borderRadius: 10, padding: '12px 14px', marginBottom: 12, boxShadow: '1px 2px 8px rgba(0,0,0,0.1)', position: 'relative' }}>
              <div style={{ fontSize: 13, color: '#111', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{n.content}</div>
              <button onClick={() => handleDeleteNote(n._localId)} style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      );
    }

    if (tab === 'storyboard') {
      return (
        <StoryboardPanel
          key={boardScript?.id || '__none'}
          isGuest={isGuest}
          isMobile={true}
          mobilePreSelected={boardScript}
        />
      );
    }

    return null;
  })();

  return (
    <div style={{
      position: 'fixed',
      top:    keyboardUp ? vvOffsetTop : 0,
      left: 0, right: 0,
      bottom: keyboardUp ? 'auto' : 0,
      height: keyboardUp ? vvHeight : undefined,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      background: D.bg, color: D.text, fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif",
    }}>

      {/* 상단 헤더 */}
      <header style={{
        height: 'clamp(44px, 12vw, 52px)', flexShrink: 0,
        display: 'flex', alignItems: 'center',
        paddingLeft: 'max(12px, env(safe-area-inset-left, 12px))',
        paddingRight: 'max(14px, env(safe-area-inset-right, 14px))',
        gap: 8, borderBottom: `1px solid ${D.border}`, background: D.sidebar,
      }}>
        <button onClick={onBack} style={{ fontSize: 18, color: D.text3, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>←</button>
        <div style={{ fontSize: 'clamp(13px, 4vw, 16px)', fontWeight: 700, color: D.accent, letterSpacing: '0.03em', flex: 1 }}>🎬 연출 작업실</div>
        {isGuest ? (
          <button onClick={loginWithReturnHash} style={{ fontSize: 12, color: D.accent, background: 'none', border: `1px solid ${D.accent}`, borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>로그인</button>
        ) : (
          <button onClick={handleLogout} disabled={loggingOut} style={{ fontSize: 12, color: D.text3, background: 'none', border: `1px solid ${D.border}`, borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>{loggingOut ? '…' : '로그아웃'}</button>
        )}
      </header>

      {/* 메인 콘텐츠 */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {mainContent}
      </div>

      {/* 하단 패널 (대본 작업실 MobileBottomPanel 동일 구조) */}
      <div style={{
        flexShrink: 0,
        borderTop: `1px solid ${D.border}`,
        background: D.panel,
        display: 'flex', flexDirection: 'column',
        height: `calc(${panelOpen ? M_OPEN_H : M_TAB_H}px + env(safe-area-inset-bottom, 0px))`,
        maxHeight: `calc(${panelOpen ? M_OPEN_H : M_TAB_H}px + env(safe-area-inset-bottom, 0px))`,
        minHeight: `calc(${panelOpen ? M_OPEN_H : M_TAB_H}px + env(safe-area-inset-bottom, 0px))`,
        transition: 'height 0.25s ease, max-height 0.25s ease, min-height 0.25s ease',
        overflow: 'hidden',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {/* 탭바 */}
        <div style={{ height: M_TAB_H, minHeight: M_TAB_H, flexShrink: 0, display: 'flex', alignItems: 'stretch', borderBottom: panelOpen ? `1px solid ${D.border}` : 'none', userSelect: 'none' }}>
          {TABS.map(({ id, icon, label }) => {
            const active = tab === id && panelOpen;
            return (
              <button key={id}
                onClick={() => { if (tab === id) { setPanelOpen(v => !v); } else { setTab(id); setPanelOpen(true); } }}
                style={{
                  flex: 1,
                  background: active ? D.active : 'none',
                  border: 'none', borderRight: `1px solid ${D.border}`,
                  cursor: 'pointer',
                  color: active ? D.accent : D.text3,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 4,
                  WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
                <span style={{ fontSize: 11, fontWeight: active ? 600 : 400 }}>{label}</span>
              </button>
            );
          })}
          <button onClick={() => setPanelOpen(v => !v)}
            style={{ background: 'none', border: 'none', borderLeft: `1px solid ${D.border}`, color: D.text3, fontSize: 16, padding: '0 14px', cursor: 'pointer', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}>
            {panelOpen ? '▾' : '▴'}
          </button>
        </div>

        {/* 패널 콘텐츠 */}
        {panelOpen && (
          <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* 광고 */}
            <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: M_AD_W, borderRight: `1px solid ${D.border}`, overflow: 'hidden', background: D.sidebar }}>
              <DirectorAdBanner height={M_CONT_H} />
            </div>
            {/* 목록 */}
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: M_LIST_W, overflowY: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
              {listContent}
            </div>
          </div>
        )}
      </div>
      {importOpen && <ImportTextModal onClose={() => setImportOpen(false)} onImport={handleMobileImport} />}
    </div>
  );
}

// ─── 감독 대시보드 ────────────────────────────────────────────────────────────
export default function DirectorDashboard({ session, onBack, isGuest = false }) {
  const user = extractUserData(session);
  const [activeMenu, setActiveMenu] = useState(isGuest ? 'storyboard' : 'projects');
  const [loggingOut, setLoggingOut] = useState(false);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1280;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = e => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const D = isDark ? D_DARK : D_LIGHT;

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabaseSignOut();
  };

  const NAV_ITEMS = [
    { id: 'projects',   icon: '📄', label: '작품 목록' },
    { id: 'notes',      icon: '📝', label: '연출노트' },
    { id: 'storyboard', icon: '🎞', label: '스토리보드' },
  ];

  /* ── 모바일 레이아웃 ──────────────────────────────────────────────────── */
  if (isMobile) {
    return (
      <ThemeCtx.Provider value={D}>
        <DirectorMobileView
          session={session}
          onBack={onBack}
          isGuest={isGuest}
          D={D}
          loginWithReturnHash={loginWithReturnHash}
          handleLogout={handleLogout}
          loggingOut={loggingOut}
        />
        {isGuest && <GuestGuide onLogin={loginWithReturnHash} />}
      </ThemeCtx.Provider>
    );
  }

  /* ── 데스크톱 레이아웃 ──────────────────────────────────────────────── */
  return (
    <ThemeCtx.Provider value={D}>
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: D.bg, color: D.text, fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif" }}>

      {/* 상단 헤더 */}
      <header style={{
        height: 56, flexShrink: 0,
        display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16,
        borderBottom: `1px solid ${D.border}`, background: D.sidebar,
      }}>
        {/* 사이드바 토글 */}
        <button
          onClick={() => setSidebarCollapsed(v => !v)}
          title={sidebarCollapsed ? '메뉴 열기' : '메뉴 닫기'}
          style={{ background: 'none', border: 'none', color: D.text3, fontSize: 16, cursor: 'pointer', padding: '4px 6px', lineHeight: 1, borderRadius: 4, flexShrink: 0 }}
        >{sidebarCollapsed ? '☰' : '✕'}</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: D.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🎬</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: D.text, letterSpacing: '-0.02em' }}>연출 작업실</span>
          <span style={{ fontSize: 9, fontWeight: 600, color: D.sidebar, background: D.accent, borderRadius: 3, padding: '2px 5px', letterSpacing: '0.05em' }}>DIRECTOR</span>
        </div>
        <div style={{ width: 1, height: 20, background: D.border }} />
        <button onClick={onBack} style={{ fontSize: 12, color: D.text3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>← 대본 작업실로</button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {user?.avatar
              ? <img src={user.avatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${D.border}` }} />
              : <div style={{ width: 28, height: 28, borderRadius: '50%', background: D.card, border: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: D.text2 }}>감</div>
            }
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: D.text }}>{user?.name || '연출'}</div>
              <div style={{ fontSize: 10, color: D.text3 }}>{user?.email}</div>
            </div>
          </div>
          {isGuest ? (
            <button onClick={loginWithReturnHash} style={{ fontSize: 11, color: D.accent, background: 'none', border: `1px solid ${D.accent}`, borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>Google로 로그인</button>
          ) : (
            <button onClick={handleLogout} disabled={loggingOut} style={{ fontSize: 11, color: D.text3, background: 'none', border: `1px solid ${D.border}`, borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>{loggingOut ? '…' : '로그아웃'}</button>
          )}
        </div>
      </header>

      {/* 본문 */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* 사이드바 */}
        <aside style={{
          width: sidebarCollapsed ? 0 : 220,
          flexShrink: 0,
          background: D.sidebar,
          borderRight: sidebarCollapsed ? 'none' : `1px solid ${D.border}`,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <div style={{ width: 220, padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <SideSection label="작품" />
            <SideItem icon="📄" label="작품 목록" active={activeMenu === 'projects'} onClick={() => setActiveMenu('projects')} />
            <div style={{ margin: '12px 0 0', height: 1, background: D.border }} />
            <SideSection label="연출" />
            <SideItem icon="📝" label="연출노트"   active={activeMenu === 'notes'}      onClick={() => setActiveMenu('notes')} />
            <SideItem icon="🎞" label="스토리보드" active={activeMenu === 'storyboard'} onClick={() => setActiveMenu('storyboard')} />
          </div>
        </aside>

        <main style={{ flex: 1, display: 'flex', minHeight: 0, background: D.bg, overflow: 'hidden' }}>
          {activeMenu === 'projects'   && <ProjectsPanel session={session} isGuest={isGuest} />}
          {activeMenu === 'notes'      && <NotesPanel />}
          {activeMenu === 'storyboard' && <StoryboardPanel isGuest={isGuest} />}
        </main>
      </div>
    </div>

    {/* 게스트 가이드 */}
    {isGuest && <GuestGuide onLogin={loginWithReturnHash} />}
    </ThemeCtx.Provider>
  );
}

// ─── 사이드바 섹션 라벨 ────────────────────────────────────────────────────────
function SideSection({ label }) {
  const D = useD();
  return (
    <div style={{
      padding: '4px 20px 2px',
      fontSize: 10, fontWeight: 700, color: D.text3,
      letterSpacing: '0.08em', textTransform: 'uppercase',
    }}>{label}</div>
  );
}

// ─── 사이드바 아이템 ───────────────────────────────────────────────────────────
function SideItem({ icon, label, active, onClick }) {
  const D = useD();
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '8px 16px 8px 18px',
        fontSize: 13, cursor: 'pointer',
        borderLeft: active ? `2px solid ${D.accent}` : '2px solid transparent',
        background: active ? D.active : 'transparent',
        color: active ? D.accent : D.text2,
        fontWeight: active ? 600 : 400,
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = D.text; }}}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = D.text2; }}}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      {label}
    </div>
  );
}

// ─── 모바일 하단 시트 ─────────────────────────────────────────────────────────
function BottomSheet({ open, onClose, title, children }) {
  const D = useD();
  return (
    <>
      {/* 백드롭 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.5)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.22s',
        }}
      />
      {/* 시트 */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 56, zIndex: 301,
        background: D.panel,
        borderRadius: '16px 16px 0 0',
        border: `1px solid ${D.border}`,
        borderBottom: 'none',
        maxHeight: '70vh',
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateY(0)' : 'translateY(105%)',
        transition: 'transform 0.25s cubic-bezier(0.32,0.72,0,1)',
        overflow: 'hidden',
      }}>
        {/* 핸들 + 제목 */}
        <div style={{ flexShrink: 0, padding: '10px 16px 8px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: D.border, margin: 'auto' }} />
        </div>
        <div style={{ flexShrink: 0, padding: '8px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: D.text3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: D.text3, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>
        {/* 내용 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </>
  );
}

// ─── 콘텐츠 공통 레이아웃 ─────────────────────────────────────────────────────
function PageShell({ title, subtitle, children }) {
  const D = useD();
  return (
    <div style={{ padding: '36px 40px', maxWidth: 900 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: D.text, letterSpacing: '-0.02em' }}>{title}</h1>
        {subtitle && <p style={{ margin: '6px 0 0', fontSize: 13, color: D.text3 }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── 빈 슬롯 ──────────────────────────────────────────────────────────────────
function EmptySlot({ icon, label, sub }) {
  const D = useD();
  return (
    <div style={{
      border: `1px dashed ${D.border}`,
      borderRadius: 12, padding: '60px 32px',
      textAlign: 'center',
      background: D.card,
    }}>
      <div style={{ fontSize: 36, marginBottom: 14, opacity: 0.6 }}>{icon}</div>
      <p style={{ margin: 0, fontSize: 14, color: D.text2, fontWeight: 500 }}>{label}</p>
      {sub && <p style={{ margin: '8px 0 0', fontSize: 12, color: D.text3 }}>{sub}</p>}
    </div>
  );
}

// ─── 패널들 ───────────────────────────────────────────────────────────────────
// Drive 끊김 여부: provider_token이 없을 때 참
function isDriveError(msg) {
  return msg && (msg.includes('Drive 권한') || msg.includes('provider_token') || msg.includes('Drive'));
}

function DriveReconnectCard({ D, message }) {
  const [loading, setLoading] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 32, textAlign: 'center', maxWidth: 320 }}>
      <div style={{ fontSize: 32 }}>🔌</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: D.text }}>Drive 연결이 끊겼습니다</div>
      <div style={{ fontSize: 12, color: D.text2, lineHeight: 1.7 }}>
        {message || 'Google Drive 권한이 만료되었습니다.'}<br />
        Google 계정으로 다시 로그인하면 계속 이용할 수 있습니다.
      </div>
      <button
        onClick={() => { setLoading(true); loginWithReturnHash(); }}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '10px 20px', borderRadius: 8,
          border: `1px solid ${D.border}`, background: D.card,
          color: D.text, fontSize: 13, fontWeight: 500,
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
        }}
      >
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" style={{ width: 16, height: 16 }} />
        {loading ? '이동 중…' : 'Google로 다시 로그인'}
      </button>
    </div>
  );
}

function ProjectsPanel({ session, isGuest, isMobile = false }) {
  const D = useD();
  const [scripts,       setScripts]       = useState(null);
  const [error,         setError]         = useState('');
  const [selected,      setSelected]      = useState(null);
  const [viewing,       setViewing]       = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [sheetOpen,     setSheetOpen]     = useState(false);
  const [subCollapsed,  setSubCollapsed]  = useState(false);
  const [localScripts,  setLocalScripts]  = useState(() => loadLocalScripts());
  const [importOpen,    setImportOpen]    = useState(false);

  // Drive 토큰 유효성 사전 확인 (로그인은 됐지만 Drive 권한 만료 상태)
  const driveDisconnected = !isGuest && session && !session.provider_token && !isTokenValid();

  useEffect(() => {
    if (!supabase) { setScripts([]); return; }
    supabase
      .from('shared_scripts')
      .select('id, title, imported_at, drive_file_id')
      .order('imported_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { setError(error.message); setScripts([]); }
        else setScripts(data || []);
      });
  }, []);

  const handleSelect = async (script) => {
    if (selected?.id === script.id) return;
    setSelected(script);
    setViewing(null);
    if (script._isLocal) {
      setViewing({ localText: script.text || '' });
      return;
    }
    setLoading(true);
    try {
      if (!isTokenValid()) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.provider_token) throw new Error('Drive 권한이 없습니다. 다시 로그인해주세요.');
        setAccessToken(session.provider_token, 3600);
      }
      const saved = await loadDirectorScript(script.drive_file_id);
      const data  = saved?.data ?? saved;
      setViewing({
        appState: {
          projects:        data.projects     || [],
          episodes:        data.episodes     || [],
          characters:      data.characters   || [],
          scenes:          data.scenes       || [],
          scriptBlocks:    data.scriptBlocks || [],
          coverDocs:       data.coverDocs    || [],
          synopsisDocs:    data.synopsisDocs || [],
          activeProjectId: data.activeProjectId,
          stylePreset:     data.stylePreset  || {},
          initialized:     true,
        },
        selections: data.selections || { cover: true, synopsis: true, episodes: {}, chars: true },
      });
    } catch (err) {
      setViewing({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLocalScript = (script) => {
    if (!window.confirm(`"${script.title}"\n\n로컬에서 삭제할까요?`)) return;
    deleteLocalScript(script.id);
    setLocalScripts(loadLocalScripts());
    if (selected?.id === script.id) { setSelected(null); setViewing(null); }
  };

  const handleImport = ({ id, title, text }) => {
    const entry = { id, title, text, createdAt: new Date().toISOString(), _isLocal: true };
    const updated = [entry, ...loadLocalScripts()];
    saveLocalScripts(updated);
    setLocalScripts(updated);
    setImportOpen(false);
    handleSelect(entry);
  };

  const handleDeleteScript = async (script) => {
    if (!supabase) return;
    if (!window.confirm(`"${script.title}"\n\n목록에서 삭제하고 Google Drive 파일도 함께 삭제할까요?`)) return;

    // 1) Drive 파일 삭제 (실패해도 계속 진행 — 파일이 이미 없는 경우 대비)
    if (script.drive_file_id) {
      try {
        // 토큰이 없으면 세션에서 가져오기
        if (!isTokenValid()) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.provider_token) setAccessToken(session.provider_token, 3600);
        }
        await deleteFileById(script.drive_file_id);
      } catch {
        // Drive 삭제 실패는 무시 (파일 없음·권한 없음 등)
      }
    }

    // 2) shared_scripts row 삭제
    const { data: deleted, error } = await supabase
      .from('shared_scripts')
      .delete()
      .eq('id', script.id)
      .eq('director_id', session.user.id)
      .select('id');
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    if (!deleted || deleted.length === 0) {
      alert('삭제 권한이 없거나 이미 삭제된 항목입니다.');
      return;
    }
    setScripts(prev => prev.filter(s => s.id !== script.id));
    if (selected?.id === script.id) { setSelected(null); setViewing(null); }
  };

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}>

      {/* 둘러보기 모드 안내 배너 */}
      {isGuest && (
        <div style={{
          flexShrink: 0, padding: '8px 16px',
          background: D.accentDim, borderBottom: `1px solid ${D.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span style={{ fontSize: 12, color: D.text2 }}>둘러보기 모드 — 대본 불러오기·저장은 로그인 후 이용할 수 있습니다.</span>
          <button
            onClick={loginWithReturnHash}
            style={{ fontSize: 11, color: D.accent, background: 'none', border: `1px solid ${D.accent}`, borderRadius: 4, padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >Google로 로그인</button>
        </div>
      )}

      {/* Drive 끊김 배너 (로그인은 됐지만 토큰 만료) */}
      {driveDisconnected && (
        <div style={{
          flexShrink: 0, padding: '8px 16px',
          background: '#3d1a1a', borderBottom: `1px solid #6b2e2e`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span style={{ fontSize: 12, color: '#f4a4a4' }}>🔌 Google Drive 연결이 끊겼습니다. 대본을 불러오려면 다시 로그인이 필요합니다.</span>
          <button
            onClick={loginWithReturnHash}
            style={{ fontSize: 11, color: '#f87171', background: 'none', border: '1px solid #f87171', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >다시 로그인</button>
        </div>
      )}

      {/* 작품 목록 (공통 JSX) */}
      {(() => {
        const scriptListContent = (
          <div style={{ padding: '8px 0' }}>
            {/* 텍스트로 가져오기 버튼 */}
            <div style={{ padding: '6px 12px 10px' }}>
              <button onClick={() => setImportOpen(true)}
                style={{ width: '100%', padding: '7px 12px', borderRadius: 6, border: `1px solid ${D.accent}`, background: 'transparent', color: D.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                + 텍스트로 가져오기
              </button>
            </div>
            {/* 로컬 작품 */}
            {localScripts.length > 0 && (
              <>
                <div style={{ padding: '4px 16px 2px', fontSize: 10, fontWeight: 700, color: D.text3, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.7 }}>로컬</div>
                {localScripts.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', borderLeft: selected?.id === s.id ? `2px solid ${D.accent}` : '2px solid transparent', background: selected?.id === s.id ? D.active : 'transparent', transition: 'background 0.12s' }}
                    onMouseEnter={e => { if (selected?.id !== s.id) e.currentTarget.style.background = 'rgba(128,128,128,0.08)'; }}
                    onMouseLeave={e => { if (selected?.id !== s.id) e.currentTarget.style.background = 'transparent'; }}>
                    <div onClick={() => { handleSelect(s); setSheetOpen(false); }} style={{ flex: 1, minWidth: 0, padding: '9px 8px 9px 16px', cursor: 'pointer' }}>
                      <div style={{ fontSize: 13, fontWeight: selected?.id === s.id ? 600 : 400, color: selected?.id === s.id ? D.accent : D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                        📁 {s.title}
                      </div>
                      <div style={{ fontSize: 10, color: D.text3 }}>{new Date(s.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} · 로컬</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); handleDeleteLocalScript(s); }}
                      style={{ flexShrink: 0, marginRight: 8, width: 22, height: 22, borderRadius: 4, border: `1px solid ${D.border}`, background: 'transparent', color: D.text3, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                  </div>
                ))}
                {(scripts?.length ?? 0) > 0 && <div style={{ height: 1, background: D.border, margin: '6px 0' }} />}
              </>
            )}
            {/* 클라우드 작품 */}
            {error && <div style={{ padding: '12px 16px', fontSize: 12, color: '#e05c5c' }}>오류: {error}</div>}
            {scripts === null && <div style={{ padding: '12px 16px', fontSize: 12, color: D.text3 }}>불러오는 중…</div>}
            {scripts?.length === 0 && !error && localScripts.length === 0 && (
              <div style={{ padding: '16px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: D.text3, lineHeight: 1.6 }}>가져온 작품이 없습니다.<br />검토 링크에서 가져오거나<br />위 버튼으로 텍스트를 붙여넣으세요.</div>
              </div>
            )}
            {scripts?.length > 0 && <div style={{ padding: '4px 16px 2px', fontSize: 10, fontWeight: 700, color: D.text3, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.7 }}>클라우드</div>}
            {scripts?.map(s => (
              <ScriptListItem key={s.id} script={s} active={selected?.id === s.id}
                onClick={() => { handleSelect(s); setSheetOpen(false); }}
                onDelete={handleDeleteScript} />
            ))}
          </div>
        );

        return isMobile ? (
          /* 모바일: 바텀 시트 */
          <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="작품 목록">
            {scriptListContent}
          </BottomSheet>
        ) : (
          /* 데스크톱: 좌측 패널 */
          <div style={{ width: subCollapsed ? 28 : 260, flexShrink: 0, borderRight: `1px solid ${D.border}`, background: D.panel, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'width 0.2s ease' }}>
            <div style={{ padding: '10px 8px 10px 12px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
              {!subCollapsed && <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: D.text3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>작품 목록</div>}
              <button onClick={() => setSubCollapsed(v => !v)} title={subCollapsed ? '목록 열기' : '목록 닫기'}
                style={{ flexShrink: 0, background: 'none', border: 'none', color: D.text3, cursor: 'pointer', fontSize: 10, padding: '2px 4px', lineHeight: 1 }}>
                {subCollapsed ? '▶' : '◀'}
              </button>
            </div>
            {!subCollapsed && <div style={{ flex: 1, overflowY: 'auto' }}>{scriptListContent}</div>}
          </div>
        );
      })()}

      {/* 대본 뷰어 영역 */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#d8d8d8' }}>

        {/* 뷰어 상단 바 */}
        <div style={{ height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10, background: D.sidebar, borderBottom: `1px solid ${D.border}` }}>
          {isMobile && (
            <button onClick={() => setSheetOpen(true)}
              style={{ fontSize: 11, color: D.accent, background: 'none', border: `1px solid ${D.accent}`, borderRadius: 5, padding: '4px 10px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
              📄 {selected ? selected.title.slice(0, 10) + (selected.title.length > 10 ? '…' : '') : '작품 선택'}
            </button>
          )}
          {selected && viewing?.appState && (
            <>
              {!isMobile && <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.title}</span>}
              <div style={{ marginLeft: 'auto' }}><SendButton scriptRow={selected} viewing={viewing} /></div>
            </>
          )}
          {(!selected || !viewing?.appState) && !isMobile && <div style={{ flex: 1 }} />}
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {!selected && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>📄</div>
                <div style={{ fontSize: 13, color: '#888' }}>{isMobile ? '위 버튼으로 작품을 선택하세요' : '좌측에서 작품을 선택하세요'}</div>
              </div>
            </div>
          )}
          {selected && loading && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 13, color: '#888' }}>불러오는 중…</div>
            </div>
          )}
          {selected && !loading && viewing?.error && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isDriveError(viewing.error)
                ? <DriveReconnectCard D={D} message={viewing.error} />
                : <div style={{ fontSize: 13, color: '#c00' }}>불러오기 실패: {viewing.error}</div>
              }
            </div>
          )}
          {selected && !loading && viewing?.appState && (
            <ViewerErrorBoundary key={selected.id}>
              <DirectorScriptViewer appState={viewing.appState} selections={viewing.selections} sharedScriptId={selected.id} />
            </ViewerErrorBoundary>
          )}
          {selected && viewing?.localText !== undefined && (
            <div style={{ height: '100%', overflowY: 'auto', padding: '24px 32px', background: D.bg }}>
              <div style={{ fontSize: 12, color: D.text3, marginBottom: 12 }}>📁 로컬 대본 — {selected.title}</div>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, color: D.text, lineHeight: 1.9, fontFamily: 'inherit', margin: 0 }}>
                {viewing.localText || '(내용 없음)'}
              </pre>
            </div>
          )}
        </div>
      </div>
      {importOpen && <ImportTextModal onClose={() => setImportOpen(false)} onImport={handleImport} />}
    </div>
  );
}

function ScriptListItem({ script, active, onClick, onDelete }) {
  const D = useD();
  const date = new Date(script.imported_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center',
        borderLeft: active ? `2px solid ${D.accent}` : '2px solid transparent',
        background: active ? D.active : 'transparent',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(128,128,128,0.08)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <div onClick={onClick} style={{ flex: 1, minWidth: 0, padding: '10px 8px 10px 16px', cursor: 'pointer' }}>
        <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? D.accent : D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
          {script.title}
        </div>
        <div style={{ fontSize: 10, color: D.text3 }}>{date}</div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(script); }}
        style={{
          flexShrink: 0, marginRight: 8,
          width: 22, height: 22, borderRadius: 4,
          border: `1px solid ${D.border}`, background: 'transparent',
          color: D.text3, fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="삭제"
      >×</button>
    </div>
  );
}

// ─── 작가에게 전송 버튼 ───────────────────────────────────────────────────────
function SendButton({ scriptRow, viewing }) {
  const D = useD();
  const [sending, setSending] = useState(false);
  const [toast,   setToast]   = useState('');

  const handleSend = async () => {
    if (!supabase || sending) return;
    setSending(true);
    setToast('전송 링크 생성 중…');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('로그인이 필요합니다.');

      // 현재 메모 전체 로드
      const { data: notesData } = await supabase
        .from('director_notes')
        .select('*')
        .eq('shared_script_id', scriptRow.id);

      const { data, error } = await supabase
        .from('director_deliveries')
        .insert({
          director_id:      session.user.id,
          shared_script_id: scriptRow.id,
          script_snapshot:  viewing.appState,
          notes_snapshot:   notesData || [],
        })
        .select('id')
        .single();

      if (error) throw new Error(error.message);

      const url = `${window.location.origin}${window.location.pathname}#delivery=${data.id}`;
      try { await navigator.clipboard.writeText(url); }
      catch {
        const el = document.createElement('input');
        el.value = url; document.body.appendChild(el);
        el.select(); document.execCommand('copy');
        document.body.removeChild(el);
      }
      setToast('링크 복사됨 ✓');
      setTimeout(() => setToast(''), 3000);
    } catch (err) {
      setToast(`오류: ${err.message}`);
      setTimeout(() => setToast(''), 3000);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {toast && (
        <span style={{
          fontSize: 11,
          color: toast.startsWith('오류') ? '#e05c5c' : toast.includes('✓') ? '#4caf50' : D.text3,
        }}>{toast}</span>
      )}
      <button
        onClick={handleSend}
        disabled={sending}
        style={{
          padding: '5px 14px', borderRadius: 6, border: 'none',
          background: sending ? '#555' : D.accent,
          color: '#1a1a1a', fontSize: 12, fontWeight: 700,
          cursor: sending ? 'default' : 'pointer', whiteSpace: 'nowrap',
        }}
      >
        작가에게 전송
      </button>
    </div>
  );
}

const NOTE_COLORS_PANEL = ['#fdf6e3', '#fef08a', '#86efac', '#93c5fd', '#f9a8d4'];

function NotesPanel({ isMobile = false }) {
  const D = useD();
  const [scripts,       setScripts]       = useState(null);
  const [localScripts,  setLocalScripts]  = useState(() => loadLocalScripts());
  const [selected,      setSelected]      = useState(null);
  const [subCollapsed,  setSubCollapsed]  = useState(false);
  const [sheetOpen,  setSheetOpen]  = useState(false);
  const [notes,     setNotes]     = useState([]);
  const [adding,    setAdding]    = useState(false);
  const [newText,   setNewText]   = useState('');
  const [newColor,  setNewColor]  = useState(NOTE_COLORS_PANEL[0]);
  const [editingId, setEditingId] = useState(null); // _localId being edited
  const [editText,  setEditText]  = useState('');
  const addRef = useRef();

  // 스크립트 목록 로드
  useEffect(() => {
    if (!supabase) { setScripts([]); return; }
    supabase
      .from('shared_scripts')
      .select('id, title, imported_at')
      .order('imported_at', { ascending: false })
      .then(({ data }) => setScripts(data || []));
  }, []);

  // 선택된 스크립트의 private notes 로드
  useEffect(() => {
    if (!selected) { setNotes([]); return; }
    const key = `director_private_notes_${selected.id}`;
    try {
      const map = JSON.parse(localStorage.getItem(key) || '{}');
      setNotes(Object.values(map).sort((a, b) => (a._localId || '').localeCompare(b._localId || '')));
    } catch { setNotes([]); }
  }, [selected]);

  useEffect(() => {
    if (adding) setTimeout(() => addRef.current?.focus(), 50);
  }, [adding]);

  const saveMap = (map) => {
    if (!selected) return;
    localStorage.setItem(`director_private_notes_${selected.id}`, JSON.stringify(map));
    setNotes(Object.values(map).sort((a, b) => (a._localId || '').localeCompare(b._localId || '')));
  };

  const loadMap = () => {
    try { return JSON.parse(localStorage.getItem(`director_private_notes_${selected.id}`) || '{}'); }
    catch { return {}; }
  };

  const handleAddNote = () => {
    if (!newText.trim()) { setAdding(false); return; }
    const map = loadMap();
    const blockId = `standalone_${Date.now()}`;
    map[blockId] = { _localId: String(Date.now()), block_id: blockId, content: newText.trim(), color: newColor };
    saveMap(map);
    setNewText(''); setNewColor(NOTE_COLORS_PANEL[0]); setAdding(false);
  };

  const handleDeleteNote = (localId) => {
    const map = loadMap();
    const entry = Object.values(map).find(n => n._localId === localId);
    if (!entry) return;
    delete map[entry.block_id];
    saveMap(map);
  };

  const handleEditSave = (localId) => {
    if (!editText.trim()) return;
    const map = loadMap();
    const entry = Object.values(map).find(n => n._localId === localId);
    if (!entry) return;
    map[entry.block_id] = { ...entry, content: editText.trim() };
    saveMap(map);
    setEditingId(null); setEditText('');
  };

  const getNoteCount = (scriptId) => {
    try {
      const map = JSON.parse(localStorage.getItem(`director_private_notes_${scriptId}`) || '{}');
      return Object.keys(map).length;
    } catch { return 0; }
  };

  const scriptListContent = (
    <div style={{ padding: '8px 0' }}>
      {/* 로컬 작품 */}
      {localScripts.length > 0 && (
        <>
          <div style={{ padding: '4px 16px 2px', fontSize: 10, fontWeight: 700, color: D.text3, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.7 }}>로컬</div>
          {localScripts.map(s => {
            const count = getNoteCount(s.id);
            const active = selected?.id === s.id;
            return (
              <div key={s.id} onClick={() => { setSelected(s); setAdding(false); setEditingId(null); setSheetOpen(false); }}
                style={{ padding: '10px 16px', cursor: 'pointer', borderLeft: active ? `2px solid ${D.accent}` : '2px solid transparent', background: active ? D.active : 'transparent', transition: 'background 0.12s', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? D.accent : D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📁 {s.title}</div>
                  <div style={{ fontSize: 10, color: D.text3, marginTop: 2 }}>메모 {count}개 · 로컬</div>
                </div>
                {count > 0 && <div style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: '#93c5fd', color: '#1a1a2e', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{count > 9 ? '9+' : count}</div>}
              </div>
            );
          })}
          {(scripts?.length ?? 0) > 0 && <div style={{ height: 1, background: D.border, margin: '4px 0' }} />}
        </>
      )}
      {(scripts?.length ?? 0) > 0 && <div style={{ padding: '4px 16px 2px', fontSize: 10, fontWeight: 700, color: D.text3, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.7 }}>클라우드</div>}
      {scripts === null && <div style={{ padding: '12px 16px', fontSize: 12, color: D.text3 }}>불러오는 중…</div>}
      {scripts?.length === 0 && localScripts.length === 0 && (
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}>📝</div>
          <div style={{ fontSize: 11, color: D.text3, lineHeight: 1.6 }}>가져온 작품이 없습니다.</div>
        </div>
      )}
      {scripts?.map(s => {
        const count  = getNoteCount(s.id);
        const active = selected?.id === s.id;
        return (
          <div key={s.id}
            onClick={() => { setSelected(s); setAdding(false); setEditingId(null); setSheetOpen(false); }}
            style={{ padding: '10px 16px', cursor: 'pointer', borderLeft: active ? `2px solid ${D.accent}` : '2px solid transparent', background: active ? D.active : 'transparent', transition: 'background 0.12s', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? D.accent : D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
              <div style={{ fontSize: 10, color: D.text3, marginTop: 2 }}>메모 {count}개</div>
            </div>
            {count > 0 && (
              <div style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: '#93c5fd', color: '#1a1a2e', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{count > 9 ? '9+' : count}</div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

      {/* 작품 목록: 모바일→부모(DirectorMobileView)가 관리 / 데스크톱→좌측 패널 */}
      {!isMobile ? (
        <div style={{ width: subCollapsed ? 28 : 240, flexShrink: 0, borderRight: `1px solid ${D.border}`, background: D.panel, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'width 0.2s ease' }}>
          <div style={{ padding: '10px 8px 10px 12px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
            {!subCollapsed && <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: D.text3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>작품별 연출노트</div>}
            <button onClick={() => setSubCollapsed(v => !v)} title={subCollapsed ? '목록 열기' : '목록 닫기'}
              style={{ flexShrink: 0, background: 'none', border: 'none', color: D.text3, cursor: 'pointer', fontSize: 10, padding: '2px 4px', lineHeight: 1 }}>
              {subCollapsed ? '▶' : '◀'}
            </button>
          </div>
          {!subCollapsed && <div style={{ flex: 1, overflowY: 'auto' }}>{scriptListContent}</div>}
        </div>
      ) : null}

      {/* 노트 목록 */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto', background: D.bg, padding: isMobile ? '16px 16px' : 32 }}>

        {/* 모바일: 작품 선택 버튼 */}
        {isMobile && (
          <button onClick={() => setSheetOpen(true)}
            style={{ width: '100%', marginBottom: 16, padding: '10px 14px', borderRadius: 8, border: `1px solid ${D.accent}`, background: 'transparent', color: D.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📝</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected ? selected.title : '작품 선택'}</span>
            <span style={{ fontSize: 11, color: D.text3 }}>▾</span>
          </button>
        )}

        {!selected && (
          <div style={{ height: '60%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>📋</div>
              <div style={{ fontSize: 13, color: D.text3 }}>{isMobile ? '위 버튼으로 작품을 선택하세요' : '좌측에서 작품을 선택하세요'}</div>
            </div>
          </div>
        )}

        {selected && (
          <div>
            {/* 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: D.text }}>{selected.title}</div>
                <div style={{ fontSize: 12, color: D.text3, marginTop: 2 }}>📋 내 연출노트 {notes.length}개</div>
              </div>
              {!adding && (
                <button
                  onClick={() => setAdding(true)}
                  style={{
                    padding: '7px 16px', borderRadius: 7, border: 'none',
                    background: D.accent, color: '#1a1a1a',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >+ 새 노트</button>
              )}
            </div>

            {/* 새 노트 입력 폼 */}
            {adding && (
              <div style={{
                background: newColor, borderRadius: 10,
                padding: '16px', marginBottom: 20,
                boxShadow: '2px 4px 16px rgba(0,0,0,0.18)',
                borderTop: '3px solid #93c5fd',
              }}>
                <textarea
                  ref={addRef}
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setNewText(''); } }}
                  placeholder="연출노트 내용을 입력하세요…"
                  rows={4}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    border: 'none', background: 'transparent',
                    fontSize: 13, color: '#111', lineHeight: 1.7,
                    resize: 'vertical', outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {NOTE_COLORS_PANEL.map(c => (
                    <button key={c} onClick={() => setNewColor(c)} style={{
                      width: 20, height: 20, borderRadius: '50%', background: c, border: 'none',
                      cursor: 'pointer', outline: newColor === c ? '2px solid #333' : 'none',
                      outlineOffset: 2,
                    }} />
                  ))}
                  <div style={{ flex: 1 }} />
                  <button onClick={() => { setAdding(false); setNewText(''); }} style={{ fontSize: 12, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>취소</button>
                  <button
                    onClick={handleAddNote}
                    disabled={!newText.trim()}
                    style={{
                      padding: '5px 14px', borderRadius: 6, border: 'none',
                      background: newText.trim() ? '#1a1a2e' : '#999',
                      color: '#fff', fontSize: 12, fontWeight: 700, cursor: newText.trim() ? 'pointer' : 'default',
                    }}
                  >저장</button>
                </div>
              </div>
            )}

            {/* 빈 상태 */}
            {notes.length === 0 && !adding && (
              <div style={{ textAlign: 'center', paddingTop: 60, opacity: 0.5 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 13, color: D.text3 }}>노트가 없습니다. "+ 새 노트"로 추가하세요.</div>
              </div>
            )}

            {/* 노트 그리드 */}
            {notes.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                {notes.map(n => (
                  <div key={n._localId} style={{
                    background: n.color || '#fef08a',
                    borderRadius: 8, padding: '12px 14px',
                    boxShadow: '2px 4px 12px rgba(0,0,0,0.15)',
                    position: 'relative',
                    borderTop: '3px solid #93c5fd',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#3b82f6', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      📋 내 연출노트
                    </div>
                    {editingId === n._localId ? (
                      <div>
                        <textarea
                          autoFocus
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Escape') { setEditingId(null); setEditText(''); } }}
                          rows={4}
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            border: 'none', background: 'rgba(255,255,255,0.5)',
                            borderRadius: 4, padding: '4px 6px',
                            fontSize: 13, color: '#111', lineHeight: 1.6,
                            resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                          }}
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                          <button onClick={() => { setEditingId(null); setEditText(''); }} style={{ fontSize: 11, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>취소</button>
                          <button
                            onClick={() => handleEditSave(n._localId)}
                            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                          >저장</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => { setEditingId(n._localId); setEditText(n.content); }}
                        style={{ fontSize: 13, color: '#111', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: 'text', minHeight: 40 }}
                        title="클릭하여 편집"
                      >
                        {n.content}
                      </div>
                    )}
                    <button
                      onClick={() => handleDeleteNote(n._localId)}
                      style={{
                        position: 'absolute', top: 8, right: 8,
                        width: 20, height: 20, borderRadius: 4,
                        border: '1px solid rgba(0,0,0,0.15)',
                        background: 'rgba(255,255,255,0.6)',
                        color: '#666', fontSize: 11, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        lineHeight: 1,
                      }}
                      title="삭제"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 스토리보드 상수 ──────────────────────────────────────────────────────────
const SB_SHOT_SIZES   = ['ELS', 'LS', 'MS', 'MCU', 'CU', 'ECU', 'OTS', 'POV', '2-SHOT'];
const SB_CAMERA_MOVES = ['Static', 'Pan →', 'Pan ←', 'Tilt ↑', 'Tilt ↓', 'Zoom In', 'Zoom Out', 'Track', 'Dolly', 'Handheld', 'Crane'];
const SB_TRANSITIONS  = ['Cut', 'Fade In', 'Fade Out', 'Dissolve', 'Wipe', 'Match Cut'];

function getSbKey(scriptId) { return `director_storyboard_${scriptId}`; }
function loadStoryboard(scriptId) {
  try { return JSON.parse(localStorage.getItem(getSbKey(scriptId)) || 'null'); }
  catch { return null; }
}
function saveStoryboard(scriptId, panels) {
  if (scriptId === '__guest_demo__') return; // 게스트 데모는 저장 안 함
  localStorage.setItem(getSbKey(scriptId), JSON.stringify(panels));
}

// ─── 블록 → 스토리보드 패널 파싱 ────────────────────────────────────────────
function classifySbBlock(type) {
  const t = (type || '').toLowerCase();
  if (['scene', 'scene_number', 'scene_heading', 'slug'].includes(t)) return 'scene';
  if (['character', 'char'].includes(t)) return 'character';
  if (['dialogue', 'dialog'].includes(t)) return 'dialogue';
  if (['parenthetical'].includes(t)) return 'parenthetical';
  if (['transition'].includes(t)) return 'transition';
  return 'action';
}
function stripSbHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim();
}
function parseScriptBlocksForDirector(blocks) {
  if (!blocks || blocks.length === 0) return [];
  const panels = []; let current = null; let currentChar = ''; let currentCharId = null;
  let cutNo = 0; let sceneNo = 0;
  const push = () => { if (current) panels.push(current); };
  const newPanel = (heading) => {
    push(); cutNo++; sceneNo++;
    current = {
      id: `sb_${Date.now()}_${cutNo}`,
      shotSize: 'MS', cameraMove: 'Static', transition: 'Cut',
      dialogue: '', action: '', duration: '3',
      sceneNo: String(sceneNo), cutNo: String(cutNo),
      drawingData: null, _sceneHeading: heading || `씬 ${sceneNo}`,
      annotatedBlocks: [], // [{ blockId, role, text, charName?, note:null }]
    };
    currentChar = ''; currentCharId = null;
  };
  for (const block of blocks) {
    const role = classifySbBlock(block.type);
    const text = stripSbHtml(block.content || block.text || '');
    if (role === 'scene') {
      newPanel(text);
    } else {
      if (!current) newPanel('');
      if (role === 'character') {
        currentChar = text; currentCharId = block.id;
      } else if (role === 'dialogue') {
        current.annotatedBlocks.push({ blockId: block.id, role: 'dialogue', text, charName: currentChar, note: null });
        currentChar = ''; currentCharId = null;
      } else if (role === 'parenthetical') {
        if (text) current.annotatedBlocks.push({ blockId: block.id, role: 'parenthetical', text, note: null });
      } else if (role === 'action') {
        if (text) current.annotatedBlocks.push({ blockId: block.id, role: 'action', text, note: null });
      } else if (role === 'transition') {
        if (text) {
          current.transition = text.includes('페이드') ? 'Fade Out' : text.includes('디졸브') ? 'Dissolve' : 'Cut';
        }
      }
    }
  }
  push();
  return panels;
}

// 생성 시 연출노트를 annotatedBlocks 각 항목에 인라인으로 붙임
function attachDirectorNotes(panels, scriptId) {
  try {
    const notesMap = JSON.parse(localStorage.getItem(`director_private_notes_${scriptId}`) || '{}');
    if (Object.keys(notesMap).length === 0) return panels;
    return panels.map(panel => ({
      ...panel,
      annotatedBlocks: (panel.annotatedBlocks || []).map(item =>
        notesMap[item.blockId]
          ? { ...item, note: { content: notesMap[item.blockId].content, color: notesMap[item.blockId].color } }
          : item
      ),
    }));
  } catch { return panels; }
}

// ─── DrawingCanvas (다크 테마) ────────────────────────────────────────────────
function SbDrawingCanvas({ initialData, onSave }) {
  const D = useD();
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('pen');
  const lastPos = useRef(null);
  const BG = D.canvasBg, PEN = D.canvasPen;

  const fillBg = (ctx, canvas) => { ctx.fillStyle = BG; ctx.fillRect(0, 0, canvas.width, canvas.height); };

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas.getContext('2d');
    fillBg(ctx, canvas);
    if (initialData) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = initialData; }
  }, [BG]);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
  };
  const startDraw = (e) => { e.preventDefault(); setIsDrawing(true); lastPos.current = getPos(e, canvasRef.current); };
  const draw = (e) => {
    e.preventDefault(); if (!isDrawing) return;
    const canvas = canvasRef.current, ctx = canvas.getContext('2d');
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y); ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = tool === 'eraser' ? BG : PEN;
    ctx.lineWidth = tool === 'eraser' ? 12 : 1.5;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    lastPos.current = pos;
  };
  const endDraw = () => { if (!isDrawing) return; setIsDrawing(false); onSave(canvasRef.current.toDataURL()); };
  const clear = () => { const canvas = canvasRef.current, ctx = canvas.getContext('2d'); fillBg(ctx, canvas); onSave(canvas.toDataURL()); };

  return (
    <div style={{ position: 'relative' }}>
      <canvas ref={canvasRef} width={320} height={180}
        style={{ width: '100%', aspectRatio: '16/9', display: 'block', cursor: tool === 'eraser' ? 'cell' : 'crosshair', borderRadius: 2 }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
      />
      <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
        {[['pen','✏️'],['eraser','🧹']].map(([t, icon]) => (
          <button key={t} onClick={() => setTool(t)} title={t}
            style={{ width: 26, height: 26, border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13,
              background: tool === t ? D.accent : D.card, color: tool === t ? '#1a1a1a' : D.text3 }}>
            {icon}
          </button>
        ))}
        <button onClick={clear} title="초기화"
          style={{ width: 26, height: 26, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'rgba(224,92,92,0.2)', color: '#e05c5c', fontSize: 13 }}>✕</button>
      </div>
      {/* 3×3 가이드 그리드 */}
      <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.12 }} viewBox="0 0 320 180">
        <line x1="107" y1="0" x2="107" y2="180" stroke="#fff" strokeWidth="0.5" strokeDasharray="3,3"/>
        <line x1="213" y1="0" x2="213" y2="180" stroke="#fff" strokeWidth="0.5" strokeDasharray="3,3"/>
        <line x1="0" y1="60" x2="320" y2="60" stroke="#fff" strokeWidth="0.5" strokeDasharray="3,3"/>
        <line x1="0" y1="120" x2="320" y2="120" stroke="#fff" strokeWidth="0.5" strokeDasharray="3,3"/>
      </svg>
    </div>
  );
}

// ─── 패널 카드 ────────────────────────────────────────────────────────────────

function SbPanelCard({ panel, index, total, onChange, onDelete, onMove, cardView,
                        isSelected, onSelect, isDragging, isDragOver,
                        onDragStart, onDragEnter, onDragEnd }) {
  const D = useD();
  const [expanded, setExpanded] = useState(true);
  const sbInp = { width: '100%', background: D.bg, border: `1px solid ${D.border}`, borderRadius: 4, color: D.text, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' };
  const sbLbl = { display: 'block', fontSize: 10, color: D.text3, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 };
  const u = (f, v) => onChange({ ...panel, [f]: v });
  const isRow = cardView === 'row';

  const fields = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
      {/* 샷/카메라/전환 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <div><label style={sbLbl}>샷 사이즈</label>
          <select value={panel.shotSize} onChange={e => u('shotSize', e.target.value)} style={sbInp}>
            {SB_SHOT_SIZES.map(s => <option key={s}>{s}</option>)}
          </select></div>
        <div><label style={sbLbl}>카메라 무브</label>
          <select value={panel.cameraMove} onChange={e => u('cameraMove', e.target.value)} style={sbInp}>
            {SB_CAMERA_MOVES.map(s => <option key={s}>{s}</option>)}
          </select></div>
        <div><label style={sbLbl}>전환 효과</label>
          <select value={panel.transition} onChange={e => u('transition', e.target.value)} style={sbInp}>
            {SB_TRANSITIONS.map(s => <option key={s}>{s}</option>)}
          </select></div>
      </div>

      {/* 씬/컷/시간 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <div><label style={sbLbl}>씬 번호</label><input value={panel.sceneNo} onChange={e => u('sceneNo', e.target.value)} placeholder="01" style={sbInp}/></div>
        <div><label style={sbLbl}>컷 번호</label><input value={panel.cutNo} onChange={e => u('cutNo', e.target.value)} style={sbInp}/></div>
        <div><label style={sbLbl}>시간(초)</label><input value={panel.duration} onChange={e => u('duration', e.target.value)} type="number" min="1" style={sbInp}/></div>
      </div>

      {/* 대사 / 액션 */}
      <div><label style={sbLbl}>대사 / 나레이션</label>
        <textarea value={panel.dialogue} onChange={e => u('dialogue', e.target.value)} placeholder="대사를 입력하세요…" style={{ ...sbInp, minHeight: 52, resize: 'vertical', lineHeight: 1.5 }}/>
      </div>
      <div><label style={sbLbl}>액션 / 연출 지시</label>
        <textarea value={panel.action} onChange={e => u('action', e.target.value)} placeholder="인물의 동작, 감정, 조명…" style={{ ...sbInp, minHeight: 52, resize: 'vertical', lineHeight: 1.5 }}/>
      </div>

      {/* 연출노트 */}
      {(() => {
        const notes = (panel.annotatedBlocks || []).filter(item => item.note);
        if (notes.length === 0) return null;
        return (
          <div>
            <label style={sbLbl}>📋 연출노트 ({notes.length})</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {notes.map((item, i) => (
                <div key={item.blockId || i} style={{
                  background: item.note.color || '#fef08a',
                  borderRadius: 5, padding: '6px 10px',
                  borderLeft: '3px solid #93c5fd',
                  fontSize: 12, color: '#111', lineHeight: 1.6,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  boxShadow: '1px 2px 6px rgba(0,0,0,0.15)',
                }}>{item.note.content}</div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(index); }}
      onDragEnter={() => onDragEnter(index)}
      onDragOver={e => e.preventDefault()}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(panel.id)}
      style={{
        background: D.card,
        border: `1px solid ${isDragOver ? D.accent : (isSelected ? D.accentDim : D.border)}`,
        borderTop: isDragOver ? `3px solid ${D.accent}` : `1px solid ${isSelected ? D.accentDim : D.border}`,
        borderRadius: 8, overflow: 'hidden',
        opacity: isDragging ? 0.45 : 1,
        transition: 'border-color 0.1s, opacity 0.15s',
        cursor: 'default',
      }}
    >
      {/* 카드 헤더 */}
      <div style={{ background: D.panel, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${D.border}` }}>
        {/* 드래그 핸들 */}
        <div
          title="드래그하여 순서 변경"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.5, cursor: 'grab', padding: '2px 3px', flexShrink: 0, opacity: 0.35 }}
        >
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: D.text2 }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 0 }}>
          <span style={{ background: D.accent, color: '#1a1a1a', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 3, fontFamily: 'monospace', flexShrink: 0, minWidth: 24, textAlign: 'center' }}>
            {index + 1}
          </span>
          {panel._sceneHeading && <span style={{ color: D.text2, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{panel._sceneHeading}</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => setExpanded(e => !e)}
            style={{ border: `1px solid ${D.border}`, background: 'transparent', color: D.text3, cursor: 'pointer', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{expanded ? '−' : '+'}</button>
          <button onClick={() => onDelete(panel.id)}
            style={{ border: `1px solid ${D.border}`, background: 'transparent', color: '#e05c5c', cursor: 'pointer', padding: '2px 7px', borderRadius: 4, fontSize: 11 }}>✕</button>
        </div>
      </div>
      {expanded && (
        isRow ? (
          <div style={{ display: 'flex' }}>
            <div style={{ width: '42%', flexShrink: 0, borderRight: `1px solid ${D.border}` }}>
              <SbDrawingCanvas initialData={panel.drawingData} onSave={d => u('drawingData', d)} />
            </div>
            <div style={{ flex: 1, padding: 12, minWidth: 0 }}>{fields}</div>
          </div>
        ) : (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ border: `1px solid ${D.border}`, borderRadius: 4, overflow: 'hidden' }}>
              <SbDrawingCanvas initialData={panel.drawingData} onSave={d => u('drawingData', d)} />
            </div>
            {fields}
          </div>
        )
      )}
    </div>
  );
}

// ── 로컬 스크립트 (외부 파일 업로드 기반) ──────────────────────────────────────
const LOCAL_SCRIPTS_KEY = 'director_local_scripts';
function loadLocalScripts() {
  try { return JSON.parse(localStorage.getItem(LOCAL_SCRIPTS_KEY) || '[]'); } catch { return []; }
}
function saveLocalScripts(list) {
  localStorage.setItem(LOCAL_SCRIPTS_KEY, JSON.stringify(list));
}
function deleteLocalScript(id) {
  saveLocalScripts(loadLocalScripts().filter(s => s.id !== id));
  localStorage.removeItem(getSbKey(id));
}

// ── 수동 입력 → 스토리보드 생성 모달 ──────────────────────────────────────────
function UploadScriptModal({ onClose, onGenerate }) {
  const D = useD();
  const [step,       setStep]       = useState(1); // 1=텍스트입력  2=씬미리보기
  const [error,      setError]      = useState('');
  const [title,      setTitle]      = useState('');
  const [scenes,     setScenes]     = useState([]);     // 편집용 씬 목록 (contentLines 없음)
  const [fullScenes, setFullScenes] = useState([]);     // 파싱 원본 (contentLines 보존)
  const [scriptText, setScriptText] = useState('');

  const OVERLAY = {
    position: 'fixed', inset: 0, zIndex: 9000,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  };
  const BOX = {
    background: D.panel, borderRadius: 12, width: '100%', maxWidth: 600,
    maxHeight: '90vh', display: 'flex', flexDirection: 'column',
    border: `1px solid ${D.border}`, overflow: 'hidden',
  };

  // 텍스트 → 씬 감지 (parseFullScript 1회만 호출, 결과 보존)
  const handleDetect = () => {
    const text = scriptText.trim();
    if (!text) { setError('대본 텍스트를 입력해주세요.'); return; }
    setError('');
    if (!title) setTitle('대본');
    const parsed = parseFullScript(text);
    setFullScenes(parsed);
    setScenes(parsed.map(s => ({ sceneNo: s.sceneNo, location: s.location, timeOfDay: s.timeOfDay, raw: s.raw })));
    setStep(2);
  };

  // 씬 편집
  const updateScene = (idx, field, val) => {
    setScenes(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  };
  const deleteScene = (idx) => setScenes(prev => prev.filter((_, i) => i !== idx));
  const addScene = () => {
    const nextNo = String((scenes.length > 0 ? Math.max(...scenes.map(s => parseInt(s.sceneNo) || 0)) : 0) + 1);
    setScenes(prev => [...prev, { sceneNo: nextNo, location: '', timeOfDay: '', raw: '' }]);
  };

  // 스토리보드 생성 (parseFullScript 재호출 없이 fullScenes 재사용)
  const handleGenerate = () => {
    const validScenes = scenes.filter(s => s.location || s.sceneNo);
    if (validScenes.length === 0) { setError('최소 1개 이상의 씬이 필요합니다.'); return; }
    const merged = validScenes.map((vs, i) => {
      const fs = fullScenes[i] || vs;
      return { ...fs, location: vs.location, timeOfDay: vs.timeOfDay, sceneNo: vs.sceneNo };
    });
    const panels = buildPanelsFromScenes(merged);
    const id = `ls_${Date.now()}`;
    onGenerate({ id, title: title.trim() || '대본', panels, text: scriptText.trim() });
  };

  return (
    <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={BOX}>
        {/* 헤더 */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: D.text }}>수동 입력으로 스토리보드 만들기</div>
            <div style={{ fontSize: 11, color: D.text3, marginTop: 2 }}>
              {step === 1 ? '대본 텍스트를 붙여넣으면 씬·지문·대사를 자동 인식합니다' : `씬 ${scenes.length}개 감지됨 — 수정 후 생성하세요`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: D.text3, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* ── 1단계: 제목 + 대본 텍스트 입력 ── */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: D.text3, display: 'block', marginBottom: 5 }}>작품 제목</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="제목 입력 (선택)"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: `1px solid ${D.border}`, background: D.bg, color: D.text, fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: D.text3, display: 'block', marginBottom: 5 }}>대본 텍스트</label>
                <div style={{ fontSize: 11, color: D.text3, marginBottom: 8, lineHeight: 1.7 }}>
                  씬번호(S#1. / 씬1. / 1. / INT. 등)가 포함된 줄을 씬 헤더로 인식합니다.<br />
                  대사(인물명: 대사)와 지문도 자동으로 구분해 패널에 채워집니다.
                </div>
                <textarea
                  value={scriptText}
                  onChange={e => setScriptText(e.target.value)}
                  placeholder={'예시:\nS#1. 카페 내부, 낮\n두 사람이 마주 앉아 있다.\n민준: 오늘은 어땠어?\n지수: 그냥... 별로였어.\n\nS#2. 골목길, 밤\n빗속을 걷는 주인공.'}
                  style={{
                    width: '100%', height: 280, resize: 'vertical',
                    background: D.bg, color: D.text,
                    border: `1px solid ${D.border}`, borderRadius: 8,
                    padding: '10px 12px', fontSize: 12, fontFamily: 'inherit',
                    lineHeight: 1.7, boxSizing: 'border-box',
                  }}
                />
              </div>
              {error && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(224,92,92,0.12)', borderRadius: 7, fontSize: 12, color: '#e05c5c', lineHeight: 1.7 }}>
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── 2단계: 씬 미리보기 ── */}
          {step === 2 && (
            <div>
              {/* 제목 수정 */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: D.text3, display: 'block', marginBottom: 5 }}>작품 제목</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="제목 입력"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: `1px solid ${D.border}`, background: D.bg, color: D.text, fontSize: 13 }}
                />
              </div>

              {/* 씬 0개일 때 */}
              {scenes.length === 0 && (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.4 }}>🔍</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: D.text, marginBottom: 6 }}>씬번호를 찾지 못했어요</div>
                  <div style={{ fontSize: 11, color: D.text3, lineHeight: 1.7, marginBottom: 16 }}>
                    S#1. / 씬1. / INT. 형식의 씬 헤더가 텍스트에 없습니다.<br />
                    씬을 직접 추가해서 스토리보드를 만들 수 있습니다.
                  </div>
                </div>
              )}

              {scenes.length > 0 && (
                <div style={{ marginBottom: 12, fontSize: 11, color: D.text3 }}>
                  씬 번호 · 장소 · 시간대를 수정하거나 불필요한 항목을 삭제하세요.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {scenes.map((scene, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: D.bg, borderRadius: 7, border: `1px solid ${D.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: D.accent, minWidth: 28, textAlign: 'center' }}>
                      S#{scene.sceneNo}
                    </div>
                    <input
                      value={scene.location}
                      onChange={e => updateScene(idx, 'location', e.target.value)}
                      placeholder="장소"
                      style={{ flex: 2, padding: '4px 7px', borderRadius: 5, border: `1px solid ${D.border}`, background: D.panel, color: D.text, fontSize: 12 }}
                    />
                    <input
                      value={scene.timeOfDay}
                      onChange={e => updateScene(idx, 'timeOfDay', e.target.value)}
                      placeholder="시간대"
                      style={{ flex: 1, padding: '4px 7px', borderRadius: 5, border: `1px solid ${D.border}`, background: D.panel, color: D.text, fontSize: 12 }}
                    />
                    <button
                      onClick={() => deleteScene(idx)}
                      style={{ background: 'none', border: 'none', color: '#e05c5c', fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                    >×</button>
                  </div>
                ))}
              </div>
              <button
                onClick={addScene}
                style={{ width: '100%', padding: '7px 0', borderRadius: 7, border: `1px dashed ${D.border}`, background: 'transparent', color: D.text3, fontSize: 12, cursor: 'pointer' }}
              >+ 씬 직접 추가</button>

              {error && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#e05c5c' }}>{error}</div>
              )}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {step === 2 && (
            <button
              onClick={() => { setStep(1); setError(''); }}
              style={{ padding: '7px 16px', borderRadius: 7, border: `1px solid ${D.border}`, background: 'transparent', color: D.text3, fontSize: 12, cursor: 'pointer' }}
            >← 텍스트 수정</button>
          )}
          <button
            onClick={onClose}
            style={{ padding: '7px 16px', borderRadius: 7, border: `1px solid ${D.border}`, background: 'transparent', color: D.text3, fontSize: 12, cursor: 'pointer' }}
          >취소</button>
          {step === 1 && (
            <button
              onClick={handleDetect}
              disabled={!scriptText.trim()}
              style={{ padding: '7px 20px', borderRadius: 7, border: 'none', background: scriptText.trim() ? D.accent : '#555', color: '#1a1a1a', fontSize: 12, fontWeight: 700, cursor: scriptText.trim() ? 'pointer' : 'default' }}
            >씬 감지 →</button>
          )}
          {step === 2 && (
            <button
              onClick={handleGenerate}
              style={{ padding: '7px 20px', borderRadius: 7, border: 'none', background: D.accent, color: '#1a1a1a', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >🎞 스토리보드 생성</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 텍스트 가져오기 모달 (스토리보드 생성 없이 바로 저장) ──────────────────────
function ImportTextModal({ onClose, onImport }) {
  const D = useD();
  const [title, setTitle] = useState('');
  const [text,  setText]  = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!text.trim()) { setError('대본 텍스트를 입력해주세요.'); return; }
    const id = `ls_${Date.now()}`;
    onImport({ id, title: title.trim() || '로컬 대본', text: text.trim() });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: D.panel, borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: `1px solid ${D.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: D.text }}>텍스트로 가져오기</div>
            <div style={{ fontSize: 11, color: D.text3, marginTop: 2 }}>대본 텍스트를 붙여넣으면 연출노트와 스토리보드를 작성할 수 있습니다</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: D.text3, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: D.text3, display: 'block', marginBottom: 5 }}>작품 제목</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="제목 없음"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 6, border: `1px solid ${D.border}`, background: D.bg, color: D.text, fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: D.text3 }}>대본 텍스트</label>
            <textarea value={text} onChange={e => setText(e.target.value)} placeholder="대본 텍스트를 붙여넣으세요…" rows={12}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6, border: `1px solid ${D.border}`, background: D.bg, color: D.text, fontSize: 12, lineHeight: 1.7, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          {error && <div style={{ fontSize: 12, color: '#e05c5c' }}>{error}</div>}
        </div>
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 6, border: `1px solid ${D.border}`, background: 'transparent', color: D.text3, fontSize: 12, cursor: 'pointer' }}>취소</button>
          <button onClick={handleSave} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: D.accent, color: '#1a1a1a', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>가져오기</button>
        </div>
      </div>
    </div>
  );
}

// 씬번호별로 컷번호를 순서대로 재부여 (1씬2컷 → 씬의 몇 번째 컷인지)
function recalcCutNos(panels) {
  const counts = {};
  return panels.map(p => {
    const key = p.sceneNo || '';
    counts[key] = (counts[key] || 0) + 1;
    return { ...p, cutNo: String(counts[key]) };
  });
}

// ─── 게스트 데모 데이터 ───────────────────────────────────────────────────────
const DEMO_SCRIPT = { id: '__guest_demo__', title: '예시: 이별의 카페', _isDemo: true };
const DEMO_PANELS = [
  { id: 'dp1', sceneNo: '1', cutNo: '1', shotSize: 'ELS', cameraMove: 'Static',   transition: 'Cut',  duration: '4', _sceneHeading: '카페 내부 / 낮',  dialogue: '',                              action: '텅 빈 카페. 창가로 햇살이 쏟아진다. 두 개의 빈 커피잔.', drawingData: null, annotatedBlocks: [] },
  { id: 'dp2', sceneNo: '1', cutNo: '2', shotSize: 'MS',  cameraMove: 'Static',   transition: 'Cut',  duration: '5', _sceneHeading: '카페 내부 / 낮',  dialogue: '민준: 우리, 이제 어떻게 되는 거야.',    action: '민준, 커피잔을 내려놓으며 지수를 바라본다.', drawingData: null, annotatedBlocks: [] },
  { id: 'dp3', sceneNo: '1', cutNo: '3', shotSize: 'CU',  cameraMove: 'Static',   transition: 'Cut',  duration: '3', _sceneHeading: '카페 내부 / 낮',  dialogue: '',                              action: '지수의 손. 커피잔을 꽉 쥐고 있다.', drawingData: null, annotatedBlocks: [] },
  { id: 'dp4', sceneNo: '2', cutNo: '1', shotSize: 'MS',  cameraMove: 'Pan',      transition: 'Cut',  duration: '4', _sceneHeading: '카페 내부 / 낮',  dialogue: '지수: 그냥... 이게 맞는 것 같아.', action: '지수, 창밖을 바라보며 말한다. 눈이 촉촉하다.', drawingData: null, annotatedBlocks: [] },
  { id: 'dp5', sceneNo: '2', cutNo: '2', shotSize: 'CU',  cameraMove: 'Zoom In',  transition: 'Cut',  duration: '3', _sceneHeading: '카페 내부 / 낮',  dialogue: '',                              action: '민준의 표정. 서서히 굳어간다.', drawingData: null, annotatedBlocks: [] },
  { id: 'dp6', sceneNo: '3', cutNo: '1', shotSize: 'LS',  cameraMove: 'Dolly Out',transition: 'Fade', duration: '7', _sceneHeading: '골목길 / 저녁',   dialogue: '',                              action: '지수, 골목길을 걸어나간다. 빗방울이 떨어지기 시작한다. 카메라가 서서히 멀어진다.', drawingData: null, annotatedBlocks: [] },
];

// ─── 게스트 가이드 ────────────────────────────────────────────────────────────
const GUIDE_STEPS = [
  {
    icon: '🎬',
    title: '연출 작업실에 오신 걸 환영합니다',
    desc: '대본을 씬 단위로 분석하고 컷별 스토리보드를 제작하는 공간입니다.\n예시 작품이 미리 열려 있어요 — 직접 조작해보세요!',
  },
  {
    icon: '🎞',
    title: '스토리보드 패널',
    desc: '씬마다 컷이 카드로 나뉩니다. 카드 상단의 숫자(1, 2, 3…)는 순서 번호예요.\n카드 안에서 씬번호·컷번호·장소를 확인할 수 있습니다.',
  },
  {
    icon: '✏️',
    title: '패널 편집',
    desc: '카드 안에서 샷 사이즈·카메라 무브·전환 효과를 고르고,\n드로잉 캔버스에 직접 그림을 그릴 수 있습니다.',
  },
  {
    icon: '➕',
    title: '패널 추가 & 정렬',
    desc: '카드를 하나 선택한 뒤 상단 "패널 추가" 버튼을 누르면 바로 아래에 새 컷이 생깁니다.\n카드 왼쪽 ⠿ 핸들을 드래그하면 순서를 바꿀 수 있습니다.',
  },
  {
    icon: '🔑',
    title: 'Google 로그인으로 더 많은 기능을',
    desc: '• 대본 작업실의 대본을 불러와 자동 씬 분리\n• 연출노트 작성 후 작가에게 피드백 전달\n• 스토리보드 저장 및 PDF 출력',
    isLast: true,
  },
];

function GuestGuide({ onLogin }) {
  const D = useD();
  const [step,    setStep]    = useState(0);
  const [visible, setVisible] = useState(true);

  if (!visible) {
    return (
      <button
        onClick={() => { setStep(0); setVisible(true); }}
        title="가이드 열기"
        style={{
          position: 'fixed', right: 24, bottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 12px)', zIndex: 9000,
          width: 40, height: 40, borderRadius: '50%',
          background: D.accent, color: '#1a1a1a',
          border: 'none', fontSize: 18, cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700,
        }}
      >?</button>
    );
  }

  const cur = GUIDE_STEPS[step];
  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 12px)', zIndex: 9000,
      width: 300,
      background: D.panel,
      border: `1px solid ${D.border}`,
      borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      overflow: 'hidden',
      fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif",
    }}>
      {/* 헤더 */}
      <div style={{ background: D.accent, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1a1a1a', letterSpacing: '0.06em' }}>
          연출 작업실 가이드 {step + 1}/{GUIDE_STEPS.length}
        </span>
        <button onClick={() => setVisible(false)}
          style={{ background: 'none', border: 'none', color: '#1a1a1a', fontSize: 16, cursor: 'pointer', lineHeight: 1, opacity: 0.7, padding: 0 }}>×</button>
      </div>

      {/* 스텝 도트 */}
      <div style={{ display: 'flex', gap: 5, padding: '10px 14px 0', justifyContent: 'center' }}>
        {GUIDE_STEPS.map((_, i) => (
          <div key={i} onClick={() => setStep(i)} style={{
            width: i === step ? 18 : 6, height: 6, borderRadius: 3,
            background: i === step ? D.accent : D.border,
            cursor: 'pointer', transition: 'all 0.2s',
          }} />
        ))}
      </div>

      {/* 본문 */}
      <div style={{ padding: '14px 16px 6px' }}>
        <div style={{ fontSize: 28, textAlign: 'center', marginBottom: 10 }}>{cur.icon}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: D.text, marginBottom: 8, textAlign: 'center' }}>{cur.title}</div>
        <div style={{ fontSize: 12, color: D.text2, lineHeight: 1.75, whiteSpace: 'pre-line' }}>{cur.desc}</div>
      </div>

      {/* 버튼 */}
      <div style={{ padding: '12px 14px', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)}
            style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${D.border}`, background: 'transparent', color: D.text3, fontSize: 11, cursor: 'pointer' }}>
            ← 이전
          </button>
        )}
        {cur.isLast ? (
          <>
            <button onClick={() => setVisible(false)}
              style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${D.border}`, background: 'transparent', color: D.text3, fontSize: 11, cursor: 'pointer' }}>
              닫기
            </button>
            <button onClick={onLogin}
              style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: D.accent, color: '#1a1a1a', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Google 로그인 →
            </button>
          </>
        ) : (
          <button onClick={() => setStep(s => s + 1)}
            style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: D.accent, color: '#1a1a1a', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            다음 →
          </button>
        )}
      </div>
    </div>
  );
}

function StoryboardPanel({ isGuest, isMobile = false, mobilePreSelected = null, mobilePrePanels = null, onMobilePanelsChange = null }) {
  const D = useD();
  const [scripts,         setScripts]         = useState(null);
  const [localScripts,    setLocalScripts]    = useState(() => loadLocalScripts());
  const [selected,        setSelected]        = useState(mobilePreSelected);
  const [panels,          setPanels]          = useState(null);   // null = 미생성
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [cardView,        setCardView]        = useState('card'); // 'card' | 'row'
  const [showUpload,      setShowUpload]      = useState(false);
  const [selectedPanelId, setSelectedPanelId] = useState(null);  // 선택된 패널
  const [draggingIdx,     setDraggingIdx]     = useState(null);   // 드래그 중인 인덱스
  const [dragOverIdx,     setDragOverIdx]     = useState(null);   // 드롭 대상 인덱스
  const [sheetOpen,       setSheetOpen]       = useState(false);  // 모바일 작품 시트
  const [printHeader,     setPrintHeader]     = useState(false);  // 출력 머리말/꼬리말
  const [printBgGraphics, setPrintBgGraphics] = useState(false);  // 출력 배경 그래픽
  const [subCollapsed,    setSubCollapsed]    = useState(false);  // 좌측 목록 패널 접힘
  const dragItem     = useRef(null);
  const dragOverItem = useRef(null);

  // 게스트: 데모 자동 선택
  useEffect(() => {
    if (!isGuest) return;
    setSelected(DEMO_SCRIPT);
    setPanels(DEMO_PANELS);
  }, [isGuest]);

  // 모바일: 외부에서 선택된 작품 동기화 (데모 스크립트는 isGuest effect가 담당)
  useEffect(() => {
    if (!mobilePreSelected || mobilePreSelected._isDemo) return;
    setSelected(mobilePreSelected);
    const loaded = loadStoryboard(mobilePreSelected.id);
    setPanels(loaded);
  }, [mobilePreSelected?.id]);

  // Supabase 스크립트 목록
  useEffect(() => {
    if (isGuest) { setScripts([]); return; }
    if (!supabase) { setScripts([]); return; }
    supabase.from('shared_scripts').select('id, title, imported_at, drive_file_id')
      .order('imported_at', { ascending: false })
      .then(({ data }) => setScripts(data || []));
  }, []);

  // 외부 파일 업로드 완료 핸들러
  const handleUploadGenerate = ({ id, title, panels: generatedPanels, text = '' }) => {
    const entry = { id, title, text, createdAt: new Date().toISOString(), _isLocal: true };
    const updated = [entry, ...loadLocalScripts()];
    saveLocalScripts(updated);
    const recalced = recalcCutNos(generatedPanels);
    saveStoryboard(id, recalced);
    setLocalScripts(updated);
    setSelected(entry);
    setPanels(recalced);
    setSelectedPanelId(null);
    setShowUpload(false);
  };

  // 로컬 스크립트 삭제
  const handleDeleteLocal = (e, id) => {
    e.stopPropagation();
    if (!window.confirm('이 스토리보드를 삭제할까요?\n(로컬에만 저장된 데이터가 삭제됩니다)')) return;
    deleteLocalScript(id);
    setLocalScripts(loadLocalScripts());
    if (selected?.id === id) { setSelected(null); setPanels(null); }
  };

  // 작품 선택 시 기존 스토리보드 로드
  const handleSelect = (s) => {
    setSelected(s);
    setError('');
    setPanels(loadStoryboard(s.id));
    setSelectedPanelId(null);
  };

  // 스토리보드 생성: Drive에서 대본 로드 → 블록 파싱
  const handleGenerate = async () => {
    if (!selected) return;
    setLoading(true); setError('');
    try {
      if (!isTokenValid()) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.provider_token) throw new Error('Drive 권한이 없습니다. 다시 로그인해주세요.');
        setAccessToken(session.provider_token, 3600);
      }
      const saved = await loadDirectorScript(selected.drive_file_id);
      const data  = saved?.data ?? saved;
      const scriptBlocks = data.scriptBlocks || [];
      const generated = attachDirectorNotes(
        parseScriptBlocksForDirector(scriptBlocks),
        selected.id
      );
      if (generated.length === 0) throw new Error('씬 헤더 블록(scene_number)이 없어 패널을 나눌 수 없습니다.');
      const recalced = recalcCutNos(generated);
      setPanels(recalced);
      saveStoryboard(selected.id, recalced);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (updated) => {
    setPanels(prev => {
      const next = prev.map(p => p.id === updated.id ? updated : p);
      saveStoryboard(selected.id, next);
      return next;
    });
  };

  const handleDelete = (id) => {
    setPanels(prev => {
      const next = recalcCutNos(prev.filter(p => p.id !== id));
      saveStoryboard(selected.id, next);
      return next;
    });
  };

  const handleMove = (index, dir) => {
    setPanels(prev => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      saveStoryboard(selected.id, next);
      return next;
    });
  };

  const handleAddPanel = () => {
    if (!selected || !panels) return;
    // 선택된 패널 위치 (없으면 맨 끝)
    const selIdx = selectedPanelId ? panels.findIndex(p => p.id === selectedPanelId) : -1;
    const refPanel = selIdx >= 0 ? panels[selIdx] : (panels.length > 0 ? panels[panels.length - 1] : null);
    const insertAfterIdx = selIdx >= 0 ? selIdx + 1 : panels.length;
    // 선택된(또는 마지막) 패널과 같은 씬번호 상속
    const newPanel = {
      id: `sb_${Date.now()}`,
      shotSize: 'MS', cameraMove: 'Static', transition: 'Cut',
      dialogue: '', action: '', duration: '3',
      sceneNo: refPanel?.sceneNo || '',
      cutNo: '1', // recalcCutNos로 즉시 재부여됨
      drawingData: null,
      _sceneHeading: refPanel?._sceneHeading || '',
      annotatedBlocks: [],
    };
    const inserted = [
      ...panels.slice(0, insertAfterIdx),
      newPanel,
      ...panels.slice(insertAfterIdx),
    ];
    const next = recalcCutNos(inserted);
    setPanels(next);
    setSelectedPanelId(newPanel.id);
    saveStoryboard(selected.id, next);
  };

  // 드래그 앤 드롭 핸들러
  const handleDragStart = (index) => {
    dragItem.current = index;
    setDraggingIdx(index);
  };
  const handleDragEnter = (index) => {
    if (dragItem.current === index) return;
    dragOverItem.current = index;
    setDragOverIdx(index);
  };
  const handleDragEnd = () => {
    const from = dragItem.current;
    const to   = dragOverItem.current;
    dragItem.current = null; dragOverItem.current = null;
    setDraggingIdx(null); setDragOverIdx(null);
    if (from === null || to === null || from === to) return;
    setPanels(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      const recalced = recalcCutNos(next);
      saveStoryboard(selected.id, recalced);
      return recalced;
    });
  };

  const handleReset = () => {
    if (!selected) return;
    if (!window.confirm('스토리보드를 초기화하면 모든 내용이 삭제됩니다. 계속할까요?')) return;
    localStorage.removeItem(getSbKey(selected.id));
    setPanels(null);
    setSelectedPanelId(null);
  };

  const getPanelCount = (scriptId) => {
    const sb = loadStoryboard(scriptId);
    return sb ? sb.length : 0;
  };

  const totalSec = panels ? panels.reduce((a, p) => a + (parseInt(p.duration) || 0), 0) : 0;

  const handlePrint = () => {
    if (!panels || panels.length === 0) return;
    const title = selected?.title || '스토리보드';
    // XSS 방어: 속성값 포함 전체 이스케이핑
    const esc = s => (s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, '<br>');
    // 색상 값 검증 (hex/rgb 계열만 허용)
    const safeColor = c => /^#[0-9a-f]{3,8}$|^rgb/i.test(c || '') ? c : '#fef08a';
    // drawingData: base64 data URL 형식만 허용
    const safeDataUrl = d => typeof d === 'string' && d.startsWith('data:image/') ? d : null;

    const panelHtml = panels.map((p, i) => {
      const notes = (p.annotatedBlocks || []).filter(b => b.note);
      const notesHtml = notes.length > 0
        ? notes.map(b => `
            <div class="note" style="background:${safeColor(b.note.color)}">
              <span class="note-label">📋 연출노트</span>
              ${esc(b.note.content)}
            </div>`).join('')
        : '';
      const imgSrc = safeDataUrl(p.drawingData);
      const drawingHtml = imgSrc
        ? `<img src="${imgSrc}" class="canvas-img"/>`
        : `<div class="canvas-empty"><span>🎬</span></div>`;

      return `
        <div class="panel">
          <div class="panel-header">
            <span class="cut-badge">${i + 1}</span>
            <span class="scene-heading">${esc(p._sceneHeading)}</span>
            <span class="transition">${esc(p.transition)}</span>
          </div>
          <div class="panel-body">
            <div class="drawing">${drawingHtml}</div>
            <div class="info">
              <div class="meta-row">
                <div class="meta-item"><span class="meta-lbl">샷 사이즈</span><span class="meta-val">${esc(p.shotSize)}</span></div>
                <div class="meta-item"><span class="meta-lbl">카메라 무브</span><span class="meta-val">${esc(p.cameraMove)}</span></div>
                <div class="meta-item"><span class="meta-lbl">시간</span><span class="meta-val">${esc(p.duration)}s</span></div>
              </div>
              ${p.dialogue ? `<div class="field"><span class="field-lbl">대사</span><div class="field-val">${esc(p.dialogue)}</div></div>` : ''}
              ${p.action   ? `<div class="field"><span class="field-lbl">액션</span><div class="field-val">${esc(p.action)}</div></div>` : ''}
              ${notesHtml ? `<div class="notes-section">${notesHtml}</div>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${esc(title)} — 스토리보드</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; background: #fff; color: #111; font-size: 12px; }
  .doc-title { padding: 24px 32px 12px; border-bottom: 2px solid #111; display: flex; justify-content: space-between; align-items: flex-end; }
  .doc-title h1 { font-size: 20px; font-weight: 700; }
  .doc-title .meta { font-size: 11px; color: #555; }
  .panels { padding: 20px 32px; display: flex; flex-direction: column; gap: 20px; }
  .panel { border: 1px solid #ccc; border-radius: 6px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .panel-header { background: #f4f4f4; padding: 6px 12px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #ddd; }
  .cut-badge { background: #e8a020; color: #000; font-size: 10px; font-weight: 700; padding: 2px 9px; border-radius: 3px; font-family: monospace; letter-spacing: 0.02em; }
  .scene-heading { font-size: 12px; font-weight: 600; flex: 1; }
  .transition { font-size: 10px; color: #888; }
  .panel-body { display: flex; gap: 0; }
  .drawing { width: 38%; flex-shrink: 0; border-right: 1px solid #ddd; background: #1a1e28; }
  .canvas-img { width: 100%; display: block; aspect-ratio: 16/9; object-fit: cover; }
  .canvas-empty { aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; font-size: 28px; opacity: 0.3; }
  .info { flex: 1; padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; }
  .meta-row { display: flex; gap: 16px; }
  .meta-item { display: flex; flex-direction: column; gap: 2px; }
  .meta-lbl { font-size: 9px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
  .meta-val { font-size: 12px; font-weight: 600; color: #111; }
  .field { display: flex; flex-direction: column; gap: 2px; }
  .field-lbl { font-size: 9px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
  .field-val { font-size: 12px; color: #333; line-height: 1.6; }
  .notes-section { display: flex; flex-direction: column; gap: 5px; }
  .note { border-radius: 4px; padding: 5px 8px; font-size: 11px; color: #111; line-height: 1.6; border-left: 3px solid #93c5fd; }
  .note-label { display: block; font-size: 8px; font-weight: 700; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
  @media print {
    @page { size: A4; margin: 15mm 15mm 20mm; }
    body { -webkit-print-color-adjust: ${printBgGraphics ? 'exact' : 'economy'}; print-color-adjust: ${printBgGraphics ? 'exact' : 'economy'}; }
    .panel { break-inside: avoid; }
    ${!printBgGraphics ? '.drawing { background: #fff !important; } .panel-header { background: #fff !important; }' : ''}
  }
</style>
</head>
<body>
  ${printHeader ? `<div class="doc-title">
    <h1>${esc(title)} — 스토리보드</h1>
    <div class="meta">패널 ${panels.length}개 · 예상 ${totalSec}초 · ${new Date().toLocaleDateString('ko-KR')}</div>
  </div>` : ''}
  <div class="panels">${panelHtml}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.'); return; }
    w.document.write(html);
    w.document.close();
  };

  // 스크립트 목록 공통 JSX (모바일 시트 + 데스크톱 패널 공용)
  const sbScriptListContent = (
    <div>
      <div style={{ padding: '10px 16px 8px' }}>
        <button onClick={() => { setShowUpload(true); setSheetOpen(false); }}
          style={{ width: '100%', padding: '8px 0', borderRadius: 6, border: `1px solid ${D.accent}`, background: 'transparent', color: D.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          + 텍스트로 만들기
        </button>
      </div>
      <div style={{ padding: '4px 0' }}>
        {localScripts.length > 0 && (
          <>
            <div style={{ padding: '4px 16px 2px', fontSize: 9, fontWeight: 700, color: D.text3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>업로드 파일</div>
            {localScripts.map(s => {
              const count = getPanelCount(s.id); const active = selected?.id === s.id;
              return (
                <div key={s.id} onClick={() => { handleSelect(s); setSheetOpen(false); }}
                  style={{ padding: '8px 16px', cursor: 'pointer', borderLeft: active ? `2px solid ${D.accent}` : '2px solid transparent', background: active ? D.active : 'transparent', transition: 'background 0.12s', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? D.accent : D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                    <div style={{ fontSize: 10, color: D.text3, marginTop: 1 }}>📄 {count > 0 ? `패널 ${count}개` : '패널 없음'}</div>
                  </div>
                  <button onClick={e => handleDeleteLocal(e, s.id)} style={{ background: 'none', border: 'none', color: D.text3, fontSize: 13, cursor: 'pointer', padding: '0 2px', flexShrink: 0, opacity: 0.5 }} title="삭제">×</button>
                </div>
              );
            })}
            {scripts?.length > 0 && <div style={{ margin: '6px 16px', borderBottom: `1px solid ${D.border}` }} />}
          </>
        )}
        {localScripts.length > 0 && scripts?.length > 0 && (
          <div style={{ padding: '4px 16px 2px', fontSize: 9, fontWeight: 700, color: D.text3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>가져온 대본</div>
        )}
        {scripts === null && <div style={{ padding: '12px 16px', fontSize: 12, color: D.text3 }}>불러오는 중…</div>}
        {scripts?.length === 0 && localScripts.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}>🎞</div>
            <div style={{ fontSize: 11, color: D.text3, lineHeight: 1.6 }}>가져온 작품이 없습니다.</div>
          </div>
        )}
        {scripts?.map(s => {
          const count = getPanelCount(s.id); const active = selected?.id === s.id;
          return (
            <div key={s.id} onClick={() => { handleSelect(s); setSheetOpen(false); }}
              style={{ padding: '10px 16px', cursor: 'pointer', borderLeft: active ? `2px solid ${D.accent}` : '2px solid transparent', background: active ? D.active : 'transparent', transition: 'background 0.12s', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? D.accent : D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                <div style={{ fontSize: 10, color: D.text3, marginTop: 2 }}>{count > 0 ? `패널 ${count}개` : '미생성'}</div>
              </div>
              {count > 0 && (
                <div style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: D.accent, color: '#1a1a1a', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{count > 9 ? '9+' : count}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%' }}>

      {/* 작품 목록: 모바일→부모(DirectorMobileView)가 관리 / 데스크톱→좌측 패널 */}
      {!isMobile ? (
        <div style={{ width: subCollapsed ? 28 : 240, flexShrink: 0, borderRight: `1px solid ${D.border}`, background: D.panel, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'width 0.2s ease' }}>
          <div style={{ padding: '10px 8px 10px 12px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
            {!subCollapsed && <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: D.text3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>스토리보드</div>}
            <button onClick={() => setSubCollapsed(v => !v)} title={subCollapsed ? '목록 열기' : '목록 닫기'}
              style={{ flexShrink: 0, background: 'none', border: 'none', color: D.text3, cursor: 'pointer', fontSize: 10, padding: '2px 4px', lineHeight: 1 }}>
              {subCollapsed ? '▶' : '◀'}
            </button>
          </div>
          {!subCollapsed && <div style={{ flex: 1, overflowY: 'auto' }}>{sbScriptListContent}</div>}
        </div>
      ) : null}

      {/* 업로드 모달 */}
      {showUpload && <UploadScriptModal onClose={() => setShowUpload(false)} onGenerate={handleUploadGenerate} />}

      {/* 우: 스토리보드 영역 */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto', background: D.bg }}>

        {/* 미선택 */}
        {!selected && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.25 }}>🎞</div>
              <div style={{ fontSize: 13, color: D.text3 }}>{isMobile ? '아래 버튼으로 작품을 선택하세요' : '좌측에서 작품을 선택하세요'}</div>
            </div>
          </div>
        )}

        {/* 생성 전 */}
        {selected && panels === null && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', maxWidth: 380 }}>
              <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>🎞</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: D.text, marginBottom: 8 }}>{selected.title}</div>
              <div style={{ fontSize: 12, color: D.text3, lineHeight: 1.8, marginBottom: 24 }}>
                대본의 씬 헤더를 기반으로 스토리보드를 자동 생성합니다.<br />
                각 패널에서 드로잉 · 샷 사이즈 · 카메라 무브 · 대사/액션을 작성할 수 있습니다.
              </div>
              {error && <div style={{ fontSize: 12, color: '#e05c5c', marginBottom: 14, lineHeight: 1.6 }}>{error}</div>}
              <button
                onClick={handleGenerate} disabled={loading}
                style={{ padding: '10px 28px', borderRadius: 8, border: 'none', background: loading ? '#555' : D.accent, color: '#1a1a1a', fontSize: 13, fontWeight: 700, cursor: loading ? 'default' : 'pointer' }}
              >{loading ? '생성 중…' : '🎞 스토리보드 생성'}</button>
            </div>
          </div>
        )}

        {/* 패널 목록 */}
        {selected && panels !== null && (
          <div style={{ padding: isMobile ? '16px 12px' : 32 }}>

            {/* 상단 바 */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
              {/* 모바일: 작품 선택 버튼 */}
              {isMobile && (
                <button onClick={() => setSheetOpen(true)}
                  style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${D.border}`, background: D.panel, color: D.text2, fontSize: 11, cursor: 'pointer', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  🎞 {selected.title.slice(0, 10)}{selected.title.length > 10 ? '…' : ''}
                </button>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {!isMobile && <div style={{ fontSize: 15, fontWeight: 700, color: D.text }}>{selected.title} — 스토리보드</div>}
                <div style={{ fontSize: 11, color: D.text3, marginTop: isMobile ? 0 : 3 }}>
                  패널 {panels.length}개 · 예상 {totalSec}초
                </div>
              </div>
              {/* 뷰 토글 */}
              <div style={{ display: 'flex', background: D.panel, borderRadius: 6, padding: 2, gap: 2 }}>
                {[['card', isMobile ? '카드' : '카드형'], ['row', isMobile ? '가로' : '가로형']].map(([v, l]) => (
                  <button key={v} onClick={() => setCardView(v)}
                    style={{ padding: isMobile ? '4px 8px' : '3px 10px', borderRadius: 4, border: 'none', fontSize: isMobile ? 12 : 11, fontWeight: 600, cursor: 'pointer',
                      background: cardView === v ? D.accent : 'transparent',
                      color: cardView === v ? '#1a1a1a' : D.text3 }}>
                    {l}
                  </button>
                ))}
              </div>
              {!isMobile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {[
                    { key: 'header',     label: '머리말',     val: printHeader,     set: setPrintHeader },
                    { key: 'bg',         label: '배경',       val: printBgGraphics, set: setPrintBgGraphics },
                  ].map(({ key, label, val, set }) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: D.text3, cursor: 'pointer', userSelect: 'none' }}>
                      <input type="checkbox" checked={val} onChange={e => set(e.target.checked)}
                        style={{ accentColor: D.accent, cursor: 'pointer' }} />
                      {label}
                    </label>
                  ))}
                  <button onClick={handlePrint}
                    style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: D.accent, color: '#1a1a1a', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    출력 / PDF
                  </button>
                </div>
              )}
              <button onClick={handleAddPanel}
                style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${D.accent}`, background: 'transparent', color: D.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                + 패널 추가
              </button>
              <button onClick={handleReset}
                style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${D.border}`, background: 'transparent', color: D.text3, fontSize: 11, cursor: 'pointer' }}>
                초기화
              </button>
            </div>

            {panels.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: D.text3, fontSize: 13 }}>
                패널이 없습니다. "+ 패널 추가"로 시작하세요.
              </div>
            )}

            {/* 카드형: 2열 그리드 / 가로형: 1열 / 모바일: 1열 */}
            <div style={isMobile
              ? { display: 'flex', flexDirection: 'column', gap: 12 }
              : cardView === 'card'
                ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }
                : { display: 'flex', flexDirection: 'column', gap: 16 }
            }>
              {panels.map((panel, idx) => (
                <SbPanelCard
                  key={panel.id}
                  panel={panel}
                  index={idx}
                  total={panels.length}
                  onChange={handleChange}
                  onDelete={handleDelete}
                  onMove={handleMove}
                  cardView={cardView}
                  isSelected={selectedPanelId === panel.id}
                  onSelect={setSelectedPanelId}
                  isDragging={draggingIdx === idx}
                  isDragOver={dragOverIdx === idx && draggingIdx !== idx}
                  onDragStart={handleDragStart}
                  onDragEnter={handleDragEnter}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
