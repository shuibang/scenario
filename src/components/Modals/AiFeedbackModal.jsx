/**
 * AiFeedbackModal — AI 피드백 요청 모달.
 *
 * 흐름: 회차·모드 선택 + 동의 → 요청(수십 초) → 결과를 aiFeedbacks 에 저장하고 피드백 노트로 이동.
 *
 * 자유 붙여넣기 입력창은 두지 않는다. 검토는 회차 단위일 때 가장 깊어지고,
 * 붙여넣기를 열면 여러 회차를 이어붙인 합본이 들어온다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Modal, { ModalBtn } from './Modal';
import { useApp } from '../../store/AppContext';
import { genId, now } from '../../store/db';
import { FEATURES, getUsageStatus } from '../../utils/membership';
import { requestAiFeedback } from '../../utils/aiFeedbackClient';
import { reportError } from '../../utils/errorTracker';
import {
  MODES,
  MODE_LABELS,
  MODE_PRODUCTION,
  buildAiFeedbackRequest,
} from '../../utils/aiFeedback';

export default function AiFeedbackModal({ open, onClose, onSaved }) {
  const { state, dispatch } = useApp();
  const { activeProjectId, episodes, characters, synopsisDocs, scriptBlocks, aiFeedbacks } = state;

  const projectEpisodes = useMemo(
    () =>
      episodes
        .filter((ep) => ep.projectId === activeProjectId)
        .sort((a, b) => (a.number || 0) - (b.number || 0)),
    [episodes, activeProjectId],
  );

  const [episodeId, setEpisodeId] = useState('');
  const [mode, setMode] = useState(MODE_PRODUCTION);
  const [agreed, setAgreed] = useState(false);
  const [usage, setUsage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { message, retryable }

  // 열릴 때마다 초기화. 동의는 매번 새로 받는다 — 대본이 AI 서버로 나가는 일이라
  // "한 번 눌렀으니 계속 동의"로 두지 않는다.
  useEffect(() => {
    if (!open) return;
    setEpisodeId(projectEpisodes[0]?.id || '');
    setMode(MODE_PRODUCTION);
    setAgreed(false);
    setError(null);
    setBusy(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 남은 횟수는 표시 전용이다. 조회에 실패하면 숫자만 감추고 요청은 그대로 할 수 있게 둔다.
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    getUsageStatus(FEATURES.AI_FEEDBACK)
      .then((result) => {
        if (mounted) setUsage(result);
      })
      .catch(() => {
        if (mounted) setUsage(null);
      });
    return () => {
      mounted = false;
    };
  }, [open]);

  const selectedEpisode = projectEpisodes.find((ep) => ep.id === episodeId) || null;

  const submit = async () => {
    setError(null);
    const episodeBlocks = scriptBlocks.filter((b) => b.episodeId === episodeId);
    const projectCharacters = characters.filter((c) => c.projectId === activeProjectId);
    const synopsisDoc = synopsisDocs.find((d) => d.projectId === activeProjectId) || null;

    const built = buildAiFeedbackRequest({
      mode,
      synopsisDoc,
      characters: projectCharacters,
      episode: selectedEpisode,
      episodeBlocks,
      aiFeedbacks,
      projectId: activeProjectId,
    });

    if (!built.ok) {
      setError({ message: built.message, retryable: false });
      return;
    }

    setBusy(true);
    try {
      const result = await requestAiFeedback(built.body);
      if (!result.ok) {
        setError({ message: result.message, retryable: result.retryable });
        return;
      }

      dispatch({
        type: 'ADD_AI_FEEDBACK',
        payload: {
          id: genId(),
          projectId: activeProjectId,
          episodeId: selectedEpisode.id,
          episodeNumber: selectedEpisode.number ?? null,
          mode,
          feedback: result.feedback,
          createdAt: now(),
        },
      });
      if (typeof result.remaining === 'number') {
        setUsage((prev) => (prev ? { ...prev, remaining: result.remaining } : prev));
      }
      onSaved?.();
      onClose();
    } catch (err) {
      reportError({ source: 'manual', message: err?.message || String(err), stack: err?.stack });
      setError({ message: '검토에 실패했습니다. 잠시 후 다시 시도해주세요.', retryable: true });
    } finally {
      setBusy(false);
    }
  };

  const remainingText = (() => {
    if (!usage?.available) return '';
    if (usage.remaining === null) return '남은 횟수: 제한 없음';
    return `남은 횟수: ${usage.remaining}회`;
  })();

  const canSubmit = !busy && agreed && !!selectedEpisode;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="AI 피드백"
      description="회차를 골라 AI 검토를 요청합니다."
      size="md"
      footer={
        <>
          <ModalBtn onClick={onClose} disabled={busy}>
            {busy ? '닫기' : '취소'}
          </ModalBtn>
          <ModalBtn variant="primary" onClick={submit} disabled={!canSubmit}>
            {busy ? '검토 중…' : '검토 요청'}
          </ModalBtn>
        </>
      }
    >
      {projectEpisodes.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--c-text4)' }}>회차가 없습니다. 먼저 회차를 만들어주세요.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--c-text4)', lineHeight: 1.7, margin: 0 }}>
            피드백은 회차 단위로 받을 때 가장 깊고 구체적입니다.
          </p>

          {/* 회차 */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>검토할 회차</span>
            <select
              value={episodeId}
              onChange={(e) => setEpisodeId(e.target.value)}
              disabled={busy}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--c-border)',
                background: 'var(--c-card)',
                color: 'var(--c-text2)',
                fontSize: 14,
              }}
            >
              {projectEpisodes.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {`${ep.number}회 ${ep.title || ''}`.trim()}
                </option>
              ))}
            </select>
          </label>

          {/* 모드 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>검토 관점</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  disabled={busy}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    borderRadius: 8,
                    fontSize: 14,
                    cursor: busy ? 'default' : 'pointer',
                    border: `1px solid ${mode === m ? 'var(--c-accent)' : 'var(--c-border)'}`,
                    background: mode === m ? 'var(--c-active)' : 'var(--c-card)',
                    color: mode === m ? 'var(--c-accent)' : 'var(--c-text4)',
                    fontWeight: mode === m ? 600 : 400,
                  }}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* 동의 */}
          <div
            style={{
              border: '1px solid var(--c-border)',
              borderRadius: 10,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: 'var(--c-hover)',
            }}
          >
            <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--c-text4)' }}>
              <p style={{ margin: 0 }}>
                선택한 회차의 대본과 시놉시스, 인물 정보, 이전 AI 피드백 요약이 AI 서버로 전송됩니다.
              </p>
              <p style={{ margin: '6px 0 0' }}>전송된 내용은 저장되지 않습니다.</p>
              <p style={{ margin: '6px 0 0', color: 'var(--c-text2)', fontWeight: 600 }}>
                피드백 문장을 작품에 그대로 옮기지 마세요.
                <br />
                AI 생성 텍스트에는 기계가 식별할 수 있는 표식이 포함될 수 있습니다.
              </p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                disabled={busy}
              />
              <span>위 내용을 확인했습니다</span>
            </label>
          </div>

          {remainingText && (
            <p style={{ fontSize: 12, color: 'var(--c-text5)', margin: 0 }}>{remainingText}</p>
          )}

          {busy && (
            <p style={{ fontSize: 13, color: 'var(--c-text4)', margin: 0, lineHeight: 1.7 }}>
              대본을 읽고 있습니다. 회차 분량에 따라 수십 초가 걸릴 수 있어요. 이 창을 열어두세요.
            </p>
          )}

          {error && (
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                color: 'var(--c-text2)',
                border: '1px solid var(--c-border)',
                borderRadius: 8,
                padding: 12,
              }}
            >
              <p style={{ margin: 0 }}>{error.message}</p>
              {error.retryable && (
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  style={{
                    marginTop: 8,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--c-border)',
                    background: 'var(--c-card)',
                    color: 'var(--c-text2)',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  다시 시도
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
