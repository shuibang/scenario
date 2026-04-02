import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
  : null;
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../store/AppContext';
import QnATab from './QnATab';
import { Document, Page, Text, View, StyleSheet, pdf, Font } from '@react-pdf/renderer';
import { ensureFontsRegistered } from '../print/printPdf';
import {
  storeFont, removeFont, loadFontMeta, saveFontMeta,
} from '../print/fontStorage';
import { resetPageHints } from './OnboardingTour';

// ─── Log PDF ──────────────────────────────────────────────────────────────────
const LOG_PDF_FONT = '함초롱바탕';

const logPdfStyles = StyleSheet.create({
  page:    { padding: '30mm 25mm', fontFamily: LOG_PDF_FONT, fontSize: 10 },
  title:   { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  sub:     { fontSize: 11, fontWeight: 'bold', marginBottom: 4, marginTop: 10 },
  row:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0' },
  cell:    { fontSize: 9, color: '#333' },
  gray:    { fontSize: 9, color: '#888' },
  stats:   { flexDirection: 'row', gap: 20, marginBottom: 10 },
  statBox: { padding: '6 10', border: '1 solid #ddd', borderRadius: 4, minWidth: 80 },
  statLbl: { fontSize: 8, color: '#888', marginBottom: 2 },
  statVal: { fontSize: 13, fontWeight: 'bold', color: '#222' },
});

function fmtSec(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${sec % 60}초`;
  return `${sec % 60}초`;
}

function fmtTs(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function LogPdfDoc({ logs, projects }) {
  const totalSec = logs.reduce((s, l) => s + (l.activeDurationSec || 0), 0);
  const totalDays = new Set(logs.map(l => l.dateKey)).size;
  const sorted = [...logs].sort((a, b) => b.completedAt - a.completedAt);
  const exportedAt = fmtTs(Date.now());

  return (
    <Document>
      <Page size="A4" style={logPdfStyles.page}>
        <Text style={logPdfStyles.title}>작업 기록 증빙</Text>
        <Text style={{ ...logPdfStyles.gray, marginBottom: 10 }}>내보내기: {exportedAt}</Text>

        <View style={logPdfStyles.stats}>
          <View style={logPdfStyles.statBox}>
            <Text style={logPdfStyles.statLbl}>총 작업시간</Text>
            <Text style={logPdfStyles.statVal}>{fmtSec(totalSec)}</Text>
          </View>
          <View style={logPdfStyles.statBox}>
            <Text style={logPdfStyles.statLbl}>작업 일수</Text>
            <Text style={logPdfStyles.statVal}>{totalDays}일</Text>
          </View>
          <View style={logPdfStyles.statBox}>
            <Text style={logPdfStyles.statLbl}>세션 수</Text>
            <Text style={logPdfStyles.statVal}>{logs.length}</Text>
          </View>
        </View>

        <Text style={logPdfStyles.sub}>세션 목록</Text>
        <View style={{ ...logPdfStyles.row, borderBottomWidth: 1, borderBottomColor: '#999' }}>
          <Text style={{ ...logPdfStyles.gray, width: '30%' }}>날짜/시간</Text>
          <Text style={{ ...logPdfStyles.gray, width: '25%' }}>작품</Text>
          <Text style={{ ...logPdfStyles.gray, width: '32%' }}>완료 항목</Text>
          <Text style={{ ...logPdfStyles.gray, width: '13%', textAlign: 'right' }}>활동시간</Text>
        </View>
        {sorted.map((log, i) => {
          const proj = projects.find(p => p.id === log.projectId);
          const snapshot = log.completedChecklistSnapshot || [];
          return (
            <View key={i} style={{ ...logPdfStyles.row, alignItems: 'flex-start' }}>
              <Text style={{ ...logPdfStyles.cell, width: '30%' }}>{fmtTs(log.completedAt)}</Text>
              <Text style={{ ...logPdfStyles.cell, width: '25%' }}>{proj?.title || '삭제된 작품'}</Text>
              <View style={{ width: '32%' }}>
                {snapshot.length > 0
                  ? snapshot.map((item, j) => (
                      <Text key={j} style={{ ...logPdfStyles.cell, fontSize: 8 }}>✓ {item.text}</Text>
                    ))
                  : <Text style={{ ...logPdfStyles.gray, fontSize: 8 }}>—</Text>
                }
              </View>
              <Text style={{ ...logPdfStyles.cell, width: '13%', textAlign: 'right' }}>{fmtSec(log.activeDurationSec || 0)}</Text>
            </View>
          );
        })}
      </Page>
    </Document>
  );
}

async function downloadLogPdf(logs, projects) {
  ensureFontsRegistered();
  const blob = await pdf(<LogPdfDoc logs={logs} projects={projects} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `작업기록_${new Date().toISOString().slice(0,10)}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function buildLogShareUrl(logs, projects) {
  const payload = {
    type: 'log-export',
    exportedAt: Date.now(),
    projects: projects.map(p => ({ id: p.id, title: p.title })),
    logs,
  };
  const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(payload)))));
  return `${window.location.origin}${window.location.pathname}#log=${encoded}`;
}

// ─── LogItem ─────────────────────────────────────────────────────────────────
function LogItem({ log, proj, epLabel, snapshot, fmt, fmtDate }) {
  const [expanded, setExpanded] = useState(false);
  const hasSnapshot = snapshot.length > 0;
  return (
    <div>
      <div
        className="flex items-start gap-3 rounded px-1 py-1"
        onClick={() => hasSnapshot && setExpanded(v => !v)}
        style={{ cursor: hasSnapshot ? 'pointer' : 'default', background: expanded ? 'var(--c-hover)' : 'transparent' }}
      >
        <span className="text-[10px] shrink-0 tabular-nums" style={{ color: 'var(--c-text6)', minWidth: '80px' }}>
          {fmtDate(log.completedAt)}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-xs block" style={{ color: 'var(--c-text4)' }}>
            {proj?.title || '삭제된 작품'}
            {epLabel && <span className="ml-1 text-[10px]" style={{ color: 'var(--c-text6)' }}>{epLabel}</span>}
          </span>
          {hasSnapshot && !expanded && (
            <span className="text-[10px]" style={{ color: 'var(--c-text6)' }}>
              완료 {snapshot.length}항목 · 클릭해서 보기
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs tabular-nums" style={{ color: 'var(--c-accent2)' }}>
            {fmt(log.activeDurationSec || 0)}
          </span>
          {hasSnapshot && (
            <span className="text-[10px]" style={{ color: 'var(--c-text6)' }}>{expanded ? '▲' : '▼'}</span>
          )}
        </div>
      </div>
      {expanded && (
        <ul className="mt-1 mb-2 ml-[88px] space-y-0.5">
          {snapshot.map((item, idx) => (
            <li key={item.id || idx} className="text-[11px] flex items-start gap-1" style={{ color: 'var(--c-text4)' }}>
              <span style={{ color: 'var(--c-accent2)', flexShrink: 0 }}>✓</span>
              <span>{item.text}</span>
              {item.docId && typeof item.docId !== 'undefined' && (
                <span className="text-[10px] ml-1" style={{ color: 'var(--c-text6)' }}>({item.docId})</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Stats tab ────────────────────────────────────────────────────────────────
function StatsTab() {
  const { state } = useApp();
  const { workTimeLogs, projects, episodes } = state;
  const [exportMsg, setExportMsg] = useState('');

  const totalSec = workTimeLogs.reduce((s, l) => s + (l.activeDurationSec || 0), 0);
  const totalDays = useMemo(() => new Set(workTimeLogs.map(l => l.dateKey)).size, [workTimeLogs]);

  const projectStats = useMemo(() => {
    return projects.map(p => {
      const logs = workTimeLogs.filter(l => l.projectId === p.id);
      const sec  = logs.reduce((s, l) => s + (l.activeDurationSec || 0), 0);
      const epCount = episodes.filter(e => e.projectId === p.id).length;
      return { project: p, sec, logCount: logs.length, epCount };
    }).sort((a, b) => b.sec - a.sec);
  }, [projects, episodes, workTimeLogs]);

  const last30 = useMemo(() => {
    const today = new Date();
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const sec = workTimeLogs
        .filter(l => l.dateKey === key)
        .reduce((s, l) => s + (l.activeDurationSec || 0), 0);
      days.push({ key, sec, label: `${d.getMonth() + 1}/${d.getDate()}` });
    }
    return days;
  }, [workTimeLogs]);

  const maxSec = Math.max(...last30.map(d => d.sec), 1);

  const recentLogs = useMemo(() =>
    [...workTimeLogs].sort((a, b) => b.completedAt - a.completedAt).slice(0, 10),
    [workTimeLogs]
  );

  const fmt = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}시간 ${m}분`;
    if (m > 0) return `${m}분 ${s}초`;
    return `${s}초`;
  };

  const fmtDate = (ts) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const cardStyle = {
    background: 'var(--c-card)',
    border: '1px solid var(--c-border)',
    borderRadius: '0.5rem',
    padding: '1rem 1.25rem',
  };

  const labelStyle = { fontSize: '10px', color: 'var(--c-text6)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' };
  const valStyle   = { fontSize: '1.5rem', fontWeight: 700, color: 'var(--c-text)', lineHeight: 1.2 };

  const handlePdfExport = async () => {
    setExportMsg('생성 중…');
    try {
      await downloadLogPdf(workTimeLogs, projects);
      setExportMsg('PDF 저장됨');
    } catch (e) {
      setExportMsg('오류: ' + e.message);
    }
    setTimeout(() => setExportMsg(''), 3000);
  };

  const handleLinkCopy = async () => {
    const url = buildLogShareUrl(workTimeLogs, projects);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const inp = document.createElement('input');
      inp.value = url; document.body.appendChild(inp);
      inp.select(); document.execCommand('copy');
      document.body.removeChild(inp);
    }
    setExportMsg('링크 복사됨');
    setTimeout(() => setExportMsg(''), 2500);
  };

  return (
    <div>
      {workTimeLogs.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <button onClick={handlePdfExport}
            className="text-xs px-3 py-1 rounded"
            style={{ background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            PDF 내보내기
          </button>
          <button onClick={handleLinkCopy}
            className="text-xs px-3 py-1 rounded"
            style={{ background: 'var(--c-tag)', color: 'var(--c-text2)', border: '1px solid var(--c-border3)', cursor: 'pointer' }}>
            읽기전용 링크
          </button>
          {exportMsg && <span className="text-xs" style={{ color: 'var(--c-accent2)' }}>{exportMsg}</span>}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div style={cardStyle}>
          <div style={labelStyle}>총 작업시간</div>
          <div style={valStyle}>{fmt(totalSec)}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>작업 일수</div>
          <div style={valStyle}>{totalDays}일</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>세션 수</div>
          <div style={valStyle}>{workTimeLogs.length}</div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
        <div style={labelStyle}>최근 30일 활동</div>
        <div className="flex items-end gap-0.5 mt-3" style={{ height: '48px' }}>
          {last30.map(d => {
            const pct = d.sec / maxSec;
            const color = pct === 0 ? 'var(--c-border3)' : pct > 0.6 ? 'var(--c-accent)' : 'var(--c-accent2)';
            return (
              <div
                key={d.key}
                title={`${d.label}: ${d.sec > 0 ? fmt(d.sec) : '없음'}`}
                style={{
                  flex: 1,
                  height: `${Math.max(pct * 40, d.sec > 0 ? 4 : 2)}px`,
                  background: color,
                  borderRadius: '2px',
                  transition: 'height 0.2s',
                }}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-1">
          <span style={{ fontSize: '9px', color: 'var(--c-text6)' }}>{last30[0]?.label}</span>
          <span style={{ fontSize: '9px', color: 'var(--c-text6)' }}>{last30[last30.length - 1]?.label}</span>
        </div>
      </div>

      {projectStats.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
          <div style={labelStyle}>작품별 작업시간</div>
          <div className="mt-3 space-y-2">
            {projectStats.map(({ project, sec, epCount }) => (
              <div key={project.id} className="flex items-center gap-3">
                <span className="text-xs flex-1 truncate" style={{ color: 'var(--c-text3)' }}>
                  {project.title}
                  {epCount > 0 && <span className="ml-1.5 text-[10px]" style={{ color: 'var(--c-text6)' }}>{epCount}회</span>}
                </span>
                <span className="text-xs tabular-nums shrink-0" style={{ color: sec > 0 ? 'var(--c-accent2)' : 'var(--c-text6)' }}>
                  {sec > 0 ? fmt(sec) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentLogs.length > 0 && (
        <div style={cardStyle}>
          <div style={labelStyle}>최근 세션</div>
          <div className="mt-3 space-y-1">
            {recentLogs.map((log, i) => {
              const proj = projects.find(p => p.id === log.projectId);
              const snapshot = log.completedChecklistSnapshot || [];
              const epLabel = (() => {
                if (!log.documentId || typeof log.documentId !== 'string' || log.documentId.match(/^[a-z]+$/)) return '';
                const ep = episodes.find(e => e.id === log.documentId);
                return ep ? `${ep.number}회` : '';
              })();
              return <LogItem key={log.startedAt + i} log={log} proj={proj} epLabel={epLabel} snapshot={snapshot} fmt={fmt} fmtDate={fmtDate} />;
            })}
          </div>
        </div>
      )}

      {workTimeLogs.length === 0 && (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--c-text5)' }}>
          작업 기록이 없습니다<br/>
          <span className="text-xs" style={{ color: 'var(--c-text6)' }}>타이머 완료 버튼을 누르면 세션이 저장됩니다</span>
        </div>
      )}
    </div>
  );
}

// ─── Settings tab ─────────────────────────────────────────────────────────────
const PUBLIC_PC_KEY     = 'drama_publicPcMode';
const DESIGN_TOOL_KEY        = 'drama_designTool';       // 'treatment' | 'scenelist'
const TREATMENT_SYNC_KEY     = 'drama_treatmentSync';    // 'off' | 'sync'
const SCENELIST_SYNC_KEY     = 'drama_scenelistSync';    // 'off' | 'sync'

// ─── Font Management ──────────────────────────────────────────────────────────
function formatBytes(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

function FontManagementSection() {
  const [fonts, setFonts]       = useState(() => loadFontMeta());
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState('');
  const fileRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!fileRef.current) return;
    fileRef.current.value = '';
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
      setError('TTF, OTF, WOFF, WOFF2 파일만 지원합니다.');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const id     = `custom_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      const name   = file.name.replace(/\.[^.]+$/, '');
      await storeFont(id, name, buffer);
      const meta = loadFontMeta();
      const updated = [...meta, {
        id,
        name,
        format: ext.toUpperCase(),
        sizeBytes: file.size,
        isDefault: meta.length === 0,  // first uploaded → default
        addedAt: Date.now(),
      }];
      saveFontMeta(updated);
      setFonts(updated);
    } catch (err) {
      setError(`업로드 실패: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSetDefault = (id) => {
    const updated = loadFontMeta().map(f => ({ ...f, isDefault: f.id === id }));
    saveFontMeta(updated);
    setFonts(updated);
  };

  const handleDelete = async (id) => {
    try {
      await removeFont(id);
      const meta = loadFontMeta().filter(f => f.id !== id);
      // if deleted font was default, set first remaining as default
      if (meta.length > 0 && !meta.some(f => f.isDefault)) {
        meta[0].isDefault = true;
      }
      saveFontMeta(meta);
      setFonts(meta);
    } catch (err) {
      setError(`삭제 실패: ${err.message}`);
    }
  };

  return (
    <div
      className="p-4 rounded-lg"
      style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>사용자 폰트 관리</div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-xs px-3 py-1 rounded"
          style={{ background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1 }}
        >
          {uploading ? '업로드 중…' : '+ 폰트 추가'}
        </button>
        <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" style={{ display: 'none' }} onChange={handleFileChange} />
      </div>

      <div className="text-xs mb-3" style={{ color: 'var(--c-text5)', lineHeight: 1.5 }}>
        TTF·OTF 파일을 추가하면 PDF·DOCX 출력 시 폰트 선택 메뉴에 표시됩니다.
        폰트 파일은 이 브라우저에만 저장됩니다.
      </div>

      {error && (
        <div className="text-xs mb-2 px-2 py-1 rounded" style={{ color: '#c00', background: '#fee' }}>
          {error}
        </div>
      )}

      {fonts.length === 0 ? (
        <div className="text-xs py-4 text-center" style={{ color: 'var(--c-text6)' }}>
          등록된 폰트 없음
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {fonts.map(f => (
            <div
              key={f.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded"
              style={{ background: 'var(--c-input)', border: '1px solid var(--c-border3)' }}
            >
              <span className="text-xs px-1 rounded" style={{ background: '#e8e8f8', color: '#5555aa', fontWeight: 600, fontSize: '9px' }}>
                {f.format}
              </span>
              <span className="flex-1 text-xs truncate" style={{ color: 'var(--c-text2)' }}>
                {f.name}
              </span>
              <span className="text-xs" style={{ color: 'var(--c-text6)', flexShrink: 0 }}>
                {formatBytes(f.sizeBytes)}
              </span>
              {f.isDefault && (
                <span className="text-xs px-1 rounded" style={{ background: '#e6f4ea', color: '#2d7a3d', fontWeight: 600, fontSize: '9px', flexShrink: 0 }}>
                  기본
                </span>
              )}
              {!f.isDefault && (
                <button
                  onClick={() => handleSetDefault(f.id)}
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ border: '1px solid var(--c-border3)', background: 'transparent', color: 'var(--c-text4)', cursor: 'pointer', flexShrink: 0, fontSize: '10px' }}
                >
                  기본
                </button>
              )}
              <button
                onClick={() => handleDelete(f.id)}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ border: '1px solid #f99', background: 'transparent', color: '#c55', cursor: 'pointer', flexShrink: 0, fontSize: '10px' }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsTab() {
  const { state, dispatch } = useApp();
  const preset = state.stylePreset || {};
  const margins = preset.pageMargins || { top: 35, right: 30, bottom: 30, left: 30 };
  const isLoggedIn = !!localStorage.getItem('drama_auth_user');

  const setPreset = (key, val) => dispatch({ type: 'SET_STYLE_PRESET', payload: { [key]: val } });
  const setMargin = (side, val) => dispatch({ type: 'SET_STYLE_PRESET', payload: { pageMargins: { ...margins, [side]: Number(val) } } });

  const [symInput, setSymInput] = useState('');
  const customSymbols = preset.customSymbols || [];
  const addSymbol = () => {
    const s = symInput.trim();
    if (s && !customSymbols.includes(s)) setPreset('customSymbols', [...customSymbols, s]);
    setSymInput('');
  };

  const [publicPc, setPublicPc] = useState(() => localStorage.getItem(PUBLIC_PC_KEY) === 'true');
  const [designTool, setDesignTool]       = useState(() => localStorage.getItem(DESIGN_TOOL_KEY) || 'treatment');
  const [treatmentSync, setTreatmentSync] = useState(() => localStorage.getItem(TREATMENT_SYNC_KEY) || 'off');
  const [scenelistSync, setScenelistSync] = useState(() => localStorage.getItem(SCENELIST_SYNC_KEY) || 'off');

  const togglePublicPc = () => {
    const next = !publicPc;
    setPublicPc(next);
    localStorage.setItem(PUBLIC_PC_KEY, String(next));
  };

  const handleDesignTool = (val) => {
    setDesignTool(val);
    localStorage.setItem(DESIGN_TOOL_KEY, val);
  };

  const toggleSync = (tool) => {
    if (tool === 'treatment') {
      const next = treatmentSync === 'sync' ? 'off' : 'sync';
      setTreatmentSync(next);
      localStorage.setItem(TREATMENT_SYNC_KEY, next);
    } else {
      const next = scenelistSync === 'sync' ? 'off' : 'sync';
      setScenelistSync(next);
      localStorage.setItem(SCENELIST_SYNC_KEY, next);
    }
  };

  const inputStyle = {
    background: 'var(--c-input)', color: 'var(--c-text3)',
    border: '1px solid var(--c-border3)', borderRadius: '0.25rem',
    padding: '3px 8px', fontSize: '12px', outline: 'none', width: '100%',
  };
  const labelStyle = { fontSize: '11px', color: 'var(--c-text5)', marginBottom: '2px', display: 'block' };

  return (
    <div className="space-y-4">

      {/* 스타일 설정 */}
      <div className="p-4 rounded-lg" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>스타일 설정</div>
          {!isLoggedIn && (
            <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--c-tag)', color: 'var(--c-text5)', border: '1px solid var(--c-border3)' }}>
              로그인 시 저장됩니다
            </span>
          )}
        </div>
        <div className="text-[10px] mb-3 px-3 py-2 rounded" style={{ background: 'var(--c-tag)', color: 'var(--c-text5)', border: '1px solid var(--c-border3)' }}>
          공모전 등 정확한 지침이 있는 경우, 규격에 맞는지 직접 확인하시길 권장합니다.
        </div>
        <div className="space-y-4">
          {/* 기본 스타일 */}
          <div>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--c-accent2)' }}>기본 스타일</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={labelStyle}>글씨 크기 (pt)</label>
                <input type="number" min="8" max="20" value={preset.fontSize ?? 11}
                  onChange={e => setPreset('fontSize', Number(e.target.value))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>줄간격 (%)</label>
                <input type="number" min="100" max="300" step="10"
                  value={Math.round((preset.lineHeight ?? 1.6) * 100)}
                  onChange={e => setPreset('lineHeight', Number(e.target.value) / 100)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>장평 (%)</label>
                <input type="number" min="50" max="200" step="5"
                  value={preset.characterWidth ?? 100}
                  onChange={e => setPreset('characterWidth', Number(e.target.value))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>인물/대사 간격 (em)</label>
                <input type="number" min="4" max="14" step="0.5"
                  value={parseFloat(preset.dialogueGap ?? '7')}
                  onChange={e => setPreset('dialogueGap', `${e.target.value}em`)} style={inputStyle} />
              </div>
            </div>
          </div>

          {/* 여백 */}
          <div>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--c-accent2)' }}>여백 (mm)</div>
            <div className="grid grid-cols-2 gap-3">
              {[['top','위'], ['bottom','아래'], ['left','왼쪽'], ['right','오른쪽']].map(([side, label]) => (
                <div key={side}>
                  <label style={labelStyle}>{label}</label>
                  <input type="number" min="5" max="60" value={margins[side] ?? 30}
                    onChange={e => setMargin(side, e.target.value)} style={inputStyle} />
                </div>
              ))}
            </div>
          </div>

          {/* 나의 태그 */}
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--c-accent2)' }}>나의 태그</div>
            <div className="text-[10px] mb-2" style={{ color: 'var(--c-text6)' }}>
              예) 클라이막스, 초목표, 도전 — 대본 씬에 붙일 나만의 태그를 추가하세요.
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {customSymbols.map(s => (
                <span key={s} className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1"
                  style={{ background: 'var(--c-tag)', color: 'var(--c-text3)', border: '1px solid var(--c-border3)' }}>
                  {s}
                  <button onClick={() => setPreset('customSymbols', customSymbols.filter(x => x !== s))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text6)', lineHeight: 1 }}>×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={symInput} onChange={e => setSymInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addSymbol(); }}
                placeholder="태그 입력 후 Enter (예: 클라이막스)"
                style={{ ...inputStyle, width: 'auto', flex: 1 }} />
              <button onClick={addSymbol} className="px-3 py-1 rounded text-xs"
                style={{ background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>추가</button>
            </div>
          </div>
        </div>
      </div>

      {/* 사용 가이드 다시 보기 */}
      <div
        className="flex items-start gap-4 p-4 rounded-lg"
        style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
      >
        <div className="flex-1">
          <div className="text-sm font-medium mb-0.5" style={{ color: 'var(--c-text)' }}>사용 가이드</div>
          <div className="text-xs" style={{ color: 'var(--c-text5)' }}>
            처음 사용자를 위한 단계별 UI 투어를 다시 볼 수 있습니다.
          </div>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('drama:startTour'))}
          className="shrink-0 text-xs px-3 py-1.5 rounded"
          style={{ background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          다시 보기
        </button>
      </div>

      <div
        className="flex items-start gap-4 p-4 rounded-lg"
        style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
      >
        <div className="flex-1">
          <div className="text-sm font-medium mb-0.5" style={{ color: 'var(--c-text)' }}>페이지 힌트 초기화</div>
          <div className="text-xs" style={{ color: 'var(--c-text5)' }}>
            각 화면에 표시되는 안내 메시지를 다시 볼 수 있도록 초기화합니다.
          </div>
        </div>
        <button
          onClick={() => { resetPageHints(); alert('페이지 힌트가 초기화됐습니다.\n각 화면을 다시 방문하면 안내가 표시됩니다.'); }}
          className="shrink-0 text-xs px-3 py-1.5 rounded"
          style={{ background: 'transparent', border: '1px solid var(--c-border3)', color: 'var(--c-text4)', cursor: 'pointer' }}
        >
          초기화
        </button>
      </div>

      <div
        className="flex items-start gap-4 p-4 rounded-lg"
        style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
      >
        <div className="flex-1">
          <div className="text-sm font-medium mb-0.5" style={{ color: 'var(--c-text)' }}>공용 PC 모드</div>
          <div className="text-xs" style={{ color: 'var(--c-text5)' }}>
            로그아웃 시 localStorage 데이터를 삭제합니다. 공용 컴퓨터 사용 시 활성화하세요.
          </div>
        </div>
        <button
          onClick={togglePublicPc}
          className="shrink-0 w-10 h-5 rounded-full transition-colors relative"
          style={{
            background: publicPc ? 'var(--c-accent)' : 'var(--c-border3)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
            style={{
              background: '#fff',
              left: publicPc ? '1.25rem' : '0.125rem',
              transition: 'left 0.15s',
            }}
          />
        </button>
      </div>
      {/* 설계 도구 설정 */}
      <div
        className="p-4 rounded-lg"
        style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
      >
        <div className="text-sm font-medium mb-1" style={{ color: 'var(--c-text)' }}>설계 도구 설정</div>
        <div className="text-xs mb-4" style={{ color: 'var(--c-text5)' }}>
          주 설계 도구는 씬 추가·가져오기가 활성화됩니다. 연동을 켜면 변경사항이 대본에 자동 반영됩니다.
        </div>

        <div className="flex flex-col gap-3">
          {[['treatment', '트리트먼트'], ['scenelist', '씬리스트']].map(([tool, label]) => {
            const isPrimary = designTool === tool;
            const syncVal = tool === 'treatment' ? treatmentSync : scenelistSync;
            const isSynced = syncVal === 'sync';
            return (
              <div
                key={tool}
                className="rounded-lg p-3"
                style={{
                  border: `1px solid ${isPrimary ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                  background: isPrimary ? 'color-mix(in srgb, var(--c-accent) 6%, transparent)' : 'transparent',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: isPrimary ? 'var(--c-accent)' : 'var(--c-text2)' }}>{label}</span>
                    {isPrimary && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--c-accent)', color: '#fff' }}>주 설계 도구</span>
                    )}
                  </div>
                  {!isPrimary && (
                    <button
                      onClick={() => handleDesignTool(tool)}
                      className="text-[10px] px-2 py-0.5 rounded"
                      style={{ background: 'transparent', color: 'var(--c-text5)', border: '1px solid var(--c-border3)', cursor: 'pointer' }}
                    >
                      주 도구로 설정
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    {isPrimary && (
                      <div className="text-[11px] mb-0.5" style={{ color: 'var(--c-accent)' }}>✓ 씬 추가 / 가져오기 활성화됨</div>
                    )}
                    <div className="text-[11px]" style={{ color: 'var(--c-text3)' }}>대본 자동 연동</div>
                    <div className="text-[10px]" style={{ color: 'var(--c-text6)' }}>변경사항이 대본에 자동 반영됩니다</div>
                  </div>
                  <button
                    onClick={() => toggleSync(tool)}
                    className="w-9 h-5 rounded-full relative shrink-0"
                    style={{ background: isSynced ? 'var(--c-accent)' : 'var(--c-border3)', border: 'none', cursor: 'pointer' }}
                  >
                    <span style={{
                      position: 'absolute', top: '2px', width: '16px', height: '16px',
                      borderRadius: '50%', background: '#fff',
                      left: isSynced ? '18px' : '2px', transition: 'left 0.15s',
                    }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 사용자 폰트 관리 */}
      <FontManagementSection />
    </div>
  );
}

// ─── Placeholder tabs ─────────────────────────────────────────────────────────
const KAKAO_PAY_URL = 'https://qr.kakaopay.com/Ej8gwMmym';
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function SupportCard() {
  const mobile = isMobile();
  return (
    <div className="w-full max-w-sm rounded-xl px-8 py-7 flex flex-col items-center gap-4"
      style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border2)' }}>
      <div className="text-sm text-center leading-relaxed" style={{ color: 'var(--c-text3)' }}>
        이 툴은 드라마 작가 지망생 개발자 혼자 만들고 있어요.<br />
        커피 한 잔 값의 응원이 큰 힘이 됩니다. ☕
      </div>
      {mobile ? (
        <a href={KAKAO_PAY_URL} target="_blank" rel="noopener noreferrer"
          className="px-5 py-2 rounded-lg text-sm font-semibold"
          style={{ background: '#FEE500', color: '#3C1E1E', textDecoration: 'none' }}>
          개발자 응원하기 💛
        </a>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="p-3 rounded-lg" style={{ background: '#fff' }}>
            <QRCodeSVG value={KAKAO_PAY_URL} size={140} />
          </div>
          <div className="text-xs text-center" style={{ color: 'var(--c-text5)' }}>
            카카오페이 앱으로 QR 스캔
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ErrorReportTab ───────────────────────────────────────────────────────────
const ERROR_TYPES = [
  { id: 'bug',     label: '🐞 버그',       desc: '기능이 작동하지 않아요' },
  { id: 'ui',      label: '🎨 화면 오류',   desc: '화면이 이상하게 보여요' },
  { id: 'feature', label: '💡 기능 제안',   desc: '이런 기능이 있으면 좋겠어요' },
  { id: 'other',   label: '📝 기타',        desc: '그 외 문의사항' },
];

function ErrorReportTab() {
  const [type, setType] = useState('bug');
  const [description, setDescription] = useState('');
  const [page, setPage] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'sending' | 'done' | 'error'

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setStatus('sending');
    if (!supabase) { setStatus('error'); return; }
    const { error } = await supabase.from('error_reports').insert({
      type,
      description: description.trim(),
      page: page.trim() || null,
    });
    setStatus(error ? 'error' : 'done');
  };

  if (status === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <div className="text-4xl">✅</div>
        <div className="text-sm font-medium" style={{ color: 'var(--c-text2)' }}>제출 완료!</div>
        <div className="text-xs text-center" style={{ color: 'var(--c-text5)' }}>소중한 피드백 감사합니다.<br />빠르게 검토하겠습니다.</div>
        <button
          onClick={() => { setStatus('idle'); setDescription(''); setPage(''); setType('bug'); }}
          className="mt-2 text-xs px-4 py-1.5 rounded"
          style={{ border: '1px solid var(--c-border3)', color: 'var(--c-text4)', background: 'transparent', cursor: 'pointer' }}
        >
          추가 제출
        </button>
      </div>
    );
  }

  const inputStyle = {
    width: '100%', background: 'var(--c-input)', border: '1px solid var(--c-border3)',
    borderRadius: 6, padding: '8px 10px', fontSize: 13, color: 'var(--c-text)',
    outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--c-text5)', marginBottom: 6, display: 'block' };

  return (
    <div className="flex flex-col gap-6" style={{ maxWidth: 480 }}>
      <div>
        <div className="text-sm font-semibold mb-1" style={{ color: 'var(--c-text2)' }}>오류 제출</div>
        <div className="text-xs" style={{ color: 'var(--c-text5)' }}>불편한 점이나 개선 아이디어를 알려주세요.</div>
      </div>

      {/* 유형 */}
      <div>
        <span style={labelStyle}>유형</span>
        <div className="grid grid-cols-2 gap-2">
          {ERROR_TYPES.map(t => (
            <button key={t.id} onClick={() => setType(t.id)}
              className="text-left px-3 py-2.5 rounded-lg text-xs"
              style={{
                border: `1px solid ${type === t.id ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                background: type === t.id ? 'var(--c-active)' : 'var(--c-input)',
                color: type === t.id ? 'var(--c-accent)' : 'var(--c-text3)',
                cursor: 'pointer',
              }}>
              <div className="font-medium">{t.label}</div>
              <div style={{ fontSize: 10, color: 'var(--c-text6)', marginTop: 2 }}>{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 내용 */}
      <div>
        <span style={labelStyle}>내용 *</span>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="어떤 문제가 있었는지 자세히 알려주세요."
          rows={5}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {/* 발생 화면 */}
      <div>
        <span style={labelStyle}>발생 화면 (선택)</span>
        <input
          value={page}
          onChange={e => setPage(e.target.value)}
          placeholder="예: 대본 편집, 출력 미리보기, 인물 페이지 …"
          style={inputStyle}
        />
      </div>

      {status === 'error' && (
        <div className="text-xs px-3 py-2 rounded" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
          전송 실패. 잠시 후 다시 시도해주세요.
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!description.trim() || status === 'sending'}
        className="px-5 py-2.5 rounded-lg text-sm font-semibold"
        style={{
          background: description.trim() ? 'var(--c-accent)' : 'var(--c-border3)',
          color: description.trim() ? '#fff' : 'var(--c-text6)',
          border: 'none', cursor: description.trim() ? 'pointer' : 'not-allowed',
        }}
      >
        {status === 'sending' ? '전송 중…' : '제출하기'}
      </button>
    </div>
  );
}

function PlaceholderTab({ icon, title, desc }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="text-4xl" style={{ color: 'var(--c-border3)' }}>{icon}</div>
      <div className="text-sm font-medium" style={{ color: 'var(--c-text3)' }}>{title}</div>
      <div className="text-xs text-center" style={{ color: 'var(--c-text6)', maxWidth: '240px' }}>{desc}</div>
    </div>
  );
}

// ─── MyPage — 마이페이지 ───────────────────────────────────────────────────────
const TABS = [
  { id: 'stats',      label: '작업통계' },
  { id: 'settings',  label: '설정' },
  { id: 'qa',        label: 'Q&A' },
  { id: 'errors',    label: '오류제출' },
  { id: 'membership',label: '멤버십' },
];

export default function MyPage() {
  const [activeTab, setActiveTab] = useState('stats');

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--c-bg)' }}>
      {/* Sidebar */}
      <div
        className="w-24 shrink-0 flex flex-col pt-8 pb-4"
        style={{ borderRight: '1px solid var(--c-border)', background: 'var(--c-panel)' }}
      >
        <div className="px-3 mb-4 text-[10px] font-bold" style={{ color: 'var(--c-text4)', letterSpacing: '0.05em' }}>마이페이지</div>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="w-full text-left px-3 py-2 text-xs"
            style={{
              background: activeTab === t.id ? 'var(--c-active)' : 'transparent',
              color: activeTab === t.id ? 'var(--c-accent)' : 'var(--c-text4)',
              borderLeft: activeTab === t.id ? '2px solid var(--c-accent)' : '2px solid transparent',
              border: 'none',
              borderLeft: activeTab === t.id ? '2px solid var(--c-accent)' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === t.id ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto pt-16 pb-10 px-10">
          {activeTab === 'stats' && <StatsTab />}
          {activeTab === 'settings' && <SettingsTab />}
          {activeTab === 'qa' && <QnATab />}
          {activeTab === 'errors' && <ErrorReportTab />}
          {activeTab === 'membership' && (
            <div className="flex flex-col items-center gap-8">
              <PlaceholderTab icon="⭐" title="멤버십" desc="멤버십 기능은 준비 중입니다." />
              <SupportCard />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
