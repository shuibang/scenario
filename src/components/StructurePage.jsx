import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { resolveSceneLabel } from '../utils/sceneResolver';

// ─── Built-in guide sets ──────────────────────────────────────────────────────
export const BUILTIN_GUIDES = [
  {
    id: 'save-the-cat',
    name: 'Save the Cat (15비트)',
    color: '#6366f1',
    beats: [
      '오프닝',
      '주제 명시',
      '설정',
      '기폭제',
      '토론',
      '2막 진입',
      'B스토리',
      '재미와 놀이',
      '중간점',
      '악당이 다가오다',
      '절망의 순간',
      '영혼의 어두운 밤',
      '3막 진입',
      '피날레',
      '엔딩',
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
  const [openGuide, setOpenGuide] = useState('save-the-cat');

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
      <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--c-text6)' }}>구조 지침</div>
      <div className="text-[10px] mb-3" style={{ color: selectedScene ? 'var(--c-accent2)' : 'var(--c-text6)' }}>
        {selectedScene ? `선택: ${selectedScene.label || '씬'}` : '씬 클릭 후 비트 적용'}
      </div>
      <div className="text-[10px] mb-2" style={{ color: 'var(--c-text6)' }}>비트를 씬 위로 드래그하여 태그 적용</div>
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
                      opacity: 1,
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

// ─── SceneList for one episode ────────────────────────────────────────────────
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
                  const tags = has
                    ? existingTags.filter(t => t !== beat)
                    : [...existingTags, beat];
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

function EpisodeSceneList({ ep, scenes, scriptBlocks, dispatch, compact = false, selectedSceneId, onSelectScene }) {
  const epScenes = useMemo(() =>
    scenes.filter(s => s.episodeId === ep.id).sort((a, b) => a.sceneSeq - b.sceneSeq),
    [scenes, ep.id]
  );
  const [tagPickerSceneId, setTagPickerSceneId] = useState(null);
  useEffect(() => {
    if (!tagPickerSceneId) return;
    const handler = () => setTagPickerSceneId(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tagPickerSceneId]);
  const epBlocks = useMemo(() => scriptBlocks.filter(b => b.episodeId === ep.id), [scriptBlocks, ep.id]);
  const snBlocks = useMemo(() => epBlocks.filter(b => b.type === 'scene_number'), [epBlocks]);
  const [dragOverSceneId, setDragOverSceneId] = useState(null);

  const sceneMeta = useMemo(() => {
    const meta = {};
    snBlocks.forEach((snb, idx) => {
      const next = snBlocks[idx + 1];
      const start = epBlocks.indexOf(snb);
      const end = next ? epBlocks.indexOf(next) : epBlocks.length;
      const seg = epBlocks.slice(start + 1, end);
      meta[snb.sceneId] = {
        dialogue: seg.filter(b => b.type === 'dialogue').length,
        action: seg.filter(b => b.type === 'action').length,
      };
    });
    return meta;
  }, [snBlocks, epBlocks]);

  const handleSceneClick = (scene) => {
    onSelectScene?.(scene.id);
    dispatch({ type: 'SET_ACTIVE_EPISODE', id: ep.id });
    setTimeout(() => dispatch({ type: 'SET_SCROLL_TO_SCENE', id: scene.id }), 50);
  };

  const handleDragOver = (e, sceneId) => {
    if (!e.dataTransfer.types.includes('text/beat')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverSceneId(sceneId);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverSceneId(null);
  };

  const handleDrop = (e, scene) => {
    e.preventDefault();
    setDragOverSceneId(null);
    const beat = e.dataTransfer.getData('text/beat');
    if (!beat) return;
    const tags = scene.tags || [];
    if (tags.includes(beat)) return;
    dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, tags: [...tags, beat] }, _record: true });
    onSelectScene?.(scene.id);
  };

  return (
    <div>
      {/* Episode header */}
      <div className="px-2 py-1.5 mb-2 rounded" style={{ background: 'var(--c-tag)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--c-text2)' }}>
            {ep.number}회 {ep.title || <span style={{ fontStyle: 'italic', color: 'var(--c-text6)' }}>제목 없음</span>}
          </span>
          <span className="text-[10px] ml-auto" style={{ color: 'var(--c-text6)' }}>{epScenes.length}씬</span>
        </div>
        {ep.majorEpisodes && (
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--c-accent2)' }}>
            ▸ {ep.majorEpisodes}
          </div>
        )}
      </div>

      {epScenes.length === 0 ? (
        <div className="text-xs py-3 text-center" style={{ color: 'var(--c-text6)' }}>씬 없음</div>
      ) : (
        <div className={compact ? 'space-y-1' : 'space-y-2'}>
          {epScenes.map(scene => {
            const snb = snBlocks.find(b => b.sceneId === scene.id);
            const label = resolveSceneLabel({ ...scene, label: snb?.label || scene.label || '' });
            const meta = sceneMeta[scene.id] || {};
            const tags = scene.tags || [];
            const isDragOver = dragOverSceneId === scene.id;
            return (
              <div
                key={scene.id}
                className="flex items-start gap-3 px-4 py-2 rounded-lg"
                style={{
                  background: isDragOver ? 'var(--c-active)' : selectedSceneId === scene.id ? 'var(--c-active)' : 'var(--c-card)',
                  border: isDragOver ? '1px dashed var(--c-accent2)' : selectedSceneId === scene.id ? '1px solid var(--c-accent)' : '1px solid var(--c-border)',
                  transition: 'border-color 0.1s',
                }}
                onMouseEnter={e => { if (selectedSceneId !== scene.id && !isDragOver) e.currentTarget.style.borderColor = 'var(--c-border2)'; }}
                onMouseLeave={e => { if (selectedSceneId !== scene.id && !isDragOver) e.currentTarget.style.borderColor = 'var(--c-border)'; }}
                onDragOver={(e) => handleDragOver(e, scene.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, scene)}
              >
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleSceneClick(scene)}>
                  <div className={compact ? 'text-xs font-bold' : 'text-sm font-bold'} style={{ color: 'var(--c-text)' }}>
                    {label || (snb?.label || '')}
                  </div>
                  {(meta.dialogue > 0 || meta.action > 0) && (
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--c-text6)' }}>
                      {meta.action > 0 && <span className="mr-2">지문 {meta.action}</span>}
                      {meta.dialogue > 0 && <span>대사 {meta.dialogue}</span>}
                    </div>
                  )}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--c-tag)', color: 'var(--c-accent2)' }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 mt-0.5" style={{ position: 'relative' }}>
                  <span className="text-[10px]" style={{ color: 'var(--c-text6)' }}>
                    {{done:'완료', writing:'작성중', draft:'초안'}[scene.status] || '초안'}
                  </span>
                  {scene.sourceTreatmentItemId && (
                    <span className="text-[9px] px-1 rounded" title="트리트먼트에서 생성된 씬"
                      style={{ background: 'var(--c-tag)', color: 'var(--c-accent2)', border: '1px solid var(--c-border4)' }}>
                      T
                    </span>
                  )}
                  <button
                    title="구조지침 태그 추가"
                    onClick={e => { e.stopPropagation(); e.preventDefault(); setTagPickerSceneId(v => v === scene.id ? null : scene.id); }}
                    style={{
                      fontSize: 13, width: 26, height: 26, borderRadius: 6,
                      border: '1px solid var(--c-border3)', background: 'var(--c-tag)',
                      color: 'var(--c-text4)', cursor: 'pointer', lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >+</button>
                  {tagPickerSceneId === scene.id && (
                    <TagPicker scene={scene} dispatch={dispatch} onClose={() => setTagPickerSceneId(null)} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── StructurePage ────────────────────────────────────────────────────────────
export default function StructurePage() {
  const { state, dispatch } = useApp();
  const { scenes, episodes, scriptBlocks, activeProjectId, activeEpisodeId } = state;

  const ALL = '__all__';
  const [selectedSceneId, setSelectedSceneId] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef(null);
  useEffect(() => {
    if (!helpOpen) return;
    const handler = (e) => { if (!helpRef.current?.contains(e.target)) setHelpOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [helpOpen]);

  // Sync selected scene to AppContext so RightPanel GuidePanel can use it
  const handleSelectScene = (id) => {
    setSelectedSceneId(id);
    dispatch({ type: 'SET_SELECTED_STRUCTURE_SCENE', id });
  };

  // Episode selector
  const projectEpisodes = episodes.filter(e => e.projectId === activeProjectId).sort((a, b) => a.number - b.number);
  const [selectedEpId, setSelectedEpId] = useState(activeEpisodeId || projectEpisodes[0]?.id || null);
  const epId = selectedEpId === ALL ? ALL : (selectedEpId || projectEpisodes[0]?.id);

  // If the selected episode was deleted, fall back to the first available episode
  useEffect(() => {
    if (!selectedEpId || selectedEpId === ALL) return;
    if (!episodes.some(e => e.id === selectedEpId)) {
      setSelectedEpId(projectEpisodes[0]?.id || ALL);
    }
  }, [episodes]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedEp = projectEpisodes.find(e => e.id === epId);

  const episodeScenes = useMemo(() =>
    epId === ALL ? [] : scenes.filter(s => s.episodeId === epId).sort((a, b) => a.sceneSeq - b.sceneSeq),
    [scenes, epId]
  );

  if (!activeProjectId) return null;

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--c-bg)' }}>
      {/* Main: scene tag overview */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-3 shrink-0" style={{ padding: '10px', borderBottom: '1px solid var(--c-border2)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--c-text2)' }}>구조</span>
          <div ref={helpRef} style={{ position: 'relative', display: 'inline-flex' }}>
            <button onClick={() => setHelpOpen(v => !v)} title="도움말" style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--c-border3)', background: helpOpen ? 'var(--c-active)' : 'transparent', color: 'var(--c-text5)', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}>?</button>
            {helpOpen && (
              <div style={{ position: 'absolute', top: '24px', left: 0, zIndex: 200, background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '10px 14px', width: 260, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--c-text3)' }}>구조 안내</div>
                {['씬을 선택하면 오른쪽에 구조 태그를 달 수 있습니다.', '구조지침(비트, 막 구성 등)은 마이페이지 → 설정에서 추가·수정할 수 있습니다.', '대본과 자동동기화 됩니다.'].map((t, i) => (
                  <div key={i} className="text-[11px] leading-relaxed" style={{ color: 'var(--c-text5)' }}>· {t}</div>
                ))}
              </div>
            )}
          </div>
          <select
            value={epId || ''}
            onChange={e => setSelectedEpId(e.target.value)}
            className="text-xs rounded outline-none px-2 py-1"
            style={{ background: 'var(--c-input)', color: 'var(--c-text2)', border: '1px solid var(--c-border3)' }}
          >
            <option value={ALL}>전체 회차</option>
            {projectEpisodes.map(ep => (
              <option key={ep.id} value={ep.id}>{ep.number}회 {ep.title || ''}</option>
            ))}
          </select>
          {epId !== ALL && (
            <span className="text-xs" style={{ color: 'var(--c-text6)' }}>{episodeScenes.length}개 씬</span>
          )}
        </div>

        {/* majorEpisodes summary bar (single ep view) */}
        {epId !== ALL && selectedEp?.majorEpisodes && (
          <div className="px-6 py-2 text-xs shrink-0" style={{ background: 'var(--c-tag)', borderBottom: '1px solid var(--c-border)', color: 'var(--c-accent2)' }}>
            ▸ 주요 에피소드: {selectedEp.majorEpisodes}
          </div>
        )}

        <div className="flex-1 overflow-y-auto" style={{ padding: 10 }}>
          {epId === ALL ? (
            projectEpisodes.length === 0 ? (
              <div className="text-center py-16 text-sm" style={{ color: 'var(--c-text5)' }}>회차가 없습니다.</div>
            ) : (
              <div className="space-y-6">
                {projectEpisodes.map(ep => (
                  <EpisodeSceneList
                    key={ep.id}
                    ep={ep}
                    scenes={scenes}
                    scriptBlocks={scriptBlocks}
                    dispatch={dispatch}
                    compact
                    selectedSceneId={selectedSceneId}
                    onSelectScene={handleSelectScene}
                  />
                ))}
              </div>
            )
          ) : episodeScenes.length === 0 ? (
            <div className="text-center py-16 text-sm" style={{ color: 'var(--c-text5)' }}>
              씬이 없습니다. 대본 편집기에서 Ctrl+1로 씬번호를 추가하세요.
            </div>
          ) : (
            <EpisodeSceneList
              ep={selectedEp || projectEpisodes[0]}
              scenes={scenes}
              scriptBlocks={scriptBlocks}
              dispatch={dispatch}
              selectedSceneId={selectedSceneId}
              onSelectScene={handleSelectScene}
            />
          )}
        </div>
      </div>

    </div>
  );
}
