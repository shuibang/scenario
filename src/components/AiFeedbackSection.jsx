/**
 * AiFeedbackSection — 피드백 노트 상단의 [AI] 절.
 *
 * 아래쪽 사람 피드백(Supabase 의 feedback_versions/sessions/comments)과 달리
 * AI 피드백은 대본에 딸린 로컬 데이터(state.aiFeedbacks)다. Supabase 에 저장하지 않는다.
 * 두 종류를 한 페이지에서 나란히 보되 저장소는 섞지 않는다.
 */
import React, { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { MODE_LABELS } from '../utils/aiFeedback';

function formatDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

/**
 * 모달은 App 이 소유한다(도구 메뉴에서도 열리므로). 여기서는 이벤트만 쏜다 —
 * 콜백을 넘기려면 CenterPanel 호출부 여러 곳에 프롭을 꿰야 해서, 코드베이스가
 * 이미 쓰는 window CustomEvent 버스(script:undo 등)를 따랐다.
 */
export const AI_FEEDBACK_OPEN_EVENT = 'ai-feedback:open';

export default function AiFeedbackSection() {
  const onRequest = () => window.dispatchEvent(new CustomEvent(AI_FEEDBACK_OPEN_EVENT));
  const { state, dispatch } = useApp();
  const { activeProjectId, aiFeedbacks } = state;
  const [openId, setOpenId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  // 최신순. 같은 회차를 여러 번 돌렸으면 모두 남으므로 이전 지적과 비교할 수 있다.
  const rows = useMemo(
    () =>
      (aiFeedbacks || [])
        .filter((row) => row?.projectId === activeProjectId)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    [aiFeedbacks, activeProjectId],
  );

  if (!activeProjectId) return null;

  const selected = rows.find((row) => row.id === openId) || null;

  return (
    <div style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-bg)', flexShrink: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
        }}
      >
        <Sparkles size={15} strokeWidth={1.75} style={{ color: 'var(--c-accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text2)' }}>AI 피드백</span>
        <span style={{ fontSize: 12, color: 'var(--c-text5)' }}>{rows.length > 0 ? `${rows.length}건` : ''}</span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onRequest}
          style={{
            padding: '6px 12px',
            borderRadius: 7,
            border: '1px solid var(--c-border)',
            background: 'var(--c-card)',
            color: 'var(--c-text2)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          AI 피드백 받기
        </button>
      </div>

      {rows.length === 0 ? (
        <p style={{ margin: 0, padding: '0 14px 12px', fontSize: 12, color: 'var(--c-text5)', lineHeight: 1.7 }}>
          피드백은 회차 단위로 받을 때 가장 깊고 구체적입니다.
        </p>
      ) : (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((row) => {
            const isOpen = row.id === openId;
            return (
              <div
                key={row.id}
                style={{
                  border: `1px solid ${isOpen ? 'var(--c-accent)' : 'var(--c-border)'}`,
                  borderRadius: 8,
                  background: 'var(--c-card)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : row.id)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--c-text2)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--c-accent)',
                        border: '1px solid var(--c-accent)',
                        borderRadius: 4,
                        padding: '1px 5px',
                        flexShrink: 0,
                      }}
                    >
                      AI
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                      {row.episodeNumber ? `${row.episodeNumber}회` : '회차 미상'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--c-text5)' }}>
                      {MODE_LABELS[row.mode] || row.mode} · {formatDate(row.createdAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(row.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--c-text6)',
                      fontSize: 12,
                      cursor: 'pointer',
                      padding: '2px 4px',
                      flexShrink: 0,
                    }}
                  >
                    삭제
                  </button>
                </div>

                {isOpen && (
                  <div
                    style={{
                      borderTop: '1px solid var(--c-border)',
                      padding: '10px 12px',
                      fontSize: 13,
                      lineHeight: 1.85,
                      color: 'var(--c-text3)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: 420,
                      overflowY: 'auto',
                    }}
                  >
                    {row.feedback}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 380,
              background: 'var(--c-card)',
              borderRadius: 12,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text2)' }}>이 AI 피드백을 삭제할까요?</div>
            <div style={{ fontSize: 13, color: 'var(--c-text4)', lineHeight: 1.7 }}>
              복구할 수 없습니다. 삭제하면 다음 요청의 이전 피드백 참고 대상에서도 빠집니다.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--c-border)',
                  background: 'var(--c-card)',
                  color: 'var(--c-text3)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: 'DELETE_AI_FEEDBACK', id: confirmId });
                  if (openId === confirmId) setOpenId(null);
                  setConfirmId(null);
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#dc2626',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
