import React, { useState, useEffect, useCallback } from 'react';
import Modal, { ModalBtn } from './Modal';
import { useApp } from '../../store/AppContext';
import { buildReviewURL } from '../../App';
import { buildSceneListShareURL } from '../../utils/sceneListShare';
import { reportError } from '../../utils/errorTracker';
import { listFeedbackVersions, createReviewLinkForExistingVersion } from '../../utils/reviewShare';
import { useBadges } from '../../utils/badges';
import { charactersWithPhoto } from '../../utils/sharePhoto';

// 작품별로 분리 저장. 옛 글로벌 키('drama_share_link_selections_v1')는 같은 key가
// 모든 작품에서 공유돼 다른 작품의 회차 ID 가 섞이면 normalize 가 자동으로 모두
// true 로 기본화되는 문제가 있었음.
const SHARE_SELECTIONS_STORAGE_PREFIX = 'drama_share_link_selections_v2:';

function storageKeyFor(projectId) {
  if (!projectId) return null;
  return SHARE_SELECTIONS_STORAGE_PREFIX + projectId;
}

function readSavedSelections(projectId) {
  const key = storageKeyFor(projectId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeSelections(allEpisodes, source) {
  const savedEpisodes = source?.episodes && typeof source.episodes === 'object' ? source.episodes : {};
  const episodesMap = {};
  allEpisodes.forEach(ep => {
    episodesMap[ep.id] = typeof savedEpisodes[ep.id] === 'boolean' ? savedEpisodes[ep.id] : true;
  });
  return {
    cover: typeof source?.cover === 'boolean' ? source.cover : true,
    synopsis: typeof source?.synopsis === 'boolean' ? source.synopsis : true,
    episodes: episodesMap,
    chars: typeof source?.chars === 'boolean' ? source.chars : true,
    // 사진 공유는 의식적 선택이어야 하므로 기본 꺼짐. 저장된 값이 없으면 false.
    charPhotos: source?.charPhotos === true,
    biography: typeof source?.biography === 'boolean' ? source.biography : false,
    treatment: typeof source?.treatment === 'boolean' ? source.treatment : false,
  };
}

export default function ShareLinkModal({ open, onClose }) {
  const { state } = useApp();
  const { episodes, activeProjectId, activeEpisodeId } = state;

  // 사진 있는 인물 수 — 0명이면 사진 옵션 자체를 노출하지 않는다.
  const photoCharCount = charactersWithPhoto(
    (state.characters || []).filter(c => c.projectId === activeProjectId),
  ).length;

  const allEpisodes = episodes
    .filter(e => e.projectId === activeProjectId)
    .sort((a, b) => a.number - b.number);

  // ── 검토 링크 선택 상태 (마지막 체크 상태 localStorage 유지, 작품별 분리)
  const makeInitialSel = useCallback(() => {
    return normalizeSelections(allEpisodes, readSavedSelections(activeProjectId));
  }, [activeProjectId, allEpisodes.map(e => e.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const [sel,        setSel]        = useState(makeInitialSel);
  const [shareUrl,   setShareUrl]   = useState(null);
  const [copied,     setCopied]     = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState(null);
  const [watermarkText, setWatermarkText] = useState('');
  const { featured: senderBadgeObj } = useBadges();
  const senderBadge = senderBadgeObj ? { emoji: senderBadgeObj.emoji, label: senderBadgeObj.label } : null;

  // 버전 선택 — 'new' 면 새 버전 생성, 그 외엔 기존 versionId
  const [versionMode,    setVersionMode]    = useState('new');
  const [existingVersions, setExistingVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // ── 씬리스트 공유 상태
  const [slEpId,      setSlEpId]      = useState(activeEpisodeId || allEpisodes[0]?.id || '');
  const [slCopied,    setSlCopied]    = useState(false);
  const [slGenerating,setSlGenerating]= useState(false);
  const [slError,     setSlError]     = useState(null);

  // 모달 열릴 때 초기화 — 체크 상태는 마지막 저장값 복원
  useEffect(() => {
    if (open) {
      setSel(makeInitialSel());
      setShareUrl(null);
      setCopied(false);
      setError(null);
      setWatermarkText('');
      setVersionMode('new');
      setSlEpId(activeEpisodeId || allEpisodes[0]?.id || '');
      setSlCopied(false);
      setSlError(null);
      // 기존 버전 목록 fetch
      if (activeProjectId) {
        setVersionsLoading(true);
        listFeedbackVersions(activeProjectId)
          .then((vs) => setExistingVersions(vs || []))
          .catch(() => setExistingVersions([]))
          .finally(() => setVersionsLoading(false));
      } else {
        setExistingVersions([]);
      }
    }
  }, [open, activeProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 체크 상태 변경 시 localStorage에 저장 (다음에 모달 열 때 복원).
  // 모달이 닫혀있을 때는 저장하지 않음 — open ↔ open=false 의 setSel 초기화가
  // 잘못된 디폴트로 옛 저장값을 덮어쓰는 위험을 차단.
  useEffect(() => {
    if (!open) return;
    const key = storageKeyFor(activeProjectId);
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(sel));
    } catch {}
  }, [sel, open, activeProjectId]);

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
      const wm = watermarkText.trim() || null;
      let url;
      if (versionMode === 'new') {
        // 새 버전 + 새 링크 생성
        url = await buildReviewURL(state, sel, { watermarkText: wm, senderBadge });
      } else {
        // 기존 버전에 새 링크만 추가 — 피드백은 그 버전 한 곳에 모임
        const { url: u } = await createReviewLinkForExistingVersion({
          versionId: versionMode,
          watermarkText: wm,
          senderBadge,
        });
        url = u;
      }
      setShareUrl(url);
    } catch (err) {
      // 로그인 누락은 사용자 액션 결과(버그 아님) — 자동수집 보내지 않고 명확한 안내만.
      if (err?.message === 'Login is required.') {
        setError('로그인이 필요한 기능이에요. 먼저 로그인한 뒤 다시 시도해주세요.');
      } else if (err?.message === 'Google Drive reconnect is required.') {
        setError('Google Drive 재연결이 필요해요. 같은 구글 계정으로 다시 로그인한 뒤 검토 링크를 생성해주세요.');
      } else {
        reportError({ source: 'manual', message: err?.message || String(err), stack: err?.stack });
        setError('링크 생성에 실패했어요. 잠시 후 다시 시도해주세요.');
      }
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
      if (err?.message === 'Login is required.') {
        setSlError('로그인이 필요한 기능이에요. 먼저 로그인한 뒤 다시 시도해주세요.');
      } else {
        setSlError(err?.message || '공유 실패');
      }
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

        {/* 버전 선택 — 새 버전 vs 기존 버전에 링크 추가 */}
        <div style={{ borderTop: '1px solid var(--c-border2)', paddingTop: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--c-text5)', marginBottom: 4 }}>버전</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: 'pointer' }}>
            <input
              type="radio"
              name="versionMode"
              checked={versionMode === 'new'}
              onChange={() => setVersionMode('new')}
              style={{ accentColor: 'var(--c-accent)', flexShrink: 0 }}
              disabled={!!shareUrl}
            />
            <span style={{ fontSize: 12, color: 'var(--c-text3)' }}>🆕 새 버전 생성 (현재 상태 스냅샷)</span>
          </label>
          {existingVersions.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: 'pointer' }}>
              <input
                type="radio"
                name="versionMode"
                checked={versionMode !== 'new'}
                onChange={() => setVersionMode(existingVersions[0]?.id || 'new')}
                style={{ accentColor: 'var(--c-accent)', flexShrink: 0 }}
                disabled={!!shareUrl}
              />
              <span style={{ fontSize: 12, color: 'var(--c-text3)' }}>📑 기존 버전에 링크만 추가:</span>
              <select
                value={versionMode === 'new' ? (existingVersions[0]?.id || '') : versionMode}
                onChange={e => setVersionMode(e.target.value)}
                disabled={versionMode === 'new' || !!shareUrl}
                style={{
                  fontSize: 11, padding: '2px 6px', borderRadius: 4,
                  background: 'var(--c-input)', color: 'var(--c-text2)',
                  border: '1px solid var(--c-border3)', outline: 'none',
                  opacity: versionMode === 'new' ? 0.5 : 1,
                }}
              >
                {existingVersions.map(v => (
                  <option key={v.id} value={v.id}>{v.version_name}</option>
                ))}
              </select>
            </label>
          )}
          {versionsLoading && (
            <div style={{ fontSize: 10, color: 'var(--c-text6)', marginTop: 2 }}>버전 목록 불러오는 중…</div>
          )}
          {versionMode !== 'new' && (
            <p style={{ fontSize: 11, color: 'var(--c-text6)', marginTop: 4, lineHeight: 1.5 }}>
              선택한 버전에 새 링크만 추가합니다. 항목 선택은 무시되고 기존 버전 내용으로 공유됩니다.
            </p>
          )}
        </div>

        <div style={{ marginBottom: 10, opacity: versionMode === 'new' ? 1 : 0.4, pointerEvents: versionMode === 'new' ? 'auto' : 'none' }}>
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
          {/* 사진 있는 인물이 하나도 없으면 노출하지 않는다. 기본 꺼짐. */}
          {photoCharCount > 0 && (
            <div style={{ marginLeft: 18 }}>
              <ShareCheck
                label={`인물 사진 함께 보내기 (${photoCharCount}명)`}
                checked={!!sel.charPhotos && sel.chars}
                onChange={() => toggle('charPhotos')}
                indent
              />
              {!sel.chars && (
                <div style={{ fontSize: 10, color: 'var(--c-text6)', marginLeft: 24, marginTop: -2 }}>
                  인물소개를 함께 선택해야 사진이 나갑니다.
                </div>
              )}
            </div>
          )}
          <ShareCheck label="인물이력서" checked={sel.biography} onChange={() => toggle('biography')} indent />
          <ShareCheck label="트리트먼트" checked={sel.treatment} onChange={() => toggle('treatment')} indent />
        </div>

        {/* 워터마크 텍스트 — 선택. 비우면 워터마크 안 나옴. */}
        <div style={{ marginTop: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--c-text5)', marginBottom: 4 }}>
            워터마크 (선택)
          </div>
          <input
            type="text"
            value={watermarkText}
            onChange={e => setWatermarkText(e.target.value.slice(0, 100))}
            placeholder="받는 사람 이름이나 식별 문구"
            disabled={!!shareUrl}
            style={{
              width: '100%', fontSize: 12, padding: '6px 10px', borderRadius: 4,
              background: 'var(--c-input)', color: 'var(--c-text)',
              border: '1px solid var(--c-border3)', outline: 'none',
              boxSizing: 'border-box',
              opacity: shareUrl ? 0.5 : 1,
            }}
          />
          <p style={{ fontSize: 11, color: 'var(--c-text6)', marginTop: 4, lineHeight: 1.5 }}>
            입력한 문구가 검토 화면과 PDF 다운로드본의 워터마크로 박힙니다. 비우면 워터마크 없이 공유됩니다.
          </p>
        </div>

        {shareUrl ? (
          <div>
            <div className="modal-link-row">
              <input className="modal-input modal-input-readonly" value={shareUrl} readOnly />
              <ModalBtn variant="primary" onClick={handleCopy}>
                {copied ? '복사됨 ✓' : '복사'}
              </ModalBtn>
              <ModalBtn variant="secondary" onClick={() => setShareUrl(null)}>
                다시 생성
              </ModalBtn>
            </div>
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
