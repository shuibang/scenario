import React from 'react';
import { useApp } from '../store/AppContext';

// ─── ProjectsManagePage — 작품 관리 (Phase X.1 골격) ─────────────────────────
// 단일 목록(state.projects) + 최근 수정 순. 이름변경/삭제는 후속 커밋.

const TYPE_LABEL = { series: '시리즈', single: '단막' };

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ProjectsManagePage() {
  const { state } = useApp();
  const projects = [...(state.projects || [])]
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--c-bg)' }}>
      {/* Header */}
      <div className="shrink-0" style={{ padding: '16px 20px', borderBottom: '1px solid var(--c-border2)' }}>
        <div className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>작품 관리</div>
        <div className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--c-text5)' }}>
          작성한 작품을 한눈에 정리하세요. 이름 변경·삭제는 다음 업데이트에서 제공됩니다.
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '12px 16px' }}>
        {projects.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-sm" style={{ color: 'var(--c-text5)' }}>아직 작품이 없습니다.</div>
            <div className="mt-2 text-xs" style={{ color: 'var(--c-text6)' }}>
              상단 [파일] → 새 작품 또는 좌측 패널에서 새 작품을 만들어보세요.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projects.map(p => (
              <div
                key={p.id}
                className="flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-4"
                style={{
                  padding: '10px 14px',
                  background: 'var(--c-card)',
                  border: '1px solid var(--c-border2)',
                  borderRadius: 8,
                }}
              >
                {/* 제목 + 메타 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>
                    {p.title || '제목 없음'}
                  </div>
                  <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--c-text5)' }}>
                    {p.genre || '장르 없음'}
                    {p.projectType ? ` · ${TYPE_LABEL[p.projectType] || p.projectType}` : ''}
                  </div>
                </div>

                {/* 작성 / 수정 시각 */}
                <div className="text-[11px] shrink-0 md:text-right" style={{ color: 'var(--c-text5)', lineHeight: 1.5 }}>
                  <div>작성: {formatDateTime(p.createdAt)}</div>
                  <div>수정: {formatDateTime(p.updatedAt || p.createdAt)}</div>
                </div>

                {/* 액션 버튼 자리 — 다음 커밋에서 이름변경/삭제 추가 예정 */}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
