import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../store/supabaseClient';
import { markAdminVisited, fetchAdminUnreadCounts } from '../../utils/adminBadge';
import ContestsAdminTab from './ContestsAdminTab';

// 탭 → unread breakdown 키 매핑
const TAB_UNREAD_KEY = {
  autoErrors: 'unresolved_client_errors',
  errors:     'unresolved_error_reports',
  survey:     'new_survey_responses',
};

/**
 * AdminPage — 운영자 본인 전용 현황 대시보드
 *
 * 진입은 `isAdminHash(hash)` + `isAdminUser(authUser)` 가드를 통과해야 한다.
 * 실제 데이터 가드는 Supabase RLS(`public.is_admin_user()`)에 있으므로
 * 이 컴포넌트가 잘못 노출되더라도 Supabase 쿼리는 0행을 반환한다.
 */

const TABS = [
  { id: 'dashboard',   label: '📊 대시보드' },
  { id: 'autoErrors',  label: '🚨 자동 오류' },
  { id: 'errors',      label: '🐞 오류 보고' },
  { id: 'survey',      label: '📋 설문 응답' },
  { id: 'shares',      label: '🔗 공유 활동' },
  { id: 'contests',    label: '🏆 공모 검토' },
  { id: 'paid',        label: '💰 유료 추정' },
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

// ─── 설문 질문 메타데이터 ──────────────────────────────────────────────────
// DB 컬럼명 → 화면에 보여줄 질문 텍스트.
// 'scale': 1~5 척도 답변 (leftLabel / rightLabel 함께 표시)
// 'array': 복수 선택 — 배열을 bullet 리스트로 렌더
// 'text' : 단답·서술
// 'meta' : 시각 등 메타 정보(렌더 시 별도 처리)
const SURVEY_QUESTIONS = [
  { key: 'q1',  label: 'Q1. 주로 어떤 글을 쓰시나요?', kind: 'text' },
  { key: 'q2',  label: 'Q2. 평소 대본 작업에 주로 사용하는 툴은? (복수)', kind: 'array' },
  { key: 'q_type', label: '대본 작업 툴 형태 선호 (선택)', kind: 'text' },
  { key: 'q3',  label: 'Q3. 실제로 사용해본 기능 (복수)', kind: 'array' },
  { key: 'q5',  label: 'Q4. 좋았던 기능과 이유', kind: 'text' },
  { key: 'q6',  label: 'Q5. 손이 안 갔던 기능과 이유', kind: 'text' },
  { key: 'q7',  label: 'Q6. 사용이 전반적으로 쉬웠나요?', kind: 'scale', leftLabel: '전혀 아니다', rightLabel: '아주 쉽다' },
  { key: 'q_ui', label: '바뀐 UI에 대한 느낌 (선택)', kind: 'text' },
  { key: 'q8',  label: 'Q7. 특별히 어렵거나 헷갈렸던 부분', kind: 'text' },
  { key: 'q9',  label: 'Q8. 모바일/태블릿 사용 경험', kind: 'text' },
  { key: 'q9_detail', label: '↳ 어떤 점이 불편했나요?', kind: 'text', subOf: 'q9' },
  { key: 'q10', label: 'Q9. 출력(PDF/DOCX/HWPX) 사용 경험', kind: 'text' },
  { key: 'q10_detail', label: '↳ 어떤 문제가 있었나요?', kind: 'text', subOf: 'q10' },
  { key: 'q12', label: 'Q10. 꼭 추가됐으면 하는 기능', kind: 'text' },
  { key: 'q13', label: 'Q11. 가장 불편했던 점', kind: 'text' },
  { key: 'q14', label: 'Q12. 다른 작가에게 추천할 의향', kind: 'scale', leftLabel: '전혀 없어요', rightLabel: '무조건 추천' },
  { key: 'q15', label: 'Q13. 추천하거나 안 하는 이유', kind: 'text' },
  { key: 'q16', label: 'Q14. 이건 무료였으면 하는 기능 (복수)', kind: 'array' },
  { key: 'q17', label: 'Q15. 사용해보신 결과 계속 사용 계획', kind: 'text' },
  { key: 'q18', label: 'Q16. 유료라면 선호하는 결제 방식', kind: 'text' },
  { key: 'q19', label: 'Q17. 광고 없는 버전에 낼 수 있는 금액', kind: 'text' },
  { key: 'q20_email', label: 'Q18. 업데이트 알림 이메일', kind: 'text' },
  { key: 'q_work_status_link', label: 'Q19. 작업현황 읽기전용 링크 (추첨 자격)', kind: 'link' },
  { key: 'q_phone', label: 'Q20. 경품 수령용 전화번호', kind: 'text' },
];

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
    autoErrors: [],
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
      { key: 'autoErrors',       q: supabase.from('client_errors').select('*').order('created_at', { ascending: false }).limit(1000) },
      { key: 'surveys',          q: supabase.from('survey_responses').select('*').order('created_at', { ascending: false }).limit(500) },
      { key: 'shared',           q: supabase.from('shared_scripts').select('*').order('imported_at', { ascending: false }).limit(500) },
      { key: 'reviewLinks',      q: supabase.from('review_links').select('*').limit(500) },
      { key: 'feedbackVersions', q: supabase.from('feedback_versions').select('*').order('created_at', { ascending: false }).limit(500) },
      { key: 'feedbackSessions', q: supabase.from('feedback_sessions').select('*').order('submitted_at', { ascending: false }).limit(500) },
    ];
    const results = await Promise.allSettled(queries.map((x) => x.q));
    const next = { errors: [], autoErrors: [], surveys: [], shared: [], reviewLinks: [], feedbackVersions: [], feedbackSessions: [] };
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

  /**
   * 오류 보고 row 의 resolved_at 토글.
   * optimistic update → 실패 시 롤백.
   */
  const toggleErrorResolved = async (row) => {
    if (!supabase || !row?.id) return;
    const next = row.resolved_at ? null : new Date().toISOString();
    const prev = state.errors;
    setState((s) => ({
      ...s,
      errors: s.errors.map((r) => (r.id === row.id ? { ...r, resolved_at: next } : r)),
    }));
    const { error } = await supabase
      .from('error_reports')
      .update({ resolved_at: next })
      .eq('id', row.id);
    if (error) {
      setState((s) => ({ ...s, errors: prev }));
      alert(`상태 변경에 실패했어요.\n\n${error.message || error}\n\n(Supabase 마이그레이션이 아직 적용 안 됐다면 SQL Editor에서 적용해주세요.)`);
    }
  };

  /**
   * 자동 오류 그룹 토글 — fingerprint 의 모든 row 를 일괄 update.
   * 그룹 안 한 row 라도 미해결이면 전체를 해결로 마킹, 전부 해결이면 전체 해제.
   */
  const toggleAutoErrorGroup = async (fingerprint, currentlyAllResolved) => {
    if (!supabase || !fingerprint) return;
    const next = currentlyAllResolved ? null : new Date().toISOString();
    const prev = state.autoErrors;
    setState((s) => ({
      ...s,
      autoErrors: s.autoErrors.map((r) => (r.fingerprint === fingerprint ? { ...r, resolved_at: next } : r)),
    }));
    const { error } = await supabase
      .from('client_errors')
      .update({ resolved_at: next })
      .eq('fingerprint', fingerprint);
    if (error) {
      setState((s) => ({ ...s, autoErrors: prev }));
      alert(`상태 변경에 실패했어요.\n\n${error.message || error}\n\n(Supabase 마이그레이션이 아직 적용 안 됐다면 SQL Editor에서 적용해주세요.)`);
    }
  };

  return { ...state, refetch, toggleErrorResolved, toggleAutoErrorGroup };
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
          <div style={labelStyle}>🚨 자동 캡처 오류</div>
          <div style={valStyle}>{(data.autoErrors || []).length}건</div>
          <div style={subValStyle}>최근 24h {(data.autoErrors || []).filter((r) => Date.now() - new Date(r.created_at).getTime() < 86400000).length}건</div>
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
// 자동 오류 탭 — client_errors fingerprint 단위로 그룹핑
// ───────────────────────────────────────────────────────────────────────────
function AutoErrorsTab({ data }) {
  const [sourceFilter, setSourceFilter] = useState('all');
  const [windowFilter, setWindowFilter] = useState('7d');
  const [hideResolved, setHideResolved] = useState(true);

  const filtered = useMemo(() => {
    const now = Date.now();
    const windowMs = windowFilter === '24h' ? 86400000
                   : windowFilter === '7d'  ? 7 * 86400000
                   : windowFilter === '30d' ? 30 * 86400000
                   : Infinity;
    let rows = data.autoErrors || [];
    if (sourceFilter !== 'all') rows = rows.filter((r) => r.source === sourceFilter);
    if (windowMs !== Infinity) rows = rows.filter((r) => now - new Date(r.created_at).getTime() < windowMs);
    return rows;
  }, [data.autoErrors, sourceFilter, windowFilter]);

  // fingerprint 단위 그룹핑
  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      const key = r.fingerprint;
      const g = map.get(key);
      if (!g) {
        map.set(key, {
          fingerprint: key,
          message: r.message,
          source: r.source,
          url: r.url,
          stack: r.stack,
          count: 1,
          users: new Set(r.user_id ? [r.user_id] : []),
          sessions: new Set([r.session_id]),
          firstAt: r.created_at,
          lastAt: r.created_at,
          samples: [r],
          unresolvedCount: r.resolved_at ? 0 : 1,
        });
      } else {
        g.count++;
        if (r.user_id) g.users.add(r.user_id);
        g.sessions.add(r.session_id);
        if (new Date(r.created_at) > new Date(g.lastAt)) g.lastAt = r.created_at;
        if (new Date(r.created_at) < new Date(g.firstAt)) g.firstAt = r.created_at;
        if (g.samples.length < 5) g.samples.push(r);
        if (!r.resolved_at) g.unresolvedCount++;
      }
    });
    // 모든 row가 resolved 인 그룹은 allResolved 표시
    const arr = Array.from(map.values()).map((g) => ({ ...g, allResolved: g.unresolvedCount === 0 }));
    const visible = hideResolved ? arr.filter((g) => !g.allResolved) : arr;
    return visible.sort((a, b) => {
      // 미해결 우선 → 최근 발생 → 발생 횟수
      if (a.allResolved !== b.allResolved) return a.allResolved ? 1 : -1;
      const dt = new Date(b.lastAt) - new Date(a.lastAt);
      if (dt !== 0) return dt;
      return b.count - a.count;
    });
  }, [filtered, hideResolved]);

  const resolvedGroupCount = useMemo(() => {
    const seen = new Map();
    (data.autoErrors || []).forEach((r) => {
      const g = seen.get(r.fingerprint) || { total: 0, resolved: 0 };
      g.total++;
      if (r.resolved_at) g.resolved++;
      seen.set(r.fingerprint, g);
    });
    let n = 0;
    seen.forEach((g) => { if (g.resolved === g.total && g.total > 0) n++; });
    return n;
  }, [data.autoErrors]);

  const sources = [
    { id: 'all',     label: `전체 (${(data.autoErrors || []).length})` },
    { id: 'window',  label: '🌐 JS 오류' },
    { id: 'promise', label: '⛓️ Promise' },
    { id: 'react',   label: '⚛️ React 크래시' },
    { id: 'manual',  label: '✋ 수동' },
  ];
  const windows = [
    { id: '24h', label: '24시간' },
    { id: '7d',  label: '7일' },
    { id: '30d', label: '30일' },
    { id: 'all', label: '전체' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {sources.map((s) => (
          <button
            key={s.id}
            onClick={() => setSourceFilter(s.id)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12,
              border: '1px solid', borderColor: sourceFilter === s.id ? 'var(--c-accent)' : 'var(--c-border3)',
              background: sourceFilter === s.id ? 'var(--c-active)' : 'transparent',
              color: sourceFilter === s.id ? 'var(--c-accent)' : 'var(--c-text4)',
              cursor: 'pointer',
            }}
          >{s.label}</button>
        ))}
        <span style={{ width: 1, height: 16, background: 'var(--c-border3)', margin: '0 4px' }} />
        {windows.map((w) => (
          <button
            key={w.id}
            onClick={() => setWindowFilter(w.id)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12,
              border: '1px solid', borderColor: windowFilter === w.id ? 'var(--c-accent)' : 'var(--c-border3)',
              background: windowFilter === w.id ? 'var(--c-active)' : 'transparent',
              color: windowFilter === w.id ? 'var(--c-accent)' : 'var(--c-text4)',
              cursor: 'pointer',
            }}
          >{w.label}</button>
        ))}
        <label
          className="flex items-center gap-1.5 cursor-pointer"
          style={{ fontSize: 11, color: 'var(--c-text4)', marginLeft: 4 }}
        >
          <input
            type="checkbox"
            checked={hideResolved}
            onChange={(e) => setHideResolved(e.target.checked)}
            style={{ accentColor: 'var(--c-accent)', width: 13, height: 13, cursor: 'pointer' }}
          />
          해결됨 숨김 ({resolvedGroupCount})
        </label>
      </div>

      <div style={cardStyle}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>
          {groups.length}개 그룹 · 총 {filtered.length}건 (미해결 → 최근 발생순)
        </div>
        {groups.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--c-text6)', padding: '20px 0', textAlign: 'center' }}>
            기록된 자동 오류가 없습니다 🎉
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <AutoErrorGroup
                key={g.fingerprint}
                group={g}
                onToggleResolved={() => data.toggleAutoErrorGroup?.(g.fingerprint, g.allResolved)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AutoErrorGroup({ group, onToggleResolved }) {
  const [open, setOpen] = useState(false);
  const sourceLabel = group.source === 'window' ? '🌐' : group.source === 'promise' ? '⛓️' : group.source === 'react' ? '⚛️' : '✋';
  const resolved = !!group.allResolved;
  return (
    <div style={{
      borderTop: '1px solid var(--c-border3)', paddingTop: 8,
      opacity: resolved ? 0.45 : 1,
    }}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={resolved}
          onChange={(e) => { e.stopPropagation(); onToggleResolved?.(); }}
          onClick={(e) => e.stopPropagation()}
          title={resolved ? '이 그룹의 모든 발생이 해결됨으로 표시됨 (같은 오류가 새로 들어오면 자동 재노출)' : '이 fingerprint 의 모든 발생을 확인·수정 완료로 표시'}
          style={{ accentColor: 'var(--c-accent)', width: 14, height: 14, cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
        />
        <span style={{ fontSize: 12, minWidth: 18, cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>{sourceLabel}</span>
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
          <div style={{ fontSize: 12.5, color: 'var(--c-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: open ? 'normal' : 'nowrap', fontWeight: 500, textDecoration: resolved ? 'line-through' : 'none' }}>
            {group.message}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--c-text6)', marginTop: 2 }}>
            {fmtRelative(group.lastAt)} · 발생 {group.count}회 · 영향 {group.users.size > 0 ? `유저 ${group.users.size}명` : '로그인 X'} · 세션 {group.sessions.size}개
            {!resolved && group.unresolvedCount < group.count && (
              <span style={{ color: 'var(--c-accent2)', marginLeft: 6 }}>· 미해결 {group.unresolvedCount}/{group.count}</span>
            )}
          </div>
        </div>
        <span style={{ fontSize: 10, color: 'var(--c-text6)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--c-input)', borderRadius: 6, fontSize: 11, color: 'var(--c-text5)', lineHeight: 1.7 }}>
          <div><strong style={{ color: 'var(--c-text3)' }}>최초 발생:</strong> {fmtDateTime(group.firstAt)}</div>
          <div><strong style={{ color: 'var(--c-text3)' }}>최근 발생:</strong> {fmtDateTime(group.lastAt)}</div>
          <div><strong style={{ color: 'var(--c-text3)' }}>URL:</strong> {group.url || '—'}</div>
          {group.stack && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--c-text6)' }}>스택 트레이스</summary>
              <pre style={{
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                fontSize: 10, color: 'var(--c-text5)', background: 'var(--c-bg)',
                padding: 8, borderRadius: 4, marginTop: 6, maxHeight: 240, overflow: 'auto',
              }}>
{group.stack}
              </pre>
            </details>
          )}
          {group.samples.length > 1 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--c-text6)' }}>최근 샘플 {group.samples.length}건 (User-Agent 등)</summary>
              <div style={{ marginTop: 6 }}>
                {group.samples.map((s) => (
                  <div key={s.id} style={{ paddingTop: 6, borderTop: '1px dashed var(--c-border3)', fontSize: 10 }}>
                    <div>{fmtDateTime(s.created_at)} · user_id: {shortId(s.user_id)} · session: {shortId(s.session_id)}</div>
                    <div style={{ color: 'var(--c-text6)' }}>{s.user_agent || '—'}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 오류 보고 탭
// ───────────────────────────────────────────────────────────────────────────
function ErrorsTab({ data }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [hideResolved, setHideResolved] = useState(true);

  const filtered = useMemo(() => {
    let rows = data.errors;
    if (filter !== 'all') rows = rows.filter((r) => r.type === filter);
    if (hideResolved) rows = rows.filter((r) => !r.resolved_at);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => (r.description || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q));
    return rows;
  }, [data.errors, filter, search, hideResolved]);

  const types = [
    { id: 'all', label: '전체' },
    { id: 'bug', label: '🐞 버그' },
    { id: 'ui', label: '🎨 화면' },
    { id: 'feature', label: '💡 제안' },
    { id: 'other', label: '📝 기타' },
  ];

  const resolvedCount = data.errors.filter((r) => r.resolved_at).length;

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
        <label
          className="flex items-center gap-1.5 cursor-pointer"
          style={{ fontSize: 11, color: 'var(--c-text4)', marginLeft: 4 }}
        >
          <input
            type="checkbox"
            checked={hideResolved}
            onChange={(e) => setHideResolved(e.target.checked)}
            style={{ accentColor: 'var(--c-accent)', width: 13, height: 13, cursor: 'pointer' }}
          />
          해결됨 숨김 ({resolvedCount})
        </label>
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
            {filtered.map((r) => <ErrorRow key={r.id} row={r} onToggleResolved={data.toggleErrorResolved} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorRow({ row, onToggleResolved }) {
  const [open, setOpen] = useState(false);
  const resolved = !!row.resolved_at;
  return (
    <div style={{
      borderTop: '1px solid var(--c-border3)', paddingTop: 8,
      opacity: resolved ? 0.45 : 1,
    }}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={resolved}
          onChange={(e) => { e.stopPropagation(); onToggleResolved?.(row); }}
          onClick={(e) => e.stopPropagation()}
          title={resolved ? `해결됨 (${fmtDateTime(row.resolved_at)})` : '확인·수정 완료 표시'}
          style={{ accentColor: 'var(--c-accent)', width: 14, height: 14, cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
        />
        <div className="flex items-start gap-3 cursor-pointer" style={{ flex: 1, minWidth: 0 }} onClick={() => setOpen((v) => !v)}>
          <span style={{ fontSize: 11, color: 'var(--c-text6)', minWidth: 90, tabularNums: true, textDecoration: resolved ? 'line-through' : 'none' }}>{fmtDateTime(row.created_at)}</span>
          <span style={{ fontSize: 11, color: 'var(--c-text5)', minWidth: 56 }}>{row.type}</span>
          <span style={{ fontSize: 12, color: 'var(--c-text3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: open ? 'normal' : 'nowrap', textDecoration: resolved ? 'line-through' : 'none' }}>
            {row.description}
          </span>
          <span style={{ fontSize: 10, color: 'var(--c-text6)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 8, marginLeft: 22, fontSize: 11, color: 'var(--c-text5)', lineHeight: 1.7 }}>
          <div>이메일: {row.email || '—'}</div>
          <div>user_id: {shortId(row.user_id)}</div>
          <div>page: {row.page || '—'}</div>
          <div>source: {row.source || '—'}</div>
          {resolved && <div style={{ color: 'var(--c-accent2)' }}>해결됨: {fmtDateTime(row.resolved_at)}</div>}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 설문 응답 탭
// ───────────────────────────────────────────────────────────────────────────
function SurveyTab({ data }) {
  const [viewMode, setViewMode] = useState('byQuestion'); // 'byRespondent' | 'byQuestion'
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

  const views = [
    { id: 'byQuestion',   label: '📋 질문별 보기' },
    { id: 'byRespondent', label: '👤 응답자별 보기' },
  ];

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

      {/* 뷰 모드 토글 */}
      <div className="flex items-center gap-2 flex-wrap">
        {views.map((v) => (
          <button
            key={v.id}
            onClick={() => setViewMode(v.id)}
            style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: '1px solid', borderColor: viewMode === v.id ? 'var(--c-accent)' : 'var(--c-border3)',
              background: viewMode === v.id ? 'var(--c-active)' : 'transparent',
              color: viewMode === v.id ? 'var(--c-accent)' : 'var(--c-text4)',
              cursor: 'pointer',
            }}
          >{v.label}</button>
        ))}
      </div>

      {viewMode === 'byRespondent' && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 11, color: 'var(--c-text6)' }}>정렬:</span>
            {[
              { id: 'eligibleFirst', label: '추첨 자격 우선' },
              { id: 'recent', label: '최신순' },
              { id: 'nps', label: '추천도 높은 순' },
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
        </>
      )}

      {viewMode === 'byQuestion' && (
        <div className="flex flex-col gap-3">
          {data.surveys.length === 0 ? (
            <div style={{ ...cardStyle, fontSize: 13, color: 'var(--c-text6)', textAlign: 'center', padding: '40px 0' }}>
              데이터가 없습니다
            </div>
          ) : (
            SURVEY_QUESTIONS.filter((q) => !q.subOf).map((q) => (
              <QuestionAggregateCard key={q.key} question={q} responses={data.surveys} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── 질문별 집계 카드 ──────────────────────────────────────────────────────
function QuestionAggregateCard({ question, responses }) {
  const [open, setOpen] = useState(false);

  // 응답한 사람만 모음 (빈 답변은 제외)
  const answered = useMemo(() => {
    return responses
      .filter((r) => !isEmptyAnswer(r[question.key]))
      .map((r) => ({
        value: r[question.key],
        email: r.q20_email,
        created_at: r.created_at,
        eligible: !!r.q_work_status_link,
        // sub-question(q9_detail/q10_detail)는 부모와 같은 row에서 같이 보여줘야 의미가 있음
        subDetail: question.key === 'q9' ? r.q9_detail
                 : question.key === 'q10' ? r.q10_detail
                 : null,
      }));
  }, [responses, question.key]);

  const totalResponses = responses.length;
  const answeredCount = answered.length;
  const responseRate = totalResponses > 0 ? Math.round((answeredCount / totalResponses) * 100) : 0;

  // 척도/배열 답변은 항상 펼친 상태(전체가 짧음), 텍스트는 응답 수가 많으면 접어둠
  const defaultOpen = question.kind === 'scale' || question.kind === 'array' || answeredCount <= 10;
  const isOpen = open || defaultOpen;

  return (
    <div style={cardStyle}>
      <div
        className="flex items-start gap-2 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text2)', lineHeight: 1.5 }}>
            {question.label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-text6)', marginTop: 3 }}>
            응답 {answeredCount}명 · 응답률 {responseRate}%
          </div>
        </div>
        {!defaultOpen && (
          <span style={{ fontSize: 11, color: 'var(--c-text6)', marginTop: 2 }}>{isOpen ? '▲' : '▼'}</span>
        )}
      </div>

      {isOpen && answeredCount > 0 && (
        <div style={{ marginTop: 14 }}>
          {question.kind === 'scale' && <ScaleSummary question={question} answered={answered} />}
          {question.kind === 'array' && <ArraySummary answered={answered} />}
          {(question.kind === 'text' || question.kind === 'link') && (
            <TextResponseList question={question} answered={answered} />
          )}
        </div>
      )}
    </div>
  );
}

function ScaleSummary({ question, answered }) {
  // 1~10 분포 + 평균 (+ NPS-style: 9~10 추천 / 7~8 중립 / 1~6 비추천)
  const counts = new Array(10).fill(0); // index 0=1점 ~ 9=10점
  let sum = 0, n = 0;
  answered.forEach((a) => {
    const v = Number(a.value);
    if (v >= 1 && v <= 10) {
      counts[v - 1]++;
      sum += v;
      n++;
    }
  });
  const avg = n > 0 ? (sum / n).toFixed(2) : '—';
  const max = Math.max(...counts, 1);
  const promoters = counts[8] + counts[9];          // 9, 10
  const passives = counts[6] + counts[7];           // 7, 8
  const detractors = counts.slice(0, 6).reduce((s, c) => s + c, 0); // 1~6
  const npsLike = n > 0 ? Math.round(((promoters - detractors) / n) * 100) : 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-accent)' }}>{avg}</span>
        <span style={{ fontSize: 11, color: 'var(--c-text6)' }}>평균 (1~10)</span>
        <span style={{ fontSize: 11, color: 'var(--c-text5)' }}>
          · 추천 {promoters} · 중립 {passives} · 비추천 {detractors}
          {' '}<span style={{ color: 'var(--c-text6)' }}>(NPS-style {npsLike >= 0 ? '+' : ''}{npsLike})</span>
        </span>
        {question.leftLabel && question.rightLabel && (
          <span style={{ fontSize: 10, color: 'var(--c-text6)', marginLeft: 'auto' }}>
            {question.leftLabel} ↔ {question.rightLabel}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => {
          const c = counts[score - 1];
          const pct = c / max;
          // NPS 색상: 9~10 promoters, 7~8 passives, 1~6 detractors
          const color = score >= 9 ? 'var(--c-accent)'
                      : score >= 7 ? 'var(--c-accent2)'
                      : 'var(--c-border3)';
          return (
            <div key={score} className="flex items-center gap-2">
              <span style={{ fontSize: 11, color: 'var(--c-text5)', width: 28, textAlign: 'right', tabularNums: true }}>
                {score}점
              </span>
              <div style={{ flex: 1, height: 14, background: 'var(--c-input)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(pct * 100, c > 0 ? 4 : 0)}%`,
                    background: color,
                    transition: 'width 0.2s',
                  }}
                />
              </div>
              <span style={{ fontSize: 11, color: 'var(--c-text5)', width: 36, tabularNums: true }}>{c}명</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArraySummary({ answered }) {
  // 항목별 빈도 카운트
  const freq = new Map();
  answered.forEach((a) => {
    (a.value || []).forEach((item) => {
      const label = String(item).replace(/^__other__:/, '기타: ');
      freq.set(label, (freq.get(label) || 0) + 1);
    });
  });
  const ranked = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
  const max = ranked.length > 0 ? ranked[0][1] : 1;
  const total = answered.length;
  return (
    <div className="flex flex-col gap-1.5">
      {ranked.map(([label, count]) => {
        const pct = count / max;
        const sharePct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={label} className="flex items-center gap-2">
            <span style={{ fontSize: 12, color: 'var(--c-text3)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </span>
            <div style={{ width: 120, height: 14, background: 'var(--c-input)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ height: '100%', width: `${pct * 100}%`, background: 'var(--c-accent2)' }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--c-text5)', width: 64, textAlign: 'right', tabularNums: true, flexShrink: 0 }}>
              {count}명 ({sharePct}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TextResponseList({ question, answered }) {
  // 최근순으로 정렬
  const sorted = [...answered].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return (
    <div className="flex flex-col gap-2">
      {sorted.map((a, i) => (
        <div
          key={i}
          style={{
            padding: '8px 10px',
            background: 'var(--c-input)',
            borderRadius: 6,
            borderLeft: '3px solid var(--c-border3)',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--c-text2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
            {question.kind === 'link' ? (
              <a href={a.value} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--c-accent)' }}>
                {a.value}
              </a>
            ) : (
              String(a.value).replace(/^__other__:/, '기타: ')
            )}
          </div>
          {a.subDetail && (
            <div style={{
              marginTop: 6, padding: '6px 8px', background: 'var(--c-bg)', borderRadius: 4,
              fontSize: 12, color: 'var(--c-text3)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}>
              <span style={{ color: 'var(--c-text6)', fontSize: 10, marginRight: 4 }}>↳ 상세:</span>
              {a.subDetail}
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--c-text6)' }}>
            {a.eligible && <span style={{ color: '#d97706', marginRight: 4 }}>🏆</span>}
            {a.email || '(이메일 없음)'} · {fmtDateTime(a.created_at)}
          </div>
        </div>
      ))}
    </div>
  );
}

function isEmptyAnswer(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'number') return false;
  return false;
}

function SurveyAnswerValue({ q, value }) {
  if (isEmptyAnswer(value)) {
    return <span style={{ color: 'var(--c-text6)' }}>—</span>;
  }
  if (q.kind === 'scale') {
    const n = Number(value);
    const clamped = Math.max(0, Math.min(10, n));
    const dots = '●'.repeat(clamped) + '○'.repeat(Math.max(0, 10 - clamped));
    return (
      <span>
        <span style={{ color: 'var(--c-accent)', letterSpacing: 1 }}>{dots}</span>
        <span style={{ marginLeft: 8 }}>{n} / 10</span>
        {q.leftLabel && q.rightLabel && (
          <span style={{ color: 'var(--c-text6)', marginLeft: 8, fontSize: 10 }}>
            ({q.leftLabel} ↔ {q.rightLabel})
          </span>
        )}
      </span>
    );
  }
  if (q.kind === 'array') {
    return (
      <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'disc' }}>
        {value.map((v, i) => (
          <li key={i} style={{ marginBottom: 2 }}>{String(v).replace(/^__other__:/, '기타: ')}</li>
        ))}
      </ul>
    );
  }
  if (q.kind === 'link') {
    return (
      <a href={value} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--c-accent)', wordBreak: 'break-all' }}>
        {value}
      </a>
    );
  }
  return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(value).replace(/^__other__:/, '기타: ')}</span>;
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
        <span style={{ fontSize: 11, color: 'var(--c-text5)' }}>추천 {row.q14 ?? '—'}/10</span>
        <span style={{ fontSize: 10, color: 'var(--c-text6)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--c-input)', borderRadius: 8 }}>
          {SURVEY_QUESTIONS.map((q) => {
            const v = row[q.key];
            // 빈 답변은 숨김 (sub 질문이거나, 사용자가 미응답)
            if (isEmptyAnswer(v)) return null;
            // sub-of 부모가 비어있으면 함께 숨김
            if (q.subOf && isEmptyAnswer(row[q.subOf])) return null;
            return (
              <div key={q.key} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px dashed var(--c-border3)' }}>
                <div style={{ fontSize: 11, color: 'var(--c-text5)', fontWeight: 600, marginBottom: 4 }}>
                  {q.label}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--c-text2)', lineHeight: 1.7 }}>
                  <SurveyAnswerValue q={q} value={v} />
                </div>
              </div>
            );
          })}
          <details style={{ marginTop: 4 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--c-text6)', fontSize: 11 }}>전체 응답 보기 (JSON)</summary>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 10, color: 'var(--c-text5)', background: 'var(--c-bg)', padding: 8, borderRadius: 4, marginTop: 6 }}>
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
  const [expiryFilter, setExpiryFilter] = useState('all'); // 'all' | 'active' | 'expired'
  const SHARES_PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  // 필터 변경 시 첫 페이지로
  useEffect(() => { setPage(0); }, [typeFilter, expiryFilter]);

  // review_links 만 만료 개념이 있음 — 다른 종류는 항상 'active' 취급
  const isExpired = (r) => {
    if (r.type !== 'review_link') return false;
    const exp = r.raw?.expires_at;
    if (!exp) return false;
    return new Date(exp).getTime() < Date.now();
  };

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

  const filtered = useMemo(() => {
    let rows = unified;
    if (typeFilter !== 'all') rows = rows.filter((r) => r.type === typeFilter);
    if (expiryFilter === 'active')  rows = rows.filter((r) => !isExpired(r));
    if (expiryFilter === 'expired') rows = rows.filter((r) => isExpired(r));
    return rows;
  }, [unified, typeFilter, expiryFilter]);

  const expiredReviewLinkCount = useMemo(
    () => unified.filter((r) => r.type === 'review_link' && isExpired(r)).length,
    [unified]
  );

  const types = [
    { id: 'all',             label: `전체 (${unified.length})` },
    { id: 'shared_script',   label: `대본 (${data.shared.length})` },
    { id: 'review_link',     label: `검토 (${data.reviewLinks.length})` },
    { id: 'feedback_version',label: `버전 (${data.feedbackVersions.length})` },
    { id: 'feedback_session',label: `세션 (${data.feedbackSessions.length})` },
  ];
  const expiryOptions = [
    { id: 'all',     label: '전체' },
    { id: 'active',  label: '활성' },
    { id: 'expired', label: `만료 (${expiredReviewLinkCount})` },
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
        <span style={{ width: 1, height: 16, background: 'var(--c-border3)', margin: '0 4px' }} />
        {expiryOptions.map((o) => (
          <button
            key={o.id}
            onClick={() => setExpiryFilter(o.id)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12,
              border: '1px solid', borderColor: expiryFilter === o.id ? 'var(--c-accent)' : 'var(--c-border3)',
              background: expiryFilter === o.id ? 'var(--c-active)' : 'transparent',
              color: expiryFilter === o.id ? 'var(--c-accent)' : 'var(--c-text4)',
              cursor: 'pointer',
            }}
          >{o.label}</button>
        ))}
      </div>

      <div style={cardStyle}>
        {(() => {
          const totalPages = Math.max(1, Math.ceil(filtered.length / SHARES_PAGE_SIZE));
          const safePage = Math.min(page, totalPages - 1);
          const startIdx = safePage * SHARES_PAGE_SIZE;
          const paged = filtered.slice(startIdx, startIdx + SHARES_PAGE_SIZE);
          return (
            <>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <div style={labelStyle}>
                  총 {filtered.length}건
                  {filtered.length > SHARES_PAGE_SIZE && (
                    <span style={{ fontSize: 9, color: 'var(--c-text6)', textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>
                      · {startIdx + 1}–{Math.min(startIdx + SHARES_PAGE_SIZE, filtered.length)}
                    </span>
                  )}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={safePage === 0}
                      style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        border: '1px solid var(--c-border3)', background: 'transparent',
                        color: safePage === 0 ? 'var(--c-text6)' : 'var(--c-text3)',
                        cursor: safePage === 0 ? 'not-allowed' : 'pointer',
                      }}
                    >이전</button>
                    <span className="tabular-nums" style={{ fontSize: 11, color: 'var(--c-text5)', minWidth: 48, textAlign: 'center' }}>
                      {safePage + 1} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={safePage >= totalPages - 1}
                      style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        border: '1px solid var(--c-border3)', background: 'transparent',
                        color: safePage >= totalPages - 1 ? 'var(--c-text6)' : 'var(--c-text3)',
                        cursor: safePage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                      }}
                    >다음</button>
                  </div>
                )}
              </div>
              {filtered.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--c-text6)', padding: '20px 0', textAlign: 'center' }}>데이터가 없습니다</div>
              ) : (
                <div className="space-y-1">
                  {paged.map((r, i) => {
                    const expired = isExpired(r);
                    return (
                      <div
                        key={`${r.type}-${r.raw?.id || i}`}
                        className="flex items-center gap-3"
                        style={{
                          borderTop: '1px solid var(--c-border3)',
                          paddingTop: 6,
                          opacity: expired ? 0.55 : 1,
                        }}
                      >
                        <span style={{ fontSize: 11, color: 'var(--c-text6)', minWidth: 90, tabularNums: true }}>{fmtDateTime(r.ts)}</span>
                        <span style={{ fontSize: 11, color: 'var(--c-text5)', minWidth: 100 }}>{r.label}</span>
                        {r.type === 'review_link' && (
                          <span style={{
                            fontSize: 9.5, padding: '1px 6px', borderRadius: 8,
                            background: expired ? 'var(--c-tag, var(--c-input))' : 'var(--c-active)',
                            color: expired ? 'var(--c-text6)' : 'var(--c-accent2)',
                            border: `1px solid ${expired ? 'var(--c-border3)' : 'var(--c-accent2)'}`,
                            flexShrink: 0,
                          }}>
                            {expired ? '만료' : '활성'}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--c-text4)', minWidth: 90 }}>user: {shortId(r.user)}</span>
                        <span style={{ fontSize: 11, color: 'var(--c-text3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ref}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1" style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--c-border3)' }}>
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 4,
                      border: '1px solid var(--c-border3)', background: 'transparent',
                      color: safePage === 0 ? 'var(--c-text6)' : 'var(--c-text3)',
                      cursor: safePage === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >← 이전</button>
                  <span className="tabular-nums" style={{ fontSize: 11, color: 'var(--c-text5)', minWidth: 48, textAlign: 'center' }}>
                    {safePage + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={safePage >= totalPages - 1}
                    style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 4,
                      border: '1px solid var(--c-border3)', background: 'transparent',
                      color: safePage >= totalPages - 1 ? 'var(--c-text6)' : 'var(--c-text3)',
                      cursor: safePage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                    }}
                  >다음 →</button>
                </div>
              )}
            </>
          );
        })()}
      </div>

      <div style={{ ...cardStyle, fontSize: 11, color: 'var(--c-text5)', lineHeight: 1.6 }}>
        ℹ️ 검토링크는 발행 후 7일까지 유효하고, 만료 + 30일 = 발행 37일 후 DB 에서 자동 삭제(pg_cron 일간 작업).
        feedback_versions 도 같이 정리됨. Drive 첨부 파일은 작가의 OAuth 권한이 필요해 서버에서 자동 삭제가 어렵고
        별도 client-side 정리는 추후 작업.
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

  // 진입 시 unread breakdown 스냅샷 → 탭 옆 빨간점에 사용. 스냅샷 후 last_visit_at 갱신.
  // 사용자가 탭을 직접 누르면 그 탭의 카운트는 로컬에서 0 으로 떨어뜨려 점 제거.
  const [unread, setUnread] = useState({
    unresolved_error_reports: 0,
    unresolved_client_errors: 0,
    new_survey_responses: 0,
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { breakdown } = await fetchAdminUnreadCounts();
      if (!cancelled && breakdown) setUnread(breakdown);
      await markAdminVisited();
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSelectTab = (id) => {
    setActiveTab(id);
    const key = TAB_UNREAD_KEY[id];
    if (key) setUnread((u) => ({ ...u, [key]: 0 }));
  };

  const goBack = () => { window.location.hash = ''; };

  if (!supabase) {
    return (
      <div style={{ padding: 40, color: '#999', fontSize: 14 }}>
        Supabase 미설정. 어드민 데이터를 불러올 수 없습니다.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ background: 'var(--c-bg)', height: '100vh' }}>
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
          {TABS.map((t) => {
            const unreadKey = TAB_UNREAD_KEY[t.id];
            const count = unreadKey ? unread[unreadKey] : 0;
            return (
              <button
                key={t.id}
                onClick={() => handleSelectTab(t.id)}
                style={{
                  padding: '8px 14px',
                  fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400,
                  color: activeTab === t.id ? 'var(--c-accent)' : 'var(--c-text5)',
                  background: 'none', border: 'none',
                  borderBottom: activeTab === t.id ? '2px solid var(--c-accent)' : '2px solid transparent',
                  cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <span>{t.label}</span>
                {count > 0 && (
                  <span
                    aria-label={`새 자료 ${count}건`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: 16, height: 16, padding: '0 5px',
                      borderRadius: 8, background: '#ef4444', color: '#fff',
                      fontSize: 10, fontWeight: 700, lineHeight: 1,
                    }}
                  >{count > 99 ? '99+' : count}</span>
                )}
              </button>
            );
          })}
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
              {activeTab === 'dashboard'  && <DashboardTab data={data} />}
              {activeTab === 'autoErrors' && <AutoErrorsTab data={data} />}
              {activeTab === 'errors'     && <ErrorsTab data={data} />}
              {activeTab === 'survey'     && <SurveyTab data={data} />}
              {activeTab === 'shares'     && <SharesTab data={data} />}
              {activeTab === 'contests'   && <ContestsAdminTab />}
              {activeTab === 'paid'       && <PaidEstimateTab data={data} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
