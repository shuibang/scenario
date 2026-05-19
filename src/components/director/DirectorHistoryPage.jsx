import { useState, useEffect } from 'react';
import { supabase } from '../../store/supabaseClient';

const LOCAL_SCRIPTS_KEY = 'director_local_scripts';

function loadLocalScripts() {
  try { return JSON.parse(localStorage.getItem(LOCAL_SCRIPTS_KEY) || '[]'); }
  catch { return []; }
}

function formatDateHeader(isoDate) {
  const d = new Date(isoDate);
  const now = new Date();
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();

  const isToday = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yest.toDateString();

  if (isToday)     return `오늘 · ${weekday}요일`;
  if (isYesterday) return `어제 · ${weekday}요일`;
  if (y === now.getFullYear()) return `${m}월 ${day}일 · ${weekday}요일`;
  return `${y}년 ${m}월 ${day}일 · ${weekday}요일`;
}

function formatTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function groupByDate(records) {
  const groups = {};
  records.forEach(r => {
    const key = new Date(r._date).toISOString().slice(0, 10);
    (groups[key] ||= []).push(r);
  });
  return Object.keys(groups).sort().reverse().map(k => [k, groups[k]]);
}

export default function DirectorHistoryPage({ onBack, isGuest, D, onOpenScript }) {
  const [scripts, setScripts] = useState(null);
  const [localScripts, setLocalScripts] = useState(() => loadLocalScripts());

  useEffect(() => {
    setLocalScripts(loadLocalScripts());
    if (isGuest) { setScripts([]); return; }
    if (!supabase) { setScripts([]); return; }
    let cancelled = false;
    // 본인 import 만 (admin 계정 우회 방지)
    supabase.auth.getSession().then(({ data }) => {
      const uid = data?.session?.user?.id;
      if (!uid) { if (!cancelled) setScripts([]); return; }
      supabase.from('shared_scripts').select('id, title, imported_at, drive_file_id, watermark_text, sender_badge_emoji, sender_badge_label')
        .eq('director_id', uid)
        .order('imported_at', { ascending: false })
        .then(({ data }) => { if (!cancelled) setScripts(data || []); });
    });
    return () => { cancelled = true; };
  }, [isGuest]);

  const loading = scripts === null;
  const records = [
    ...(scripts || []).map(s => ({ ...s, _date: s.imported_at, _isLocal: false })),
    ...localScripts.map(s => ({ ...s, _date: s.createdAt || new Date().toISOString(), _isLocal: true })),
  ].sort((a, b) => new Date(b._date) - new Date(a._date));

  const grouped = groupByDate(records);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: D.bg, color: D.text }}>
      <header style={{
        height: 'clamp(44px, 12vw, 52px)', flexShrink: 0,
        display: 'flex', alignItems: 'center',
        paddingLeft: 'max(12px, env(safe-area-inset-left, 12px))',
        paddingRight: 'max(14px, env(safe-area-inset-right, 14px))',
        gap: 10, borderBottom: `1px solid ${D.border}`, background: D.sidebar,
      }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: D.text3, fontSize: 18, cursor: 'pointer', padding: '4px 6px', lineHeight: 1, WebkitTapHighlightColor: 'transparent' }}
        >←</button>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: D.text, letterSpacing: '-0.01em' }}>접속 기록</h2>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 40 }}>
        {loading && (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: D.text3, fontSize: 13 }}>불러오는 중…</div>
        )}
        {!loading && records.length === 0 && (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: D.text3, fontSize: 13, lineHeight: 1.7 }}>
            아직 받은 대본이 없습니다.<br />
            <span style={{ fontSize: 11, opacity: 0.7 }}>작가가 공유한 대본이 여기에 기록됩니다.</span>
          </div>
        )}
        {!loading && grouped.map(([date, items]) => (
          <section key={date}>
            <div style={{ padding: '14px 16px 6px', fontSize: 11, fontWeight: 700, color: D.accent, letterSpacing: '0.04em' }}>
              {formatDateHeader(date)}
            </div>
            {items.map(item => (
              <div
                key={`${item._isLocal ? 'L' : 'C'}-${item.id}`}
                onClick={() => onOpenScript?.(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px',
                  borderBottom: `1px solid ${D.border}`,
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: D.text3, flexShrink: 0, minWidth: 38 }}>
                  {formatTime(item._date)}
                </span>
                <span style={{ fontSize: 11, color: D.text3, flexShrink: 0 }}>
                  {item._isLocal ? '📁' : '☁'}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title || '제목 없음'}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
