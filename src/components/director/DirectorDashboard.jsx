import { useState, useEffect, useRef, createContext, useContext, Component } from 'react';
import { supabaseSignOut, extractUserData, supabase, signInWithGoogle } from '../../store/supabaseClient';
import { setAccessToken, isTokenValid, loadDirectorScript, deleteFileById } from '../../store/googleDrive';
import DirectorScriptViewer from './DirectorScriptViewer';
import PreviewRenderer from '../../print/PreviewRenderer';

// OAuth 리디렉트 시 현재 hash 보존 → App.jsx onAuthStateChange에서 복원
const RETURN_HASH_KEY = 'drama_pending_return_hash';

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

// ─── 감독 대시보드 ────────────────────────────────────────────────────────────
export default function DirectorDashboard({ session, onBack, isGuest = false }) {
  const user = extractUserData(session);
  const [activeMenu, setActiveMenu] = useState('projects');
  const [loggingOut, setLoggingOut] = useState(false);
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

  return (
    <ThemeCtx.Provider value={D}>
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: D.bg, color: D.text, fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif" }}>

      {/* 상단 헤더 */}
      <header style={{
        height: 56,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 16,
        borderBottom: `1px solid ${D.border}`,
        background: D.sidebar,
      }}>
        {/* 로고 영역 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: D.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14,
          }}>🎬</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: D.text, letterSpacing: '-0.02em' }}>연출 작업실</span>
          <span style={{
            fontSize: 9, fontWeight: 600, color: D.sidebar,
            background: D.accent, borderRadius: 3,
            padding: '2px 5px', letterSpacing: '0.05em',
          }}>DIRECTOR</span>
        </div>

        <div style={{ width: 1, height: 20, background: D.border }} />

        <button
          onClick={onBack}
          style={{
            fontSize: 12, color: D.text3,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          ← 대본 작업실로
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {user?.avatar
              ? <img src={user.avatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${D.border}` }} />
              : <div style={{ width: 28, height: 28, borderRadius: '50%', background: D.card, border: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: D.text2 }}>감</div>
            }
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: D.text }}>{user?.name || '감독'}</div>
              <div style={{ fontSize: 10, color: D.text3 }}>{user?.email}</div>
            </div>
          </div>
          {isGuest ? (
            <button
              onClick={loginWithReturnHash}
              style={{
                fontSize: 11, color: D.accent,
                background: 'none', border: `1px solid ${D.accent}`,
                borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
              }}
            >Google로 로그인</button>
          ) : (
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              style={{
                fontSize: 11, color: D.text3,
                background: 'none', border: `1px solid ${D.border}`,
                borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
              }}
            >{loggingOut ? '…' : '로그아웃'}</button>
          )}
        </div>
      </header>

      {/* 본문 */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* 좌측 사이드바 */}
        <aside style={{
          width: 220,
          flexShrink: 0,
          background: D.sidebar,
          borderRight: `1px solid ${D.border}`,
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 0',
          gap: 2,
        }}>
          <SideSection label="작품" />
          <SideItem icon="📄" label="작품 목록" active={activeMenu === 'projects'} onClick={() => setActiveMenu('projects')} />

          <div style={{ margin: '12px 0 0', height: 1, background: D.border, mx: 12 }} />

          <SideSection label="연출" />
          <SideItem icon="📝" label="연출노트"   active={activeMenu === 'notes'}      onClick={() => setActiveMenu('notes')} />
          <SideItem icon="🎞" label="스토리보드" active={activeMenu === 'storyboard'} onClick={() => setActiveMenu('storyboard')} />
        </aside>

        {/* 우측 콘텐츠 */}
        <main style={{ flex: 1, display: 'flex', minHeight: 0, background: D.bg, overflow: 'hidden' }}>
          {activeMenu === 'projects'   && <ProjectsPanel session={session} isGuest={isGuest} />}
          {activeMenu === 'notes'      && <NotesPanel />}
          {activeMenu === 'storyboard' && <StoryboardPanel />}
        </main>
      </div>
    </div>
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
        padding: '8px 16px 8px 20px',
        fontSize: 13, cursor: 'pointer',
        borderRight: active ? `2px solid ${D.accent}` : '2px solid transparent',
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

function ProjectsPanel({ session, isGuest }) {
  const D = useD();
  const [scripts,  setScripts]  = useState(null);
  const [error,    setError]    = useState('');
  const [selected, setSelected] = useState(null);
  const [viewing,  setViewing]  = useState(null);
  const [loading,  setLoading]  = useState(false);

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
    const { error } = await supabase.from('shared_scripts').delete().eq('id', script.id);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
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

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

      {/* 좌: 작품 목록 패널 */}
      <div style={{
        width: 260, flexShrink: 0,
        borderRight: `1px solid ${D.border}`,
        background: D.panel,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 16px 10px', borderBottom: `1px solid ${D.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: D.text3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>작품 목록</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {error && <div style={{ padding: '12px 16px', fontSize: 12, color: '#e05c5c' }}>오류: {error}</div>}
          {scripts === null && <div style={{ padding: '12px 16px', fontSize: 12, color: D.text3 }}>불러오는 중…</div>}
          {scripts?.length === 0 && !error && (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.4 }}>📄</div>
              <div style={{ fontSize: 11, color: D.text3, lineHeight: 1.6 }}>가져온 작품이 없습니다.<br />검토 링크에서 가져오기를<br />눌러주세요.</div>
            </div>
          )}
          {scripts?.map(s => (
            <ScriptListItem
              key={s.id}
              script={s}
              active={selected?.id === s.id}
              onClick={() => handleSelect(s)}
              onDelete={handleDeleteScript}
            />
          ))}
        </div>
      </div>

      {/* 우: 대본 뷰어 영역 */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#d8d8d8' }}>

        {/* 뷰어 상단 바 */}
        {selected && viewing?.appState && (
          <div style={{
            height: 44, flexShrink: 0,
            display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10,
            background: D.sidebar, borderBottom: `1px solid ${D.border}`,
          }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.title}
            </span>
            <SendButton scriptRow={selected} viewing={viewing} />
          </div>
        )}

        {/* 본문 스크롤 영역 */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {!selected && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>📄</div>
                <div style={{ fontSize: 13, color: '#888' }}>좌측에서 작품을 선택하세요</div>
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
              <DirectorScriptViewer
                appState={viewing.appState}
                selections={viewing.selections}
                sharedScriptId={selected.id}
              />
            </ViewerErrorBoundary>
          )}
        </div>
      </div>

      </div>
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

function NotesPanel() {
  const D = useD();
  const [scripts,   setScripts]   = useState(null);
  const [selected,  setSelected]  = useState(null);
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

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

      {/* 좌: 작품 목록 */}
      <div style={{
        width: 240, flexShrink: 0,
        borderRight: `1px solid ${D.border}`,
        background: D.panel,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 16px 10px', borderBottom: `1px solid ${D.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: D.text3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>작품별 연출노트</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {scripts === null && <div style={{ padding: '12px 16px', fontSize: 12, color: D.text3 }}>불러오는 중…</div>}
          {scripts?.length === 0 && (
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
                onClick={() => { setSelected(s); setAdding(false); setEditingId(null); }}
                style={{
                  padding: '10px 16px', cursor: 'pointer',
                  borderLeft: active ? `2px solid ${D.accent}` : '2px solid transparent',
                  background: active ? D.active : 'transparent',
                  transition: 'background 0.12s',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? D.accent : D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize: 10, color: D.text3, marginTop: 2 }}>메모 {count}개</div>
                </div>
                {count > 0 && (
                  <div style={{
                    flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
                    background: '#93c5fd', color: '#1a1a2e',
                    fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{count > 9 ? '9+' : count}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 우: 노트 목록 */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto', background: D.bg, padding: 32 }}>
        {!selected && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>📋</div>
              <div style={{ fontSize: 13, color: D.text3 }}>좌측에서 작품을 선택하세요</div>
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

function SbPanelCard({ panel, index, total, onChange, onDelete, onMove, cardView }) {
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
    <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 8, overflow: 'hidden' }}>
      {/* 카드 헤더 */}
      <div style={{ background: D.panel, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${D.border}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, opacity: 0.3 }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: D.text2 }}/>)}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 0 }}>
          <span style={{ background: D.accent, color: '#1a1a1a', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, fontFamily: 'monospace', flexShrink: 0 }}>
            CUT {panel.cutNo || index + 1}
          </span>
          {panel.sceneNo && <span style={{ border: `1px solid ${D.border}`, color: D.text3, fontSize: 10, padding: '2px 6px', borderRadius: 3, fontFamily: 'monospace', flexShrink: 0 }}>S#{panel.sceneNo}</span>}
          {panel._sceneHeading && <span style={{ color: D.text2, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{panel._sceneHeading}</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={() => onMove(index, -1)} disabled={index === 0}
            style={{ border: `1px solid ${D.border}`, background: 'transparent', color: D.text3, cursor: 'pointer', padding: '2px 7px', borderRadius: 4, fontSize: 11 }}>↑</button>
          <button onClick={() => onMove(index, 1)} disabled={index === total - 1}
            style={{ border: `1px solid ${D.border}`, background: 'transparent', color: D.text3, cursor: 'pointer', padding: '2px 7px', borderRadius: 4, fontSize: 11 }}>↓</button>
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

function StoryboardPanel() {
  const D = useD();
  const [scripts,   setScripts]   = useState(null);
  const [selected,  setSelected]  = useState(null);
  const [panels,    setPanels]    = useState(null);   // null = 미생성
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [cardView,  setCardView]  = useState('card'); // 'card' | 'row'

  // 스크립트 목록
  useEffect(() => {
    if (!supabase) { setScripts([]); return; }
    supabase.from('shared_scripts').select('id, title, imported_at, drive_file_id')
      .order('imported_at', { ascending: false })
      .then(({ data }) => setScripts(data || []));
  }, []);

  // 작품 선택 시 기존 스토리보드 로드
  const handleSelect = (s) => {
    setSelected(s);
    setError('');
    setPanels(loadStoryboard(s.id));
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
      setPanels(generated);
      saveStoryboard(selected.id, generated);
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
      const next = prev.filter(p => p.id !== id);
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
    const cutNo = panels.length + 1;
    const newPanel = {
      id: `sb_${Date.now()}`, shotSize: 'MS', cameraMove: 'Static', transition: 'Cut',
      dialogue: '', action: '', duration: '3',
      sceneNo: String(cutNo), cutNo: String(cutNo),
      drawingData: null, _sceneHeading: `씬 ${cutNo}`,
    };
    const next = [...panels, newPanel];
    setPanels(next);
    saveStoryboard(selected.id, next);
  };

  const handleReset = () => {
    if (!selected) return;
    if (!window.confirm('스토리보드를 초기화하면 모든 내용이 삭제됩니다. 계속할까요?')) return;
    localStorage.removeItem(getSbKey(selected.id));
    setPanels(null);
  };

  const getPanelCount = (scriptId) => {
    const sb = loadStoryboard(scriptId);
    return sb ? sb.length : 0;
  };

  const totalSec = panels ? panels.reduce((a, p) => a + (parseInt(p.duration) || 0), 0) : 0;

  const handlePrint = () => {
    if (!panels || panels.length === 0) return;
    const title = selected?.title || '스토리보드';
    const esc = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');

    const panelHtml = panels.map((p, i) => {
      const notes = (p.annotatedBlocks || []).filter(b => b.note);
      const notesHtml = notes.length > 0
        ? notes.map(b => `
            <div class="note" style="background:${b.note.color || '#fef08a'}">
              <span class="note-label">📋 연출노트</span>
              ${esc(b.note.content)}
            </div>`).join('')
        : '';
      const drawingHtml = p.drawingData
        ? `<img src="${p.drawingData}" class="canvas-img"/>`
        : `<div class="canvas-empty"><span>🎬</span></div>`;

      return `
        <div class="panel">
          <div class="panel-header">
            <span class="cut-badge">CUT ${esc(p.cutNo || String(i+1))}</span>
            <span class="scene-no">S#${esc(p.sceneNo)}</span>
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
  .cut-badge { background: #e8a020; color: #000; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 3px; font-family: monospace; }
  .scene-no { border: 1px solid #bbb; color: #555; font-size: 10px; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
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
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .panel { break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="doc-title">
    <h1>${esc(title)} — 스토리보드</h1>
    <div class="meta">패널 ${panels.length}개 · 예상 ${totalSec}초 · ${new Date().toLocaleDateString('ko-KR')}</div>
  </div>
  <div class="panels">${panelHtml}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.'); return; }
    w.document.write(html);
    w.document.close();
  };

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%' }}>

      {/* 좌: 작품 목록 */}
      <div style={{
        width: 240, flexShrink: 0,
        borderRight: `1px solid ${D.border}`,
        background: D.panel,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 16px 10px', borderBottom: `1px solid ${D.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: D.text3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>스토리보드</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {scripts === null && <div style={{ padding: '12px 16px', fontSize: 12, color: D.text3 }}>불러오는 중…</div>}
          {scripts?.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}>🎞</div>
              <div style={{ fontSize: 11, color: D.text3, lineHeight: 1.6 }}>가져온 작품이 없습니다.</div>
            </div>
          )}
          {scripts?.map(s => {
            const count  = getPanelCount(s.id);
            const active = selected?.id === s.id;
            return (
              <div key={s.id}
                onClick={() => handleSelect(s)}
                style={{
                  padding: '10px 16px', cursor: 'pointer',
                  borderLeft: active ? `2px solid ${D.accent}` : '2px solid transparent',
                  background: active ? D.active : 'transparent',
                  transition: 'background 0.12s',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? D.accent : D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize: 10, color: D.text3, marginTop: 2 }}>
                    {count > 0 ? `패널 ${count}개` : '미생성'}
                  </div>
                </div>
                {count > 0 && (
                  <div style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: D.accent, color: '#1a1a1a', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {count > 9 ? '9+' : count}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 우: 스토리보드 영역 */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto', background: D.bg }}>

        {/* 미선택 */}
        {!selected && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.25 }}>🎞</div>
              <div style={{ fontSize: 13, color: D.text3 }}>좌측에서 작품을 선택하세요</div>
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
          <div style={{ padding: 32 }}>

            {/* 상단 바 */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: D.text }}>{selected.title} — 스토리보드</div>
                <div style={{ fontSize: 11, color: D.text3, marginTop: 3 }}>
                  패널 {panels.length}개 · 예상 {totalSec}초
                </div>
              </div>
              {/* 뷰 토글 */}
              <div style={{ display: 'flex', background: D.panel, borderRadius: 6, padding: 2, gap: 2 }}>
                {[['card', '카드형'], ['row', '가로형']].map(([v, l]) => (
                  <button key={v} onClick={() => setCardView(v)}
                    style={{ padding: '3px 10px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: cardView === v ? D.accent : 'transparent',
                      color: cardView === v ? '#1a1a1a' : D.text3 }}>
                    {l}
                  </button>
                ))}
              </div>
              <button onClick={handlePrint}
                style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: D.accent, color: '#1a1a1a', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                출력 / PDF
              </button>
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

            {/* 카드형: 2열 그리드 / 가로형: 1열 */}
            <div style={cardView === 'card'
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
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
