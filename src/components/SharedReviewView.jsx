import React, { useCallback, useEffect, useRef, useState } from 'react';
import PreviewRenderer from '../print/PreviewRenderer';
import { exportPdf } from '../print/printPdf';
import { reviewLegacySchema } from '../utils/urlSchemas';
import { loadSharedReviewResource, isShortReviewId, submitHandwritingSession, createFeedbackReplyLink } from '../utils/reviewShare';
import { supabase } from '../store/supabaseClient';
import { guardedSignInWithGoogle } from '../utils/guardedSignIn';
import { setAccessToken, saveDirectorScript } from '../store/googleDrive';
import { buildFeedbackViewerState } from '../utils/feedbackVersions';
import { reportError } from '../utils/errorTracker';
import { KakaoAdBannerBase as KakaoAdBanner } from './AdBanner';
import WatermarkOverlay from './WatermarkOverlay';
import BadgeChip from './BadgeChip';
import DirectorScriptViewer from './director/DirectorScriptViewer';
import HandwritingCanvas from './director/HandwritingCanvas';

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
  const [handwritingMode,  setHandwritingMode]  = useState(false);
  const [activeTool,       setActiveTool]       = useState('pen');
  const [handwritingSent,  setHandwritingSent]  = useState(false);
  const [memoText,         setMemoText]         = useState('');
  const scrollContainerRef = useRef(null);
  const hwCanvasRef        = useRef(null);

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
        watermark_text: (watermarkText || '').trim()
          || session?.user?.user_metadata?.full_name
          || session?.user?.user_metadata?.name
          || session?.user?.email?.split('@')[0]
          || '연출',
        sender_badge_emoji: resource?.link?.sender_badge_emoji || null,
        sender_badge_label: resource?.link?.sender_badge_label || null,
      });
      if (error) throw new Error(error.message);

      setImportToast('완료! 연출 작업실로 이동합니다.');
      setTimeout(() => {
        window.location.hash = '#director';
      }, 1200);
    } catch (error) {
      reportError({ source: 'manual', message: error?.message || String(error), stack: error?.stack });
      setImportToast('');
      setImporting(false);
      alert('연출 작업실로 가져오는 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.');
    }
  }, [resource, snapshotContent]);

  const watermarkText = resource?.link?.watermark_text || null;

  const handlePdfDownload = useCallback(async () => {
    if (!snapshotContent) return;
    setPdfExporting(true);
    setPdfStep('');
    const { appState, selections } = buildFeedbackViewerState(snapshotContent);
    try {
      await exportPdf(appState, selections, { onStep: setPdfStep, watermarkText });
    } catch (error) {
      reportError({ source: 'manual', message: error?.message || String(error), stack: error?.stack });
      alert('PDF 다운로드에 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setPdfExporting(false);
      setPdfStep('');
    }
  }, [snapshotContent, watermarkText]);

  const handleHandwritingReply = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { loginWithReturnHash(); return; }

    const saveResult = hwCanvasRef.current?.save?.() || null;
    const dataUrl = saveResult?.dataUrl || saveResult || null;
    const canvasSize = saveResult?.width
      ? { width: saveResult.width, height: saveResult.height }
      : null;
    const senderDisplayName =
      session.user?.user_metadata?.full_name ||
      session.user?.user_metadata?.name ||
      session.user?.email?.split('@')[0] ||
      '연출';

    try {
      const submitResult = await submitHandwritingSession(
        resource?.link?.id,
        senderDisplayName,
        dataUrl,
        memoText.trim() || null,
        canvasSize
      );
      await createFeedbackReplyLink({
        versionId: submitResult?.version_id || resource?.version?.id,
        sessionId: submitResult?.session_id,
      });
      setHandwritingSent(true);
    } catch (err) {
      alert('회신 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.');
    }
  }, [resource, memoText]);

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
        position: 'relative',
      }}
    >
      <WatermarkOverlay text={watermarkText} />
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: isMobile ? 8 : 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 4, gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555', fontWeight: 600 }}>
              {resource?.link?.sender_badge_emoji && (
                <BadgeChip
                  badge={{
                    emoji: resource.link.sender_badge_emoji,
                    label: resource.link.sender_badge_label || '',
                    publicLabel: resource.link.sender_badge_label || '',
                  }}
                  size={18}
                  tooltip="public"
                />
              )}
              <span>{title} 검토 요청</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {importToast && (
                <span style={{ fontSize: 12, color: '#27ae60', fontWeight: 500 }}>{importToast}</span>
              )}
              <button
                onClick={() => setHandwritingMode(prev => !prev)}
                style={{
                  padding: '6px 12px', fontSize: 13, borderRadius: 8, border: 'none',
                  cursor: 'pointer', whiteSpace: 'nowrap', minWidth: 'fit-content',
                  background: handwritingMode ? '#E8F0FE' : '#F0EDE8',
                  color: handwritingMode ? '#1a73e8' : '#666',
                }}
              >
                ✏️ {handwritingMode ? '필기 모드' : '필기로 회신'}
              </button>
              {handwritingMode && (
                <button
                  onClick={handleHandwritingReply}
                  disabled={handwritingSent}
                  style={{
                    padding: '6px 12px', fontSize: 13, borderRadius: 8,
                    border: 'none', cursor: handwritingSent ? 'default' : 'pointer',
                    whiteSpace: 'nowrap',
                    background: '#E6F4EA',
                    color: '#137333', fontWeight: 600,
                  }}
                >
                  {handwritingSent ? '회신 완료 ✓' : '회신하기'}
                </button>
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

        {!handwritingMode && (
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
                background: '#8DA0BB',
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
        )}

        {/* 100% 기준 폭: 모바일이면 화면 가로, 그 외엔 태블릿(768)로 제한 */}
        {handwritingMode && (
          <div style={{ maxWidth: isMobile ? '100%' : 768, margin: '0 auto 8px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 8px',
              background: '#F0EDE8',
              borderRadius: 8,
            }}>
              {[['pen', '펜'], ['highlighter', '형광펜'], ['eraser', '지우개']].map(([t, l]) => (
                <button key={t} onClick={() => setActiveTool(t)}
                  style={{
                    fontSize: 12, padding: '3px 8px', borderRadius: 6,
                    border: 'none', cursor: 'pointer',
                    background: activeTool === t ? '#E8F0FE' : 'transparent',
                    color: activeTool === t ? '#1a73e8' : '#666',
                    fontWeight: activeTool === t ? 600 : 400,
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
        {isMobile && handwritingMode && (
          <div style={{ maxWidth: '100%', margin: '0 auto 8px', padding: '0 8px' }}>
            <textarea
              value={memoText}
              onChange={(e) => setMemoText(e.target.value)}
              placeholder="텍스트 메모 (선택)"
              style={{
                width: '100%', minHeight: 80, padding: '8px',
                fontSize: 13, borderRadius: 8, resize: 'vertical',
                border: '1px solid #D0CCC4', fontFamily: 'inherit',
                boxSizing: 'border-box', background: '#FAFAF8',
              }}
            />
          </div>
        )}
        {handwritingMode ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', maxWidth: 780, margin: '0 auto', width: '100%' }}>
            <div
              ref={scrollContainerRef}
              style={{ position: 'relative', width: isMobile ? '100%' : 568, flexShrink: 0 }}
            >
              <DirectorScriptViewer
                appState={appState}
                selections={selections}
                readOnly={true}
                watermarkText={resource?.link?.watermark_text || null}
              />
              <HandwritingCanvas
                ref={hwCanvasRef}
                scriptLinkId={resource?.link?.id || 'review'}
                isActive={true}
                containerRef={scrollContainerRef}
                activeTool={activeTool}
              />
            </div>
            {!isMobile && (
              <div style={{ width: 200, flexShrink: 0, position: 'sticky', top: 8, alignSelf: 'flex-start' }}>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>텍스트 메모</div>
                <textarea
                  value={memoText}
                  onChange={(e) => setMemoText(e.target.value)}
                  placeholder="메모를 입력하세요"
                  style={{
                    width: '100%', minHeight: 200, padding: '8px',
                    fontSize: 13, borderRadius: 8, resize: 'vertical',
                    border: '1px solid #D0CCC4', fontFamily: 'inherit',
                    boxSizing: 'border-box', background: '#FAFAF8',
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div style={{ width: '100%', maxWidth: isMobile ? '100%' : 768, margin: '0 auto' }}>
            <PreviewRenderer appState={appState} selections={selections} zoom={zoom} />
          </div>
        )}
      </div>

      {/* 카카오 애드핏 — 검토링크 페이지 하단 고정 (PC 728×90 / 모바일 320×100) */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: isMobile ? '6px 0' : '8px 0',
          background: '#ececec',
          borderTop: '1px solid #c4c4c4',
        }}
      >
        {isMobile ? (
          <KakaoAdBanner
            unitId="DAN-DCImro84Aqn4N89r"
            width={320}
            height={100}
          />
        ) : (
          <KakaoAdBanner
            unitId="DAN-HDnkAFXFiZO9rZUw"
            width={728}
            height={90}
          />
        )}
      </div>
    </div>
  );
}
