import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import AdBanner from './AdBanner';
import { exportPdf }              from '../print/printPdf';
import { exportDocx }             from '../print/printDocx';
import { exportHancom, exportHwpx } from '../print/hancomExporter';
import PreviewRenderer  from '../print/PreviewRenderer';
import { buildReviewURL } from '../App';
import {
  checkFontsAvailability,
  getFontWarnings,
  getEffectivePdfFontName,
  getFontByCssFamily,
  FONT_STATUS,
  getFontPdfStatus,
  getFontById,
} from '../print/FontRegistry';


// ─── PrintPreviewModal ────────────────────────────────────────────────────────
export default function PrintPreviewModal({ onClose }) {
  const { state } = useApp();
  const {
    episodes, activeProjectId, stylePreset,
  } = state;

  const allEpisodes = useMemo(
    () => episodes.filter(e => e.projectId === activeProjectId).sort((a, b) => a.number - b.number),
    [episodes, activeProjectId]
  );

  // ─── Selection state
  const [sel, setSel] = useState(() => {
    const episodesMap = {};
    allEpisodes.forEach(ep => { episodesMap[ep.id] = true; });
    return { cover: true, synopsis: true, episodes: episodesMap, chars: true, biography: false, treatment: false, scenelist: false };
  });

  const [format, setFormat]       = useState('pdf');
  const [exporting, setExporting] = useState(false);
  const [shareMsg, setShareMsg]   = useState('');
  const [sharing, setSharing]     = useState(false);
  const [exportStep, setExportStep] = useState('');  // '직렬화' | '레이아웃' | '파일 생성' | '다운로드'
  const [error, setError]         = useState(null);

  // ─── Font availability (async, loaded on mount)
  const [fontAvailability, setFontAvailability] = useState(null);
  useEffect(() => {
    checkFontsAvailability().then(setFontAvailability);
  }, []);

  const fontWarnings = useMemo(
    () => getFontWarnings(stylePreset, fontAvailability),
    [stylePreset, fontAvailability]
  );

  const selectedFontName  = getFontByCssFamily(stylePreset?.fontFamily)?.displayName ?? stylePreset?.fontFamily ?? '함초롱바탕';
  const effectivePdfFont  = getEffectivePdfFontName(stylePreset, fontAvailability);

  const toggle = useCallback((key, sub) => {
    setSel(s => {
      if (sub !== undefined) return { ...s, [key]: { ...s[key], [sub]: !s[key][sub] } };
      return { ...s, [key]: !s[key] };
    });
  }, []);

  // ─── Export
  const handleExport = useCallback(async () => {
    setError(null);
    setExportStep('');
    setExporting(true);
    const onStep = (label) => {
      setExportStep(label);
    };
    try {
      if (format === 'pdf')         await exportPdf(state, sel, { onStep });
      else if (format === 'docx')   await exportDocx(state, sel, { onStep });
      else if (format === 'hancom') await exportHancom(state, sel, { onStep });
      else if (format === 'hwpx')   await exportHwpx(state, sel);
      onClose();
    } catch (err) {
      console.error('[PrintPreviewModal] export failed:', err);
      setError(err.message || '내보내기 실패');
      setExportStep('');
    } finally {
      setExporting(false);
    }
  }, [format, state, sel, onClose]);

  const handleShare = useCallback(async () => {
    setSharing(true);
    setShareMsg('링크 생성 중…');
    try {
      const url = await buildReviewURL(state, sel);
      try { await navigator.clipboard.writeText(url); }
      catch {
        const inp = document.createElement('input');
        inp.value = url; document.body.appendChild(inp);
        inp.select(); document.execCommand('copy');
        document.body.removeChild(inp);
      }
      setShareMsg('링크 복사됨 (7일 후 만료)');
      setTimeout(() => setShareMsg(''), 3000);
    } catch {
      setShareMsg('링크 생성 실패');
      setTimeout(() => setShareMsg(''), 3000);
    } finally {
      setSharing(false);
    }
  }, [state, sel]);

  const handleBackdrop = e => { if (e.target === e.currentTarget) onClose(); };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center no-print"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={handleBackdrop}
    >
      <div
        className="flex rounded-xl shadow-2xl"
        style={{
          width:      'min(960px, 95vw)',
          height:     'min(88vh, 760px)',
          background: 'var(--c-panel)',
          border:     '1px solid var(--c-border)',
          overflow:   'clip',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Left: Options ──────────────────────────────────────────────────── */}
        <div
          className="w-64 shrink-0 flex flex-col overflow-y-auto"
          style={{ borderRight: '1px solid var(--c-border)', padding: '1.25rem', WebkitOverflowScrolling: 'touch' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>출력 설정</h2>
            <button onClick={onClose} style={{ color: 'var(--c-text5)' }} className="text-lg leading-none">×</button>
          </div>

          {/* Print target */}
          <Section title="출력 대상">
            <Checkbox label="표지"     checked={sel.cover}    onChange={() => toggle('cover')} />
            <Checkbox label="시놉시스" checked={sel.synopsis} onChange={() => toggle('synopsis')} />

            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--c-text6)' }}>
              회차별 대본
            </div>
            {allEpisodes.map(ep => (
              <Checkbox
                key={ep.id}
                label={`${ep.number}회 ${ep.title || ''}`}
                checked={!!sel.episodes[ep.id]}
                onChange={() => toggle('episodes', ep.id)}
                indent
              />
            ))}

            <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--c-text6)' }}>
              참고자료
            </div>
            <Checkbox label="인물소개"   checked={sel.chars}      onChange={() => toggle('chars')} indent />
            <Checkbox label="인물이력서" checked={sel.biography}  onChange={() => toggle('biography')} indent />
            <Checkbox label="트리트먼트" checked={sel.treatment}  onChange={() => toggle('treatment')} indent />
            <Checkbox label="씬리스트"   checked={sel.scenelist}  onChange={() => toggle('scenelist')} indent />
            <Checkbox label="인물관계도" checked={false}          onChange={() => {}} indent disabled />
            <Checkbox label="자료수집"   checked={false}          onChange={() => {}} indent disabled />
          </Section>

          {/* Share button — 출력 형식 위 */}
          <button
            onClick={handleShare}
            disabled={sharing}
            className="w-full py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              background: 'transparent',
              border: '1px solid var(--c-border3)',
              color: 'var(--c-text3)',
              marginBottom: '0.5rem',
              cursor: sharing ? 'default' : 'pointer',
            }}
          >
            {shareMsg || '검토 링크 공유'}
          </button>

          {/* Format */}
          <Section title="출력 형식">
            <p className="text-[10px] mb-2" style={{ color: 'var(--c-text5)', lineHeight: 1.5 }}>
              💡 베타 기준 <strong>워드(DOCX)</strong>가 가장 완성도 높게 구현되어 있습니다.
            </p>
            {[
              { value: 'pdf',    label: 'PDF (인쇄)' },
              { value: 'docx',   label: '워드 (DOCX)' },
              { value: 'hancom', label: '한글 호환 DOCX' },
              { value: 'hwpx',   label: 'HWPX (한컴 전용)' },
            ].map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2 py-1 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  value={value}
                  checked={format === value}
                  onChange={() => setFormat(value)}
                  className="accent-[#5a5af5]"
                />
                <span className="text-xs" style={{ color: 'var(--c-text2)' }}>{label}</span>
              </label>
            ))}
          </Section>

          {/* Format hints */}
          {(format === 'docx' || format === 'hancom') && (
            <p className="text-[10px] mb-3" style={{ color: 'var(--c-text5)', lineHeight: 1.5 }}>
              미설치된 글꼴이 있는 경우 기기에 따라 다른 글꼴로 출력될 수 있습니다.
            </p>
          )}
          {format === 'hancom' && (
            <p className="text-[10px] mb-3" style={{ color: 'var(--c-text5)', lineHeight: 1.5 }}>
              함초롱바탕 글꼴로 출력됩니다. HWP 2014+ 및 한컴오피스에서 열 수 있습니다.
            </p>
          )}
          {format === 'hwpx' && (
            <p className="text-[10px] mb-3" style={{ color: 'var(--c-text5)', lineHeight: 1.5 }}>
              한컴 네이티브 HWPX 형식입니다. 한글 2014 이상에서 열 수 있습니다. 워드에서는 열리지 않습니다.
            </p>
          )}


          {/* 기울임체 미지원 경고 */}
          {(format === 'pdf' || format === 'hwpx') && (
            <div className="mb-3 px-2 py-1.5 rounded text-[10px]" style={{ background: 'var(--c-bg3)', color: 'var(--c-text5)', lineHeight: 1.5 }}>
              ⚠ 기울임체(이탤릭)는 {format === 'pdf' ? 'PDF' : '한글(HWPX)'} 출력에서 지원되지 않습니다.
            </div>
          )}

          {/* Export error */}
          {error && (
            <div className="mb-3 px-2 py-2 rounded" style={{ color: '#c00', background: '#fee', lineHeight: 1.5 }}>
              <div className="text-[11px] font-medium mb-0.5">내보내기 실패</div>
              <div className="text-[10px]" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{error}</div>
            </div>
          )}

          {/* Step status during export */}
          {exporting && exportStep && (
            <div className="text-[10px] mb-2 text-center" style={{ color: 'var(--c-text5)' }}>
              {format === 'pdf' ? 'PDF' : format === 'docx' ? 'DOCX' : '한글 DOCX'} —{' '}
              {exportStep} 중…
            </div>
          )}

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--c-accent)', marginTop: '0.5rem' }}
          >
            {exporting
              ? `${exportStep || '처리'} 중…`
              : format === 'pdf' ? '인쇄 / PDF 저장' : '파일 다운로드'}
          </button>

          <AdBanner slot="print-modal-left" mobileHide={false} height={60} style={{ marginTop: 8, borderRadius: 6 }} />
        </div>

        {/* ── Right: Preview ──────────────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ background: '#d8d8d8' }}
        >
          <PreviewRenderer
            appState={state}
            selections={sel}
            columnWidth={340}
          />

          <AdBanner slot="print-modal-right" mobileHide={false} height={72} style={{ margin: '12px 16px 16px', borderRadius: 4 }} />
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--c-text5)' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange, indent, disabled }) {
  return (
    <label
      className="flex items-center gap-2 py-0.5 cursor-pointer"
      style={{ paddingLeft: indent ? '0.75rem' : 0, opacity: disabled ? 0.4 : 1 }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="accent-[#5a5af5]"
      />
      <span className="text-xs" style={{ color: 'var(--c-text2)' }}>{label}</span>
    </label>
  );
}
