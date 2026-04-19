import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { resolveSceneLabel, parseSceneContent, TIME_OF_DAY_OPTIONS } from '../utils/sceneResolver';
import { buildSceneLabel } from '../utils/scenePrefix';
import { getSceneFormat, parseWithFormat, formatSceneHeader } from '../utils/sceneFormat';
import { now, genId } from '../store/db';
import { getChipInlineStyle } from '../utils/emotionColor';
import { exportScenelistXlsx } from '../print/scenelistExport';

// ─── CharacterMultiSelect ─────────────────────────────────────────────────────
function CharacterMultiSelect({ characterIds = [], projectChars, autoDetectedStr, onChange }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState(null);
  const triggerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const selectedChars = characterIds.map(id => projectChars.find(c => c.id === id)).filter(Boolean);
  const selectedNames = selectedChars.map(c => c.givenName || c.name || '');
  const autoNames = autoDetectedStr ? autoDetectedStr.split(', ').filter(Boolean) : [];
  const hasMismatch = autoNames.length > 0 && (
    autoNames.some(n => !selectedNames.includes(n)) || selectedNames.some(n => !autoNames.includes(n))
  );

  const toggle = (charId) => {
    const next = characterIds.includes(charId)
      ? characterIds.filter(id => id !== charId)
      : [...characterIds, charId];
    onChange(next);
  };

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 2, left: rect.left });
    }
    setOpen(v => !v);
  };

  const displayText = selectedNames.length > 0 ? selectedNames.join(', ') : (autoDetectedStr || '—');

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        onMouseDown={e => { e.preventDefault(); handleOpen(); }}
        className="text-xs text-left w-full"
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '0',
          color: hasMismatch ? 'var(--c-accent2)' : 'var(--c-text4)',
          maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          display: 'block',
        }}
        title={hasMismatch ? `대사 감지: ${autoDetectedStr}\n선택됨: ${selectedNames.join(', ')}` : displayText}
      >
        {hasMismatch && <span style={{ marginRight: '3px', color: 'var(--c-accent2)' }}>⚠</span>}
        {displayText}
      </button>
      {open && dropPos && (
        <div
          ref={containerRef}
          style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            zIndex: 1000,
            background: 'var(--c-tag)',
            border: '1px solid var(--c-border4)',
            borderRadius: '6px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            minWidth: '160px',
            maxHeight: '220px',
            overflowY: 'auto',
          }}
        >
          {projectChars.length === 0 ? (
            <div className="px-3 py-2 text-xs" style={{ color: 'var(--c-text6)' }}>
              등록된 인물 없음
            </div>
          ) : projectChars.map(c => {
            const name = c.givenName || c.name || '';
            const checked = characterIds.includes(c.id);
            return (
              <div
                key={c.id}
                onMouseDown={e => { e.preventDefault(); toggle(c.id); }}
                className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer"
                style={{ color: 'var(--c-text2)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-active)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{
                  display: 'inline-block', width: '12px', height: '12px',
                  border: `1.5px solid ${checked ? 'var(--c-accent)' : 'var(--c-border3)'}`,
                  borderRadius: '3px',
                  background: checked ? 'var(--c-accent)' : 'transparent',
                  flexShrink: 0,
                  position: 'relative',
                }}>
                  {checked && (
                    <span style={{
                      position: 'absolute', top: '-1px', left: '1px',
                      color: '#fff', fontSize: '10px', lineHeight: 1,
                    }}>✓</span>
                  )}
                </span>
                {name}
              </div>
            );
          })}
          {autoDetectedStr && (
            <div className="px-3 py-1.5 text-[10px]" style={{
              color: 'var(--c-text6)', borderTop: '1px solid var(--c-border)',
            }}>
              대사 감지: {autoDetectedStr}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Single row ───────────────────────────────────────────────────────────────
function SceneListRow({ scene, idx, blockLabel, autoCharacters, projectChars, onContentChange, onMetaChange, onCharsChange, onNavigate, remarkMode, emotionTags }) {
  const [contentVal,  setContentVal]  = useState(scene.sceneListContent || '');
  const [locVal,      setLocVal]      = useState(scene.location     || '');
  const [subLocVal,   setSubLocVal]   = useState(scene.subLocation  || '');
  const [todVal,      setTodVal]      = useState(scene.timeOfDay    || '');

  // 대본 편집기에서 변경 시 즉시 반영
  useEffect(() => { setContentVal(scene.sceneListContent || ''); }, [scene.sceneListContent]);
  useEffect(() => { setLocVal(scene.location    || ''); }, [scene.location]);
  useEffect(() => { setSubLocVal(scene.subLocation || ''); }, [scene.subLocation]);
  useEffect(() => { setTodVal(scene.timeOfDay   || ''); }, [scene.timeOfDay]);

  const cellStyle = {
    background: 'var(--c-input)', color: 'var(--c-text)',
    border: '1px solid transparent', minWidth: '44px',
  };
  const onFocus = e => { e.target.style.borderColor = 'var(--c-accent)'; };
  const onBlurBorder = e => { e.target.style.borderColor = 'transparent'; };

  return (
    <tr
      style={{ borderBottom: '1px solid var(--c-border)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {/* 씬번호 */}
      <td className="px-2 py-1" style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
        <button
          onClick={onNavigate}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-accent)', fontWeight: 700, fontSize: '11px' }}
          title="대본 씬으로 이동"
        >
          {blockLabel || `S#${idx + 1}.`}
        </button>
      </td>

      {/* 장소 */}
      <td className="px-2 py-1">
        <input value={locVal} onChange={e => setLocVal(e.target.value)}
          onFocus={onFocus}
          onBlur={e => { onBlurBorder(e); onMetaChange({ location: locVal.trim() }); }}
          placeholder="장소" className="w-full rounded text-xs px-1.5 py-0.5 outline-none" style={cellStyle} />
      </td>

      {/* 세부장소 */}
      <td className="px-2 py-1">
        <input value={subLocVal} onChange={e => setSubLocVal(e.target.value)}
          onFocus={onFocus}
          onBlur={e => { onBlurBorder(e); onMetaChange({ subLocation: subLocVal.trim() }); }}
          placeholder="세부장소" className="w-full rounded text-xs px-1.5 py-0.5 outline-none" style={cellStyle} />
      </td>

      {/* 시간대 */}
      <td className="px-2 py-1">
        <input value={todVal} onChange={e => setTodVal(e.target.value)}
          onFocus={onFocus}
          onBlur={e => { onBlurBorder(e); onMetaChange({ timeOfDay: todVal.trim() }); }}
          placeholder="시간대" className="w-full rounded text-xs px-1.5 py-0.5 outline-none" style={cellStyle} />
      </td>

      {/* 내용 */}
      <td className="px-2 py-1">
        <input value={contentVal} onChange={e => setContentVal(e.target.value)}
          onFocus={onFocus}
          onBlur={e => { onBlurBorder(e); onContentChange(contentVal); }}
          placeholder="내용 입력" className="w-full rounded text-xs px-1.5 py-0.5 outline-none"
          style={{ ...cellStyle, minWidth: undefined }} />
      </td>

      {/* 등장인물 (multi-select from character data) */}
      <td className="px-3 py-1.5">
        <CharacterMultiSelect
          characterIds={scene.characterIds || []}
          projectChars={projectChars}
          autoDetectedStr={autoCharacters}
          onChange={onCharsChange}
        />
      </td>

      {/* 비고(태그) */}
      <td className="px-3 py-1.5">
        <div className="flex flex-wrap gap-0.5">
          {remarkMode !== 'emotion' && remarkMode !== 'empty' && (scene.tags || []).map(t => (
            <span key={t} className="text-[9px] px-1 rounded"
              style={{ background: 'var(--c-tag)', color: 'var(--c-accent2)' }}>
              #{t}
            </span>
          ))}
          {remarkMode !== 'structure' && remarkMode !== 'empty' && (emotionTags || []).map((et, i) => (
            <span key={i} style={getChipInlineStyle(et.color, et.intensity)}>
              {et.word}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ─── SceneListPage ────────────────────────────────────────────────────────────
export default function SceneListPage() {
  const { state, dispatch } = useApp();
  const { scenes, scriptBlocks, episodes, characters, activeProjectId, activeEpisodeId, projects } = state;

  const projectEpisodes = useMemo(() =>
    episodes.filter(e => e.projectId === activeProjectId).sort((a, b) => a.number - b.number),
    [episodes, activeProjectId]
  );

  const [selectedEpId, setSelectedEpId] = useState(activeEpisodeId || projectEpisodes[0]?.id || null);
  const epId = selectedEpId || projectEpisodes[0]?.id;

  // Fallback if selected episode was deleted
  useEffect(() => {
    if (!selectedEpId) return;
    if (!episodes.some(e => e.id === selectedEpId)) {
      setSelectedEpId(projectEpisodes[0]?.id || null);
    }
  }, [episodes]); // eslint-disable-line react-hooks/exhaustive-deps

  const epBlocks = useMemo(() =>
    scriptBlocks.filter(b => b.episodeId === epId),
    [scriptBlocks, epId]
  );

  // 대본 블록 순서 기준으로 씬 정렬 (씬리스트와 대본의 순서를 항상 일치)
  const epScenes = useMemo(() => {
    const allScenes = scenes.filter(s => s.episodeId === epId);
    const sceneMap = new Map(allScenes.map(s => [s.id, s]));
    const ordered = epBlocks
      .filter(b => b.type === 'scene_number' && b.sceneId)
      .map(b => sceneMap.get(b.sceneId))
      .filter(Boolean);
    const orderedIds = new Set(ordered.map(s => s.id));
    const orphans = allScenes
      .filter(s => !orderedIds.has(s.id))
      .sort((a, b) => (a.sceneSeq || 0) - (b.sceneSeq || 0));
    return [...ordered, ...orphans];
  }, [scenes, epId, epBlocks]);

  // 블록의 라벨(S#n.)을 sceneId 기준으로 조회
  const blockLabelMap = useMemo(() => {
    const map = new Map();
    epBlocks.filter(b => b.type === 'scene_number' && b.sceneId)
      .forEach(b => map.set(b.sceneId, b.label));
    return map;
  }, [epBlocks]);

  const projectChars = useMemo(() =>
    characters.filter(c => c.projectId === activeProjectId),
    [characters, activeProjectId]
  );

  // Compute dialogue characters per scene (auto-detected from blocks)
  const sceneCharacters = useMemo(() => {
    const result = {};
    epScenes.forEach(scene => {
      const snBlock = epBlocks.find(b => b.type === 'scene_number' && b.sceneId === scene.id);
      if (!snBlock) { result[scene.id] = ''; return; }
      const snIdx  = epBlocks.indexOf(snBlock);
      const nextSn = epBlocks.find((b, i) => i > snIdx && b.type === 'scene_number');
      const endIdx = nextSn ? epBlocks.indexOf(nextSn) : epBlocks.length;
      const seg    = epBlocks.slice(snIdx + 1, endIdx);
      const names  = new Set(
        seg.filter(b => b.type === 'dialogue' && b.characterName).map(b => b.characterName)
      );
      result[scene.id] = [...names].join(', ');
    });
    return result;
  }, [epScenes, epBlocks]);

  const handleContentChange = (sceneId, content) => {
    dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, sceneListContent: content, updatedAt: now() }, _record: true });
  };

  // 포맷 설정 변경 감지 (scene_format_changed 이벤트)
  const [formatVer, setFormatVer] = useState(0);
  useEffect(() => {
    const handler = () => setFormatVer(v => v + 1);
    window.addEventListener('scene_format_changed', handler);
    return () => window.removeEventListener('scene_format_changed', handler);
  }, []);

  const handleMetaChange = (sceneId, meta) => {
    dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, ...meta, updatedAt: now() } });
    // 씬 헤더 블록(scene_number)도 동기화 → 대본 본문에 반영
    const block = epBlocks.find(b => b.type === 'scene_number' && b.sceneId === sceneId);
    if (block) {
      const scene = epScenes.find(s => s.id === sceneId);
      const merged = { ...scene, ...meta };
      const fmt = getSceneFormat();
      const newContent = formatSceneHeader(merged, fmt);
      const updatedBlocks = epBlocks.map(b =>
        b.id === block.id ? { ...b, content: newContent, updatedAt: now() } : b
      );
      dispatch({ type: 'SET_BLOCKS', episodeId: epId, payload: updatedBlocks });
    }
  };

  // 대본 편집기에서 씬 헤더(scene_number 블록)가 바뀌면 scene 객체 필드도 동기화
  // 포맷 설정이 바뀌어도 재파싱 (formatVer 의존)
  useEffect(() => {
    const fmt = getSceneFormat();
    epScenes.forEach(scene => {
      const block = epBlocks.find(b => b.type === 'scene_number' && b.sceneId === scene.id);
      if (!block?.content) return;
      // 레이블 prefix(S#1. / 1. / INT. 등) 제거 후 포맷 기반 파싱
      const raw = block.content.replace(/^(?:S#\d+\.|INT\.|EXT\.|\d+\.)\s*/i, '').trim();
      if (!raw) return;
      const parsed = parseWithFormat(raw, fmt);
      const loc = parsed.location    || '';
      const sub = parsed.subLocation || '';
      const tod = parsed.timeOfDay   || '';
      if (loc !== (scene.location || '') || sub !== (scene.subLocation || '') || tod !== (scene.timeOfDay || '')) {
        dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, location: loc, subLocation: sub, timeOfDay: tod, updatedAt: now() } });
      }
    });
  }, [epBlocks, formatVer]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCharsChange = (sceneId, characterIds) => {
    dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, characterIds, updatedAt: now() } });
  };

  const handleNavigate = (scene) => {
    dispatch({ type: 'SET_ACTIVE_EPISODE', id: epId });
    setTimeout(() => dispatch({ type: 'SET_SCROLL_TO_SCENE', id: scene.id }), 50);
  };

  const [remarkMode, setRemarkMode] = useState('all'); // 'all' | 'structure' | 'emotion' | 'empty'

  // 씬별 감정태그 계산 (블록에서 추출, 중복 단어 제거)
  const sceneEmotionTags = useMemo(() => {
    const result = {};
    epScenes.forEach(scene => {
      const snBlock = epBlocks.find(b => b.type === 'scene_number' && b.sceneId === scene.id);
      if (!snBlock) { result[scene.id] = []; return; }
      const snIdx = epBlocks.indexOf(snBlock);
      const nextSn = epBlocks.find((b, i) => i > snIdx && b.type === 'scene_number');
      const endIdx = nextSn ? epBlocks.indexOf(nextSn) : epBlocks.length;
      const seg = epBlocks.slice(snIdx + 1, endIdx);
      const seen = new Set();
      result[scene.id] = seg
        .filter(b => b.emotionTag?.color && b.emotionTag?.intensity)
        .map(b => b.emotionTag)
        .filter(t => { if (seen.has(t.word)) return false; seen.add(t.word); return true; });
    });
    return result;
  }, [epScenes, epBlocks]);

  const [downloading, setDownloading] = useState(false);
  const [dlMsg, setDlMsg] = useState('');

  const currentEp = useMemo(() => projectEpisodes.find(e => e.id === epId), [projectEpisodes, epId]);

  const handleDownload = async () => {
    if (!currentEp || !epScenes.length) return;
    setDownloading(true);
    setDlMsg('');
    try {
      await exportScenelistXlsx(currentEp, epScenes, projectChars);
    } catch (e) {
      console.error('[scenelistExport]', e);
      setDlMsg('오류 발생');
      setTimeout(() => setDlMsg(''), 3000);
    } finally {
      setDownloading(false);
    }
  };

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const helpRef = useRef(null);

  useEffect(() => {
    if (!helpOpen) return;
    const handler = (e) => {
      if (!helpRef.current?.contains(e.target)) setHelpOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [helpOpen]);

  const handleImportToScript = () => {
    // 씬은 있지만 scene_number 블록이 없는 씬만 추가
    const missingScenes = epScenes.filter(scene =>
      !epBlocks.some(b => b.type === 'scene_number' && b.sceneId === scene.id)
    );
    if (!missingScenes.length) {
      setImportMsg('모든 씬이 이미 대본에 있습니다');
      setImporting(false);
      setTimeout(() => setImportMsg(''), 2500);
      return;
    }
    const newBlocks = missingScenes.map(scene => ({
      id: genId(), episodeId: epId, projectId: activeProjectId,
      type: 'scene_number', content: resolveSceneLabel({ ...scene, label: '' }),
      label: '', sceneId: scene.id,
      createdAt: now(), updatedAt: now(),
    }));
    const merged = [...epBlocks, ...newBlocks];
    let seq = 0;
    const labelled = merged.map(b => {
      if (b.type === 'scene_number') { seq++; return { ...b, label: buildSceneLabel(seq) }; }
      return b;
    });
    dispatch({ type: 'SET_BLOCKS', episodeId: epId, payload: labelled });
    setImporting(false);
    setImportMsg(`${missingScenes.length}개 씬 → 대본에 추가됨`);
    setTimeout(() => setImportMsg(''), 3000);
  };

  const handleAddScene = () => {
    if (!epId) return;
    const sceneId = genId();
    const nextSeq = (epScenes.length > 0 ? Math.max(...epScenes.map(s => s.sceneSeq || 0)) : 0) + 1;
    const newScene = {
      id: sceneId, episodeId: epId, projectId: activeProjectId,
      sceneSeq: nextSeq, label: buildSceneLabel(nextSeq),
      status: 'draft', tags: [], characters: [], characterIds: [],
      content: '', location: '', subLocation: '', timeOfDay: '',
      specialSituation: '', sceneListContent: '',
      createdAt: now(), updatedAt: now(),
    };
    dispatch({ type: 'ADD_SCENE', payload: newScene });
  };

  if (!activeProjectId) return null;

  const REMARK_MODES = [
    { key: 'all',       label: '모든태그' },
    { key: 'structure', label: '구조태그' },
    { key: 'emotion',   label: '감정태그' },
    { key: 'empty',     label: '비우기'   },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ background: 'var(--c-bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0" style={{ padding: '10px', borderBottom: '1px solid var(--c-border2)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--c-text2)' }}>씬리스트</span>
        {/* 도움말 */}
        <div ref={helpRef} style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            onClick={() => setHelpOpen(v => !v)}
            title="도움말"
            style={{
              width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--c-border3)',
              background: helpOpen ? 'var(--c-active)' : 'transparent',
              color: 'var(--c-text5)', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1, flexShrink: 0,
            }}
          >?</button>
          {helpOpen && (
            <div style={{
              position: 'absolute', top: '24px', left: 0, zIndex: 200,
              background: 'var(--c-card)', border: '1px solid var(--c-border)',
              borderRadius: 8, padding: '10px 14px', width: 240,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            }}>
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--c-text3)' }}>씬리스트 안내</div>
              {[
                '씬 번호, 장소, 시간대, 등장인물을 정리하세요.',
                '씬번호 클릭 시 대본의 해당 씬으로 이동합니다.',
                '대본과 자동동기화 됩니다.',
              ].map((t, i) => (
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
          {projectEpisodes.map(ep => (
            <option key={ep.id} value={ep.id}>{ep.number}회 {ep.title || ''}</option>
          ))}
        </select>
        <span className="text-xs" style={{ color: 'var(--c-text6)' }}>{epScenes.length}개 씬</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {(importMsg || dlMsg) && <span className="text-xs" style={{ color: 'var(--c-accent2)' }}>{importMsg || dlMsg}</span>}
          <button
            onClick={handleDownload}
            disabled={downloading || !epScenes.length}
            title="엑셀(XLSX)로 다운로드"
            style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, background: 'transparent', color: 'var(--c-text3)', border: '1px solid var(--c-border3)', cursor: downloading ? 'default' : 'pointer', opacity: downloading ? 0.5 : 1 }}
          >XLSX</button>
          <button
            onClick={() => setImporting(true)}
            style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, background: 'transparent', color: 'var(--c-text3)', border: '1px solid var(--c-border3)', cursor: 'pointer' }}
          >대본으로 가져오기</button>
          <button
            onClick={() => setFullscreen(true)}
            title="전체화면 보기"
            style={{ padding: '3px 8px', borderRadius: 4, fontSize: 13, background: 'transparent', color: 'var(--c-text5)', border: '1px solid var(--c-border3)', cursor: 'pointer', lineHeight: 1 }}
          >⤢</button>
        </div>
      </div>

      {/* 비고 표기 선택 */}
      <div className="flex items-center gap-2 shrink-0" style={{ padding: '4px 10px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-panel)' }}>
        <span className="text-[10px]" style={{ color: 'var(--c-text6)' }}>* 비고 표기 선택 :</span>
        {REMARK_MODES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setRemarkMode(key)}
            style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 3, cursor: 'pointer',
              border: remarkMode === key ? '1px solid var(--c-accent)' : '1px solid var(--c-border3)',
              background: remarkMode === key ? 'var(--c-accent)' : 'transparent',
              color: remarkMode === key ? '#fff' : 'var(--c-text5)',
              fontWeight: remarkMode === key ? 600 : 400,
            }}
          >{label}</button>
        ))}
      </div>

      {/* Import confirmation bar */}
      {importing && (
        <div className="px-6 py-2 flex items-center gap-2 shrink-0" style={{ borderBottom: '1px solid var(--c-border2)', background: 'var(--c-active)' }}>
          <span className="text-xs flex-1" style={{ color: 'var(--c-text4)' }}>
            대본에 없는 씬 {epScenes.filter(s => !epBlocks.some(b => b.type === 'scene_number' && b.sceneId === s.id)).length}개를 추가합니다
          </span>
          <button onClick={handleImportToScript} className="px-3 py-1 rounded text-xs text-white" style={{ background: 'var(--c-accent)', border: 'none', cursor: 'pointer' }}>확인</button>
          <button onClick={() => setImporting(false)} className="px-3 py-1 rounded text-xs" style={{ color: 'var(--c-text4)', border: '1px solid var(--c-border3)', background: 'transparent', cursor: 'pointer' }}>취소</button>
        </div>
      )}

      {/* 전체화면 오버레이 */}
      {fullscreen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--c-bg)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--c-border2)', flexShrink: 0 }}>
            <span className="text-sm font-medium" style={{ color: 'var(--c-text2)' }}>씬리스트</span>
            <select value={epId || ''} onChange={e => setSelectedEpId(e.target.value)}
              className="text-xs rounded outline-none px-2 py-1"
              style={{ background: 'var(--c-input)', color: 'var(--c-text2)', border: '1px solid var(--c-border3)' }}>
              {projectEpisodes.map(ep => (
                <option key={ep.id} value={ep.id}>{ep.number}회 {ep.title || ''}</option>
              ))}
            </select>
            <span className="text-xs" style={{ color: 'var(--c-text6)' }}>{epScenes.length}개 씬</span>
            <button onClick={() => setFullscreen(false)}
              style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 4, fontSize: 12, background: 'transparent', color: 'var(--c-text4)', border: '1px solid var(--c-border3)', cursor: 'pointer' }}>
              닫기
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 24, pointerEvents: 'none', background: 'linear-gradient(to right, transparent, var(--c-bg))', zIndex: 2 }} />
            {epScenes.length === 0 ? (
              <div className="py-16 text-center text-sm" style={{ color: 'var(--c-text5)' }}>씬이 없습니다.</div>
            ) : (
              <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: '640px' }}>
                <colgroup>
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead>
                  <tr style={{ background: 'var(--c-panel)', borderBottom: '2px solid var(--c-border2)', position: 'sticky', top: 0, zIndex: 1 }}>
                    {['씬번호', '장소', '세부장소', '시간대', '내용', '등장인물', '비고'].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-semibold text-xs" style={{ color: 'var(--c-text4)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {epScenes.map((scene, idx) => (
                    <SceneListRow
                      key={scene.id} scene={scene} idx={idx}
                      blockLabel={blockLabelMap.get(scene.id)}
                      autoCharacters={sceneCharacters[scene.id] || ''}
                      projectChars={projectChars}
                      onContentChange={v => handleContentChange(scene.id, v)}
                      onMetaChange={meta => handleMetaChange(scene.id, meta)}
                      onCharsChange={ids => handleCharsChange(scene.id, ids)}
                      onNavigate={() => { handleNavigate(scene); setFullscreen(false); }}
                      remarkMode={remarkMode}
                      emotionTags={sceneEmotionTags[scene.id] || []}
                    />
                  ))}
                </tbody>
              </table>
            )}
            <div className="px-6 py-3">
              <button onClick={handleAddScene} className="w-full py-2 rounded text-sm"
                style={{ color: 'var(--c-text4)', border: '1px dashed var(--c-border3)', background: 'transparent', cursor: 'pointer' }}>
                + 씬 추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto" style={{ position: 'relative' }}>
        {/* 오른쪽 스크롤 인디케이터 페이드 */}
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0,
          width: 24, pointerEvents: 'none',
          background: 'linear-gradient(to right, transparent, var(--c-bg))',
          zIndex: 2,
        }} />
        {epScenes.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--c-text5)' }}>
            씬이 없습니다. 대본 편집기에서 Ctrl+1로 씬번호를 추가하세요.
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: '640px' }}>
            <colgroup>
              <col style={{ width: '7%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr style={{ background: 'var(--c-panel)', borderBottom: '2px solid var(--c-border2)', position: 'sticky', top: 0, zIndex: 1 }}>
                {['씬번호', '장소', '세부장소', '시간대', '내용', '등장인물', '비고'].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-semibold text-xs" style={{ color: 'var(--c-text4)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {epScenes.map((scene, idx) => (
                <SceneListRow
                  key={scene.id}
                  scene={scene}
                  idx={idx}
                  blockLabel={blockLabelMap.get(scene.id)}
                  autoCharacters={sceneCharacters[scene.id] || ''}
                  projectChars={projectChars}
                  onContentChange={v => handleContentChange(scene.id, v)}
                  onMetaChange={meta => handleMetaChange(scene.id, meta)}
                  onCharsChange={ids => handleCharsChange(scene.id, ids)}
                  onNavigate={() => handleNavigate(scene)}
                  remarkMode={remarkMode}
                  emotionTags={sceneEmotionTags[scene.id] || []}
                />
              ))}
            </tbody>
          </table>
        )}
        {/* 씬 추가 — 하단 */}
        <div className="px-6 py-3">
          <button
            onClick={handleAddScene}
            className="w-full py-2 rounded text-sm"
            style={{ color: 'var(--c-text4)', border: '1px dashed var(--c-border3)', background: 'transparent', cursor: 'pointer' }}
          >+ 씬 추가</button>
        </div>
      </div>
    </div>
  );
}
