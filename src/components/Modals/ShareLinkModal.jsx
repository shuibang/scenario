import React, { useState, useEffect, useCallback } from 'react';
import Modal, { ModalBtn } from './Modal';
import { useApp } from '../../store/AppContext';
import { buildReviewURL } from '../../App';
import { buildSceneListShareURL } from '../../utils/sceneListShare';

export default function ShareLinkModal({ open, onClose }) {
  const { state } = useApp();
  const { episodes, activeProjectId, activeEpisodeId } = state;

  const allEpisodes = episodes
    .filter(e => e.projectId === activeProjectId)
    .sort((a, b) => a.number - b.number);

  // ── 검토 링크 선택 상태
  const makeInitialSel = useCallback(() => {
    const episodesMap = {};
    allEpisodes.forEach(ep => { episodesMap[ep.id] = true; });
    return { cover: true, synopsis: true, episodes: episodesMap, chars: true, biography: false, treatment: false };
  }, [allEpisodes.map(e => e.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const [sel,        setSel]        = useState(makeInitialSel);
  const [shareUrl,   setShareUrl]   = useState(null);
  const [copied,     setCopied]     = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState(null);

  // ── 씬리스트 공유 상태
  const [slEpId,      setSlEpId]      = useState(activeEpisodeId || allEpisodes[0]?.id || '');
  const [slCopied,    setSlCopied]    = useState(false);
  const [slGenerating,setSlGenerating]= useState(false);
  const [slError,     setSlError]     = useState(null);

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setSel(makeInitialSel());
      setShareUrl(null);
      setCopied(false);
      setError(null);
      setSlEpId(activeEpisodeId || allEpisodes[0]?.id || '');
      setSlCopied(false);
      setSlError(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key, id) => {
    setSel(prev => {
      if (key === 'episodes') {
        return { ...prev, episodes: { ...prev.episodes, [id]: !prev.episodes[id] } };
      }
      return { ...prev, [key]: !prev[key] };
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const url = await buildReviewURL(state, sel);
      setShareUrl(url);
    } catch (err) {
      setError('링크 생성 실패: ' + (err?.message || err));
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSlShare = async () => {
    if (!slEpId) return;
    setSlGenerating(true);
    setSlError(null);
    try {
      const url = await buildSceneListShareURL(state, slEpId);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const el = document.createElement('input');
        el.value = url; document.body.appendChild(el); el.select();
        document.execCommand('copy'); document.body.removeChild(el);
      }
      setSlCopied(true);
      setTimeout(() => setSlCopied(false), 3000);
    } catch (err) {
      setSlError(err?.message || '공유 실패');
    } finally {
      setSlGenerating(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="링크 공유"
      size="sm"
      description="공유할 항목을 선택하세요."
      footer={
        <>
          <ModalBtn variant="secondary" onClick={onClose}>닫기</ModalBtn>
          {!shareUrl && (
            <ModalBtn variant="primary" onClick={handleGenerate} disabled={generating}>
              {generating ? '생성 중…' : '검토 링크 생성'}
            </ModalBtn>
          )}
        </>
      }
    >
      {/* ── 섹션 1: 검토 링크 ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          검토 링크 (7일 유효)
        </div>
        <p style={{ fontSize: 11, color: 'var(--c-text5)', marginBottom: 10, lineHeight: 1.5 }}>
          읽기 전용 검토 링크를 생성합니다. 공유할 항목을 선택하세요.
        </p>

        <div style={{ borderTop: '1px solid var(--c-border2)', paddingTop: 10, marginBottom: 10 }}>
          <ShareCheck label="표지"     checked={sel.cover}    onChange={() => toggle('cover')} />
          <ShareCheck label="시놉시스" checked={sel.synopsis} onChange={() => toggle('synopsis')} />

          {allEpisodes.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: 'var(--c-text5)', margin: '6px 0 4px 0' }}>회차별 대본</div>
              {allEpisodes.map(ep => (
                <ShareCheck
                  key={ep.id}
                  label={`${ep.number}회 ${ep.title || ''}`.trim()}
                  checked={!!sel.episodes[ep.id]}
                  onChange={() => toggle('episodes', ep.id)}
                  indent
                />
              ))}
            </>
          )}

          <div style={{ fontSize: 10, color: 'var(--c-text5)', margin: '6px 0 4px 0' }}>참고자료</div>
          <ShareCheck label="인물소개"   checked={sel.chars}     onChange={() => toggle('chars')}     indent />
          <ShareCheck label="인물이력서" checked={sel.biography} onChange={() => toggle('biography')} indent />
          <ShareCheck label="트리트먼트" checked={sel.treatment} onChange={() => toggle('treatment')} indent />
        </div>

        {shareUrl ? (
          <div>
            <div className="modal-link-row">
              <input className="modal-input modal-input-readonly" value={shareUrl} readOnly />
              <ModalBtn variant="primary" onClick={handleCopy}>
                {copied ? '복사됨 ✓' : '복사'}
              </ModalBtn>
            </div>
            <button
              onClick={() => setShareUrl(null)}
              style={{ fontSize: 11, color: 'var(--c-text5)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 6, padding: 0 }}
            >
              항목 변경 후 다시 생성
            </button>
          </div>
        ) : null}

        {error && <p style={{ fontSize: 12, color: 'var(--c-danger, #e53e3e)', marginTop: 6 }}>{error}</p>}
      </div>

      {/* ── 섹션 2: 씬리스트 공유 ── */}
      <div style={{ borderTop: '1px solid var(--c-border2)', paddingTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          씬리스트 공유
        </div>
        <p style={{ fontSize: 11, color: 'var(--c-text5)', marginBottom: 10, lineHeight: 1.5 }}>
          연출자에게 씬리스트를 URL로 공유합니다.
        </p>

        {allEpisodes.length > 1 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--c-text5)', marginBottom: 4 }}>회차 선택</div>
            <select
              value={slEpId}
              onChange={e => setSlEpId(e.target.value)}
              style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, background: 'var(--c-input)', color: 'var(--c-text2)', border: '1px solid var(--c-border3)', outline: 'none' }}
            >
              {allEpisodes.map(ep => (
                <option key={ep.id} value={ep.id}>{ep.number}회 {ep.title || ''}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ModalBtn
            variant="primary"
            onClick={handleSlShare}
            disabled={slGenerating || !slEpId}
          >
            {slGenerating ? '생성 중…' : slCopied ? '링크 복사됨 ✓' : '씬리스트 링크 복사'}
          </ModalBtn>
        </div>

        {slError && <p style={{ fontSize: 12, color: 'var(--c-danger, #e53e3e)', marginTop: 6 }}>{slError}</p>}
      </div>
    </Modal>
  );
}

function ShareCheck({ label, checked, onChange, indent }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
      paddingLeft: indent ? 12 : 0, paddingTop: 3, paddingBottom: 3,
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ width: 13, height: 13, accentColor: 'var(--c-accent)', flexShrink: 0, cursor: 'pointer' }}
      />
      <span style={{ fontSize: 12, color: 'var(--c-text3)' }}>{label}</span>
    </label>
  );
}
