/**
 * ContestBoard — 공모전 보드 (메모 탭 자리에 들어감)
 *
 * 사용자에게는 status='active' 인 공모전만 표시. 마감 임박순 정렬.
 * 카테고리 필터 칩 + "신규 N건" 뱃지 + "+ 제보" 버튼.
 * 데스크톱/모바일 공통 컴포넌트. 부모가 wrapper 크기를 잡음.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { fetchActiveContests, subscribeActiveContests, getActiveContestsCacheSync, CONTEST_CATEGORIES } from '../../store/contestsApi';
import ReportContestModal from './ReportContestModal';
const LAST_SEEN_KEY = 'drama_contests_last_seen';
const PINNED_KEY = 'drama_contests_pinned';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadPinned() {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // 마감 지난 항목은 로드 시점에 자동 정리
    const t = todayKey();
    return arr.filter((p) => p && p.id && (!p.submit_end || p.submit_end >= t));
  } catch { return []; }
}

function savePinned(list) {
  try { localStorage.setItem(PINNED_KEY, JSON.stringify(list)); } catch {}
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const diffMs = target - today;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function fmtDday(d) {
  if (d == null) return '';
  if (d < 0) return `마감 ${-d}일 지남`;
  if (d === 0) return 'D-DAY';
  return `D-${d}`;
}

function ddayColor(d) {
  if (d == null || d < 0) return { bg: 'var(--c-tag)', color: 'var(--c-text5)' };
  if (d <= 3) return { bg: '#fee2e2', color: '#b91c1c' };
  if (d <= 7) return { bg: '#fef3c7', color: '#a16207' };
  return { bg: 'var(--c-tag)', color: 'var(--c-text3)' };
}

function ContestCard({ contest, isNew, isPinned, onTogglePin }) {
  const d = daysUntil(contest.submit_end);
  const dc = ddayColor(d);
  // 마감일: MM-DD 만 표시 (한 줄 컴팩트). null/공백 안전.
  const endShort = contest.submit_end ? contest.submit_end.slice(5) : '';

  const handleDdayClick = (e) => {
    // 카드 a 태그의 이동 동작 차단 + 핀 토글
    e.preventDefault();
    e.stopPropagation();
    onTogglePin?.(contest);
  };

  return (
    <a
      href={contest.source_url}
      target="_blank"
      rel="noopener noreferrer"
      title={contest.title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        marginBottom: 4,
        borderRadius: 6,
        border: '1px solid ' + (isPinned ? 'var(--c-accent)' : 'var(--c-border3)'),
        background: 'var(--c-panel2, var(--c-panel))',
        textDecoration: 'none',
        color: 'inherit',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--c-hover, var(--c-tag))';
        if (!isPinned) e.currentTarget.style.borderColor = 'var(--c-accent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--c-panel2, var(--c-panel))';
        if (!isPinned) e.currentTarget.style.borderColor = 'var(--c-border3)';
      }}
    >
      {/* 남은 날짜 — 클릭하면 상단 핀 토글 */}
      <button
        type="button"
        onClick={handleDdayClick}
        title={isPinned ? '핀 해제' : '상단에 핀'}
        style={{
          fontSize: 10, fontWeight: 700,
          padding: '2px 6px', borderRadius: 4,
          background: dc.bg, color: dc.color,
          whiteSpace: 'nowrap', flexShrink: 0,
          minWidth: 38, textAlign: 'center',
          border: 'none', cursor: 'pointer',
          position: 'relative',
        }}
      >
        {isPinned && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            fontSize: 8, lineHeight: 1,
          }}>📌</span>
        )}
        {fmtDday(d)}
      </button>
      {isNew && (
        <span
          style={{
            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
            background: 'var(--c-accent)', color: '#fff', flexShrink: 0,
          }}
        >N</span>
      )}
      {/* 제목 (1줄, ellipsis) */}
      <span
        style={{
          flex: 1, minWidth: 0,
          fontSize: 12, fontWeight: 500, color: 'var(--c-text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >{contest.title}</span>
      {/* 마감일 */}
      <span
        style={{
          fontSize: 11, color: 'var(--c-text6)',
          flexShrink: 0, whiteSpace: 'nowrap',
        }}
      >{endShort}</span>
    </a>
  );
}

function PinnedHeader({ items, onUnpin }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{
      padding: '6px 10px', borderBottom: '1px solid var(--c-border2)',
      background: 'rgba(99, 102, 241, 0.06)', flexShrink: 0,
    }}>
      {items.map((p) => {
        const d = daysUntil(p.submit_end);
        const dc = ddayColor(d);
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 11 }}>📌</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
              background: dc.bg, color: dc.color, whiteSpace: 'nowrap', flexShrink: 0,
              minWidth: 36, textAlign: 'center',
            }}>{fmtDday(d)}</span>
            <a
              href={p.source_url}
              target="_blank"
              rel="noopener noreferrer"
              title={p.title}
              style={{
                flex: 1, minWidth: 0, fontSize: 11, fontWeight: 500,
                color: 'var(--c-text)', textDecoration: 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >{p.title}</a>
            <span style={{ fontSize: 10, color: 'var(--c-text6)', flexShrink: 0 }}>
              {p.submit_end ? p.submit_end.slice(5) : ''}
            </span>
            <button
              type="button"
              onClick={() => onUnpin(p.id)}
              title="핀 해제"
              style={{
                background: 'transparent', border: 'none', color: 'var(--c-text6)',
                fontSize: 12, cursor: 'pointer', padding: '0 2px', lineHeight: 1,
              }}
            >×</button>
          </div>
        );
      })}
    </div>
  );
}

export default function ContestBoard({ compact = false }) {
  const [contests, setContests] = useState(() => getActiveContestsCacheSync() || []);
  const [loading, setLoading] = useState(() => getActiveContestsCacheSync() == null);
  const [error, setError] = useState(null);
  // 다중 선택. 빈 배열 = 전체 표시.
  const [selectedCats, setSelectedCats] = useState([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [pinned, setPinned] = useState(() => loadPinned());

  const toggleCat = (cat) => {
    setSelectedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const togglePin = useCallback((contest) => {
    setPinned((prev) => {
      const idx = prev.findIndex((p) => p.id === contest.id);
      let next;
      if (idx >= 0) {
        next = prev.filter((_, i) => i !== idx);
      } else {
        next = [
          ...prev,
          {
            id: contest.id,
            title: contest.title,
            source_url: contest.source_url,
            submit_end: contest.submit_end,
          },
        ];
      }
      savePinned(next);
      return next;
    });
  }, []);

  const unpin = useCallback((id) => {
    setPinned((prev) => {
      const next = prev.filter((p) => p.id !== id);
      savePinned(next);
      return next;
    });
  }, []);

  const pinnedIdSet = useMemo(() => new Set(pinned.map((p) => p.id)), [pinned]);

  // 마감 지난 항목 자동 청소 — 보드 mount 후 + 매 1시간마다
  useEffect(() => {
    const cleanup = () => {
      const t = todayKey();
      setPinned((prev) => {
        const next = prev.filter((p) => !p.submit_end || p.submit_end >= t);
        if (next.length !== prev.length) savePinned(next);
        return next;
      });
    };
    cleanup();
    const iv = setInterval(cleanup, 60 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const lastSeen = useMemo(() => {
    try { return parseInt(localStorage.getItem(LAST_SEEN_KEY) || '0', 10) || 0; } catch { return 0; }
  }, [showReportModal]);

  const refresh = useCallback(async ({ force = false } = {}) => {
    setLoading(true);
    setError(null);
    try {
      await fetchActiveContests({ force });
    } catch (err) {
      setError(err?.message || '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = subscribeActiveContests((next) => {
      if (Array.isArray(next)) setContests(next);
    });
    refresh();
    return unsub;
  }, [refresh]);

  // 보드를 열면 마지막 본 시각 갱신 (mount 후 약간 지연 — 뱃지를 잠시 확인할 수 있게)
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(LAST_SEEN_KEY, String(Date.now())); } catch {}
      window.dispatchEvent(new Event('drama_contests_seen'));
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    if (selectedCats.length === 0) return contests;
    return contests.filter((c) => {
      const cats = Array.isArray(c.category) ? c.category : (c.category ? [c.category] : []);
      if (cats.length === 0) return selectedCats.includes('기타');
      return cats.some((cat) => selectedCats.includes(cat));
    });
  }, [contests, selectedCats]);

  const newCount = useMemo(() => {
    if (!lastSeen) return 0;
    return contests.filter(c => {
      const t = c.approved_at ? new Date(c.approved_at).getTime() : 0;
      return t > lastSeen;
    }).length;
  }, [contests, lastSeen]);

  const pad = compact ? 8 : 12;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{
        padding: `8px ${pad}px`, borderBottom: '1px solid var(--c-border2)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text3)' }}>
          🏆 공모전
          {newCount > 0 && (
            <span style={{
              marginLeft: 6, fontSize: 10, fontWeight: 700,
              padding: '1px 6px', borderRadius: 8,
              background: 'var(--c-accent)', color: '#fff',
            }}>NEW {newCount}</span>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => refresh({ force: true })}
          title="새로고침"
          style={{
            fontSize: 11, padding: '3px 6px', borderRadius: 4,
            border: '1px solid var(--c-border3)', background: 'transparent',
            color: 'var(--c-text5)', cursor: 'pointer',
          }}
        >↻</button>
        <button
          onClick={() => setShowReportModal(true)}
          style={{
            fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
            border: '1px solid var(--c-accent)', background: 'transparent',
            color: 'var(--c-accent)', cursor: 'pointer',
          }}
        >+ 제보</button>
      </div>

      {/* 핀된 공모전 (상단 고정 — D-day 클릭으로 토글, 마감 지나면 자동 정리) */}
      <PinnedHeader items={pinned} onUnpin={unpin} />

      {/* 카테고리 칩 (다중 선택 — '전체'는 모두 해제). 한 줄 고정 + 가로 스크롤 */}
      <div style={{
        padding: `6px ${pad}px`, display: 'flex', gap: 4, flexWrap: 'nowrap',
        borderBottom: '1px solid var(--c-border2)', flexShrink: 0,
        overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}>
        {(() => {
          const allOff = selectedCats.length === 0;
          return (
            <button
              onClick={() => setSelectedCats([])}
              style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 10,
                border: '1px solid ' + (allOff ? 'var(--c-accent)' : 'var(--c-border3)'),
                background: allOff ? 'var(--c-accent)' : 'transparent',
                color: allOff ? '#fff' : 'var(--c-text5)',
                cursor: 'pointer', fontWeight: allOff ? 600 : 400,
                flexShrink: 0, whiteSpace: 'nowrap',
              }}
            >전체</button>
          );
        })()}
        {CONTEST_CATEGORIES.map((cat) => {
          const active = selectedCats.includes(cat);
          return (
            <button
              key={cat}
              onClick={() => toggleCat(cat)}
              style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 10,
                border: '1px solid ' + (active ? 'var(--c-accent)' : 'var(--c-border3)'),
                background: active ? 'var(--c-accent)' : 'transparent',
                color: active ? '#fff' : 'var(--c-text5)',
                cursor: 'pointer', fontWeight: active ? 600 : 400,
                flexShrink: 0, whiteSpace: 'nowrap',
              }}
            >{cat}</button>
          );
        })}
      </div>

      {/* 리스트 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: `8px ${pad}px`, WebkitOverflowScrolling: 'touch' }}>
        {loading && contests.length === 0 && (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--c-text6)' }}>
            불러오는 중…
          </div>
        )}
        {error && (
          <div style={{ padding: '12px', fontSize: 11, color: '#b91c1c', background: '#fee2e2', borderRadius: 4 }}>
            {error}
          </div>
        )}
        {!loading && filtered.length === 0 && !error && (
          <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: 12, color: 'var(--c-text6)' }}>
            아직 등록된 공모전이 없습니다.
            <div style={{ marginTop: 8, fontSize: 11 }}>
              알고 계신 공모전을 <button
                onClick={() => setShowReportModal(true)}
                style={{ color: 'var(--c-accent)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >제보</button>해주세요.
            </div>
          </div>
        )}
        {filtered.map(c => (
          <ContestCard
            key={c.id}
            contest={c}
            isNew={lastSeen > 0 && c.approved_at && new Date(c.approved_at).getTime() > lastSeen}
            isPinned={pinnedIdSet.has(c.id)}
            onTogglePin={togglePin}
          />
        ))}
      </div>

      {showReportModal && (
        <ReportContestModal
          onClose={() => setShowReportModal(false)}
          onSubmitted={() => { setShowReportModal(false); }}
        />
      )}
    </div>
  );
}
