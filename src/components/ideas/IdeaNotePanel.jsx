import React, { useEffect, useMemo, useState } from 'react';
import {
  subscribeIdeas,
  addIdea,
  updateIdea,
  deleteIdea,
} from '../../store/ideasStore';
import IdeaNoteEditor from './IdeaNoteEditor';

/**
 * IdeaNotePanel — 아이디어 노트 핵심 패널
 *
 * 같은 컴포넌트를 3 mount point 에서 재사용:
 *   - 사이드 시트 (compact)
 *   - 분할보기 페인 (comfortable)
 *   - 풀스크린 페이지 (full)
 *
 * Props:
 *   density       — 'compact' | 'comfortable' | 'full' (기본 'comfortable')
 *   onExpand      — 풀사이즈 보기로 전환 콜백 (있으면 우상단에 버튼 표시)
 *   onClose       — 닫기 콜백 (있으면 우상단 X 표시)
 *   onPromote     — (idea) => void  : 작품으로 승격 핸들러 (외부 모달 연결)
 *   showHeader    — 상단바 표시 여부 (기본 true)
 */
export default function IdeaNotePanel({
  density = 'comfortable',
  onExpand,
  onClose,
  onPromote,
  showHeader = true,
}) {
  const [ideas, setIdeas] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState(null);
  const [sortMode, setSortMode] = useState('updated'); // 'updated' | 'created' | 'starred'

  useEffect(() => {
    const unsub = subscribeIdeas((next) => setIdeas(next.slice()));
    return unsub;
  }, []);

  // 자동 선택: 첫 진입 시 또는 선택된 항목이 사라졌을 때 가장 위 항목 선택
  useEffect(() => {
    if (ideas.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !ideas.some((i) => i.id === selectedId)) {
      setSelectedId(ideas[0].id);
    }
  }, [ideas, selectedId]);

  const allTags = useMemo(() => {
    const set = new Set();
    ideas.forEach((it) => (it.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [ideas]);

  const filtered = useMemo(() => {
    let rows = ideas;
    if (tagFilter) rows = rows.filter((it) => (it.tags || []).includes(tagFilter));
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((it) => {
        if ((it.title || '').toLowerCase().includes(q)) return true;
        const blockText = (it.blocks || [])
          .map((b) => `${b.content || ''} ${b.name || ''} ${b.title || ''} ${b.url || ''}`)
          .join(' ')
          .toLowerCase();
        return blockText.includes(q);
      });
    }
    rows = rows.slice();
    if (sortMode === 'updated') rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    else if (sortMode === 'created') rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    else if (sortMode === 'starred') {
      rows.sort((a, b) => {
        if (!!a.starred !== !!b.starred) return a.starred ? -1 : 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
    }
    return rows;
  }, [ideas, search, tagFilter, sortMode]);

  const selected = useMemo(
    () => ideas.find((it) => it.id === selectedId) || null,
    [ideas, selectedId]
  );

  const handleAdd = async () => {
    const created = await addIdea();
    setSelectedId(created.id);
  };

  const handleUpdate = (patch) => {
    if (!selected) return;
    updateIdea(selected.id, patch);
  };

  const handleDelete = async () => {
    if (!selected) return;
    const id = selected.id;
    await deleteIdea(id);
  };

  const handlePromote = () => {
    if (!selected || !onPromote) return;
    onPromote(selected);
  };

  // Layout: compact는 목록/편집 토글, comfortable/full은 좌우 분할
  const isCompact = density === 'compact';
  const [compactView, setCompactView] = useState('list'); // 'list' | 'editor'

  const headerHeight = 36;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0,
      background: 'var(--c-bg)',
    }}>
      {showHeader && (
        <div style={{
          flexShrink: 0, height: headerHeight,
          display: 'flex', alignItems: 'center',
          padding: '0 10px', gap: 8,
          borderBottom: '1px solid var(--c-border)',
          background: 'var(--c-panel)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text2)' }}>💡 아이디어 노트</span>
          <span style={{ fontSize: 10.5, color: 'var(--c-text6)' }}>{ideas.length}개</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={handleAdd}
              title="새 아이디어"
              style={{ ...headerBtnStyle, color: 'var(--c-accent)', borderColor: 'var(--c-accent)' }}
            >+ 새로</button>
            {onExpand && (
              <button onClick={onExpand} title="풀사이즈 보기" style={headerBtnStyle}>⛶</button>
            )}
            {onClose && (
              <button onClick={onClose} title="닫기" style={headerBtnStyle}>✕</button>
            )}
          </div>
        </div>
      )}

      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex',
        flexDirection: isCompact ? 'column' : 'row',
      }}>
        {/* 목록 영역 */}
        {(!isCompact || compactView === 'list') && (
          <div style={{
            flex: isCompact ? '1 1 0' : '0 0 240px',
            minWidth: 0, minHeight: 0,
            borderRight: isCompact ? 'none' : '1px solid var(--c-border)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--c-border3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="제목·본문 검색"
                style={searchInputStyle}
              />
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {[
                  { id: 'updated', label: '수정순' },
                  { id: 'created', label: '작성순' },
                  { id: 'starred', label: '⭐ 우선' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSortMode(s.id)}
                    style={{
                      ...miniChipStyle,
                      ...(sortMode === s.id ? activeChipStyle : null),
                    }}
                  >{s.label}</button>
                ))}
              </div>
              {allTags.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxHeight: 60, overflowY: 'auto' }}>
                  <button
                    onClick={() => setTagFilter(null)}
                    style={{ ...miniChipStyle, ...(tagFilter === null ? activeChipStyle : null) }}
                  >전체 태그</button>
                  {allTags.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTagFilter(t)}
                      style={{ ...miniChipStyle, ...(tagFilter === t ? activeChipStyle : null) }}
                    >#{t}</button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--c-text6)', fontSize: 12 }}>
                  {ideas.length === 0 ? '+ 새로 만들어 시작해보세요' : '검색 결과 없음'}
                </div>
              ) : filtered.map((it) => (
                <IdeaListItem
                  key={it.id}
                  idea={it}
                  active={it.id === selectedId}
                  onSelect={() => {
                    setSelectedId(it.id);
                    if (isCompact) setCompactView('editor');
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* 편집 영역 */}
        {(!isCompact || compactView === 'editor') && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {isCompact && (
              <div style={{
                flexShrink: 0,
                padding: '6px 10px',
                borderBottom: '1px solid var(--c-border3)',
                background: 'var(--c-panel)',
              }}>
                <button
                  onClick={() => setCompactView('list')}
                  style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 4,
                    border: '1px solid var(--c-border3)', background: 'transparent',
                    color: 'var(--c-text4)', cursor: 'pointer',
                  }}
                >← 목록</button>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
              <IdeaNoteEditor
                idea={selected}
                onChange={handleUpdate}
                onPromote={onPromote && selected ? handlePromote : null}
                onDelete={selected ? handleDelete : null}
                compact={isCompact}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IdeaListItem({ idea, active, onSelect }) {
  const preview = useMemo(() => {
    const first = (idea.blocks || []).find((b) => (b.content || b.url || b.name || '').trim());
    if (!first) return '';
    if (first.type === 'character') return `${first.name || ''} — ${first.content || ''}`.slice(0, 80);
    if (first.type === 'link')      return first.url || first.title || '';
    if (first.type === 'image')     return '🖼️ 이미지';
    return (first.content || '').slice(0, 80);
  }, [idea]);

  const elapsed = useMemo(() => {
    const ts = idea.updatedAt || idea.createdAt || 0;
    if (!ts) return '';
    const diff = Date.now() - ts;
    const d = 86400000;
    if (diff < d) return '오늘';
    if (diff < d * 7) return `${Math.floor(diff / d)}일 전`;
    if (diff < d * 30) return `${Math.floor(diff / (d * 7))}주 전`;
    if (diff < d * 365) return `${Math.floor(diff / (d * 30))}달 전`;
    return `${Math.floor(diff / (d * 365))}년 전`;
  }, [idea]);

  return (
    <button
      onClick={onSelect}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '8px 10px',
        border: 'none',
        borderBottom: '1px solid var(--c-border3)',
        background: active ? 'var(--c-active)' : 'transparent',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--c-hover)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        {idea.starred && <span style={{ fontSize: 11 }}>⭐</span>}
        <span style={{
          fontSize: 12.5, fontWeight: 600,
          color: active ? 'var(--c-accent)' : 'var(--c-text2)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
        }}>
          {idea.title || '(제목 없음)'}
        </span>
        <span style={{ fontSize: 9.5, color: 'var(--c-text6)' }}>{elapsed}</span>
      </div>
      {preview && (
        <div style={{
          fontSize: 11, color: 'var(--c-text5)',
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          lineHeight: 1.4,
        }}>
          {preview}
        </div>
      )}
      {(idea.tags || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
          {idea.tags.slice(0, 4).map((t) => (
            <span key={t} style={{
              fontSize: 9.5, padding: '1px 6px', borderRadius: 8,
              background: 'var(--c-tag, var(--c-input))', color: 'var(--c-text5)',
            }}>#{t}</span>
          ))}
        </div>
      )}
    </button>
  );
}

// ─── 스타일 ─────────────────────────────────────────────────────────────────
const searchInputStyle = {
  width: '100%', padding: '5px 9px', borderRadius: 4,
  border: '1px solid var(--c-border3)', background: 'var(--c-input)',
  color: 'var(--c-text)', fontSize: 12, outline: 'none', boxSizing: 'border-box',
};

const headerBtnStyle = {
  padding: '3px 8px', borderRadius: 4, fontSize: 11,
  border: '1px solid var(--c-border3)', background: 'transparent',
  color: 'var(--c-text4)', cursor: 'pointer',
};

const miniChipStyle = {
  padding: '2px 7px', borderRadius: 10, fontSize: 10.5,
  border: '1px solid var(--c-border3)', background: 'transparent',
  color: 'var(--c-text5)', cursor: 'pointer',
};

const activeChipStyle = {
  background: 'var(--c-active)',
  borderColor: 'var(--c-accent)',
  color: 'var(--c-accent)',
};
