import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { findMatches, replaceAllInBlocks } from '../utils/findReplace';

const SCOPE_OPTIONS = [
  { value: 'all',      label: '전체' },
  { value: 'dialogue', label: '대사만' },
  { value: 'action',   label: '지문만' },
];

function getBlockLabel(type) {
  if (type === 'scene_number')  return '씬';
  if (type === 'dialogue')      return '대사';
  if (type === 'action')        return '지문';
  if (type === 'parenthetical') return '괄호체';
  return type;
}

// 씬 레이블: 같은 회차 블록 내에서 해당 블록 직전의 scene_number
function getSceneLabel(blockId, searchBlocks) {
  const block = searchBlocks.find(b => b.id === blockId);
  if (!block) return 'S#?';
  const epBlocks = searchBlocks.filter(b => b.episodeId === block.episodeId);
  const blockIdx = epBlocks.findIndex(b => b.id === blockId);
  let lastScene = null;
  for (const sb of epBlocks) {
    if (sb.type !== 'scene_number') continue;
    const sbIdx = epBlocks.findIndex(b => b.id === sb.id);
    if (sbIdx <= blockIdx) lastScene = sb;
    else break;
  }
  return lastScene?.label || lastScene?.content || 'S#?';
}

export default function FindReplaceMobileModal({ open, initialMode, onClose }) {
  const { state, dispatch } = useApp();
  const { scriptBlocks, activeEpisodeId, activeProjectId, episodes } = state;

  const currentEpisodeBlocks = activeEpisodeId
    ? scriptBlocks.filter(b => b.episodeId === activeEpisodeId)
    : activeProjectId
      ? scriptBlocks.filter(b => b.projectId === activeProjectId)
      : [];

  const projectBlocks = activeProjectId
    ? scriptBlocks.filter(b => b.projectId === activeProjectId)
    : currentEpisodeBlocks;

  const [query,         setQuery]         = useState('');
  const [replaceText,   setReplaceText]   = useState('');
  const caseSensitive = false;
  const [scope,         setScope]         = useState('all');
  const [episodeScope,  setEpisodeScope]  = useState('current'); // 'current' | 'all'
  const [matches,       setMatches]       = useState([]);
  const [currentIdx,    setCurrentIdx]    = useState(-1);
  const [replaceMode,   setReplaceMode]   = useState(initialMode === 'replace');
  const [replaceResult, setReplaceResult] = useState(null);

  const findInputRef = useRef(null);

  const searchBlocks = episodeScope === 'all' ? projectBlocks : currentEpisodeBlocks;

  // 현재 프로젝트 회차 목록
  const projectEpisodes = (episodes || [])
    .filter(e => e.projectId === activeProjectId)
    .sort((a, b) => (a.number || 0) - (b.number || 0));

  const getEpLabel = useCallback((episodeId) => {
    const ep = projectEpisodes.find(e => e.id === episodeId);
    return ep ? `${ep.number}화` : '';
  }, [projectEpisodes]);

  useEffect(() => {
    if (open) {
      setReplaceMode(initialMode === 'replace');
      setTimeout(() => findInputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setMatches([]);
      setCurrentIdx(-1);
      setReplaceResult(null);
    }
  }, [open, initialMode]);

  useEffect(() => {
    setReplaceResult(null);
    const timer = setTimeout(() => {
      if (!query.trim()) { setMatches([]); setCurrentIdx(-1); return; }
      const blockTypes = scope === 'all' ? null : [scope];
      const results = findMatches(searchBlocks, query, { caseSensitive, blockTypes, searchScope: 'content_only' });
      setMatches(results);
      setCurrentIdx(results.length > 0 ? 0 : -1);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, scope, caseSensitive, searchBlocks]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIdx(i => (i + 1) % matches.length);
  }, [matches.length]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIdx(i => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);

  // 블록으로 이동 — 다른 회차면 회차 전환 후 스크롤
  const navigateToBlock = useCallback((blockId, closeModal = false) => {
    const block = searchBlocks.find(b => b.id === blockId);
    if (!block) return;

    const doScroll = () => {
      const el = document.querySelector(`[data-block-id="${blockId}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('find-highlight');
      setTimeout(() => el.classList.remove('find-highlight'), 1200);
    };

    if (closeModal) onClose?.();

    if (block.episodeId && block.episodeId !== activeEpisodeId) {
      dispatch({ type: 'SET_ACTIVE_EPISODE', id: block.episodeId });
      setTimeout(doScroll, 350);
    } else {
      requestAnimationFrame(doScroll);
    }
  }, [searchBlocks, activeEpisodeId, dispatch, onClose]);

  const handleMatchTap = useCallback((blockId, idx) => {
    setCurrentIdx(idx);
    navigateToBlock(blockId, true);
  }, [navigateToBlock]);

  const handleReplaceAll = useCallback(() => {
    if (!query.trim() || matches.length === 0) return;
    const scopeLabel = episodeScope === 'all' ? '전체 대본' : '현재 회차';
    const ok = window.confirm(
      `[${scopeLabel}] "${query}"를 "${replaceText}"로 ${matches.length}개 모두 바꿉니다. 계속하시겠습니까?`
    );
    if (!ok) return;

    const blockTypes = scope === 'all' ? null : [scope];
    const updatedBlocks = replaceAllInBlocks(searchBlocks, query, replaceText, {
      caseSensitive,
      blockTypes,
    });

    const unchanged = updatedBlocks.every((b, i) => b === searchBlocks[i]);
    if (unchanged) return;

    const epIds = [...new Set(updatedBlocks.map(b => b.episodeId).filter(Boolean))];
    epIds.forEach(epId => {
      const payload  = updatedBlocks.filter(b => b.episodeId === epId);
      const original = searchBlocks.filter(b => b.episodeId === epId);
      if (payload.some((b, i) => b !== original[i])) {
        dispatch({ type: 'SET_BLOCKS', episodeId: epId, payload, _record: true });
      }
    });

    setReplaceResult(`${matches.length}개를 바꿨습니다.`);
    setMatches([]);
    setCurrentIdx(-1);
  }, [query, replaceText, matches, scope, caseSensitive, searchBlocks, episodeScope, dispatch]);

  const statusText = !query.trim()
    ? '검색어를 입력하세요'
    : matches.length === 0
      ? '매칭 없음'
      : `${matches.length}개 발견${currentIdx >= 0 ? ` (${currentIdx + 1}번째)` : ''}`;

  const inputStyle = {
    width: '100%', height: 40, padding: '0 10px', fontSize: 14,
    border: '1px solid var(--c-border3)', borderRadius: 6,
    background: 'var(--c-input)', color: 'var(--c-text)',
    outline: 'none', boxSizing: 'border-box',
  };

  const pillBase = {
    height: 28, padding: '0 10px', fontSize: 12, borderRadius: 14,
    cursor: 'pointer', border: '1px solid var(--c-border3)',
    fontWeight: 500, transition: 'all 0.12s',
  };

  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) onClose?.(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9000,
          }}
        />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(92vw, 480px)',
            maxHeight: '90vh',
            background: 'var(--c-panel)',
            borderRadius: 10,
            boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
            zIndex: 9001,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          aria-describedby={undefined}
        >
          <Dialog.Title style={{ display: 'none' }}>찾기 / 바꾸기</Dialog.Title>

          {/* 헤더 */}
          <div style={{
            height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 10px 0 16px', borderBottom: '1px solid var(--c-border)', flexShrink: 0,
          }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>찾기 / 바꾸기</span>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer',
                background: 'transparent', color: 'var(--c-text4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* 입력 영역 */}
          <div style={{ padding: '12px 14px 8px', flexShrink: 0 }}>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: 'var(--c-text4)', display: 'block', marginBottom: 4 }}>찾기</label>
              <input
                ref={findInputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Enter') { e.shiftKey ? goPrev() : goNext(); }
                }}
                placeholder="검색어 입력"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--c-accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--c-border3)'}
              />
            </div>

            {/* 바꾸기 토글 */}
            <button
              onClick={() => setReplaceMode(v => !v)}
              style={{
                fontSize: 12, color: replaceMode ? 'var(--c-accent)' : 'var(--c-text4)',
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
                display: 'flex', alignItems: 'center', gap: 4, marginBottom: replaceMode ? 6 : 0,
              }}
            >
              <span style={{ fontSize: 9 }}>{replaceMode ? '▲' : '▼'}</span>
              바꾸기
            </button>

            {replaceMode && (
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--c-text4)', display: 'block', marginBottom: 4 }}>바꿀 단어</label>
                <input
                  value={replaceText}
                  onChange={e => setReplaceText(e.target.value)}
                  placeholder="바꿀 단어 입력"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--c-accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--c-border3)'}
                />
              </div>
            )}

            {/* 옵션 행 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {/* 회차 범위 pills */}
              <div style={{ display: 'flex', gap: 4 }}>
                {[{ v: 'current', l: '현재 회차' }, { v: 'all', l: '전체 대본' }].map(({ v, l }) => (
                  <button
                    key={v}
                    onClick={() => setEpisodeScope(v)}
                    style={{
                      ...pillBase,
                      background: episodeScope === v ? 'var(--c-accent)' : 'var(--c-input)',
                      color: episodeScope === v ? '#fff' : 'var(--c-text4)',
                      borderColor: episodeScope === v ? 'var(--c-accent)' : 'var(--c-border3)',
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>


              {/* 블록 유형 */}
              <select
                value={scope}
                onChange={e => setScope(e.target.value)}
                style={{
                  marginLeft: 'auto', height: 30, padding: '0 6px', fontSize: 12,
                  border: '1px solid var(--c-border3)', borderRadius: 5,
                  background: 'var(--c-input)', color: 'var(--c-text3)', cursor: 'pointer',
                }}
              >
                {SCOPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 버튼 + 상태 */}
          <div style={{
            padding: '0 14px 8px',
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}>
            <button
              onClick={goPrev}
              disabled={matches.length === 0}
              style={{
                height: 34, padding: '0 10px', fontSize: 12, borderRadius: 5,
                cursor: matches.length > 0 ? 'pointer' : 'default',
                border: '1px solid var(--c-border3)', background: 'var(--c-input)', color: 'var(--c-text3)',
                display: 'flex', alignItems: 'center', gap: 3, opacity: matches.length === 0 ? 0.4 : 1,
              }}
            >
              <ChevronUp size={13} /> 이전
            </button>
            <button
              onClick={goNext}
              disabled={matches.length === 0}
              style={{
                height: 34, padding: '0 10px', fontSize: 12, borderRadius: 5,
                cursor: matches.length > 0 ? 'pointer' : 'default',
                border: '1px solid var(--c-border3)', background: 'var(--c-input)', color: 'var(--c-text3)',
                display: 'flex', alignItems: 'center', gap: 3, opacity: matches.length === 0 ? 0.4 : 1,
              }}
            >
              <ChevronDown size={13} /> 다음
            </button>
            {replaceMode && (
              <button
                onClick={handleReplaceAll}
                disabled={matches.length === 0 || !query.trim()}
                style={{
                  height: 34, padding: '0 10px', fontSize: 12, borderRadius: 5,
                  cursor: matches.length > 0 ? 'pointer' : 'default',
                  border: 'none',
                  background: matches.length > 0 ? 'var(--c-accent)' : 'var(--c-border3)',
                  color: matches.length > 0 ? '#fff' : 'var(--c-text5)',
                  opacity: matches.length === 0 ? 0.4 : 1,
                  marginLeft: 'auto',
                }}
              >
                모두 바꾸기
              </button>
            )}
            <span style={{
              fontSize: 11, color: replaceResult ? 'var(--c-accent)' : 'var(--c-text5)',
              marginLeft: replaceMode ? 0 : 'auto',
              whiteSpace: 'nowrap',
            }}>
              {replaceResult || statusText}
            </span>
          </div>

          {/* 매칭 목록 */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, borderTop: '1px solid var(--c-border)' }}>
            {matches.length === 0 && query.trim() && !replaceResult && (
              <div style={{ padding: '20px 14px', fontSize: 13, color: 'var(--c-text5)', textAlign: 'center' }}>
                매칭 없음
              </div>
            )}
            {matches.map((m, i) => {
              const block = searchBlocks.find(b => b.id === m.blockId);
              const sceneLabel = getSceneLabel(m.blockId, searchBlocks);
              const epLabel = episodeScope === 'all' && block ? getEpLabel(block.episodeId) : null;
              const isActive = i === currentIdx;
              return (
                <div
                  key={`${m.blockId}-${m.matchIndex}`}
                  onClick={() => handleMatchTap(m.blockId, i)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer',
                    borderLeft: isActive ? '3px solid var(--c-accent)' : '3px solid transparent',
                    background: isActive ? 'var(--c-active)' : 'transparent',
                  }}
                >
                  <div style={{ fontSize: 10, color: 'var(--c-text5)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {epLabel && <span style={{ color: 'var(--c-accent)', marginRight: 4 }}>{epLabel}</span>}
                    {sceneLabel} · {getBlockLabel(m.blockType)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--c-text)', lineHeight: 1.5 }}>
                    {m.context.before && (
                      <span style={{ color: 'var(--c-text4)' }}>
                        {m.context.before.length > 20 ? '…' + m.context.before.slice(-20) : m.context.before}
                      </span>
                    )}
                    <mark style={{
                      background: 'rgba(141,160,187,0.2)', color: 'var(--c-accent)',
                      fontWeight: 600, borderRadius: 2, padding: '0 1px',
                    }}>
                      {m.context.match}
                    </mark>
                    {m.context.after && (
                      <span style={{ color: 'var(--c-text4)' }}>
                        {m.context.after.length > 20 ? m.context.after.slice(0, 20) + '…' : m.context.after}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
