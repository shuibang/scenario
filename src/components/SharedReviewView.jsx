/**
 * SharedReviewView — 공유 링크로 열었을 때 보이는 읽기전용 미리보기 + 피드백 패널
 *
 * URL hash: #review=SHORT_ID  (Supabase 저장, 새 방식)
 *           #review=BASE64    (구형 링크 폴백)
 *
 * 레이아웃:
 *   데스크톱: 좌(미리보기) + 우(피드백 280px) — 접기/펼치기 가능
 *   모바일:   상(미리보기) + 하(피드백 고정바) — 접기/펼치기 가능
 */
import React, { useState, useEffect, useCallback } from 'react';
import PreviewRenderer from '../print/PreviewRenderer';
import { exportPdf } from '../print/pdfViaServer';
import { loadReviewPayload, isShortReviewId } from '../utils/reviewShare';
import { reviewLegacySchema } from '../utils/urlSchemas';
import { supabase } from '../store/supabaseClient';
import { guardedSignInWithGoogle } from '../utils/guardedSignIn';
import { setAccessToken, saveDirectorScript } from '../store/googleDrive';

const RETURN_HASH_KEY = 'drama_pending_return_hash';
// 로그인 후 돌아올 hash 저장 (OAuth 리디렉트 시 hash가 날아가므로)
function loginWithReturnHash() {
  try { localStorage.setItem(RETURN_HASH_KEY, window.location.hash); } catch {}
  guardedSignInWithGoogle();
}

// source_url 검증 — javascript:/data: 스킴 주입 방지 (시나리오 4)
function getSafeSourceUrl() {
  try {
    const u = new URL(window.location.href);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return window.location.origin;
    // hash는 100자로 자름 (악의적 페이로드 삽입 방지)
    const hash = u.hash.slice(0, 100);
    return u.origin + u.pathname + hash;
  } catch {
    return window.location.origin;
  }
}

const zBtnStyle = {
  background: '#fff', border: '1px solid #ddd', borderRadius: 6,
  cursor: 'pointer', fontSize: 16, color: '#444',
  padding: '2px 10px', lineHeight: 1.4,
};

function decodeLegacy(hash) {
  try {
    const raw = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(hash.slice(8))))));
    return reviewLegacySchema.parse(raw);
  } catch {
    return null;
  }
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn, { passive: true });
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

const A4_W_PX = 794;

export default function SharedReviewView() {
  const [data, setData]         = useState(null);
  const [bad,  setBad]          = useState(false);
  const [expired, setExpired]   = useState(false);
  const [zoom, setZoom]         = useState(1.0);
  const [driveError, setDriveError] = useState(false); // Drive 권한 없음 상태
  const isMobile = useIsMobile();

  const zoomIn  = () => setZoom(z => Math.min(z + 0.1, 2.0));
  const zoomOut = () => setZoom(z => Math.max(z - 0.1, 0.3));
  const zoomReset = () => setZoom(1.0);

  const [importing,    setImporting]    = useState(false);
  const [importToast,  setImportToast]  = useState(''); // '' | '가져오는 중…' | '완료!'

  const handleImport = useCallback(async () => {
    if (!data) return;
    setImporting(true);
    setImportToast('가져오는 중…');
    setDriveError(false);
    try {
      // 1) 로그인 확인
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        loginWithReturnHash();
        return;
      }

      // 2) Drive 토큰 세팅 — expires_in 실제값 사용 (시나리오 5)
      if (session.provider_token) {
        setAccessToken(session.provider_token, session.expires_in ?? 3600);
      } else {
        setDriveError(true);
        setImportToast('');
        setImporting(false);
        return;
      }

      // 3) 대본 데이터 Drive에 저장
      const title = data.projects?.[0]?.title || '공유 대본';
      const driveFileId = await saveDirectorScript(title, data);

      // 4) shared_scripts 테이블에 메타 저장
      const { error } = await supabase.from('shared_scripts').insert({
        director_id:   session.user.id,
        title,
        drive_file_id: driveFileId,
        source_url:    getSafeSourceUrl(),
      });
      if (error) throw new Error(`저장 실패: ${error.message}`);

      // 5) 완료 → 연출 작업실로 이동
      setImportToast('완료! 연출 작업실로 이동합니다 ✓');
      setTimeout(() => { window.location.hash = '#director'; }, 1200);
    } catch (err) {
      setImportToast('');
      setImporting(false);
      alert(`오류: ${err.message}`);
    }
  }, [data]);

  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfStep,      setPdfStep]      = useState('');
  const handlePdfDownload = useCallback(async () => {
    if (!data) return;
    setPdfExporting(true);
    setPdfStep('');
    const appState = {
      projects:     data.projects     || [],
      episodes:     data.episodes     || [],
      characters:   data.characters   || [],
      scenes:       data.scenes       || [],
      scriptBlocks: data.scriptBlocks || [],
      coverDocs:    data.coverDocs    || [],
      synopsisDocs: data.synopsisDocs || [],
      activeProjectId: data.activeProjectId,
      stylePreset:  data.stylePreset  || {},
      initialized:  true,
    };
    const selections = data.selections || { cover: true, synopsis: true, episodes: {}, chars: true };
    try {
      await exportPdf(appState, selections, { onStep: setPdfStep });
    } catch (err) {
      alert(`PDF 다운로드 실패: ${err.message}`);
    } finally {
      setPdfExporting(false);
      setPdfStep('');
    }
  }, [data]);

  useEffect(() => {
    const val = window.location.hash.slice(8); // '#review=' 제거
    if (isShortReviewId(val)) {
      loadReviewPayload(val)
        .then(setData)
        .catch((err) => {
          if (err?.message === 'EXPIRED') setExpired(true);
          else setBad(true);
        });
    } else {
      const result = decodeLegacy(window.location.hash);
      if (result) setData(result);
      else setBad(true);
    }
  }, []);

  if (expired) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888', fontSize: 14 }}>
      링크가 만료되었습니다. 작가에게 새 링크를 요청해주세요.
    </div>
  );
  if (bad) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888', fontSize: 14 }}>
      링크가 올바르지 않습니다.
    </div>
  );
  if (!data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#aaa', fontSize: 13 }}>
      불러오는 중…
    </div>
  );

  const appState = {
    projects:     data.projects     || [],
    episodes:     data.episodes     || [],
    characters:   data.characters   || [],
    scenes:       data.scenes       || [],
    scriptBlocks: data.scriptBlocks || [],
    coverDocs:    data.coverDocs    || [],
    synopsisDocs: data.synopsisDocs || [],
    activeProjectId: data.activeProjectId,
    stylePreset:  data.stylePreset  || {},
    initialized: true,
  };
  const selections = data.selections || { cover: true, synopsis: true, episodes: {}, chars: true };
  const projectTitle = data.projects?.[0]?.title || '대본';

  // ── 상단 공통 바 (제목 + 가져오기 버튼) ──────────────────────────────────
  const topBar = (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 4, gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: '#555', fontWeight: 600 }}>
          {projectTitle} — 검토 요청
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {importToast && (
            <span style={{ fontSize: 12, color: '#27ae60', fontWeight: 500 }}>{importToast}</span>
          )}
          <button
            onClick={handleImport}
            disabled={importing}
            style={{
              padding: '5px 12px', borderRadius: 6, border: 'none',
              background: importing ? '#999' : '#e8b84b',
              color: '#1a1a1a', fontSize: 12, fontWeight: 700,
              cursor: importing ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            🎬 연출 작업실로 가져오기
          </button>
        </div>
      </div>
      {/* Drive 권한 없음 안내 */}
      {driveError && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8,
          padding: '10px 14px', flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 12, color: '#856404', lineHeight: 1.5 }}>
            🔌 Google Drive 연결이 끊겼습니다.<br />
            다시 로그인하면 연출 작업실로 가져올 수 있어요.
          </div>
          <button
            onClick={loginWithReturnHash}
            style={{
              padding: '6px 14px', borderRadius: 6, border: 'none',
              background: '#e8b84b', color: '#1a1a1a', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >Google로 다시 로그인</button>
        </div>
      )}
    </div>
  );

  // ── 줌 컨트롤 바 ──────────────────────────────────────────────────────────
  const zoomBar = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 0', userSelect: 'none', flexWrap: 'wrap' }}>
      <button onClick={zoomOut} style={zBtnStyle}>−</button>
      <button onClick={zoomReset} style={{ ...zBtnStyle, minWidth: 48, fontSize: 11 }}>{Math.round(zoom * 100)}%</button>
      <button onClick={zoomIn}  style={zBtnStyle}>+</button>
      <button
        onClick={handlePdfDownload}
        disabled={pdfExporting}
        style={{
          ...zBtnStyle,
          background: '#5a5af5', color: '#fff', border: 'none',
          padding: '3px 12px', fontSize: 12, fontWeight: 600,
          opacity: pdfExporting ? 0.6 : 1,
          cursor: pdfExporting ? 'default' : 'pointer',
        }}
      >
        {pdfExporting ? `${pdfStep || 'PDF'} 중…` : 'PDF 다운로드'}
      </button>
    </div>
  );

  // ── 공통 레이아웃 (모바일/데스크톱 동일) ─────────────────────────────────
  // zoom: PreviewRenderer의 zoom prop으로 직접 전달 (ResizeObserver scale에 곱해짐)
  const previewWrapper = (
    <PreviewRenderer appState={appState} selections={selections} zoom={zoom} />
  );

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#d8d8d8', fontFamily: 'sans-serif' }}>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: isMobile ? '8px' : '16px' }}>
        {topBar}
        {zoomBar}
        {previewWrapper}
      </div>
    </div>
  );
}
