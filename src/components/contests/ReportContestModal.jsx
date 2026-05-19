/**
 * ReportContestModal — 사용자가 공모전 정보를 제보하는 모달.
 * 제출하면 status='pending_review' 로 들어가고, 어드민 검토 후 활성화됨.
 */
import React, { useState } from 'react';
import { reportContest, CONTEST_CATEGORIES, loadLastSelectedCategories, saveLastSelectedCategories } from '../../store/contestsApi';

export default function ReportContestModal({ onClose, onSubmitted }) {
  const [title, setTitle] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [prize, setPrize] = useState('');
  // 마지막 선택 자동 복원 — 같은 유형(단막/웹소설 등)을 반복 등록하는 패턴 지원.
  const [categories, setCategories] = useState(() => loadLastSelectedCategories());
  const [submitStart, setSubmitStart] = useState('');
  const [submitEnd, setSubmitEnd] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const toggleCategory = (cat) => {
    setCategories((prev) => {
      const next = prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat];
      saveLastSelectedCategories(next);
      return next;
    });
  };

  const onSubmit = async (e) => {
    e?.preventDefault?.();
    setError(null);
    setSubmitting(true);
    try {
      await reportContest({
        title,
        organizer: organizer || null,
        source_url: sourceUrl,
        prize: prize || null,
        category: categories,
        submit_start: submitStart || null,
        submit_end: submitEnd,
        reporter_memo: memo || null,
      });
      setSuccess(true);
      setTimeout(() => { onSubmitted?.(); }, 1200);
    } catch (err) {
      setError(err?.message || '제출 실패');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 12,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--c-panel)', border: '1px solid var(--c-border)',
          borderRadius: 10, padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', margin: 0 }}>
            공모전 제보
          </h3>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', fontSize: 18,
              color: 'var(--c-text5)', cursor: 'pointer', padding: 4,
            }}
          >×</button>
        </div>

        <div style={{ fontSize: 11, color: 'var(--c-text6)', marginBottom: 12, lineHeight: 1.5 }}>
          드라마 대본/극본 공모전이라면 제보해주세요. 운영진 확인 후 게시판에 올라갑니다.
        </div>

        {success ? (
          <div style={{ padding: '20px 8px', textAlign: 'center', color: '#15803d', fontWeight: 600 }}>
            ✓ 제보 완료! 검토 후 게시됩니다.
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="공모전명 *" required>
              <input
                type="text" value={title} onChange={e => setTitle(e.target.value)}
                required maxLength={200}
                style={inputStyle}
              />
            </Field>
            <Field label="주최">
              <input
                type="text" value={organizer} onChange={e => setOrganizer(e.target.value)}
                placeholder="예: KOCCA, KBS"
                maxLength={100} style={inputStyle}
              />
            </Field>
            <Field label="원문 URL *" required>
              <input
                type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}
                placeholder="https://..."
                required style={inputStyle}
              />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="접수 시작" style={{ flex: 1 }}>
                <input type="date" value={submitStart} onChange={e => setSubmitStart(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="마감일 *" style={{ flex: 1 }} required>
                <input type="date" value={submitEnd} onChange={e => setSubmitEnd(e.target.value)} required style={inputStyle} />
              </Field>
            </div>
            <Field label="카테고리 (복수 선택)">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CONTEST_CATEGORIES.map((c) => {
                  const active = categories.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCategory(c)}
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
            </Field>
            <Field label="상금/시상">
              <input
                type="text" value={prize} onChange={e => setPrize(e.target.value)}
                placeholder="예: 대상 3,000만원"
                maxLength={100} style={inputStyle}
              />
            </Field>
            <Field label="메모 (선택)">
              <textarea
                value={memo} onChange={e => setMemo(e.target.value)}
                placeholder="추가 정보가 있다면…"
                rows={2} maxLength={500}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </Field>

            {error && (
              <div style={{ padding: '8px 10px', background: '#fee2e2', color: '#b91c1c', borderRadius: 4, fontSize: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="button" onClick={onClose} disabled={submitting}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 6,
                  border: '1px solid var(--c-border3)', background: 'transparent',
                  color: 'var(--c-text5)', fontSize: 13, cursor: 'pointer',
                }}
              >취소</button>
              <button
                type="submit" disabled={submitting}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 6,
                  border: 'none', background: 'var(--c-accent)',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                }}
              >{submitting ? '제출 중…' : '제보하기'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '6px 8px', borderRadius: 5,
  border: '1px solid var(--c-border3)', background: 'var(--c-input)',
  color: 'var(--c-text)', fontSize: 12, fontFamily: 'inherit',
  boxSizing: 'border-box', outline: 'none',
};

function Field({ label, children, required, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, ...style }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text5)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}
