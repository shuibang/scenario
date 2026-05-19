/**
 * ContestsAdminTab — 어드민용 공모전 검토/관리 탭
 *
 * - 상단: 검토 대기 큐 (pending_review) — 승인/반려/편집
 * - 하단: 활성 공모전 목록 (active) — 편집/마감처리/삭제
 * - 수동 등록 폼 (간단)
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  fetchPendingContests,
  fetchAllContests,
  fetchPastContests,
  approveContest,
  rejectContest,
  updateContest,
  deleteContest,
  createContestManual,
  CONTEST_CATEGORIES,
  loadLastSelectedCategories,
  saveLastSelectedCategories,
} from '../../store/contestsApi';

const SOURCE_LABELS = {
  manual: '수동',
  rss: 'RSS',
  scrape: '자동',
  user_report: '제보',
};

export default function ContestsAdminTab() {
  const [pending, setPending] = useState([]);
  const [active, setActive] = useState([]);
  const [past, setPast] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // contest 객체
  const [showCreate, setShowCreate] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, a, pst] = await Promise.all([
        fetchPendingContests(),
        fetchAllContests({ statusFilter: 'active', limit: 200 }),
        fetchPastContests({ daysWindow: 90 }),
      ]);
      setPending(p);
      setActive(a);
      setPast(pst);
    } catch (err) {
      setError(err?.message || '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const onApprove = async (id) => {
    try { await approveContest(id); await reload(); } catch (e) { alert(e.message); }
  };
  const onReject = async (id) => {
    if (!confirm('이 공모전을 반려하시겠습니까?')) return;
    try { await rejectContest(id); await reload(); } catch (e) { alert(e.message); }
  };
  const onDelete = async (id) => {
    if (!confirm('완전 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    try { await deleteContest(id); await reload(); } catch (e) { alert(e.message); }
  };
  const onClose_ = async (id) => {
    try { await updateContest(id, { status: 'closed' }); await reload(); } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>🏆 공모전 검토</h3>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowCreate(true)} style={btnPrimary}>+ 수동 등록</button>
        <button onClick={reload} style={btnSecondary}>↻ 새로고침</button>
      </div>

      {error && (
        <div style={{ padding: 10, background: '#fee2e2', color: '#b91c1c', borderRadius: 4, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* 검토 대기 큐 */}
      <Section title={`검토 대기 (${pending.length})`} color="#d97706">
        {pending.length === 0
          ? <Empty>검토할 공모전이 없습니다.</Empty>
          : pending.map(c => (
              <ContestRow
                key={c.id}
                contest={c}
                onApprove={() => onApprove(c.id)}
                onReject={() => onReject(c.id)}
                onEdit={() => setEditing(c)}
                onDelete={() => onDelete(c.id)}
                isPending
              />
            ))
        }
      </Section>

      {/* 활성 공모전 */}
      <Section title={`활성 공모전 (${active.length})`} color="#15803d">
        {active.length === 0
          ? <Empty>활성 공모전이 없습니다.</Empty>
          : active.map(c => (
              <ContestRow
                key={c.id}
                contest={c}
                onEdit={() => setEditing(c)}
                onClose={() => onClose_(c.id)}
                onDelete={() => onDelete(c.id)}
              />
            ))
        }
      </Section>

      {/* 작년 같은 시기 공모전 — 올해도 열렸는지 확인용 */}
      <Section title={`작년 이맘때 공모전 (${past.length})`} color="#6b7280">
        <div style={{ fontSize: 11, color: 'var(--c-text6)', marginBottom: 8, lineHeight: 1.5 }}>
          작년 오늘 ±90일에 마감했던 공모전들. 원문 URL을 눌러 올해도 열렸는지 확인하고,
          열렸으면 위쪽 [+ 수동 등록]으로 새로 등록하세요.
        </div>
        {past.length === 0
          ? <Empty>작년 이맘때 마감 공모전이 없습니다.</Empty>
          : past.map(c => (
              <ContestRow
                key={c.id}
                contest={c}
                onEdit={() => setEditing(c)}
                onDelete={() => onDelete(c.id)}
              />
            ))
        }
      </Section>

      {editing && (
        <EditModal
          contest={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }}
        />
      )}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => { setShowCreate(false); await reload(); }}
        />
      )}
    </div>
  );
}

// ─── 하위 컴포넌트 ──────────────────────────────────────────────────────────

function Section({ title, color, children }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h4 style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 8, borderBottom: '1px solid var(--c-border3)', paddingBottom: 4 }}>
        {title}
      </h4>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--c-text6)', fontSize: 12 }}>{children}</div>;
}

function categoryList(cat) {
  if (!cat) return [];
  return Array.isArray(cat) ? cat : [cat];
}

function ContestRow({ contest, onApprove, onReject, onEdit, onClose, onDelete, isPending }) {
  const c = contest;
  const cats = categoryList(c.category);
  return (
    <div style={{
      padding: 10, marginBottom: 6, borderRadius: 6,
      border: '1px solid var(--c-border3)', background: 'var(--c-card)',
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', marginBottom: 3 }}>
          {c.title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--c-text5)', marginBottom: 4, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 6px' }}>
          {c.organizer && <span>{c.organizer}</span>}
          {cats.length > 0 && (
            <span style={{ display: 'inline-flex', gap: 3 }}>
              {cats.map((cat) => (
                <span key={cat} style={{
                  fontSize: 10, padding: '1px 5px', borderRadius: 3,
                  background: 'var(--c-tag)', color: 'var(--c-accent2)',
                }}>{cat}</span>
              ))}
            </span>
          )}
          <span>· 마감 {c.submit_end}</span>
          {c.prize && <span>· {c.prize}</span>}
          <span style={{ marginLeft: 4, padding: '1px 5px', background: 'var(--c-tag)', borderRadius: 3, fontSize: 10 }}>
            {SOURCE_LABELS[c.source_type] || c.source_type}
          </span>
        </div>
        <a href={c.source_url} target="_blank" rel="noopener noreferrer"
           style={{ fontSize: 11, color: 'var(--c-accent)' }}>
          {c.source_url}
        </a>
        {c.reporter_memo && (
          <div style={{ fontSize: 11, color: 'var(--c-text5)', marginTop: 4, padding: 6, background: 'var(--c-tag)', borderRadius: 4 }}>
            제보 메모: {c.reporter_memo}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        {isPending && (
          <>
            <button onClick={onApprove} style={btnApprove}>승인</button>
            <button onClick={onReject} style={btnReject}>반려</button>
          </>
        )}
        <button onClick={onEdit} style={btnSecondary}>편집</button>
        {!isPending && <button onClick={onClose} style={btnSecondary}>마감</button>}
        <button onClick={onDelete} style={btnDanger}>삭제</button>
      </div>
    </div>
  );
}

function EditModal({ contest, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: contest.title || '',
    organizer: contest.organizer || '',
    source_url: contest.source_url || '',
    poster_url: contest.poster_url || '',
    prize: contest.prize || '',
    category: categoryList(contest.category),
    submit_start: contest.submit_start || '',
    submit_end: contest.submit_end || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await updateContest(contest.id, {
        title: form.title.trim(),
        organizer: form.organizer.trim() || null,
        source_url: form.source_url.trim(),
        poster_url: form.poster_url.trim() || null,
        prize: form.prize.trim() || null,
        category: form.category,
        submit_start: form.submit_start || null,
        submit_end: form.submit_end,
      });
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="공모전 편집" onClose={onClose}>
      <FormFields form={form} upd={upd} />
      {err && <div style={{ padding: 8, background: '#fee2e2', color: '#b91c1c', borderRadius: 4, fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onClose} style={{ ...btnSecondary, flex: 1 }}>취소</button>
        <button onClick={save} disabled={saving} style={{ ...btnPrimary, flex: 1 }}>{saving ? '저장 중…' : '저장'}</button>
      </div>
    </ModalShell>
  );
}

function CreateModal({ onClose, onCreated }) {
  // 카테고리 만 마지막 선택 자동 복원 (등록 시 자주 같은 유형 반복).
  const [form, setForm] = useState(() => ({
    title: '', organizer: '', source_url: '', poster_url: '',
    prize: '', category: loadLastSelectedCategories(), submit_start: '', submit_end: '',
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await createContestManual({
        title: form.title.trim(),
        organizer: form.organizer.trim() || null,
        source_url: form.source_url.trim(),
        poster_url: form.poster_url.trim() || null,
        prize: form.prize.trim() || null,
        category: form.category,
        submit_start: form.submit_start || null,
        submit_end: form.submit_end,
      });
      onCreated();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="공모전 수동 등록 (즉시 활성)" onClose={onClose}>
      <FormFields form={form} upd={upd} />
      {err && <div style={{ padding: 8, background: '#fee2e2', color: '#b91c1c', borderRadius: 4, fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onClose} style={{ ...btnSecondary, flex: 1 }}>취소</button>
        <button onClick={save} disabled={saving} style={{ ...btnPrimary, flex: 1 }}>{saving ? '등록 중…' : '등록'}</button>
      </div>
    </ModalShell>
  );
}

function FormFields({ form, upd }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <FormRow label="제목 *">
        <input value={form.title} onChange={e => upd('title', e.target.value)} style={inputStyle} />
      </FormRow>
      <FormRow label="주최">
        <input value={form.organizer} onChange={e => upd('organizer', e.target.value)} style={inputStyle} />
      </FormRow>
      <FormRow label="원문 URL *">
        <input value={form.source_url} onChange={e => upd('source_url', e.target.value)} style={inputStyle} />
      </FormRow>
      <FormRow label="포스터 URL">
        <input value={form.poster_url} onChange={e => upd('poster_url', e.target.value)} style={inputStyle} />
      </FormRow>
      <div style={{ display: 'flex', gap: 8 }}>
        <FormRow label="접수 시작" style={{ flex: 1 }}>
          <input type="date" value={form.submit_start} onChange={e => upd('submit_start', e.target.value)} style={inputStyle} />
        </FormRow>
        <FormRow label="마감 *" style={{ flex: 1 }}>
          <input type="date" value={form.submit_end} onChange={e => upd('submit_end', e.target.value)} style={inputStyle} />
        </FormRow>
      </div>
      <FormRow label="카테고리 (복수 선택)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CONTEST_CATEGORIES.map((c) => {
            const cats = Array.isArray(form.category) ? form.category : [];
            const active = cats.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  const next = active ? cats.filter((x) => x !== c) : [...cats, c];
                  upd('category', next);
                  saveLastSelectedCategories(next);
                }}
                style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 12,
                  border: '1px solid ' + (active ? 'var(--c-accent)' : 'var(--c-border3)'),
                  background: active ? 'var(--c-accent)' : 'transparent',
                  color: active ? '#fff' : 'var(--c-text5)',
                  fontWeight: active ? 600 : 400, cursor: 'pointer',
                }}
              >{c}</button>
            );
          })}
        </div>
      </FormRow>
      <FormRow label="상금/시상">
        <input value={form.prize} onChange={e => upd('prize', e.target.value)} style={inputStyle} />
      </FormRow>
    </div>
  );
}

function FormRow({ label, children, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, ...style }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text5)' }}>{label}</span>
      {children}
    </label>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--c-panel)', border: '1px solid var(--c-border)',
        borderRadius: 10, padding: 16,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{title}</h3>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, color: 'var(--c-text5)', cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── 스타일 ──────────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '6px 8px', borderRadius: 4,
  border: '1px solid var(--c-border3)', background: 'var(--c-input)',
  color: 'var(--c-text)', fontSize: 12, fontFamily: 'inherit',
  boxSizing: 'border-box', outline: 'none',
};

const btnBase = {
  padding: '4px 10px', borderRadius: 4, border: 'none',
  fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

const btnPrimary  = { ...btnBase, background: 'var(--c-accent)', color: '#fff', padding: '6px 12px' };
const btnSecondary= { ...btnBase, background: 'transparent', color: 'var(--c-text5)', border: '1px solid var(--c-border3)' };
const btnApprove  = { ...btnBase, background: '#15803d', color: '#fff' };
const btnReject   = { ...btnBase, background: '#dc2626', color: '#fff' };
const btnDanger   = { ...btnBase, background: 'transparent', color: '#dc2626', border: '1px solid #fca5a5' };
