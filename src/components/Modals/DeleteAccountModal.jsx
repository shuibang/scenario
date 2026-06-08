/**
 * DeleteAccountModal — 계정 삭제 3단계 플로우
 *
 * step 1: 데이터 내보내기 안내
 * step 2: 1차 확인 다이얼로그
 * step 3: "삭제" 텍스트 직접 입력 (2차 확인)
 */
import React, { useState, useCallback, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useApp } from '../../store/AppContext';
import { supabase, supabaseSignOut } from '../../store/supabaseClient';
import { clearAccessToken } from '../../store/googleDrive';
import { clearDropboxToken } from '../../store/dropbox';
import { exportHwpx, exportHancom } from '../../print/hancomExporter';
import { clearDramaStorage } from '../../store/db';

// ─── 선택 기본값: 현재 프로젝트 전 회차 포함 ─────────────────────────────────
function buildDefaultSelections(state) {
  const { episodes, activeProjectId } = state;
  const projectEpisodes = episodes
    .filter(e => e.projectId === activeProjectId)
    .sort((a, b) => a.number - b.number);
  return {
    cover: true,
    synopsis: true,
    episodes: Object.fromEntries(projectEpisodes.map(ep => [ep.id, true])),
    chars: true,
    biography: false,
    treatment: false,
  };
}

// ─── API 호출 ──────────────────────────────────────────────────────────────────
async function callDeleteAccount() {
  if (!supabase) throw new Error('Supabase가 초기화되지 않았습니다.');

  // supabase.functions.invoke: SDK가 URL·CORS·auth token을 자동 처리
  const { error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
  });

  if (error) {
    // FunctionsHttpError에는 context.json()으로 본문이 들어있음
    let msg = error.message || '계정 삭제에 실패했습니다.';
    try {
      const body = await error.context?.json?.();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
}

// ─── 공통 카드 래퍼 ─────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div
      className="rounded-lg"
      style={{
        background: 'var(--c-card)',
        border: '1px solid var(--c-border)',
        padding: '14px 16px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Step 1: 내보내기 안내 ───────────────────────────────────────────────────
function ExportStep({ onProceed, onClose }) {
  const { state } = useApp();
  const [exporting, setExporting] = useState(null); // 'hwpx' | 'docx' | null
  const [exportError, setExportError] = useState('');

  const hasProject = Boolean(state.activeProjectId);
  const selections = useMemo(() => buildDefaultSelections(state), [state]);

  const handleExport = useCallback(async (format) => {
    setExportError('');
    setExporting(format);
    try {
      if (format === 'hwpx') await exportHwpx(state, selections);
      else await exportHancom(state, selections);
    } catch (e) {
      setExportError(e?.message || '내보내기에 실패했습니다.');
    } finally {
      setExporting(null);
    }
  }, [state, selections]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 경고 헤더 */}
      <div
        style={{
          background: 'color-mix(in srgb, #d97706 12%, transparent)',
          border: '1px solid #d97706',
          borderRadius: 8,
          padding: '12px 14px',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1.2 }}>⚠️</span>
        <div>
          <div className="text-sm font-semibold" style={{ color: '#b45309', marginBottom: 4 }}>
            계정을 삭제하면 모든 대본이 영구 삭제됩니다.
          </div>
          <div className="text-xs" style={{ color: '#92400e', lineHeight: 1.5 }}>
            삭제 전에 작업물을 저장해두세요.
            대본이 여러 개라면 보관함에서 대본별로 내보낸 후 돌아오세요.
          </div>
        </div>
      </div>

      {/* 현재 대본 내보내기 */}
      <Card>
        <div className="text-xs font-semibold mb-3" style={{ color: 'var(--c-text5)' }}>
          현재 열려있는 대본 내보내기
        </div>
        {!hasProject ? (
          <div className="text-xs" style={{ color: 'var(--c-text5)', fontStyle: 'italic' }}>
            열려있는 대본이 없습니다. 보관함에서 대본을 열고 내보내기 해주세요.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => handleExport('hwpx')}
              disabled={exporting !== null}
              className="text-sm rounded px-3 py-2"
              style={{
                border: '1px solid var(--c-border2)',
                background: 'var(--c-input)',
                color: 'var(--c-text)',
                cursor: exporting !== null ? 'not-allowed' : 'pointer',
                opacity: exporting !== null ? 0.6 : 1,
                fontWeight: 500,
              }}
            >
              {exporting === 'hwpx' ? '내보내는 중...' : 'HWPX로 내보내기'}
            </button>
            <button
              onClick={() => handleExport('docx')}
              disabled={exporting !== null}
              className="text-sm rounded px-3 py-2"
              style={{
                border: '1px solid var(--c-border2)',
                background: 'var(--c-input)',
                color: 'var(--c-text)',
                cursor: exporting !== null ? 'not-allowed' : 'pointer',
                opacity: exporting !== null ? 0.6 : 1,
                fontWeight: 500,
              }}
            >
              {exporting === 'docx' ? '내보내는 중...' : 'DOCX로 내보내기'}
            </button>
          </div>
        )}
        {exportError && (
          <div className="text-xs mt-2" style={{ color: '#ef4444' }}>{exportError}</div>
        )}
      </Card>

      {/* 하단 액션 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <button
          onClick={onClose}
          className="text-sm px-4 py-2 rounded"
          style={{
            background: 'transparent',
            border: '1px solid var(--c-border2)',
            color: 'var(--c-text5)',
            cursor: 'pointer',
          }}
        >
          취소
        </button>
        <button
          onClick={onProceed}
          className="text-sm px-4 py-2 rounded"
          style={{
            background: 'transparent',
            border: '1px solid #ef4444',
            color: '#ef4444',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          그래도 삭제하기
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: 1차 확인 ───────────────────────────────────────────────────────
function ConfirmStep({ onProceed, onBack }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card style={{ borderColor: '#ef4444' }}>
        <div className="text-sm font-semibold mb-2" style={{ color: '#ef4444' }}>
          정말 계정을 삭제하시겠습니까?
        </div>
        <div className="text-xs" style={{ color: 'var(--c-text4)', lineHeight: 1.7 }}>
          삭제 시 아래 항목이 <strong>영구적으로 제거</strong>되며 복구할 수 없습니다.
        </div>
        <ul className="text-xs mt-2" style={{ color: 'var(--c-text5)', lineHeight: 1.8, paddingLeft: 16 }}>
          <li>모든 대본 데이터 (클라우드에 저장된 것 포함)</li>
          <li>공유 검토 링크 및 피드백 기록</li>
          <li>뱃지·통계·뉴스레터 구독 정보</li>
          <li>Google 계정 연동 및 Drive 동기화 권한</li>
        </ul>
        <div className="text-xs mt-3" style={{ color: 'var(--c-text6)' }}>
          ※ Google Drive에 저장된 파일은 Google 계정에 그대로 남아있습니다.
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <button
          onClick={onBack}
          className="text-sm px-4 py-2 rounded"
          style={{
            background: 'transparent',
            border: '1px solid var(--c-border2)',
            color: 'var(--c-text5)',
            cursor: 'pointer',
          }}
        >
          이전
        </button>
        <button
          onClick={onProceed}
          className="text-sm px-4 py-2 rounded"
          style={{
            background: '#ef4444',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          계속 진행
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: 2차 확인 — "삭제" 텍스트 입력 ──────────────────────────────────
function FinalConfirmStep({ onConfirm, onBack, deleting }) {
  const [text, setText] = useState('');
  const canDelete = text.trim() === '삭제';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card>
        <div className="text-sm mb-3" style={{ color: 'var(--c-text3)' }}>
          아래 입력란에 <strong style={{ color: '#ef4444' }}>삭제</strong>를 정확히 입력하면 계정 삭제가 진행됩니다.
        </div>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="삭제"
          autoFocus
          disabled={deleting}
          style={{
            width: '100%',
            padding: '8px 10px',
            fontSize: 14,
            border: `1px solid ${canDelete ? '#ef4444' : 'var(--c-border2)'}`,
            borderRadius: 6,
            background: 'var(--c-input)',
            color: 'var(--c-text)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <button
          onClick={onBack}
          disabled={deleting}
          className="text-sm px-4 py-2 rounded"
          style={{
            background: 'transparent',
            border: '1px solid var(--c-border2)',
            color: 'var(--c-text5)',
            cursor: deleting ? 'not-allowed' : 'pointer',
            opacity: deleting ? 0.5 : 1,
          }}
        >
          이전
        </button>
        <button
          onClick={onConfirm}
          disabled={!canDelete || deleting}
          className="text-sm px-4 py-2 rounded"
          style={{
            background: canDelete && !deleting ? '#dc2626' : 'var(--c-border3)',
            border: 'none',
            color: canDelete && !deleting ? '#fff' : 'var(--c-text6)',
            cursor: canDelete && !deleting ? 'pointer' : 'not-allowed',
            fontWeight: 600,
            minWidth: 90,
          }}
        >
          {deleting ? '삭제 중...' : '계정 영구 삭제'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────────────────
export default function DeleteAccountModal({ open, onClose }) {
  const [step, setStep] = useState(1); // 1 | 2 | 3
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const STEP_TITLES = {
    1: '계정 삭제 전 확인',
    2: '최종 확인',
    3: '계정 삭제 확인',
  };

  const handleClose = useCallback(() => {
    if (deleting) return;
    setStep(1);
    setError('');
    onClose();
  }, [deleting, onClose]);

  const handleDelete = useCallback(async () => {
    setError('');
    setDeleting(true);
    try {
      await callDeleteAccount();

      // 로컬 스토리지 + IDB 삭제
      try { await clearDramaStorage(); } catch {}

      // 드라이브 토큰 정리
      try { clearAccessToken(); } catch {}
      try { clearDropboxToken?.(); } catch {}

      // 로그아웃 (이미 서버에서 계정 삭제됨이므로 실패해도 무시)
      try { await supabaseSignOut(); } catch {}

      // 랜딩 페이지로 이동
      window.location.replace('/');
    } catch (e) {
      setError(e?.message || '계정 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
      setDeleting(false);
    }
  }, []);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={v => { if (!v) handleClose(); }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal-content modal-md">
          {/* 헤더 */}
          <div className="modal-header">
            <Dialog.Title className="modal-title" style={{ color: '#ef4444' }}>
              {STEP_TITLES[step]}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="modal-close-btn"
                aria-label="닫기"
                onClick={handleClose}
                disabled={deleting}
              >
                ✕
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="sr-only">
            계정 삭제 확인 절차입니다. 삭제하면 모든 데이터가 영구 제거됩니다.
          </Dialog.Description>

          {/* 단계 인디케이터 */}
          <div className="modal-body" style={{ paddingBottom: 0, paddingTop: 12 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {[1, 2, 3].map(s => (
                <div
                  key={s}
                  style={{
                    flex: 1, height: 3, borderRadius: 2,
                    background: s <= step ? '#ef4444' : 'var(--c-border3)',
                    transition: 'background 0.2s',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="modal-body" style={{ paddingTop: 0 }}>
            {step === 1 && (
              <ExportStep
                onProceed={() => setStep(2)}
                onClose={handleClose}
              />
            )}
            {step === 2 && (
              <ConfirmStep
                onProceed={() => setStep(3)}
                onBack={() => setStep(1)}
              />
            )}
            {step === 3 && (
              <FinalConfirmStep
                onConfirm={handleDelete}
                onBack={() => setStep(2)}
                deleting={deleting}
              />
            )}

            {error && (
              <div
                className="text-xs mt-3 rounded px-3 py-2"
                style={{
                  background: 'color-mix(in srgb, #ef4444 10%, transparent)',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                }}
              >
                {error}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
