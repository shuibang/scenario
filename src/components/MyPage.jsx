import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useApp } from '../store/AppContext';
import QnATab from './QnATab';
import { Document, Page, Text, View, StyleSheet, pdf, Font } from '@react-pdf/renderer';
import {
  storeFont, removeFont, loadFontMeta, saveFontMeta,
} from '../print/fontStorage';

// ─── Log PDF ──────────────────────────────────────────────────────────────────
const logPdfStyles = StyleSheet.create({
  page:    { padding: '30mm 25mm', fontFamily: 'Helvetica', fontSize: 10 },
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
          <Text style={{ ...logPdfStyles.gray, width: '35%' }}>날짜/시간</Text>
          <Text style={{ ...logPdfStyles.gray, width: '35%' }}>작품</Text>
          <Text style={{ ...logPdfStyles.gray, width: '15%', textAlign: 'right' }}>활동시간</Text>
        </View>
        {sorted.map((log, i) => {
          const proj = projects.find(p => p.id === log.projectId);
          return (
            <View key={i} style={logPdfStyles.row}>
              <Text style={{ ...logPdfStyles.cell, width: '35%' }}>{fmtTs(log.completedAt)}</Text>
              <Text style={{ ...logPdfStyles.cell, width: '35%' }}>{proj?.title || '삭제된 작품'}</Text>
              <Text style={{ ...logPdfStyles.cell, width: '15%', textAlign: 'right' }}>{fmtSec(log.activeDurationSec || 0)}</Text>
            </View>
          );
        })}
      </Page>
    </Document>
  );
}

async function downloadLogPdf(logs, projects) {
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
          <div className="mt-3 space-y-1.5">
            {recentLogs.map((log, i) => {
              const proj = projects.find(p => p.id === log.projectId);
              const snapshot = log.completedChecklistSnapshot || [];
              return (
                <div key={log.startedAt + i} className="flex items-start gap-3">
                  <span className="text-[10px] shrink-0 tabular-nums" style={{ color: 'var(--c-text6)', minWidth: '80px' }}>
                    {fmtDate(log.completedAt)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs truncate block" style={{ color: 'var(--c-text4)' }}>
                      {proj?.title || '삭제된 작품'}
                      {log.documentId && typeof log.documentId === 'string' && !log.documentId.match(/^[a-z]+$/) && (
                        <span className="ml-1 text-[10px]" style={{ color: 'var(--c-text6)' }}>
                          {(() => { const ep = episodes.find(e => e.id === log.documentId); return ep ? `${ep.number}회` : ''; })()}
                        </span>
                      )}
                    </span>
                    {snapshot.length > 0 && (
                      <span className="text-[9px]" style={{ color: 'var(--c-text6)' }}>
                        완료 항목: {snapshot.map(s => s.text).join(', ').slice(0, 60)}
                      </span>
                    )}
                  </div>
                  <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--c-accent2)' }}>
                    {fmt(log.activeDurationSec || 0)}
                  </span>
                </div>
              );
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
const DESIGN_TOOL_KEY   = 'drama_designTool';   // 'treatment' | 'scenelist'
const REFLECT_MODE_KEY  = 'drama_reflectMode';  // 'draft' | 'sync'

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
  const [publicPc, setPublicPc] = useState(() => localStorage.getItem(PUBLIC_PC_KEY) === 'true');
  const [designTool, setDesignTool] = useState(() => localStorage.getItem(DESIGN_TOOL_KEY) || 'treatment');
  const [reflectMode, setReflectMode] = useState(() => localStorage.getItem(REFLECT_MODE_KEY) || 'draft');

  const togglePublicPc = () => {
    const next = !publicPc;
    setPublicPc(next);
    localStorage.setItem(PUBLIC_PC_KEY, String(next));
  };

  const handleDesignTool = (val) => {
    setDesignTool(val);
    localStorage.setItem(DESIGN_TOOL_KEY, val);
  };

  const handleReflectMode = (val) => {
    setReflectMode(val);
    localStorage.setItem(REFLECT_MODE_KEY, val);
  };

  return (
    <div className="space-y-4">
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
        <div className="text-sm font-medium mb-3" style={{ color: 'var(--c-text)' }}>설계 도구 설정</div>

        {/* 주 설계 도구 */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1">
            <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--c-text2)' }}>주 설계 도구</div>
            <div className="text-xs" style={{ color: 'var(--c-text5)' }}>
              작업 시 기본으로 열리는 설계 탭을 선택합니다.
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            {[['treatment', '트리트먼트'], ['scenelist', '씬리스트']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => handleDesignTool(val)}
                className="text-xs px-3 py-1 rounded"
                style={{
                  background: designTool === val ? 'var(--c-accent)' : 'transparent',
                  color: designTool === val ? '#fff' : 'var(--c-text4)',
                  border: `1px solid ${designTool === val ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 대본 반영 방식 */}
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--c-text2)' }}>대본 반영 방식</div>
            <div className="text-xs" style={{ color: 'var(--c-text5)' }}>
              씬리스트/트리트먼트 변경이 대본에 반영되는 방식을 설정합니다.
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            {[['draft', '초안 유지'], ['sync', '대본 연동']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => handleReflectMode(val)}
                className="text-xs px-3 py-1 rounded"
                style={{
                  background: reflectMode === val ? 'var(--c-accent)' : 'transparent',
                  color: reflectMode === val ? '#fff' : 'var(--c-text4)',
                  border: `1px solid ${reflectMode === val ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 사용자 폰트 관리 */}
      <FontManagementSection />
    </div>
  );
}

// ─── Placeholder tabs ─────────────────────────────────────────────────────────
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
        className="w-36 shrink-0 flex flex-col pt-8 pb-4"
        style={{ borderRight: '1px solid var(--c-border)', background: 'var(--c-panel)' }}
      >
        <div className="px-4 mb-4 text-xs font-bold" style={{ color: 'var(--c-text4)', letterSpacing: '0.05em' }}>마이페이지</div>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="w-full text-left px-4 py-2 text-sm"
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
        <div className="max-w-2xl mx-auto py-8 px-6">
          {activeTab === 'stats' && <StatsTab />}
          {activeTab === 'settings' && <SettingsTab />}
          {activeTab === 'qa' && <QnATab />}
          {activeTab === 'errors' && (
            <PlaceholderTab icon="🐞" title="오류 제출" desc="버그나 개선사항을 발견하셨나요? 준비 중입니다." />
          )}
          {activeTab === 'membership' && (
            <PlaceholderTab icon="⭐" title="멤버십" desc="멤버십 기능은 준비 중입니다." />
          )}
        </div>
      </div>
    </div>
  );
}
