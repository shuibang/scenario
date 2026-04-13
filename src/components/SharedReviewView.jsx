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
import { supabase, signInWithGoogle } from '../store/supabaseClient';
import { setAccessToken, saveDirectorScript } from '../store/googleDrive';

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
  const [feedback, setFeedback] = useState('');
  const [copied,   setCopied]   = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [zoom, setZoom]         = useState(1.0);
  const isMobile = useIsMobile();

  const zoomIn  = () => setZoom(z => Math.min(z + 0.1, 2.0));
  const zoomOut = () => setZoom(z => Math.max(z - 0.1, 0.3));
  const zoomReset = () => setZoom(1.0);

  const [importing,    setImporting]    = useState(false);
  const [importToast,  setImportToast]  = useState(''); // '' | '가져오는 중…' | '완료!' | 오류메시지

  const handleImport = useCallback(async () => {
    if (!data) return;
    setImporting(true);
    setImportToast('가져오는 중…');
    try {
      // 1) 로그인 확인
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // 미로그인 → Google 로그인 리디렉트 (현재 hash 유지)
        await signInWithGoogle();
        return;
      }

      // 2) Drive 토큰 세팅
      if (session.provider_token) {
        setAccessToken(session.provider_token, 3600);
      } else {
        throw new Error('Drive 권한이 없습니다. 다시 로그인해주세요.');
      }

      // 3) 대본 데이터 Drive에 저장
      const title = data.projects?.[0]?.title || '공유 대본';
      const driveFileId = await saveDirectorScript(title, data);

      // 4) shared_scripts 테이블에 메타 저장
      const { error } = await supabase.from('shared_scripts').insert({
        director_id:   session.user.id,
        title,
        drive_file_id: driveFileId,
        source_url:    window.location.href,
      });
      if (error) throw new Error(`저장 실패: ${error.message}`);

      // 5) 완료 → 연출 작업실로 이동
      setImportToast('완료! 연출 작업실로 이동합니다 ✓');
      setTimeout(() => { window.location.hash = '#director'; }, 1200);
    } catch (err) {
      setImportToast(`오류: ${err.message}`);
      setTimeout(() => { setImportToast(''); setImporting(false); }, 3000);
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
        .catch(() => setBad(true));
    } else {
      const result = decodeLegacy(window.location.hash);
      if (result) setData(result);
      else setBad(true);
    }
  }, []);

  if (bad) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888', fontSize: 14 }}>
      링크가 올바르지 않거나 만료되었습니다.
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

  const handleCopy = async () => {
    const text = `[${projectTitle} 피드백]\n\n${feedback}`.trim();
    try { await navigator.clipboard.writeText(text); }
    catch {
      const el = document.createElement('textarea');
      el.value = text; document.body.appendChild(el);
      el.select(); document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── 상단 공통 바 (제목 + 가져오기 버튼) ──────────────────────────────────
  const topBar = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
      <div style={{ fontSize: 13, color: '#555', fontWeight: 600 }}>
        {projectTitle} — 검토 요청
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {importToast && (
          <span style={{
            fontSize: 12, color: importToast.startsWith('오류') ? '#c0392b' : importToast.startsWith('완료') ? '#27ae60' : '#555',
            fontWeight: 500,
          }}>
            {importToast}
          </span>
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

  // ── 공통 피드백 패널 내용 ─────────────────────────────────────────────────
  const PANEL_H = 260; // 모바일 열렸을 때 높이
  const feedbackContent = (
    <>
      <textarea
        value={feedback}
        onChange={e => setFeedback(e.target.value)}
        placeholder={`${projectTitle}에 대한 피드백을 자유롭게 작성하세요.`}
        style={{
          flex: 1,
          resize: 'none',
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
          padding: '10px',
          fontSize: '12px',
          lineHeight: 1.7,
          color: '#333',
          outline: 'none',
          fontFamily: 'inherit',
          minHeight: isMobile ? 120 : undefined,
        }}
        onFocus={e => { e.target.style.borderColor = '#5a5af5'; }}
        onBlur={e => { e.target.style.borderColor = '#e0e0e0'; }}
      />
      <button
        onClick={handleCopy}
        disabled={!feedback.trim()}
        style={{
          marginTop: '10px',
          padding: '10px',
          background: feedback.trim() ? '#5a5af5' : '#ccc',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: feedback.trim() ? 'pointer' : 'default',
          fontSize: '13px',
          fontWeight: 600,
          transition: 'background 0.15s',
        }}
      >
        {copied ? '복사됨 ✓' : '피드백 복사'}
      </button>
      <div style={{ marginTop: '8px', fontSize: '10px', color: '#bbb', lineHeight: 1.5, textAlign: 'center' }}>
        복사한 피드백을 메시지·이메일로 작가에게 전달하세요.
      </div>
    </>
  );

  // ── 패널 헤더 (접기/펼치기 포함) ─────────────────────────────────────────
  const panelHeader = (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: panelOpen ? (isMobile ? 10 : 16) : 0 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#222' }}>피드백</div>
        {panelOpen && !isMobile && (
          <div style={{ fontSize: '11px', color: '#999', marginTop: 2 }}>작성 후 복사해서 전달하세요.</div>
        )}
      </div>
      <button
        onClick={() => setPanelOpen(v => !v)}
        style={{
          background: 'none', border: '1px solid #e0e0e0', borderRadius: 6,
          cursor: 'pointer', fontSize: 12, color: '#888',
          padding: '3px 10px', lineHeight: 1.4, flexShrink: 0,
        }}
      >
        {panelOpen ? '접기 ▾' : '펼치기 ▴'}
      </button>
    </div>
  );

  // ── 모바일 레이아웃 ───────────────────────────────────────────────────────
  if (isMobile) {
    const mobileColW = Math.round((window.innerWidth - 32) * zoom);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#d8d8d8', fontFamily: 'sans-serif' }}>
        {/* 미리보기 영역 */}
        <div style={{
          flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '8px',
          paddingBottom: panelOpen ? PANEL_H + 52 : 52,
          transition: 'padding-bottom 0.25s ease',
        }}>
          {topBar}
          {zoomBar}
          <PreviewRenderer appState={appState} selections={selections} columnWidth={mobileColW} />
        </div>

        {/* 하단 피드백 패널 (fixed) */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#fff',
          borderTop: '1px solid #ddd',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.10)',
          transition: 'height 0.25s ease',
          height: panelOpen ? PANEL_H + 52 : 52,
          overflow: 'hidden',
          zIndex: 100,
          display: 'flex', flexDirection: 'column',
          padding: '12px 16px',
        }}>
          {panelHeader}
          {panelOpen && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {feedbackContent}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 데스크톱 레이아웃 ─────────────────────────────────────────────────────
  const desktopPanelW = panelOpen ? 280 : 48;
  // 피드백 패널 너비와 패딩 제외한 가용 폭 기반으로 기본 columnWidth 계산
  const baseColW = Math.max(200, window.innerWidth - desktopPanelW - 80);
  const desktopColW = Math.round(baseColW * zoom);

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#d8d8d8', fontFamily: 'sans-serif' }}>

      {/* 미리보기 */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '16px' }}>
        {topBar}
        {zoomBar}
        <PreviewRenderer appState={appState} selections={selections} columnWidth={desktopColW} />
      </div>

      {/* 피드백 패널 */}
      <div style={{
        width: panelOpen ? '280px' : '48px', flexShrink: 0,
        background: '#fff', borderLeft: '1px solid #ddd',
        display: 'flex', flexDirection: 'column',
        padding: panelOpen ? '20px 16px' : '20px 8px',
        transition: 'width 0.25s ease, padding 0.25s ease',
        overflow: 'hidden',
      }}>
        {panelOpen ? (
          <>
            {panelHeader}
            {feedbackContent}
          </>
        ) : (
          /* 접혔을 때: 세로 버튼만 */
          <button
            onClick={() => setPanelOpen(true)}
            style={{
              background: 'none', border: '1px solid #e0e0e0', borderRadius: 6,
              cursor: 'pointer', fontSize: 11, color: '#888',
              padding: '6px 4px', writingMode: 'vertical-rl', lineHeight: 1.4,
            }}
          >
            피드백 펼치기 ▸
          </button>
        )}
      </div>
    </div>
  );
}
