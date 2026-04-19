import React, { useState } from 'react';
import { supabase } from '../store/supabaseClient';

const REPORT_TYPES = [
  { id: 'bug',     label: '🐞 버그' },
  { id: 'ui',      label: '🎨 화면 오류' },
  { id: 'feature', label: '💡 기능 제안' },
  { id: 'other',   label: '📝 기타' },
];

export default function FeedbackButtons() {
  const [captureStep, setCaptureStep] = useState(null);
  const [screenshotData, setScreenshotData] = useState(null);
  const [reportType, setReportType] = useState('bug');
  const [reportDesc, setReportDesc] = useState('');
  const [reportEmail, setReportEmail] = useState('');
  const [reportStatus, setReportStatus] = useState('idle');

  const btnBase = { fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--c-border3)', background: 'transparent', cursor: 'pointer' };
  const inputBase = { width: '100%', background: 'var(--c-input)', border: '1px solid var(--c-border3)', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: 'var(--c-text)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

  const handleCapture = async () => {
    setCaptureStep(null);
    await new Promise(r => setTimeout(r, 80));
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(document.documentElement, {
        useCORS: true, allowTaint: true, scale: 0.7, logging: false,
      });
      setScreenshotData(canvas.toDataURL('image/jpeg', 0.75));
    } catch {
      setScreenshotData(null);
    }
    setCaptureStep('form');
  };

  const handleSubmitReport = async () => {
    if (!reportDesc.trim()) return;
    const lastAt = localStorage.getItem('error_report_last_at');
    if (lastAt && Date.now() - Number(lastAt) < 60 * 1000) return;
    setReportStatus('sending');
    let screenshotUrl = null;
    if (screenshotData && supabase) {
      try {
        const res = await fetch(screenshotData);
        const blob = await res.blob();
        const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const { data: up } = await supabase.storage
          .from('error-screenshots')
          .upload(filename, blob, { contentType: 'image/jpeg', upsert: false });
        if (up) {
          const { data: { publicUrl } } = supabase.storage.from('error-screenshots').getPublicUrl(up.path);
          screenshotUrl = publicUrl;
        }
      } catch {}
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id ?? null;
    const descFull = screenshotUrl
      ? `${reportDesc.trim()}\n\n📸 스크린샷: ${screenshotUrl}`
      : reportDesc.trim();
    const { error } = await supabase.from('error_reports').insert({
      type: reportType, description: descFull, user_id: userId,
      email: reportEmail.trim() || null,
    });
    if (!error) localStorage.setItem('error_report_last_at', String(Date.now()));
    setReportStatus(error ? 'error' : 'done');
  };

  const closeModal = () => {
    setCaptureStep(null); setScreenshotData(null);
    setReportDesc(''); setReportType('bug'); setReportEmail(''); setReportStatus('idle');
  };

  return (
    <>
      <div style={{ borderTop: '1px solid var(--c-border)', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => { window.location.href = '/#survey'; }}
          style={{ ...btnBase, width: '100%', padding: '7px 0', fontSize: 11, color: 'var(--c-accent)', borderColor: 'var(--c-accent)' }}
        >📋 사용경험 설문 참여하기</button>
        <button
          onClick={() => setCaptureStep('confirm')}
          style={{ ...btnBase, width: '100%', padding: '7px 0', fontSize: 11, color: '#e05555', borderColor: '#e05555' }}
        >🐞 오류보고하기</button>
      </div>

      {captureStep === 'confirm' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--c-panel)', borderRadius: 12, padding: '28px 28px 24px', maxWidth: 340, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📸</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', marginBottom: 8 }}>현재 화면을 캡처합니다</div>
            <div style={{ fontSize: 12, color: 'var(--c-text5)', marginBottom: 22, lineHeight: 1.6 }}>
              캡처된 화면은 오류 보고서에 첨부되어<br />개발팀에 전달됩니다.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setCaptureStep(null)} style={{ ...btnBase, flex: 1, padding: '10px 0', fontSize: 13, color: 'var(--c-text4)' }}>취소</button>
              <button onClick={handleCapture} style={{ flex: 1, padding: '10px 0', borderRadius: 6, fontSize: 13, fontWeight: 700, border: 'none', background: 'var(--c-accent)', color: '#fff', cursor: 'pointer' }}>캡처하기</button>
            </div>
          </div>
        </div>
      )}

      {captureStep === 'form' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--c-panel)', borderRadius: 12, padding: 24, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            {reportStatus === 'done' ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', marginBottom: 8 }}>제출 완료!</div>
                <div style={{ fontSize: 12, color: 'var(--c-text5)', marginBottom: 20 }}>소중한 피드백 감사합니다. 빠르게 검토하겠습니다.</div>
                <button onClick={closeModal} style={{ ...btnBase, padding: '8px 24px', fontSize: 13, color: 'var(--c-text4)' }}>닫기</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>🐞 오류 보고</div>
                  <button onClick={closeModal} style={{ fontSize: 20, background: 'transparent', border: 'none', color: 'var(--c-text5)', cursor: 'pointer', lineHeight: 1 }}>×</button>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text5)', marginBottom: 6 }}>첨부 스크린샷</div>
                  {screenshotData
                    ? <img src={screenshotData} alt="screenshot" style={{ width: '100%', borderRadius: 6, border: '1px solid var(--c-border3)', maxHeight: 180, objectFit: 'cover', objectPosition: 'top' }} />
                    : <div style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--c-input)', fontSize: 11, color: 'var(--c-text5)' }}>스크린샷 캡처에 실패했습니다. 텍스트로 설명해 주세요.</div>
                  }
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text5)', marginBottom: 6 }}>유형</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {REPORT_TYPES.map(t => (
                      <button key={t.id} onClick={() => setReportType(t.id)} style={{
                        padding: '7px 10px', borderRadius: 6, fontSize: 12, textAlign: 'left', cursor: 'pointer',
                        border: `1px solid ${reportType === t.id ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                        background: reportType === t.id ? 'var(--c-active)' : 'var(--c-input)',
                        color: reportType === t.id ? 'var(--c-accent)' : 'var(--c-text3)',
                      }}>{t.label}</button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text5)', marginBottom: 6 }}>내용 *</div>
                  <textarea value={reportDesc} onChange={e => setReportDesc(e.target.value)} placeholder="어떤 문제가 있었는지 알려주세요." rows={4} style={{ ...inputBase, resize: 'vertical' }} />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text5)', marginBottom: 6 }}>답변 이메일 (선택)</div>
                  <input type="email" value={reportEmail} onChange={e => setReportEmail(e.target.value)} placeholder="example@email.com" style={inputBase} />
                </div>
                {reportStatus === 'error' && (
                  <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 6, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: 12 }}>
                    전송 실패. 잠시 후 다시 시도해주세요.
                  </div>
                )}
                <button
                  onClick={handleSubmitReport}
                  disabled={!reportDesc.trim() || reportStatus === 'sending'}
                  style={{
                    width: '100%', padding: '12px 0', borderRadius: 8, fontSize: 14, fontWeight: 700, border: 'none', cursor: reportDesc.trim() ? 'pointer' : 'not-allowed',
                    background: reportDesc.trim() ? 'var(--c-accent)' : 'var(--c-border3)',
                    color: reportDesc.trim() ? '#fff' : 'var(--c-text6)',
                  }}
                >{reportStatus === 'sending' ? '전송 중…' : '제출하기'}</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
