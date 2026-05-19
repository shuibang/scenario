/**
 * ContestBoard — 공모전 보드 (메모 탭 자리에 들어감)
 *
 * 사용자에게는 status='active' 인 공모전만 표시. 마감 임박순 정렬.
 * 카테고리 필터 칩 + "신규 N건" 뱃지 + "+ 제보" 버튼.
 * 데스크톱/모바일 공통 컴포넌트. 부모가 wrapper 크기를 잡음.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { fetchActiveContests, subscribeActiveContests, getActiveContestsCacheSync } from '../../store/contestsApi';
import ReportContestModal from './ReportContestModal';

const CATEGORIES = ['전체', '미니시리즈', '단막', '시나리오', '기타'];
const LAST_SEEN_KEY = 'drama_contests_last_seen';

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

function ContestCard({ contest, isNew }) {
  const d = daysUntil(contest.submit_end);
  const dc = ddayColor(d);

  return (
    <div
      style={{
        padding: '10px 12px',
        marginBottom: 8,
        borderRadius: 8,
        border: '1px solid var(--c-border3)',
        background: 'var(--c-panel2, var(--c-panel))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
        <span
          style={{
            fontSize: 10, fontWeight: 700,
            padding: '2px 6px', borderRadius: 4,
            background: dc.bg, color: dc.color,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >{fmtDday(d)}</span>
        {isNew && (
          <span
            style={{
              fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
              background: 'var(--c-accent)', color: '#fff', flexShrink: 0,
            }}
          >NEW</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.3, wordBreak: 'keep-all' }}>
            {contest.title}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--c-text5)', display: 'flex', flexWrap: 'wrap', gap: '2px 8px', marginBottom: 6 }}>
        {contest.organizer && <span>{contest.organizer}</span>}
        {contest.prize && <span>· {contest.prize}</span>}
        {contest.category && (
          <span
            style={{
              fontSize: 10, padding: '1px 5px', borderRadius: 4,
              background: 'var(--c-tag)', color: 'var(--c-accent2)',
            }}
          >{contest.category}</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--c-text6)' }}>
        {contest.submit_end && <span>마감 {contest.submit_end}</span>}
      </div>
      <div style={{ marginTop: 6 }}>
        <a
          href={contest.source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block', fontSize: 11, fontWeight: 600,
            color: 'var(--c-accent)', textDecoration: 'none',
            padding: '3px 8px', borderRadius: 4,
            border: '1px solid var(--c-border3)',
          }}
        >원문 보기 →</a>
      </div>
    </div>
  );
}

export default function ContestBoard({ compact = false }) {
  const [contests, setContests] = useState(() => getActiveContestsCacheSync() || []);
  const [loading, setLoading] = useState(() => getActiveContestsCacheSync() == null);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('전체');
  const [showReportModal, setShowReportModal] = useState(false);

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
    if (category === '전체') return contests;
    return contests.filter(c => (c.category || '기타') === category);
  }, [contests, category]);

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

      {/* 카테고리 칩 */}
      <div style={{
        padding: `6px ${pad}px`, display: 'flex', gap: 4, flexWrap: 'wrap',
        borderBottom: '1px solid var(--c-border2)', flexShrink: 0,
      }}>
        {CATEGORIES.map(cat => {
          const active = category === cat;
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 10,
                border: '1px solid ' + (active ? 'var(--c-accent)' : 'var(--c-border3)'),
                background: active ? 'var(--c-accent)' : 'transparent',
                color: active ? '#fff' : 'var(--c-text5)',
                cursor: 'pointer', fontWeight: active ? 600 : 400,
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
