import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { getChipInlineStyle } from '../utils/emotionColor';

// ─── Built-in guide sets ──────────────────────────────────────────────────────
export const BUILTIN_GUIDES = [
  {
    id: 'save-the-cat',
    name: 'Save the Cat (15비트)',
    color: '#6366f1',
    beats: [
      '오프닝', '주제 명시', '설정', '기폭제', '토론', '2막 진입',
      'B스토리', '재미와 놀이', '중간점', '악당이 다가오다',
      '절망의 순간', '영혼의 어두운 밤', '3막 진입', '피날레', '엔딩',
    ],
  },
  {
    id: '7-sequence',
    name: '7시퀀스',
    color: '#f59e0b',
    beats: ['발단', '전개1', '전개2', '전개3', '클라이막스', '결말1', '결말2'],
  },
];

// ─── Guide panel (exported for RightPanel context) ────────────────────────────
export function GuidePanel({ selectedSceneId, scenes, dispatch }) {
  const [openGuide, setOpenGuide] = useState(null);

  const handleBeatClick = (beat) => {
    if (!selectedSceneId) return;
    const scene = scenes.find(s => s.id === selectedSceneId);
    if (!scene) return;
    const tags = scene.tags || [];
    if (tags.includes(beat)) return;
    dispatch({ type: 'UPDATE_SCENE', payload: { id: selectedSceneId, tags: [...tags, beat] }, _record: true });
  };

  const selectedScene = scenes.find(s => s.id === selectedSceneId);

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--c-text6)' }}>구조 지침</div>
      {BUILTIN_GUIDES.map(guide => (
        <div key={guide.id} className="mb-3">
          <button
            onClick={() => setOpenGuide(openGuide === guide.id ? null : guide.id)}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded text-left text-xs font-semibold"
            style={{
              background: 'var(--c-tag)',
              color: guide.color,
              border: `1px solid ${guide.color}44`,
              cursor: 'pointer',
            }}
          >
            <span>{guide.name}</span>
            <span style={{ opacity: 0.6 }}>{openGuide === guide.id ? '▲' : '▼'}</span>
          </button>
          {openGuide === guide.id && (
            <div className="mt-1 space-y-0.5 pl-2">
              {guide.beats.map((beat, i) => {
                const alreadyTagged = selectedScene && (selectedScene.tags || []).includes(beat);
                return (
                  <div
                    key={beat}
                    draggable
                    onClick={() => handleBeatClick(beat)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/beat', beat);
                      e.dataTransfer.setData('text/beat-color', guide.color);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    title={selectedSceneId ? `${beat} 태그 추가 (클릭 또는 드래그)` : '씬에 드래그하거나 씬 선택 후 클릭'}
                    className="flex items-center gap-2 text-xs py-1 rounded"
                    style={{
                      borderLeft: `2px solid ${guide.color}66`,
                      paddingLeft: '8px',
                      color: alreadyTagged ? guide.color : 'var(--c-text4)',
                      cursor: 'grab',
                      background: alreadyTagged ? `${guide.color}18` : 'transparent',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${guide.color}22`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = alreadyTagged ? `${guide.color}18` : 'transparent'; }}
                  >
                    <span style={{ color: guide.color, minWidth: '1.2em', fontSize: '10px' }}>{i + 1}</span>
                    {beat}
                    {alreadyTagged && <span style={{ marginLeft: 'auto', fontSize: '9px', color: guide.color }}>✓</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── TagPicker dropdown ───────────────────────────────────────────────────────
function TagPicker({ scene, dispatch, onClose }) {
  const existingTags = scene.tags || [];
  return (
    <div
      style={{
        position: 'absolute', right: 0, top: '100%', zIndex: 200,
        background: 'var(--c-panel)', border: '1px solid var(--c-border2)',
        borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
        minWidth: 160, padding: '6px 0', maxHeight: 280, overflowY: 'auto',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {BUILTIN_GUIDES.map(guide => (
        <div key={guide.id}>
          <div style={{ padding: '4px 12px 2px', fontSize: 10, fontWeight: 600, color: guide.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {guide.name}
          </div>
          {guide.beats.map(beat => {
            const has = existingTags.includes(beat);
            return (
              <button
                key={beat}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '5px 16px', fontSize: 12,
                  background: has ? 'var(--c-active)' : 'none',
                  color: has ? guide.color : 'var(--c-text3)',
                  border: 'none', cursor: 'pointer',
                }}
                onClick={() => {
                  const tags = has ? existingTags.filter(t => t !== beat) : [...existingTags, beat];
                  dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, tags }, _record: true });
                }}
              >
                {has ? '✓ ' : ''}{beat}
              </button>
            );
          })}
        </div>
      ))}
      <div style={{ height: 1, background: 'var(--c-border)', margin: '4px 0' }} />
      <button style={{ display: 'block', width: '100%', textAlign: 'center', padding: '5px 12px', fontSize: 11, color: 'var(--c-text5)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={onClose}>닫기</button>
    </div>
  );
}

// ─── EmotionChip ──────────────────────────────────────────────────────────────
function EmotionChip({ emotionTag }) {
  if (!emotionTag) return null;
  const style = getChipInlineStyle(emotionTag.color, emotionTag.intensity);
  return <span style={style}>{emotionTag.word}</span>;
}

// ─── getTimelineColor (라벤더→남색→인디고) ────────────────────────────────────
function getTimelineColor(ratio) {
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const lerpColor = (c1, c2, t) => ({
    r: lerp(c1[0], c2[0], t),
    g: lerp(c1[1], c2[1], t),
    b: lerp(c1[2], c2[2], t),
  });
  const light = [199, 210, 254];
  const dark  = [30,  46, 129];
  const mid   = [67,  56, 202];
  const c = ratio <= 0.85
    ? lerpColor(light, dark, ratio / 0.85)
    : lerpColor(dark, mid, (ratio - 0.85) / 0.15);
  return `rgb(${c.r},${c.g},${c.b})`;
}

// ─── ColorBar ─────────────────────────────────────────────────────────────────
function ColorBar({ tab, scenes, scriptBlocks, characters, epId, selectedCharKey }) {
  const BAR_H = 28;

  // 씬보드: 밝은 배경 + 검정 씬구분선 + 감정 dots
  if (tab === '씬보드') {
    const epBlocks = scriptBlocks.filter(b => b.episodeId === epId);
    const total = epBlocks.length || 1;
    const snBlocks = epBlocks.filter(b => b.type === 'scene_number');

    return (
      <div style={{ height: BAR_H, position: 'relative', flexShrink: 0, overflow: 'hidden', background: 'linear-gradient(to right, #c7d2fe, #1e2e81 85%, #4338ca)' }}>
        {snBlocks.map((sn) => {
          const idx = epBlocks.indexOf(sn);
          const pct = (idx / total) * 100;
          const nextSn = snBlocks[snBlocks.indexOf(sn) + 1];
          const end = nextSn ? epBlocks.indexOf(nextSn) : epBlocks.length;
          const seg = epBlocks.slice(idx, end);
          const emotionBlocks = seg.filter(b => b.emotionTag);
          return (
            <React.Fragment key={sn.id}>
              {/* 씬 구분선 */}
              <div style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${pct}%`,
                width: 1.5, background: 'rgba(255,255,255,0.7)',
              }} />
              {/* 감정 dots */}
              {emotionBlocks.map((b) => {
                const bIdx = epBlocks.indexOf(b);
                const dotPct = (bIdx / total) * 100;
                return (
                  <div
                    key={b.id}
                    title={b.emotionTag.word}
                    style={{
                      position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)',
                      left: `${dotPct}%`,
                      width: 6, height: 6, borderRadius: '50%',
                      background: b.emotionTag.color,
                      border: '1px solid rgba(255,255,255,0.8)',
                      pointerEvents: 'none',
                    }}
                  />
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  // 지문: 바코드형태 (action 블록 위치)
  if (tab === '지문') {
    const epBlocks = scriptBlocks.filter(b => b.episodeId === epId);
    const total = epBlocks.length || 1;
    const actionBlocks = epBlocks.filter(b => b.type === 'action');
    return (
      <div style={{ height: BAR_H, position: 'relative', flexShrink: 0, background: '#f5f5f5', borderBottom: '1px solid var(--c-border)' }}>
        {actionBlocks.map((b) => {
          const idx = epBlocks.indexOf(b);
          const pct = (idx / total) * 100;
          const w = Math.max(0.5, (1 / total) * 100);
          return (
            <div
              key={b.id}
              style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${pct}%`, width: `${w}%`,
                background: b.emotionTag ? b.emotionTag.color : '#212121',
                opacity: b.emotionTag ? 0.85 : 0.6,
              }}
            />
          );
        })}
      </div>
    );
  }

  // 인물: 선택된 인물의 감정태그 색상으로 표시
  if (tab === '인물') {
    const epBlocks = scriptBlocks.filter(b => b.episodeId === epId);
    const total = epBlocks.length || 1;
    const dialogueBlocks = epBlocks.filter(b => b.type === 'dialogue');

    return (
      <div style={{ height: BAR_H, position: 'relative', flexShrink: 0, background: 'var(--c-tag)', borderBottom: '1px solid var(--c-border)', overflow: 'hidden' }}>
        {dialogueBlocks.map((b) => {
          const idx = epBlocks.indexOf(b);
          const pct = (idx / total) * 100;
          const isSelected = selectedCharKey && (
            b.characterId === selectedCharKey ||
            b.charName === selectedCharKey ||
            b.characterName === selectedCharKey
          );
          const color = isSelected
            ? (b.emotionTag?.color || '#6366f1')
            : 'rgba(150,150,150,0.2)';
          return (
            <div
              key={b.id}
              title={isSelected ? (b.emotionTag?.word || b.characterName || '') : ''}
              style={{
                position: 'absolute', top: 4, bottom: 4,
                left: `${pct}%`, width: Math.max(0.5, (1 / total) * 100) + '%',
                background: color, borderRadius: 1,
              }}
            />
          );
        })}
      </div>
    );
  }

  return <div style={{ height: BAR_H, background: 'var(--c-tag)', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }} />;
}

// ─── SceneBoardCard ───────────────────────────────────────────────────────────
function SceneBoardCard({ scene, seqNum, isSelected, isOver, isDragging, onClick, onDelete, sceneChars, dragProps, dispatch }) {
  const [deleteMode, setDeleteMode] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const cardRef = useRef(null);

  // 카드 밖 클릭 시 deleteMode 해제
  useEffect(() => {
    if (!deleteMode) return;
    const handler = (e) => {
      if (cardRef.current && !cardRef.current.contains(e.target)) {
        setDeleteMode(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [deleteMode]);

  return (
    <div
      ref={cardRef}
      {...dragProps}
      onClick={onClick}
      onDoubleClick={(e) => { e.stopPropagation(); setDeleteMode(v => !v); }}
      style={{
        position: 'relative',
        background: isSelected ? 'var(--c-active)' : 'var(--c-card)',
        border: isOver
          ? '2px solid var(--c-accent)'
          : deleteMode
            ? '2px solid #ef4444'
            : `1px solid ${isSelected ? 'var(--c-accent)' : 'var(--c-border)'}`,
        borderRadius: 10,
        padding: '8px 10px',
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        transition: 'border-color 0.15s, opacity 0.15s',
      }}
    >
      {/* 씬정보 + 삭제 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <div style={{ fontSize: 10, color: 'var(--c-text5)', fontWeight: 600 }}>
          <span style={{ color: 'var(--c-accent2)', marginRight: 4 }}>S#{seqNum}</span>
          {scene.content && <span>{scene.content.replace(/^S#\d+\.?\s*/i, '')}</span>}
        </div>
        {deleteMode && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(scene.id); setDeleteMode(false); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: '#ef4444', color: '#fff', border: 'none',
              borderRadius: 6, padding: '2px 8px', fontSize: 11,
              cursor: 'pointer', fontWeight: 600, flexShrink: 0,
            }}
          >삭제</button>
        )}
      </div>

      {/* 인물등장 */}
      {sceneChars.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--c-text4)', marginBottom: 5 }}>
          {sceneChars.join(' · ')}
        </div>
      )}

      {/* 내용요약 (씬리스트에서 입력한 내용 표시) */}
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          fontSize: 11, lineHeight: 1.5, marginBottom: 4,
          color: scene.sceneListContent ? 'var(--c-text3)' : 'var(--c-text6)',
          fontStyle: scene.sceneListContent ? 'normal' : 'italic',
          minHeight: '4em',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {scene.sceneListContent || '씬리스트에서 입력'}
      </div>

      {/* 태그 + 추가 버튼 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4, marginTop: 2 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, flex: 1 }}>
          {(scene.tags || []).map(t => (
            <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'var(--c-tag)', color: 'var(--c-text5)' }}>{t}</span>
          ))}
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); setTagPickerOpen(v => !v); }}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            style={{
              background: 'none', border: '1px solid var(--c-border3)',
              borderRadius: 6, padding: '2px 6px', fontSize: 10,
              cursor: 'pointer', color: 'var(--c-text5)',
            }}
          >+태그</button>
          {tagPickerOpen && (
            <TagPicker
              scene={scene}
              dispatch={dispatch}
              onClose={() => setTagPickerOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SceneBoardTab ────────────────────────────────────────────────────────────
function SceneBoardTab({ epId, scenes, scriptBlocks, characters, dispatch, onSelectScene, selectedSceneId }) {
  const epScenes = useMemo(() =>
    scenes.filter(s => s.episodeId === epId).sort((a, b) => (a.sceneSeq ?? 0) - (b.sceneSeq ?? 0)),
    [scenes, epId]
  );
  const epBlocks = useMemo(() => scriptBlocks.filter(b => b.episodeId === epId), [scriptBlocks, epId]);

  const activeScenes = useMemo(() => epScenes.filter(s => !s.deleted), [epScenes]);
  const deletedScenes = useMemo(() => epScenes.filter(s => s.deleted), [epScenes]);

  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const [showDeleted, setShowDeleted] = useState(false);

  function handleDragStart(e, idx) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, idx) {
    e.preventDefault();
    if (idx !== dragIdx) setOverIdx(idx);
  }

  function handleDrop(e, toIdx) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === toIdx) { setDragIdx(null); setOverIdx(null); return; }
    const reordered = [...activeScenes];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const updatedScenes = reordered.map((s, i) => ({ ...s, sceneSeq: i + 1 }));
    const snById = {};
    epBlocks.forEach(b => { if (b.type === 'scene_number') snById[b.sceneId] = b; });
    const groups = reordered.map(scene => {
      const sn = snById[scene.id];
      if (!sn) return [];
      const start = epBlocks.indexOf(sn);
      const nextSceneInOld = activeScenes.find((s, i) => {
        const prevIdx = activeScenes.indexOf(scene);
        return i > prevIdx && snById[s.id] && epBlocks.indexOf(snById[s.id]) > start;
      });
      const end = nextSceneInOld && snById[nextSceneInOld.id]
        ? epBlocks.indexOf(snById[nextSceneInOld.id])
        : epBlocks.length;
      return epBlocks.slice(start, end);
    });
    const inGroup = new Set(groups.flat().map(b => b.id));
    const orphans = epBlocks.filter(b => !inGroup.has(b.id));
    const reorderedBlocks = [...orphans, ...groups.flat()];
    dispatch({ type: 'SET_BLOCKS', episodeId: epId, payload: reorderedBlocks, _record: true });
    dispatch({ type: 'SYNC_SCENES', episodeId: epId, payload: updatedScenes });
    setDragIdx(null);
    setOverIdx(null);
  }

  function handleDragEnd() { setDragIdx(null); setOverIdx(null); }

  function handleDelete(sceneId) {
    dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, deleted: true }, _record: true });
  }

  function handleRestore(sceneId) {
    dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, deleted: false }, _record: true });
  }

  function handleSaveSummary(sceneId, content) {
    dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, sceneListContent: content }, _record: true });
  }

  // 씬별 등장 인물 계산 — 인물정보(characterId)가 등록된 인물만
  const sceneCharsMap = useMemo(() => {
    const charMap = new Map(characters.map(c => [c.id, c]));
    const map = {};
    const snBlocks = epBlocks.filter(b => b.type === 'scene_number');
    snBlocks.forEach((sn, idx) => {
      const next = snBlocks[idx + 1];
      const start = epBlocks.indexOf(sn);
      const end = next ? epBlocks.indexOf(next) : epBlocks.length;
      const seg = epBlocks.slice(start + 1, end);
      const charSet = new Set();
      seg.forEach(b => {
        if (b.type === 'dialogue' && b.characterId && charMap.has(b.characterId)) {
          const c = charMap.get(b.characterId);
          const name = c.givenName || c.name || '';
          if (name) charSet.add(name);
        }
      });
      map[sn.sceneId] = [...charSet];
    });
    return map;
  }, [epBlocks, characters]);

  if (!activeScenes.length && !deletedScenes.length) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-text5)', fontSize: 13 }}>씬이 없습니다.</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      {/* 활성 씬 그리드 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 12,
      }}>
        {activeScenes.map((scene, idx) => (
          <SceneBoardCard
            key={scene.id}
            scene={scene}
            seqNum={idx + 1}
            isSelected={selectedSceneId === scene.id}
            isOver={overIdx === idx}
            isDragging={dragIdx === idx}
            onClick={() => onSelectScene?.(scene.id)}
            onDelete={handleDelete}
            sceneChars={sceneCharsMap[scene.id] || []}
            dispatch={dispatch}
            dragProps={{
              draggable: true,
              onDragStart: (e) => { e.stopPropagation(); handleDragStart(e, idx); },
              onDragOver: (e) => handleDragOver(e, idx),
              onDrop: (e) => handleDrop(e, idx),
              onDragEnd: handleDragEnd,
            }}
          />
        ))}
      </div>

      {/* 삭제된 씬 */}
      {deletedScenes.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setShowDeleted(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--c-text5)', padding: '4px 0',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: 9 }}>{showDeleted ? '▼' : '▶'}</span>
            삭제된 씬 {deletedScenes.length}개
          </button>
          {showDeleted && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 8, marginTop: 8, opacity: 0.65,
            }}>
              {deletedScenes.map(scene => (
                <div
                  key={scene.id}
                  style={{
                    background: 'var(--c-card)',
                    border: '1px dashed var(--c-border3)',
                    borderRadius: 10, padding: '8px 12px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--c-text6)' }}>S#{scene.sceneSeq}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-text4)', lineHeight: 1.3 }}>
                      {scene.sceneListContent || scene.content || '(내용 없음)'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestore(scene.id)}
                    style={{
                      background: 'var(--c-tag)', border: '1px solid var(--c-border3)',
                      borderRadius: 6, padding: '3px 8px', fontSize: 11,
                      cursor: 'pointer', color: 'var(--c-text3)', flexShrink: 0,
                    }}
                  >되살리기</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SceneTab ─────────────────────────────────────────────────────────────────
function SceneTab({ epId, scenes, scriptBlocks, dispatch, onSelectScene, selectedSceneId }) {
  const epScenes = useMemo(() =>
    scenes.filter(s => s.episodeId === epId && !s.deleted).sort((a, b) => (a.sceneSeq ?? 0) - (b.sceneSeq ?? 0)),
    [scenes, epId]
  );
  const epBlocks = useMemo(() => scriptBlocks.filter(b => b.episodeId === epId), [scriptBlocks, epId]);

  // 씬별 첫 번째 감정 블록
  const sceneFirstEmotion = useMemo(() => {
    const map = {};
    const snBlocks = epBlocks.filter(b => b.type === 'scene_number');
    snBlocks.forEach((sn, idx) => {
      const next = snBlocks[idx + 1];
      const start = epBlocks.indexOf(sn);
      const end = next ? epBlocks.indexOf(next) : epBlocks.length;
      const seg = epBlocks.slice(start + 1, end);
      map[sn.sceneId] = seg.find(b => b.emotionTag)?.emotionTag || null;
    });
    return map;
  }, [epBlocks]);

  const [tagPickerSceneId, setTagPickerSceneId] = useState(null);
  useEffect(() => {
    if (!tagPickerSceneId) return;
    const h = () => setTagPickerSceneId(null);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [tagPickerSceneId]);

  if (!epScenes.length) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-text5)', fontSize: 13 }}>씬이 없습니다.</div>;
  }

  return (
    <div style={{ padding: '0 0 16px' }}>
      {epScenes.map(scene => {
        const isSelected = selectedSceneId === scene.id;
        const emotion = sceneFirstEmotion[scene.id];
        const chars = (scene.characterIds || [])
          .map(id => {
            /* 이름 resolving은 scenes에 포함된 characterNames 필드 사용 */
            return (scene.characterNames || {})[id] || '';
          }).filter(Boolean);
        return (
          <div
            key={scene.id}
            onClick={() => {
              onSelectScene?.(scene.id);
              dispatch({ type: 'SET_ACTIVE_EPISODE', id: epId });
              setTimeout(() => dispatch({ type: 'SET_SCROLL_TO_SCENE', id: scene.id }), 50);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px',
              background: isSelected ? 'var(--c-active)' : 'transparent',
              borderBottom: '1px solid var(--c-border)',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--c-tag)'; }}
            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
          >
            {/* 씬 정보 */}
            <div style={{ fontSize: 12, color: 'var(--c-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {scene.content || `S#${scene.sceneSeq}`}
            </div>
            {/* 등장인물 */}
            {chars.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--c-text6)', flexShrink: 0 }}>
                {chars.join(' · ')}
              </div>
            )}
            {/* 일반 태그 */}
            <div style={{ display: 'flex', gap: 3, flexShrink: 0, flexWrap: 'wrap', maxWidth: 160 }}>
              {(scene.tags || []).map(t => (
                <span key={t} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 8, background: 'var(--c-tag)', color: 'var(--c-text5)' }}>{t}</span>
              ))}
            </div>
            {/* 감정 chip */}
            {emotion && (
              <div style={{ flexShrink: 0 }}>
                <EmotionChip emotionTag={emotion} />
              </div>
            )}
            {/* 태그 편집 버튼 */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={e => { e.stopPropagation(); setTagPickerSceneId(tagPickerSceneId === scene.id ? null : scene.id); }}
                style={{ background: 'none', border: '1px solid var(--c-border3)', borderRadius: 6, padding: '2px 6px', fontSize: 11, cursor: 'pointer', color: 'var(--c-text5)' }}
              >
                +태그
              </button>
              {tagPickerSceneId === scene.id && (
                <TagPicker scene={scene} dispatch={dispatch} onClose={() => setTagPickerSceneId(null)} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ActionTab ────────────────────────────────────────────────────────────────
function ActionTab({ epId, scenes, scriptBlocks }) {
  const epBlocks = useMemo(() => scriptBlocks.filter(b => b.episodeId === epId), [scriptBlocks, epId]);
  const epScenes = useMemo(() =>
    scenes.filter(s => s.episodeId === epId).sort((a, b) => (a.sceneSeq ?? 0) - (b.sceneSeq ?? 0)),
    [scenes, epId]
  );

  // 씬별 action 블록 그룹
  const groups = useMemo(() => {
    const snBlocks = epBlocks.filter(b => b.type === 'scene_number');
    return snBlocks.map((sn, idx) => {
      const next = snBlocks[idx + 1];
      const start = epBlocks.indexOf(sn);
      const end = next ? epBlocks.indexOf(next) : epBlocks.length;
      const seg = epBlocks.slice(start + 1, end);
      const scene = scenes.find(s => s.id === sn.sceneId);
      return {
        scene,
        sceneBlock: sn,
        actions: seg.filter(b => b.type === 'action'),
      };
    }).filter(g => g.actions.length > 0 && !g.scene?.deleted);
  }, [epBlocks, scenes]);

  if (!groups.length) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-text5)', fontSize: 13 }}>지문 블록이 없습니다.</div>;
  }

  return (
    <div style={{ padding: '8px 0 16px' }}>
      {groups.map(({ scene, sceneBlock, actions }) => (
        <div key={sceneBlock.id} style={{ marginBottom: 16 }}>
          {/* 씬 헤더 */}
          <div style={{ padding: '4px 16px', fontSize: 11, fontWeight: 700, color: 'var(--c-text4)', background: 'var(--c-tag)', borderBottom: '1px solid var(--c-border)' }}>
            {scene?.content || `S#${scene?.sceneSeq}`}
          </div>
          {/* action 블록들 */}
          {actions.map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 16px', borderBottom: '1px solid var(--c-border)' }}>
              <div style={{ flex: 1, fontSize: 12, color: 'var(--c-text)', lineHeight: 1.5 }}>
                {b.content?.replace(/<[^>]+>/g, '') || ''}
              </div>
              {b.emotionTag && (
                <div style={{ flexShrink: 0, paddingTop: 2 }}>
                  <EmotionChip emotionTag={b.emotionTag} />
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── CharacterTab ─────────────────────────────────────────────────────────────
function CharacterTab({ epId, scenes, scriptBlocks, characters, onCharKeyChange }) {
  const epBlocks = useMemo(() => scriptBlocks.filter(b => b.episodeId === epId), [scriptBlocks, epId]);
  const dialogueBlocks = useMemo(() => epBlocks.filter(b => b.type === 'dialogue'), [epBlocks]);

  // 등장 인물 목록 (대사 있는 인물만)
  const charList = useMemo(() => {
    const nameSet = new Map(); // characterId or charName → display name
    dialogueBlocks.forEach(b => {
      const key = b.characterId || b.charName || b.characterName || '';
      if (key) {
        const name = b.charName || b.characterName || b.characterId || '';
        if (!nameSet.has(key)) nameSet.set(key, name);
      }
    });
    return [...nameSet.entries()].map(([id, name]) => ({ id, name }));
  }, [dialogueBlocks]);

  const [selectedCharKey, setSelectedCharKey] = useState(charList[0]?.id || null);
  useEffect(() => {
    if (!selectedCharKey && charList.length > 0) {
      setSelectedCharKey(charList[0].id);
      onCharKeyChange?.(charList[0].id);
    }
  }, [charList]); // eslint-disable-line

  const handleCharSelect = (id) => {
    setSelectedCharKey(id);
    onCharKeyChange?.(id);
  };

  const selectedDialogues = useMemo(() => {
    if (!selectedCharKey) return [];
    return dialogueBlocks.filter(b =>
      (b.characterId || b.charName || b.characterName) === selectedCharKey ||
      (b.characterId === selectedCharKey) ||
      (b.charName === selectedCharKey)
    );
  }, [dialogueBlocks, selectedCharKey]);

  // 씬 번호 조회 헬퍼
  const sceneByBlockId = useMemo(() => {
    const map = {};
    const snBlocks = epBlocks.filter(b => b.type === 'scene_number');
    snBlocks.forEach((sn, idx) => {
      const next = snBlocks[idx + 1];
      const start = epBlocks.indexOf(sn);
      const end = next ? epBlocks.indexOf(next) : epBlocks.length;
      epBlocks.slice(start, end).forEach(b => { map[b.id] = sn; });
    });
    return map;
  }, [epBlocks]);

  const scenesMap = useMemo(() => {
    const m = {};
    scenes.forEach(s => { m[s.id] = s; });
    return m;
  }, [scenes]);

  if (!charList.length) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-text5)', fontSize: 13 }}>대사 블록이 없습니다.</div>;
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* 왼쪽: 인물 목록 */}
      <div style={{ width: 120, borderRight: '1px solid var(--c-border)', overflowY: 'auto', flexShrink: 0 }}>
        {charList.map(({ id, name }) => (
          <div
            key={id}
            onClick={() => handleCharSelect(id)}
            style={{
              padding: '10px 12px',
              fontSize: 12, fontWeight: selectedCharKey === id ? 700 : 400,
              color: selectedCharKey === id ? 'var(--c-accent)' : 'var(--c-text3)',
              background: selectedCharKey === id ? 'var(--c-active)' : 'transparent',
              cursor: 'pointer',
              borderBottom: '1px solid var(--c-border)',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { if (selectedCharKey !== id) e.currentTarget.style.background = 'var(--c-tag)'; }}
            onMouseLeave={e => { if (selectedCharKey !== id) e.currentTarget.style.background = 'transparent'; }}
          >
            {name || id}
          </div>
        ))}
      </div>

      {/* 오른쪽: 대사 목록 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {selectedDialogues.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c-text5)', fontSize: 13 }}>대사가 없습니다.</div>
        ) : (
          selectedDialogues.map(b => {
            const snBlock = sceneByBlockId[b.id];
            const scene = snBlock ? scenesMap[snBlock.sceneId] : null;
            return (
              <div key={b.id} style={{ padding: '8px 16px', borderBottom: '1px solid var(--c-border)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {/* 씬 번호 */}
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text5)', minWidth: 28, flexShrink: 0, paddingTop: 2 }}>
                  {scene ? `S#${scene.sceneSeq}` : ''}
                </div>
                {/* 대사 내용 */}
                <div style={{ flex: 1, fontSize: 12, color: 'var(--c-text)', lineHeight: 1.5 }}>
                  {b.content?.replace(/<[^>]+>/g, '') || ''}
                </div>
                {/* 감정 chip */}
                {b.emotionTag && (
                  <div style={{ flexShrink: 0, paddingTop: 2 }}>
                    <EmotionChip emotionTag={b.emotionTag} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── StructurePage ────────────────────────────────────────────────────────────
export default function StructurePage() {
  const { state, dispatch } = useApp();
  const { scenes, episodes, scriptBlocks, characters, activeProjectId, activeEpisodeId } = state;

  const TABS = ['씬보드', '지문', '인물'];
  const [activeTab, setActiveTab] = useState('씬보드');
  const [selectedSceneId, setSelectedSceneId] = useState(null);
  const [selectedCharKey, setSelectedCharKey] = useState(null);

  const projectEpisodes = useMemo(() =>
    episodes.filter(e => e.projectId === activeProjectId).sort((a, b) => a.number - b.number),
    [episodes, activeProjectId]
  );
  const [selectedEpId, setSelectedEpId] = useState(activeEpisodeId || projectEpisodes[0]?.id || null);

  useEffect(() => {
    if (!selectedEpId && projectEpisodes.length > 0) setSelectedEpId(projectEpisodes[0].id);
  }, [projectEpisodes]); // eslint-disable-line

  const epId = selectedEpId || projectEpisodes[0]?.id || null;

  const handleSelectScene = (id) => {
    setSelectedSceneId(id);
    dispatch({ type: 'SET_SELECTED_STRUCTURE_SCENE', id });
  };

  if (!activeProjectId) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--c-bg)', overflow: 'hidden' }}>

      {/* 컬러바 */}
      {epId && (
        <ColorBar
          tab={activeTab}
          scenes={scenes}
          scriptBlocks={scriptBlocks}
          characters={characters}
          epId={epId}
          selectedCharKey={selectedCharKey}
        />
      )}

      {/* 헤더: 회차 선택 + 탭 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
        <select
          value={epId || ''}
          onChange={e => setSelectedEpId(e.target.value)}
          style={{ fontSize: 12, background: 'var(--c-input)', color: 'var(--c-text2)', border: '1px solid var(--c-border3)', borderRadius: 6, padding: '3px 8px', outline: 'none' }}
        >
          {projectEpisodes.map(ep => (
            <option key={ep.id} value={ep.id}>{ep.number}화 {ep.title || ''}</option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        {/* 탭 버튼 */}
        <div style={{ display: 'flex', gap: 2 }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 8, border: 'none',
                background: activeTab === tab ? 'var(--c-accent)' : 'var(--c-tag)',
                color: activeTab === tab ? '#fff' : 'var(--c-text4)',
                fontWeight: activeTab === tab ? 700 : 400,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {epId ? (
          <>
            {activeTab === '씬보드' && (
              <SceneBoardTab
                epId={epId} scenes={scenes} scriptBlocks={scriptBlocks}
                characters={characters}
                dispatch={dispatch} onSelectScene={handleSelectScene} selectedSceneId={selectedSceneId}
              />
            )}
            {activeTab === '지문' && (
              <ActionTab epId={epId} scenes={scenes} scriptBlocks={scriptBlocks} />
            )}
            {activeTab === '인물' && (
              <CharacterTab
                epId={epId} scenes={scenes} scriptBlocks={scriptBlocks} characters={characters}
                onCharKeyChange={setSelectedCharKey}
              />
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--c-text5)', fontSize: 13 }}>
            회차를 선택하세요.
          </div>
        )}
      </div>

    </div>
  );
}
