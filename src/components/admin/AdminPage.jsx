import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../store/supabaseClient';

/**
 * AdminPage — 운영자 본인 전용 현황 대시보드
 *
 * 진입은 `isAdminHash(hash)` + `isAdminUser(authUser)` 가드를 통과해야 한다.
 * 실제 데이터 가드는 Supabase RLS(`public.is_admin_user()`)에 있으므로
 * 이 컴포넌트가 잘못 노출되더라도 Supabase 쿼리는 0행을 반환한다.
 */

const TABS = [
  { id: 'dashboard', label: '📊 대시보드' },
  { id: 'errors',    label: '🐞 오류 보고' },
  { id: 'survey',    label: '📋 설문 응답' },
  { id: 'shares',    label: '🔗 공유 활동' },
  { id: 'paid',      label: '💰 유료 추정' },
];

const cardStyle = {
  background: 'var(--c-card)',
  border: '1px solid var(--c-border)',
  borderRadius: '0.5rem',
  padding: '1rem 1.25rem',
};
const labelStyle = { fontSize: 10, color: 'var(--c-text6)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' };
const valStyle = { fontSize: '1.4rem', fontWeight: 700, color: 'var(--c-text)', lineHeight: 1.2 };
const subValStyle = { fontSize: 11, color: 'var(--c-text5)', marginTop: 4 };

function fmtDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear().toString().slice(2)}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtRelative(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const day = 86400000;
  if (diff < day) return '오늘';
  if (diff < day * 7) return `${Math.floor(diff / day)}일 전`;
  if (diff < day * 30) return `${Math.floor(diff / (day * 7))}주 전`;
  if (diff < day * 365) return `${Math.floor(diff / (day * 30))}달 전`;
  return `${Math.floor(diff / (day * 365))}년 전`;
}

function shortId(id) {
  if (!id) return '—';
  const s = String(id);
  if (s.length <= 8) return s;
  return s.slice(0, 6) + '…' + s.slice(-2);
}

function extractUserId(row, table) {
  if (!row) return null;
  if (table === 'shared_scripts')    return row.director_id || row.user_id || null;
  if (table === 'review_links')      return row.owner_user_id || row.created_by || row.user_id || null;
  if (table === 'feedback_versions') return row.author_user_id || null;
  if (table === 'feedback_sessions') return row.sender_user_id || null;
  if (table === 'error_reports')     return row.user_id || null;
  return row.user_id || null;
}

// 테이블별 생성 시각 컬럼이 통일돼 있지 않아 흡수.
// review_links(레거시)는 생성 시각 컬럼이 없으므로 null 반환 → 정렬·집계에서 제외된다.
function getCreatedAt(row, table) {
  if (!row) return null;
  if (table === 'shared_scripts')    return row.imported_at || row.created_at || null;
  if (table === 'feedback_sessions') return row.submitted_at || row.created_at || null;
  if (table === 'review_links')      return row.created_at || null; // 보통 undefined
  return row.created_at || null;
}

// ───────────────────────────────────────────────────────────────────────────
// 데이터 fetch 훅
// ───────────────────────────────────────────────────────────────────────────
function useAdminData() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    warnings: [],
    errors: [],
    surveys: [],
    shared: [],
    reviewLinks: [],
    feedbackVersions: [],
    feedbackSessions: [],
  });

  const refetch = async () => {
    if (!supabase) {
      setState((s) => ({ ...s, loading: false, error: 'Supabase 미설정' }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null, warnings: [] }));

    // 테이블별 컬럼명이 통일돼 있지 않음:
    //   error_reports, survey_responses, feedback_versions, feedback_comments  → created_at
    //   shared_scripts                                                          → imported_at
    //   feedback_sessions                                                       → submitted_at
    //   review_links (legacy)                                                   → 정렬 컬럼 없음 (expires_at만 존재)
    const queries = [
      { key: 'errors',           q: supabase.from('error_reports').select('*').order('created_at', { ascending: false }).limit(500) },
      { key: 'surveys',          q: supabase.from('survey_responses').select('*').order('created_at', { ascending: false }).limit(500) },
      { key: 'shared',           q: supabase.from('shared_scripts').select('*').order('imported_at', { ascending: false }).limit(500) },
      { key: 'reviewLinks',      q: supabase.from('review_links').select('*').limit(500) },
      { key: 'feedbackVersions', q: supabase.from('feedback_versions').select('*').order('created_at', { ascending: false }).limit(500) },
      { key: 'feedbackSessions', q: supabase.from('feedback_sessions').select('*').order('submitted_at', { ascending: false }).limit(500) },
    ];
    const results = await Promise.allSettled(queries.map((x) => x.q));
    const next = { errors: [], surveys: [], shared: [], reviewLinks: [], feedbackVersions: [], feedbackSessions: [] };
    const warnings = [];
    results.forEach((r, i) => {
      const key = queries[i].key;
      if (r.status === 'fulfilled' && !r.value.error) {
        next[key] = r.value.data || [];
      } else {
        const msg = r.status === 'fulfilled' ? r.value.error?.message : r.reason?.message;
        warnings.push(`${key}: ${msg || '알 수 없는 오류'}`);
      }
    });

    setState({
      loading: false,
      error: null,
      warnings,
      ...next,
    });
  };

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, refetch };
}

// ───────────────────────────────────────────────────────────────────────────
// 대시보드 탭
// ───────────────────────────────────────────────────────────────────────────
function DashboardTab({ data }) {
  const stats = useMemo(() => {
    const activeUserSet = new Set();
    data.errors.forEach((r) => { const u = extractUserId(r, 'error_reports'); if (u) activeUserSet.add(u); });
    data.shared.forEach((r) => { const u = extractUserId(r, 'shared_scripts'); if (u) activeUserSet.add(u); });
    data.reviewLinks.forEach((r) => { const u = extractUserId(r, 'review_links'); if (u) activeUserSet.add(u); });
    data.feedbackVersions.forEach((r) => { const u = extractUserId(r, 'feedback_versions'); if (u) activeUserSet.add(u); });

    const now = Date.now();
    const day30 = 30 * 86400000;
    const recentErrors = data.errors.filter((r) => now - new Date(r.created_at).getTime() < day30).length;
    const totalShares = data.shared.length + data.reviewLinks.length + data.feedbackVersions.length + data.feedbackSessions.length;

    const eligibleCount = data.surveys.filter((r) => !!r.q_work_status_link).length;

    return {
      activeUsers: activeUserSet.size,
      errorTotal: data.errors.length,
      errorRecent: recentErrors,
      surveyTotal: data.surveys.length,
      surveyEligible: eligibleCount,
      shareTotal: totalShares,
    };
  }, [data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div style={cardStyle}>
          <div style={labelStyle}>활동 사용자 (식별 가능)</div>
          <div style={valStyle}>{stats.activeUsers}명</div>
          <div style={subValStyle}>오류·공유·피드백에 기록된 distinct user_id</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>오류 보고</div>
          <div style={valStyle}>{stats.errorTotal}건</div>
          <div style={subValStyle}>최근 30일 {stats.errorRecent}건</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>설문 응답</div>
          <div style={valStyle}>{stats.surveyTotal}명</div>
          <div style={subValStyle}>이중 추첨 자격 후보 {stats.surveyEligible}명</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>공유 활동 합계</div>
          <div style={valStyle}>{stats.shareTotal}건</div>
          <div style={subValStyle}>대본·검토·피드백 버전·세션</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>대본 공유</div>
          <div style={valStyle}>{data.shared.length}건</div>
          <div style={subValStyle}>shared_scripts</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>피드백 세션</div>
          <div style={valStyle}>{data.feedbackSessions.length}건</div>
          <div style={subValStyle}>받은 피드백 누계</div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 오류 보고 탭
// ───────────────────────────────────────────────────────────────────────────
function ErrorsTab({ data }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let rows = data.errors;
    if (filter !== 'all') rows = rows.filter((r) => r.type === filter);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => (r.description || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q));
    return rows;
  }, [data.errors, filter, search]);

  const types = [
    { id: 'all', label: '전체' },
    { id: 'bug', label: '🐞 버그' },
    { id: 'ui', label: '🎨 화면' },
    { id: 'feature', label: '💡 제안' },
    { id: 'other', label: '📝 기타' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12,
              border: '1px solid', borderColor: filter === t.id ? 'var(--c-accent)' : 'var(--c-border3)',
              background: filter === t.id ? 'var(--c-active)' : 'transparent',
              color: filter === t.id ? 'var(--c-accent)' : 'var(--c-text4)',
              cursor: 'pointer',
            }}
          >{t.label} {filter === t.id ? '' : `(${t.id === 'all' ? data.errors.length : data.errors.filter((r) => r.type === t.id).length})`}</button>
        ))}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="내용/이메일 검색"
          style={{
            marginLeft: 'auto', minWidth: 200, padding: '4px 10px', borderRadius: 6,
            border: '1px solid var(--c-border3)', background: 'var(--c-input)',
            fontSize: 12, color: 'var(--c-text)',
          }}
        />
      </div>

      <div style={cardStyle}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>총 {filtered.length}건 (최근순)</div>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--c-text6)', padding: '20px 0', textAlign: 'center' }}>데이터가 없습니다</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => <ErrorRow key={r.id} row={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorRow({ row }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: '1px solid var(--c-border3)', paddingTop: 8 }}>
      <div className="flex items-start gap-3 cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <span style={{ fontSize: 11, color: 'var(--c-text6)', minWidth: 90, tabularNums: true }}>{fmtDateTime(row.created_at)}</span>
        <span style={{ fontSize: 11, color: 'var(--c-text5)', minWidth: 56 }}>{row.type}</span>
        <span style={{ fontSize: 12, color: 'var(--c-text3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: open ? 'normal' : 'nowrap' }}>
          {row.description}
        </span>
        <span style={{ fontSize: 10, color: 'var(--c-text6)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 8, marginLeft: 0, fontSize: 11, color: 'var(--c-text5)', lineHeight: 1.7 }}>
          <div>이메일: {row.email || '—'}</div>
          <div>user_id: {shortId(row.user_id)}</div>
          <div>page: {row.page || '—'}</div>
          <div>source: {row.source || '—'}</div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 설문 응답 탭
// ───────────────────────────────────────────────────────────────────────────
function SurveyTab({ data }) {
  const [sort, setSort] = useState('eligibleFirst');

  const sorted = useMemo(() => {
    const rows = [...data.surveys];
    if (sort === 'eligibleFirst') {
      rows.sort((a, b) => {
        const ae = a.q_work_status_link ? 1 : 0;
        const be = b.q_work_status_link ? 1 : 0;
        if (ae !== be) return be - ae;
        return new Date(b.created_at) - new Date(a.created_at);
      });
    } else if (sort === 'recent') {
      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sort === 'nps') {
      rows.sort((a, b) => (b.q14 || 0) - (a.q14 || 0));
    }
    return rows;
  }, [data.surveys, sort]);

  const eligibleCount = data.surveys.filter((r) => !!r.q_work_status_link).length;
  const phoneCount = data.surveys.filter((r) => !!r.q_phone).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        <div style={cardStyle}>
          <div style={labelStyle}>총 응답</div>
          <div style={valStyle}>{data.surveys.length}명</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>🏆 추첨 자격 후보</div>
          <div style={valStyle}>{eligibleCount}명</div>
          <div style={subValStyle}>작업현황 링크 제출자</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>📞 전화번호 제출</div>
          <div style={valStyle}>{phoneCount}명</div>
          <div style={subValStyle}>경품 수령 가능</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span style={{ fontSize: 11, color: 'var(--c-text6)' }}>정렬:</span>
        {[
          { id: 'eligibleFirst', label: '추첨 자격 우선' },
          { id: 'recent', label: '최신순' },
          { id: 'nps', label: 'NPS 높은 순' },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => setSort(s.id)}
            style={{
              padding: '3px 9px', borderRadius: 4, fontSize: 11,
              border: '1px solid', borderColor: sort === s.id ? 'var(--c-accent)' : 'var(--c-border3)',
              background: sort === s.id ? 'var(--c-active)' : 'transparent',
              color: sort === s.id ? 'var(--c-accent)' : 'var(--c-text4)',
              cursor: 'pointer',
            }}
          >{s.label}</button>
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>응답 목록 ({sorted.length}건)</div>
        {sorted.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--c-text6)', padding: '20px 0', textAlign: 'center' }}>데이터가 없습니다</div>
        ) : (
          <div className="space-y-2">
            {sorted.map((r) => <SurveyRow key={r.id || r.created_at} row={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function SurveyRow({ row }) {
  const [open, setOpen] = useState(false);
  const eligible = !!row.q_work_status_link;
  return (
    <div style={{ borderTop: '1px solid var(--c-border3)', paddingTop: 8 }}>
      <div className="flex items-center gap-2 cursor-pointer flex-wrap" onClick={() => setOpen((v) => !v)}>
        <span style={{ fontSize: 11, color: 'var(--c-text6)', minWidth: 90, tabularNums: true }}>{fmtDateTime(row.created_at)}</span>
        {eligible && <span style={{ fontSize: 11, color: '#d97706', fontWeight: 700 }}>🏆</span>}
        <span style={{ fontSize: 12, color: 'var(--c-text3)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.q20_email || '(이메일 없음)'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--c-text5)' }}>NPS {row.q14 ?? '—'}</span>
        <span style={{ fontSize: 10, color: 'var(--c-text6)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--c-text5)', lineHeight: 1.8 }}>
          {row.q_work_status_link && (
            <div>
              작업현황 링크: <a href={row.q_work_status_link} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--c-accent)' }}>{row.q_work_status_link}</a>
            </div>
          )}
          <div>전화번호: {row.q_phone || '—'}</div>
          <div>Q14(NPS): {row.q14 ?? '—'}</div>
          <div>Q7: {row.q7 ?? '—'}</div>
          {row.q15 && <div>Q15(자유): {row.q15}</div>}
          {row.q18 && <div>Q18: {row.q18}</div>}
          {row.q19 && <div>Q19: {row.q19}</div>}
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--c-text6)' }}>전체 응답 보기 (JSON)</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 10, color: 'var(--c-text5)', background: 'var(--c-input)', padding: 8, borderRadius: 4, marginTop: 6 }}>
{JSON.stringify(row, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 공유 활동 탭
// ───────────────────────────────────────────────────────────────────────────
function SharesTab({ data }) {
  const [typeFilter, setTypeFilter] = useState('all');

  const unified = useMemo(() => {
    const rows = [];
    data.shared.forEach((r) => rows.push({
      type: 'shared_script', label: '대본 공유',
      ts: getCreatedAt(r, 'shared_scripts'), user: extractUserId(r, 'shared_scripts'),
      ref: r.title || r.id, raw: r,
    }));
    data.reviewLinks.forEach((r) => rows.push({
      type: 'review_link', label: `검토 (${r.link_type || r.kind || '?'})`,
      ts: getCreatedAt(r, 'review_links'), user: extractUserId(r, 'review_links'),
      ref: r.id, raw: r,
    }));
    data.feedbackVersions.forEach((r) => rows.push({
      type: 'feedback_version', label: '피드백 버전',
      ts: getCreatedAt(r, 'feedback_versions'), user: extractUserId(r, 'feedback_versions'),
      ref: r.version_name || r.id, raw: r,
    }));
    data.feedbackSessions.forEach((r) => rows.push({
      type: 'feedback_session', label: '피드백 세션',
      ts: getCreatedAt(r, 'feedback_sessions'), user: extractUserId(r, 'feedback_sessions'),
      ref: r.id, raw: r,
    }));
    // ts 없는 행(review_links)은 뒤로 보냄
    rows.sort((a, b) => {
      if (!a.ts && !b.ts) return 0;
      if (!a.ts) return 1;
      if (!b.ts) return -1;
      return new Date(b.ts) - new Date(a.ts);
    });
    return rows;
  }, [data]);

  const filtered = typeFilter === 'all' ? unified : unified.filter((r) => r.type === typeFilter);

  const types = [
    { id: 'all',             label: `전체 (${unified.length})` },
    { id: 'shared_script',   label: `대본 (${data.shared.length})` },
    { id: 'review_link',     label: `검토 (${data.reviewLinks.length})` },
    { id: 'feedback_version',label: `버전 (${data.feedbackVersions.length})` },
    { id: 'feedback_session',label: `세션 (${data.feedbackSessions.length})` },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => setTypeFilter(t.id)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12,
              border: '1px solid', borderColor: typeFilter === t.id ? 'var(--c-accent)' : 'var(--c-border3)',
              background: typeFilter === t.id ? 'var(--c-active)' : 'transparent',
              color: typeFilter === t.id ? 'var(--c-accent)' : 'var(--c-text4)',
              cursor: 'pointer',
            }}
          >{t.label}</button>
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>{filtered.length}건 (최근순)</div>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--c-text6)', padding: '20px 0', textAlign: 'center' }}>데이터가 없습니다</div>
        ) : (
          <div className="space-y-1">
            {filtered.slice(0, 200).map((r, i) => (
              <div key={`${r.type}-${r.raw?.id || i}`} className="flex items-center gap-3" style={{ borderTop: '1px solid var(--c-border3)', paddingTop: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--c-text6)', minWidth: 90, tabularNums: true }}>{fmtDateTime(r.ts)}</span>
                <span style={{ fontSize: 11, color: 'var(--c-text5)', minWidth: 100 }}>{r.label}</span>
                <span style={{ fontSize: 11, color: 'var(--c-text4)', minWidth: 90 }}>user: {shortId(r.user)}</span>
                <span style={{ fontSize: 11, color: 'var(--c-text3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ref}</span>
              </div>
            ))}
            {filtered.length > 200 && (
              <div style={{ fontSize: 11, color: 'var(--c-text6)', padding: 8, textAlign: 'center' }}>
                ⋯ 상위 200건만 표시 (총 {filtered.length}건)
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 유료 추정 탭
// ───────────────────────────────────────────────────────────────────────────
function PaidEstimateTab({ data }) {
  const metrics = useMemo(() => {
    const directorUsers = new Set();
    const directorCount = {};
    data.shared.forEach((r) => {
      const u = extractUserId(r, 'shared_scripts');
      if (u) {
        directorUsers.add(u);
        directorCount[u] = (directorCount[u] || 0) + 1;
      }
    });
    const heavyShareUsers = Object.entries(directorCount).filter(([, c]) => c >= 5).map(([u]) => u);

    const feedbackAuthors = new Set();
    data.feedbackVersions.forEach((r) => {
      const u = extractUserId(r, 'feedback_versions');
      if (u) feedbackAuthors.add(u);
    });

    // 첫 활동 ts 추출 (4개 테이블 union의 user별 min(created_at))
    const firstSeen = new Map();
    const noteFirst = (u, ts) => {
      if (!u || !ts) return;
      const t = new Date(ts).getTime();
      if (!firstSeen.has(u) || firstSeen.get(u) > t) firstSeen.set(u, t);
    };
    data.errors.forEach((r) => noteFirst(extractUserId(r, 'error_reports'), getCreatedAt(r, 'error_reports')));
    data.shared.forEach((r) => noteFirst(extractUserId(r, 'shared_scripts'), getCreatedAt(r, 'shared_scripts')));
    data.reviewLinks.forEach((r) => noteFirst(extractUserId(r, 'review_links'), getCreatedAt(r, 'review_links')));
    data.feedbackVersions.forEach((r) => noteFirst(extractUserId(r, 'feedback_versions'), getCreatedAt(r, 'feedback_versions')));

    const day30 = 30 * 86400000;
    const now = Date.now();
    const retained30 = Array.from(firstSeen.entries()).filter(([, t]) => now - t > day30).map(([u]) => u);

    const recentErrorReporters = new Set();
    data.errors.forEach((r) => {
      if (now - new Date(r.created_at).getTime() < day30) {
        const u = extractUserId(r, 'error_reports');
        if (u) recentErrorReporters.add(u);
      }
    });

    const activeUserSet = new Set([...firstSeen.keys()]);
    const surveyRate = activeUserSet.size > 0
      ? Math.round((data.surveys.length / activeUserSet.size) * 100)
      : null;

    const candidateCap = Math.max(directorUsers.size, heavyShareUsers.length, feedbackAuthors.size);

    return {
      directorUsers: directorUsers.size,
      heavyShareUsers: heavyShareUsers.length,
      feedbackAuthors: feedbackAuthors.size,
      retained30: retained30.length,
      recentErrorReporters: recentErrorReporters.size,
      surveyRate,
      candidateCap,
      activeUsers: activeUserSet.size,
    };
  }, [data]);

  return (
    <div className="flex flex-col gap-3">
      <div style={{ ...cardStyle, background: 'var(--c-tip-bg, var(--c-card))', borderColor: 'var(--c-accent2)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text2)', marginBottom: 4 }}>
          💡 추정 후보 상한: <span style={{ color: 'var(--c-accent)' }}>{metrics.candidateCap}명</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--c-text5)', lineHeight: 1.6 }}>
          아래 프록시 지표 중 max 값. <strong>추정치이며 실제 결제 의향과는 무관</strong>합니다.
          유료화 시점에 카카오페이 결제 콘솔에서 실 결제자를 직접 확인해주세요.
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div style={cardStyle}>
          <div style={labelStyle}>디렉터 모드 사용자</div>
          <div style={valStyle}>{metrics.directorUsers}명</div>
          <div style={subValStyle}>shared_scripts.director_id distinct</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>헤비 공유 사용자 (5건+)</div>
          <div style={valStyle}>{metrics.heavyShareUsers}명</div>
          <div style={subValStyle}>협업 빈도가 높은 사용자</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>피드백 작성자</div>
          <div style={valStyle}>{metrics.feedbackAuthors}명</div>
          <div style={subValStyle}>feedback_versions distinct</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>30일+ 유지 사용자</div>
          <div style={valStyle}>{metrics.retained30}명</div>
          <div style={subValStyle}>첫 활동 후 30일 이상 경과</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>최근 30일 활성 보고자</div>
          <div style={valStyle}>{metrics.recentErrorReporters}명</div>
          <div style={subValStyle}>최근 오류 보고 경험</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>설문 응답률</div>
          <div style={valStyle}>{metrics.surveyRate == null ? '—' : `${metrics.surveyRate}%`}</div>
          <div style={subValStyle}>응답자 / 활동 사용자</div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 메인
// ───────────────────────────────────────────────────────────────────────────
export default function AdminPage({ authUser }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const data = useAdminData();

  const goBack = () => { window.location.hash = ''; };

  if (!supabase) {
    return (
      <div style={{ padding: 40, color: '#999', fontSize: 14 }}>
        Supabase 미설정. 어드민 데이터를 불러올 수 없습니다.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ background: 'var(--c-bg)', minHeight: '100vh' }}>
      {/* 상단바 */}
      <div style={{
        flexShrink: 0, borderBottom: '1px solid var(--c-border)', background: 'var(--c-panel)',
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={goBack}
          style={{
            padding: '4px 10px', borderRadius: 4, border: '1px solid var(--c-border3)',
            background: 'transparent', color: 'var(--c-text4)', fontSize: 12, cursor: 'pointer',
          }}
        >← 앱으로</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text2)' }}>🛠 관리자 대시보드</div>
        <div style={{ fontSize: 11, color: 'var(--c-text6)' }}>{authUser?.email}</div>
        <button
          onClick={data.refetch}
          style={{
            marginLeft: 'auto', padding: '4px 10px', borderRadius: 4,
            border: '1px solid var(--c-border3)', background: 'transparent',
            color: 'var(--c-text4)', fontSize: 12, cursor: 'pointer',
          }}
        >↻ 새로고침</button>
      </div>

      {/* 탭바 */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--c-border)', background: 'var(--c-panel)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 14px',
                fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400,
                color: activeTab === t.id ? 'var(--c-accent)' : 'var(--c-text5)',
                background: 'none', border: 'none',
                borderBottom: activeTab === t.id ? '2px solid var(--c-accent)' : '2px solid transparent',
                cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap',
              }}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto" style={{ padding: '20px 16px 60px' }}>
          {data.loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--c-text6)', fontSize: 13 }}>불러오는 중…</div>
          ) : data.error ? (
            <div style={{ padding: 20, color: '#dc2626', fontSize: 13, background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
              데이터 로드 실패: {data.error}
              <div style={{ fontSize: 11, color: '#991b1b', marginTop: 4 }}>
                RLS 정책이 적용되었는지, 어드민 이메일이 화이트리스트에 있는지 확인해주세요.
              </div>
            </div>
          ) : (
            <>
              {data.warnings && data.warnings.length > 0 && (
                <div style={{
                  marginBottom: 12, padding: '10px 14px', borderRadius: 6,
                  background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.35)',
                  fontSize: 12, color: 'var(--c-text3)',
                }}>
                  <div style={{ fontWeight: 600, color: '#d97706', marginBottom: 4 }}>⚠️ 일부 데이터를 가져오지 못했어요</div>
                  {data.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--c-text5)' }}>· {w}</div>
                  ))}
                </div>
              )}
              {activeTab === 'dashboard' && <DashboardTab data={data} />}
              {activeTab === 'errors'    && <ErrorsTab data={data} />}
              {activeTab === 'survey'    && <SurveyTab data={data} />}
              {activeTab === 'shares'    && <SharesTab data={data} />}
              {activeTab === 'paid'      && <PaidEstimateTab data={data} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
