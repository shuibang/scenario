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

function scrollToBlock(blockId) {
  const el = document.querySelector(`[data-block-id="${blockId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('find-highlight');
  setTimeout(() => el.classList.remove('find-highlight'), 1200);
}

export default function FindReplaceMobileModal({ open, initialMode, onClose }) {
  const { state, dispatch } = useApp();
  const { scriptBlocks, activeEpisodeId, activeProjectId } = state;

  const episodeBlocks = activeEpisodeId
    ? scriptBlocks.filter(b => b.episodeId === activeEpisodeId)
    : activeProjectId
      ? scriptBlocks.filter(b => b.projectId === activeProjectId)
      : [];

  const [query,         setQuery]         = useState('');
  const [replaceText,   setReplaceText]   = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [scope,         setScope]         = useState('all');
  const [matches,       setMatches]       = useState([]);
  const [currentIdx,    setCurrentIdx]    = useState(-1);
  const [replaceMode,   setReplaceMode]   = useState(initialMode === 'replace');
  const [replaceResult, setReplaceResult] = useState(null);

  const findInputRef = useRef(null);

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
      const results = findMatches(episodeBlocks, query, { caseSensitive, blockTypes, searchScope: 'content_only' });
      setMatches(results);
      setCurrentIdx(results.length > 0 ? 0 : -1);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, scope, caseSensitive, episodeBlocks]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIdx(i => (i + 1) % matches.length);
  }, [matches.length]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIdx(i => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const handleMatchTap = useCallback((blockId, idx) => {
    setCurrentIdx(idx);
    onClose?.();
    requestAnimationFrame(() => scrollToBlock(blockId));
  }, [onClose]);

  const handleReplaceAll = useCallback(() => {
    if (!query.trim() || matches.length === 0) return;
    const ok = window.confirm(
      `"${query}"를 "${replaceText}"로 ${matches.length}개 모두 바꿉니다. 계속하시겠습니까?`
    );
    if (!ok) return;

    const blockTypes = scope === 'all' ? null : [scope];
    const updatedBlocks = replaceAllInBlocks(episodeBlocks, query, replaceText, {
      caseSensitive,
      blockTypes,
    });

    const unchanged = updatedBlocks.every((b, i) => b === episodeBlocks[i]);
    if (unchanged) return;

    if (activeEpisodeId) {
      dispatch({ type: 'SET_BLOCKS', episodeId: activeEpisodeId, payload: updatedBlocks, _record: true });
    } else {
      const epIds = [...new Set(updatedBlocks.map(b => b.episodeId).filter(Boolean))];
      epIds.forEach(epId => {
        dispatch({
          type: 'SET_BLOCKS',
          episodeId: epId,
          payload: updatedBlocks.filter(b => b.episodeId === epId),
          _record: true,
        });
      });
    }

    setReplaceResult(`${matches.length}개를 바꿨습니다.`);
    setMatches([]);
    setCurrentIdx(-1);
  }, [query, replaceText, matches, scope, caseSensitive, episodeBlocks, activeEpisodeId, dispatch]);

  const sceneBlocks = episodeBlocks.filter(b => b.type === 'scene_number');
  function getSceneLabel(blockIndex) {
    let lastScene = null;
    for (const sb of sceneBlocks) {
      const sbIdx = episodeBlocks.findIndex(b => b.id === sb.id);
      if (sbIdx <= blockIndex) lastScene = sb;
      else break;
    }
    return lastScene?.label || lastScene?.content || 'S#?';
  }

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--c-text3)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={e => setCaseSensitive(e.target.checked)}
                  style={{ accentColor: 'var(--c-accent)', cursor: 'pointer', width: 14, height: 14 }}
                />
                대/소문자
              </label>
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
              const sceneLabel = getSceneLabel(m.blockIndex);
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
                    {sceneLabel} · {getBlockLabel(m.blockType)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--c-text)', lineHeight: 1.5 }}>
                    {m.context.before && (
                      <span style={{ color: 'var(--c-text4)' }}>
                        {m.context.before.length > 20 ? '…' + m.context.before.slice(-20) : m.context.before}
                      </span>
                    )}
                    <mark style={{
                      background: 'rgba(90,90,245,0.2)', color: 'var(--c-accent)',
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
