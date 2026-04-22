import React, { useCallback, useEffect, useState } from 'react';
import PreviewRenderer from '../print/PreviewRenderer';
import { exportPdf } from '../print/pdfViaServer';
import { reviewLegacySchema } from '../utils/urlSchemas';
import { loadSharedReviewResource, isShortReviewId } from '../utils/reviewShare';
import { supabase } from '../store/supabaseClient';
import { guardedSignInWithGoogle } from '../utils/guardedSignIn';
import { setAccessToken, saveDirectorScript } from '../store/googleDrive';
import { buildFeedbackViewerState } from '../utils/feedbackVersions';

const RETURN_HASH_KEY = 'drama_pending_return_hash';

function loginWithReturnHash() {
  try {
    localStorage.setItem(RETURN_HASH_KEY, window.location.hash);
  } catch {}
  guardedSignInWithGoogle();
}

function getSafeSourceUrl() {
  try {
    const url = new URL(window.location.href);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return window.location.origin;
    const hash = url.hash.slice(0, 100);
    return url.origin + url.pathname + hash;
  } catch {
    return window.location.origin;
  }
}

const zoomButtonStyle = {
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 16,
  color: '#444',
  padding: '2px 10px',
  lineHeight: 1.4,
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
    const handleResize = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return mobile;
}

export default function SharedReviewView() {
  const [resource, setResource] = useState(null);
  const [bad, setBad] = useState(false);
  const [expired, setExpired] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [driveError, setDriveError] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importToast, setImportToast] = useState('');
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfStep, setPdfStep] = useState('');
  const isMobile = useIsMobile();

  // 100% 기준: 모바일이면 화면 가로 꽉 참, 그 외엔 태블릿(768px) 꽉 참
  // 줌 범위도 그에 맞춰 다르게 — 모바일은 50%~150%, 데스크톱/태블릿은 100%~200%
  const zoomMin = isMobile ? 0.5 : 1.0;
  const zoomMax = isMobile ? 1.5 : 2.0;
  const zoomIn = () => setZoom((value) => Math.min(Math.round((value + 0.1) * 10) / 10, zoomMax));
  const zoomOut = () => setZoom((value) => Math.max(Math.round((value - 0.1) * 10) / 10, zoomMin));
  const zoomReset = () => setZoom(1.0);

  // 줌 한계 바깥(창 크기 변경으로 mobile/desktop 전환 시)이면 가장 가까운 값으로 스냅
  useEffect(() => {
    if (zoom < zoomMin) setZoom(zoomMin);
    else if (zoom > zoomMax) setZoom(zoomMax);
  }, [zoomMin, zoomMax, zoom]);

  useEffect(() => {
    const value = window.location.hash.slice(8);
    if (isShortReviewId(value)) {
      loadSharedReviewResource(value)
        .then(setResource)
        .catch((error) => {
          if (error?.message === 'EXPIRED') setExpired(true);
          else setBad(true);
        });
      return;
    }

    const legacy = decodeLegacy(window.location.hash);
    if (legacy) {
      setResource({
        kind: 'legacy_review',
        link: null,
        version: null,
        session: null,
        comments: [],
        snapshotContent: legacy,
      });
      return;
    }

    setBad(true);
  }, []);

  const snapshotContent = resource?.snapshotContent || null;

  const handleImport = useCallback(async () => {
    if (!snapshotContent) return;
    setImporting(true);
    setImportToast('가져오는 중...');
    setDriveError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        loginWithReturnHash();
        return;
      }

      if (session.provider_token) {
        setAccessToken(session.provider_token, session.expires_in ?? 3600);
      } else {
        setDriveError(true);
        setImportToast('');
        setImporting(false);
        return;
      }

      const title = snapshotContent.projects?.[0]?.title || '공유 대본';
      const payload =
        resource?.kind === 'feedback_version'
          ? {
              ...snapshotContent,
              _feedbackContext: {
                shareType: 'feedback_version',
                requestLinkId: resource.link?.id || '',
                versionId: resource.version?.id || '',
                scriptId: resource.version?.script_id || snapshotContent.activeProjectId || '',
                versionName: resource.version?.version_name || '',
              },
            }
          : snapshotContent;
      const driveFileId = await saveDirectorScript(title, payload);

      const { error } = await supabase.from('shared_scripts').insert({
        director_id: session.user.id,
        title,
        drive_file_id: driveFileId,
        source_url: getSafeSourceUrl(),
      });
      if (error) throw new Error(error.message);

      setImportToast('완료! 연출 작업실로 이동합니다.');
      setTimeout(() => {
        window.location.hash = '#director';
      }, 1200);
    } catch (error) {
      setImportToast('');
      setImporting(false);
      alert(`오류: ${error.message}`);
    }
  }, [resource, snapshotContent]);

  const handlePdfDownload = useCallback(async () => {
    if (!snapshotContent) return;
    setPdfExporting(true);
    setPdfStep('');
    const { appState, selections } = buildFeedbackViewerState(snapshotContent);
    try {
      await exportPdf(appState, selections, { onStep: setPdfStep });
    } catch (error) {
      alert(`PDF 다운로드 실패: ${error.message}`);
    } finally {
      setPdfExporting(false);
      setPdfStep('');
    }
  }, [snapshotContent]);

  if (expired) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888', fontSize: 14 }}>
        링크가 만료되었습니다. 작성자에게 새 링크를 요청해 주세요.
      </div>
    );
  }

  if (bad) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888', fontSize: 14 }}>
        링크가 올바르지 않습니다.
      </div>
    );
  }

  if (!snapshotContent) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#aaa', fontSize: 13 }}>
        불러오는 중...
      </div>
    );
  }

  const { appState, selections, title } = buildFeedbackViewerState(snapshotContent);

  return (
    <div
      style={{
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: '#d8d8d8',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: isMobile ? 8 : 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 4, gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13, color: '#555', fontWeight: 600 }}>
              {title} 검토 요청
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {importToast && (
                <span style={{ fontSize: 12, color: '#27ae60', fontWeight: 500 }}>{importToast}</span>
              )}
              <button
                onClick={handleImport}
                disabled={importing}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: importing ? '#999' : '#e8b84b',
                  color: '#1a1a1a',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: importing ? 'default' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                연출 작업실로 가져오기
              </button>
            </div>
          </div>

          {driveError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                background: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: 8,
                padding: '10px 14px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: 12, color: '#856404', lineHeight: 1.5 }}>
                Google Drive 연결이 끊겼습니다.
                <br />
                다시 로그인하면 연출 작업실로 가져올 수 있습니다.
              </div>
              <button
                onClick={loginWithReturnHash}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#e8b84b',
                  color: '#1a1a1a',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Google로 다시 로그인
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 0', userSelect: 'none', flexWrap: 'wrap' }}>
          <button onClick={zoomOut} style={zoomButtonStyle}>-</button>
          <button onClick={zoomReset} style={{ ...zoomButtonStyle, minWidth: 48, fontSize: 11 }}>
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={zoomIn} style={zoomButtonStyle}>+</button>
          <button
            onClick={handlePdfDownload}
            disabled={pdfExporting}
            style={{
              ...zoomButtonStyle,
              background: '#5a5af5',
              color: '#fff',
              border: 'none',
              padding: '3px 12px',
              fontSize: 12,
              fontWeight: 600,
              opacity: pdfExporting ? 0.6 : 1,
              cursor: pdfExporting ? 'default' : 'pointer',
            }}
          >
            {pdfExporting ? `${pdfStep || 'PDF'} 중...` : 'PDF 다운로드'}
          </button>
        </div>

        {/* 100% 기준 폭: 모바일이면 화면 가로, 그 외엔 태블릿(768)로 제한 */}
        <div style={{ width: '100%', maxWidth: isMobile ? '100%' : 768, margin: '0 auto' }}>
          <PreviewRenderer appState={appState} selections={selections} zoom={zoom} />
        </div>
      </div>
    </div>
  );
}
