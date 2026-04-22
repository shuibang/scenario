import { useState } from 'react';
import { supabase } from '../../store/supabaseClient';

const ERROR_TYPES = [
  { id: 'bug',     label: '🐞 버그',      desc: '기능이 작동하지 않아요' },
  { id: 'ui',      label: '🎨 화면 오류',  desc: '화면이 이상하게 보여요' },
  { id: 'feature', label: '💡 기능 제안',  desc: '이런 기능이 있으면 좋겠어요' },
  { id: 'other',   label: '📝 기타',       desc: '그 외 문의사항' },
];

export default function DirectorErrorReportPage({ onBack, session, D }) {
  const [type, setType] = useState('bug');
  const [description, setDescription] = useState('');
  const [page, setPage] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | done | error

  const handleSubmit = async () => {
    if (!description.trim()) return;
    const lastAt = localStorage.getItem('error_report_last_at');
    if (lastAt && Date.now() - Number(lastAt) < 60 * 1000) return;
    setStatus('sending');
    if (!supabase) { setStatus('error'); return; }
    const userId = session?.user?.id ?? null;
    // source 구분: description 프리픽스에 [Director] 자동 삽입
    const { error } = await supabase.from('error_reports').insert({
      type,
      description: `[Director] ${description.trim()}`,
      page: page.trim() || null,
      email: email.trim() || null,
      user_id: userId,
    });
    if (!error) localStorage.setItem('error_report_last_at', String(Date.now()));
    setStatus(error ? 'error' : 'done');
  };

  const inputStyle = {
    width: '100%', background: D.card, border: `1px solid ${D.border}`,
    borderRadius: 6, padding: '8px 10px', fontSize: 13, color: D.text,
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: D.text3, marginBottom: 6, display: 'block' };

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
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: D.text, letterSpacing: '-0.01em' }}>오류 보고</h2>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 40px' }}>
        {status === 'done' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 60 }}>
            <div style={{ fontSize: 36 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: D.text }}>제출 완료!</div>
            <div style={{ fontSize: 12, color: D.text3, textAlign: 'center', lineHeight: 1.7 }}>
              소중한 피드백 감사합니다.<br />빠르게 검토하겠습니다.
            </div>
            <button
              onClick={() => { setStatus('idle'); setDescription(''); setPage(''); setType('bug'); setEmail(''); }}
              style={{ marginTop: 8, fontSize: 12, padding: '6px 16px', borderRadius: 6, border: `1px solid ${D.border}`, color: D.text3, background: 'transparent', cursor: 'pointer' }}
            >
              추가 제출
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 480, margin: '0 auto' }}>
            <div style={{ fontSize: 12, color: D.text3 }}>불편한 점이나 개선 아이디어를 알려주세요.</div>

            {/* 유형 */}
            <div>
              <span style={labelStyle}>유형</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {ERROR_TYPES.map(t => {
                  const active = type === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setType(t.id)}
                      style={{
                        textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                        border: `1px solid ${active ? D.accent : D.border}`,
                        background: active ? D.active : D.card,
                        color: active ? D.accent : D.text3,
                        cursor: 'pointer', fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{t.label}</div>
                      <div style={{ fontSize: 10, color: D.text3, marginTop: 2, opacity: 0.85 }}>{t.desc}</div>
                    </button>
                  );
                })}
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

            {/* 페이지 */}
            <div>
              <span style={labelStyle}>발생 화면 (선택)</span>
              <input
                value={page}
                onChange={e => setPage(e.target.value)}
                placeholder="예: 접속 기록, 대본 뷰어 등"
                style={inputStyle}
              />
            </div>

            {/* 이메일 */}
            <div>
              <span style={labelStyle}>답변 받을 이메일 (선택)</span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={session?.user?.email || 'you@example.com'}
                style={inputStyle}
              />
            </div>

            {/* 제출 */}
            <button
              onClick={handleSubmit}
              disabled={!description.trim() || status === 'sending'}
              style={{
                padding: '12px 16px', borderRadius: 8, border: 'none',
                background: (!description.trim() || status === 'sending') ? D.border : D.accent,
                color: (!description.trim() || status === 'sending') ? D.text3 : '#1a1a1a',
                fontSize: 13, fontWeight: 700,
                cursor: (!description.trim() || status === 'sending') ? 'default' : 'pointer',
              }}
            >
              {status === 'sending' ? '제출 중…' : '제출'}
            </button>

            {status === 'error' && (
              <div style={{ fontSize: 12, color: 'var(--c-error)', textAlign: 'center' }}>
                제출에 실패했습니다. 잠시 후 다시 시도해주세요.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
