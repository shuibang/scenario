import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { findMatches, replaceAllInBlocks } from '../utils/findReplace';

// 블록 유형 범위: 'all' | 'dialogue' | 'action'
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
        background: 'rgba(141,160,187,0.2)',
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

// 씬 레이블: searchBlocks 내 해당 블록 앞의 마지막 scene_number
function getSceneLabel(blockId, searchBlocks) {
  const block = searchBlocks.find(b => b.id === blockId);
  if (!block) return 'S#?';
  // 같은 회차 블록만 대상
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

export default function FindReplacePanel({ initialMode = 'find', onClose }) {
  const { state, dispatch } = useApp();
  const { scriptBlocks, activeEpisodeId, activeProjectId, episodes } = state;

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
  const listRef      = useRef(null);

  // 검색 대상 블록
  const currentEpisodeBlocks = activeEpisodeId
    ? scriptBlocks.filter(b => b.episodeId === activeEpisodeId)
    : activeProjectId
      ? scriptBlocks.filter(b => b.projectId === activeProjectId)
      : [];

  const projectBlocks = activeProjectId
    ? scriptBlocks.filter(b => b.projectId === activeProjectId)
    : currentEpisodeBlocks;

  const searchBlocks = episodeScope === 'all' ? projectBlocks : currentEpisodeBlocks;

  // 현재 프로젝트의 회차 목록 (번호 순)
  const projectEpisodes = (episodes || [])
    .filter(e => e.projectId === activeProjectId)
    .sort((a, b) => (a.number || 0) - (b.number || 0));

  const getEpLabel = useCallback((episodeId) => {
    const ep = projectEpisodes.find(e => e.id === episodeId);
    return ep ? `${ep.number}화` : '';
  }, [projectEpisodes]);

  // 초기 포커스
  useEffect(() => {
    findInputRef.current?.focus();
    if (initialMode === 'replace') setReplaceMode(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 실시간 검색 (150ms 디바운스)
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

  // 블록으로 이동 — 다른 회차면 먼저 회차 전환
  const navigateToBlock = useCallback((blockId) => {
    const block = searchBlocks.find(b => b.id === blockId);
    if (!block) return;

    const doScroll = () => {
      const el = document.querySelector(`[data-block-id="${blockId}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('find-highlight');
      setTimeout(() => el.classList.remove('find-highlight'), 1200);
    };

    if (block.episodeId && block.episodeId !== activeEpisodeId) {
      dispatch({ type: 'SET_ACTIVE_EPISODE', id: block.episodeId });
      // 에디터가 새 회차를 로드할 때까지 대기
      setTimeout(doScroll, 350);
    } else {
      doScroll();
    }
  }, [searchBlocks, activeEpisodeId, dispatch]);

  // currentIdx 변경 시 에디터 스크롤
  useEffect(() => {
    if (currentIdx < 0 || !matches[currentIdx]) return;
    navigateToBlock(matches[currentIdx].blockId);
  }, [currentIdx]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // episodeId별 그룹화 dispatch
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

  const inputStyle = {
    width: '100%', height: 32, padding: '0 8px', fontSize: 13,
    border: '1px solid var(--c-border3)', borderRadius: 4,
    background: 'var(--c-input)', color: 'var(--c-text)',
    outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle   = { fontSize: 11, color: 'var(--c-text4)', marginBottom: 4, display: 'block' };
  const sectionStyle = { padding: '10px 12px 6px', flexShrink: 0 };
  const radioLabelStyle = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--c-text3)', cursor: 'pointer' };

  return (
    <div
      className="h-full flex flex-col select-none"
      style={{ background: 'var(--c-panel)', borderRight: '1px solid var(--c-border)', overflow: 'hidden' }}
    >
      {/* ── 컨트롤 전체를 단일 flexShrink:0 블록으로 묶음 ────────────────────── */}
      <div style={{ flexShrink: 0 }}>

        {/* 헤더 */}
        <div style={{
          height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 8px 0 12px', borderBottom: '1px solid var(--c-border)',
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
        <div style={{ padding: '2px 12px 4px' }}>
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
              value={replaceText}
              onChange={e => setReplaceText(e.target.value)}
              placeholder="바꿀 단어 입력"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--c-accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--c-border3)'}
            />
          </div>
        )}

        {/* 옵션 + 검색 범위 (컴팩트) */}
        <div style={{ padding: '6px 12px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* 회차 범위 pills */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[{ v: 'current', l: '현재 회차' }, { v: 'all', l: '전체 대본' }].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => setEpisodeScope(v)}
                style={{
                  height: 24, padding: '0 8px', fontSize: 11, borderRadius: 12, cursor: 'pointer',
                  border: '1px solid',
                  borderColor: episodeScope === v ? 'var(--c-accent)' : 'var(--c-border3)',
                  background: episodeScope === v ? 'var(--c-accent)' : 'var(--c-input)',
                  color: episodeScope === v ? '#fff' : 'var(--c-text4)',
                  fontWeight: episodeScope === v ? 600 : 400,
                }}
              >
                {l}
              </button>
            ))}
          </div>
          {/* 블록 유형 + 대소문자 한 줄 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(SCOPE_LABELS).map(([val, lbl]) => (
              <label key={val} style={{ ...radioLabelStyle, fontSize: 11 }}>
                <input
                  type="radio" name="fr-scope" value={val}
                  checked={scope === val}
                  onChange={() => setScope(val)}
                  style={{ accentColor: 'var(--c-accent)', cursor: 'pointer' }}
                />
                {lbl}
              </label>
            ))}
          </div>
        </div>

        {/* 버튼 그룹 */}
        <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 6 }}>
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
          padding: '0 12px', display: 'flex', alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, color: replaceResult ? 'var(--c-accent)' : 'var(--c-text4)' }}>
            {replaceResult || statusText}
          </span>
        </div>

      </div>{/* ── 컨트롤 끝 ──────────────────────────────────────────────────────── */}

      {/* 매칭 목록 — 컨트롤과 별개의 flex:1 영역 */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {matches.length === 0 && query.trim() && !replaceResult && (
          <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--c-text5)', textAlign: 'center' }}>
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
              onClick={() => { setCurrentIdx(i); navigateToBlock(m.blockId); }}
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
                {epLabel && <span style={{ color: 'var(--c-accent)', marginRight: 4 }}>{epLabel}</span>}
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
