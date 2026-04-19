import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { findMatches, replaceAllInBlocks } from '../utils/findReplace';

// scope: 'all' | 'dialogue' | 'action'
const SCOPE_LABELS = {
  all:      '전체',
  dialogue: '대사만',
  action:   '지문만',
};

function getBlockLabel(type) {
  if (type === 'scene_number')  return '씬';
  if (type === 'dialogue')      return '대사';
  if (type === 'action')        return '지문';
  if (type === 'parenthetical') return '괄호체';
  return type;
}

function HighlightedText({ before, match, after }) {
  return (
    <span>
      {before && (
        <span style={{ color: 'var(--c-text4)' }}>
          {before.length > 20 ? '…' + before.slice(-20) : before}
        </span>
      )}
      <mark style={{
        background: 'rgba(90,90,245,0.2)',
        color: 'var(--c-accent)',
        fontWeight: 600,
        borderRadius: 2,
        padding: '0 1px',
      }}>
        {match}
      </mark>
      {after && (
        <span style={{ color: 'var(--c-text4)' }}>
          {after.length > 20 ? after.slice(0, 20) + '…' : after}
        </span>
      )}
    </span>
  );
}

function scrollToBlock(blockId) {
  const el = document.querySelector(`[data-block-id="${blockId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('find-highlight');
  setTimeout(() => el.classList.remove('find-highlight'), 1200);
}

export default function FindReplacePanel({ initialMode = 'find', onClose }) {
  const { state, dispatch } = useApp();
  const { scriptBlocks, activeEpisodeId, activeProjectId } = state;

  // activeEpisodeId가 null이면 activeProjectId로 fallback
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

  const findInputRef    = useRef(null);
  const replaceInputRef = useRef(null);
  const listRef         = useRef(null);

  // 초기 포커스
  useEffect(() => {
    findInputRef.current?.focus();
    if (initialMode === 'replace') setReplaceMode(true);
  }, []);

  // 실시간 검색 (150ms 디바운스)
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

  // currentIdx 변경 시 에디터 스크롤
  useEffect(() => {
    if (currentIdx < 0 || !matches[currentIdx]) return;
    scrollToBlock(matches[currentIdx].blockId);
  }, [currentIdx]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIdx(i => (i + 1) % matches.length);
  }, [matches.length]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIdx(i => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);

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
      // episodeId별 그룹화 dispatch
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

  // ESC 닫기
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const statusText = (() => {
    if (!query.trim()) return '검색어를 입력하세요';
    if (matches.length === 0) return '매칭 없음';
    return `결과: ${matches.length}개 발견${currentIdx >= 0 ? ` (${currentIdx + 1}번째)` : ''}`;
  })();

  // 매칭 블록이 속한 씬 레이블 조회
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

  const inputStyle = {
    width: '100%', height: 32, padding: '0 8px', fontSize: 13,
    border: '1px solid var(--c-border3)', borderRadius: 4,
    background: 'var(--c-input)', color: 'var(--c-text)',
    outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 11, color: 'var(--c-text4)', marginBottom: 4, display: 'block' };
  const sectionStyle = { padding: '10px 12px 6px' };
  const dividerStyle = {
    fontSize: 10, color: 'var(--c-text6)', textTransform: 'uppercase',
    letterSpacing: '0.06em', padding: '6px 12px 4px',
  };

  return (
    <div
      className="h-full flex flex-col select-none"
      style={{ background: 'var(--c-panel)', borderRight: '1px solid var(--c-border)' }}
    >
      {/* 헤더 */}
      <div style={{
        height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 8px 0 12px', borderBottom: '1px solid var(--c-border)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>찾기 / 바꾸기</span>
        <button
          onClick={onClose}
          title="닫기 (Esc)"
          style={{
            width: 28, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer',
            background: 'transparent', color: 'var(--c-text4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--c-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <X size={14} />
        </button>
      </div>

      {/* 찾기 input */}
      <div style={sectionStyle}>
        <label style={labelStyle}>찾기</label>
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
      <div style={{ padding: '2px 12px 6px' }}>
        <button
          onClick={() => setReplaceMode(v => !v)}
          style={{
            fontSize: 11, color: replaceMode ? 'var(--c-accent)' : 'var(--c-text4)',
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
            display: 'flex', alignItems: 'center', gap: 3,
          }}
        >
          <span style={{ fontSize: 9 }}>{replaceMode ? '▲' : '▼'}</span>
          바꾸기
        </button>
      </div>

      {replaceMode && (
        <div style={{ ...sectionStyle, paddingTop: 0 }}>
          <label style={labelStyle}>바꿀 단어</label>
          <input
            ref={replaceInputRef}
            value={replaceText}
            onChange={e => setReplaceText(e.target.value)}
            placeholder="바꿀 단어 입력"
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = 'var(--c-accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--c-border3)'}
          />
        </div>
      )}

      {/* 옵션 */}
      <div style={dividerStyle}>옵션</div>
      <div style={{ padding: '2px 12px 6px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--c-text3)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={e => setCaseSensitive(e.target.checked)}
            style={{ accentColor: 'var(--c-accent)', cursor: 'pointer' }}
          />
          대/소문자 구분
        </label>
      </div>

      {/* 범위 */}
      <div style={dividerStyle}>범위</div>
      <div style={{ padding: '2px 12px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {Object.entries(SCOPE_LABELS).map(([val, lbl]) => (
          <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--c-text3)', cursor: 'pointer' }}>
            <input
              type="radio"
              name="fr-scope"
              value={val}
              checked={scope === val}
              onChange={() => setScope(val)}
              style={{ accentColor: 'var(--c-accent)', cursor: 'pointer' }}
            />
            {lbl}
          </label>
        ))}
      </div>

      {/* 버튼 그룹 */}
      <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={goPrev}
          disabled={matches.length === 0}
          title="이전 (Shift+Enter)"
          style={{
            height: 30, padding: '0 8px', fontSize: 11, borderRadius: 4,
            cursor: matches.length > 0 ? 'pointer' : 'default',
            border: '1px solid var(--c-border3)', background: 'var(--c-input)', color: 'var(--c-text3)',
            display: 'flex', alignItems: 'center', gap: 3, opacity: matches.length === 0 ? 0.4 : 1,
          }}
        >
          <ChevronUp size={12} /> 이전
        </button>
        <button
          onClick={goNext}
          disabled={matches.length === 0}
          title="다음 (Enter)"
          style={{
            height: 30, padding: '0 8px', fontSize: 11, borderRadius: 4,
            cursor: matches.length > 0 ? 'pointer' : 'default',
            border: '1px solid var(--c-border3)', background: 'var(--c-input)', color: 'var(--c-text3)',
            display: 'flex', alignItems: 'center', gap: 3, opacity: matches.length === 0 ? 0.4 : 1,
          }}
        >
          <ChevronDown size={12} /> 다음
        </button>
        {replaceMode && (
          <button
            onClick={handleReplaceAll}
            disabled={matches.length === 0 || !query.trim()}
            title="모두 바꾸기"
            style={{
              height: 30, padding: '0 8px', fontSize: 11, borderRadius: 4,
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
      </div>

      {/* 상태바 */}
      <div style={{
        height: 32, borderTop: '1px solid var(--c-border)', borderBottom: '1px solid var(--c-border)',
        padding: '0 12px', display: 'flex', alignItems: 'center', flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: replaceResult ? 'var(--c-accent)' : 'var(--c-text4)' }}>
          {replaceResult || statusText}
        </span>
      </div>

      {/* 매칭 목록 */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {matches.length === 0 && query.trim() && !replaceResult && (
          <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--c-text5)', textAlign: 'center' }}>
            매칭 없음
          </div>
        )}
        {matches.map((m, i) => {
          const sceneLabel = getSceneLabel(m.blockIndex);
          const isActive = i === currentIdx;
          return (
            <div
              key={`${m.blockId}-${m.matchIndex}`}
              onClick={() => { setCurrentIdx(i); scrollToBlock(m.blockId); }}
              style={{
                padding: '7px 12px', cursor: 'pointer',
                borderLeft: isActive ? '2px solid var(--c-accent)' : '2px solid transparent',
                background: isActive ? 'var(--c-active)' : 'transparent',
                transition: 'background 80ms',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-hover)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ fontSize: 10, color: 'var(--c-text5)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {sceneLabel} · {getBlockLabel(m.blockType)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--c-text)', lineHeight: 1.4 }}>
                <HighlightedText {...m.context} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
