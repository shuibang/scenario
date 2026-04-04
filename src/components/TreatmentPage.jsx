import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { genId, now } from '../store/db';
import { parseSceneContent } from '../utils/sceneResolver';

// ─── Import status ────────────────────────────────────────────────────────────
const STATUS_COLOR = { imported: 'var(--c-accent2)', modified: '#f59e0b', deleted: '#ef4444' };
const STATUS_LABEL = { imported: '변환됨', modified: '수정됨', deleted: '씬 삭제됨' };
const STATUS_BADGE = { imported: '✓', modified: '△', deleted: '✕' };

// ─── Scene heading detector ────────────────────────────────────────────────────
// "특수상황) 장소" 또는 "(시간대)" 패턴이 있으면 씬 헤딩으로 인식
function looksLikeSceneHeading(text) {
  if (!text) return false;
  if (/^[^)]{1,10}\)\s+\S/.test(text)) return true;            // 특수상황) 장소
  if (/\((낮|밤|아침|오전|오후|저녁|새벽)\)\s*$/.test(text)) return true; // (시간대)
  return false;
}

// ─── Migration: old {id, text} → new {id, text, order, ...extra} ─────────────
function migrateItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0)
    return [{ id: genId(), text: '', order: 0 }];
  return raw.map((it, i) => ({
    ...it,                       // preserve all fields (importedSceneId, importedText, etc.)
    id:    it.id    || genId(),
    text:  it.text  ?? '',
    order: it.order ?? i,
  }));
}

// ─── TreatmentPage ────────────────────────────────────────────────────────────
// 회차별 숫자 개요형 줄거리 문서
// 데이터: episode.summaryItems = [{id, text, order}, ...]
// "대본으로 가져오기": 각 항목 → 씬번호 + 지문 블록 (원본 유지)
export default function TreatmentPage() {
  const { state, dispatch } = useApp();
  const { episodes, scriptBlocks, scenes, activeProjectId, activeEpisodeId } = state;

  const projectEpisodes = episodes
    .filter(e => e.projectId === activeProjectId)
    .sort((a, b) => a.number - b.number);

  const [selectedEpId, setSelectedEpId] = useState(
    activeEpisodeId || projectEpisodes[0]?.id || null
  );
  const epId   = selectedEpId || projectEpisodes[0]?.id;
  const episode = episodes.find(e => e.id === epId);

  const [items, setItems]       = useState([]);

  // Compute per-item import status: null | 'imported' | 'modified' | 'deleted'
  const itemStatusMap = useMemo(() => {
    const map = new Map();
    items.forEach(it => {
      if (!it.importedSceneId) { map.set(it.id, null); return; }
      const scene = scenes.find(s => s.id === it.importedSceneId && s.episodeId === epId);
      if (!scene) { map.set(it.id, 'deleted'); return; }
      // Check if the action block text differs from what was originally imported
      const actionBlock = scriptBlocks.find(b => b.sceneId === it.importedSceneId && b.type === 'action');
      if (it.importedText !== undefined && actionBlock && actionBlock.content?.trim() !== it.importedText) {
        map.set(it.id, 'modified');
      } else {
        map.set(it.id, 'imported');
      }
    });
    return map;
  }, [items, scenes, scriptBlocks, epId]);
  const [importing, setImporting] = useState(false);
  const [importWarning, setImportWarning] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  // textarea refs for focus control after state updates
  const textareaRefs   = useRef({});
  const pendingFocus   = useRef(null); // { id, cursor }

  // Keep a ref to scriptBlocks so save() can access the latest value without re-creating
  const scriptBlocksRef = useRef(scriptBlocks);
  useEffect(() => { scriptBlocksRef.current = scriptBlocks; }, [scriptBlocks]);

  // ─── stale-epId guard (회차 삭제 시 fallback) ────────────────────────────
  useEffect(() => {
    if (!selectedEpId) return;
    if (!episodes.some(e => e.id === selectedEpId)) {
      setSelectedEpId(projectEpisodes[0]?.id || null);
    }
  }, [episodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load items when episode changes ─────────────────────────────────────
  useEffect(() => {
    if (!episode) return;
    setItems(migrateItems(episode.summaryItems));
  }, [epId, episode?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Focus pending textarea after items change ────────────────────────────
  useEffect(() => {
    if (!pendingFocus.current) return;
    const { id, cursor } = pendingFocus.current;
    pendingFocus.current = null;
    const el = textareaRefs.current[id];
    if (!el) return;
    el.focus();
    try { el.setSelectionRange(cursor, cursor); } catch {}
  }, [items]);

  // ─── Persist to episode.summaryItems ─────────────────────────────────────
  // record=true → structural change (split/merge/move/paste), recorded in undo stack
  // record=false → text typing, not recorded
  const save = useCallback((newItems, record = false) => {
    setItems(newItems);
    dispatch({ type: 'UPDATE_EPISODE', payload: { id: epId, summaryItems: newItems }, _record: record });

    // ── Auto-sync: importedSceneId가 있는 항목의 action 블록을 즉시 갱신
    if (localStorage.getItem('drama_treatmentSync') === 'sync') {
      const epBlocks = scriptBlocksRef.current.filter(b => b.episodeId === epId);
      let changed = false;
      const updatedBlocks = epBlocks.map(block => {
        if (block.type !== 'action') return block;
        const item = newItems.find(it => it.importedSceneId === block.sceneId);
        if (item && item.text.trim() !== block.content?.trim()) {
          changed = true;
          return { ...block, content: item.text.trim(), updatedAt: now() };
        }
        return block;
      });
      if (changed) {
        dispatch({ type: 'SET_BLOCKS', episodeId: epId, payload: updatedBlocks });
      }
    }
  }, [epId, dispatch]);

  // ─── Auto-resize textarea ─────────────────────────────────────────────────
  const autoResize = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  // ─── Keyboard: Enter → split, Backspace at 0 → merge ────────────────────
  const handleKeyDown = useCallback((e, it, idx) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const pos    = e.target.selectionStart;
      const before = it.text.slice(0, pos);
      const after  = it.text.slice(pos);
      const newId  = genId();
      const newItems = [
        ...items.slice(0, idx),
        { ...it, text: before },
        { id: newId, text: after, order: idx + 1 },
        ...items.slice(idx + 1),
      ];
      pendingFocus.current = { id: newId, cursor: 0 };
      save(newItems, true);   // structural — record
      return;
    }

    if (e.key === 'Backspace' && idx > 0) {
      const pos = e.target.selectionStart;
      const end = e.target.selectionEnd;
      if (pos === 0 && end === 0) {
        e.preventDefault();
        const prev      = items[idx - 1];
        const cursor    = prev.text.length;
        const merged    = { ...prev, text: prev.text + it.text };
        const newItems  = [
          ...items.slice(0, idx - 1),
          merged,
          ...items.slice(idx + 1),
        ];
        pendingFocus.current = { id: prev.id, cursor };
        save(newItems, true);   // structural — record
        return;
      }
    }

    if (e.key === 'Delete' && idx < items.length - 1) {
      const pos = e.target.selectionStart;
      if (pos === it.text.length && e.target.selectionEnd === pos) {
        e.preventDefault();
        const next     = items[idx + 1];
        const cursor   = it.text.length;
        const merged   = { ...it, text: it.text + next.text };
        const newItems = [
          ...items.slice(0, idx),
          merged,
          ...items.slice(idx + 2),
        ];
        pendingFocus.current = { id: it.id, cursor };
        save(newItems, true);   // structural — record
        return;
      }
    }
  }, [items, save]);

  // ─── Paste: split multi-line text into multiple items ─────────────────────
  const handlePaste = useCallback((e, it, idx) => {
    const pasted = e.clipboardData.getData('text/plain');
    if (!pasted.includes('\n')) return; // single-line: let default handle

    e.preventDefault();
    const lines = pasted.split('\n').map(l => l.trimEnd());
    // filter trailing empty lines but keep internal ones as separators
    const nonEmpty = lines.filter((l, i) => l.length > 0 || i < lines.length - 1);
    if (!nonEmpty.length) return;

    const pos    = e.target.selectionStart;
    const selEnd = e.target.selectionEnd;
    const before = it.text.slice(0, pos);
    const after  = it.text.slice(selEnd);

    const allLines = nonEmpty;
    allLines[0]                   = before + allLines[0];
    allLines[allLines.length - 1] = allLines[allLines.length - 1] + after;

    const spliced = allLines.map((text, i) => ({
      id:    i === 0 ? it.id : genId(),
      text,
      order: idx + i,
    }));

    const lastNew = spliced[spliced.length - 1];
    const newItems = [
      ...items.slice(0, idx),
      ...spliced,
      ...items.slice(idx + 1),
    ];
    pendingFocus.current = { id: lastNew.id, cursor: allLines[allLines.length - 1].length - after.length };
    save(newItems, true);   // structural — record
  }, [items, save]);

  // ─── Update single item text ──────────────────────────────────────────────
  const updateItem = useCallback((id, text) => {
    save(items.map(it => it.id === id ? { ...it, text } : it));
  }, [items, save]);

  const removeItem = useCallback((id) => {
    const next = items.filter(it => it.id !== id);
    save(next.length ? next : [{ id: genId(), text: '', order: 0 }], true);
  }, [items, save]);

  const moveItem = useCallback((id, dir) => {
    const idx = items.findIndex(it => it.id === id);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= items.length) return;
    const next = [...items];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    save(next, true);
  }, [items, save]);

  const addItem = useCallback(() => {
    const newId = genId();
    const next  = [...items, { id: newId, text: '', order: items.length }];
    pendingFocus.current = { id: newId, cursor: 0 };
    save(next, true);
  }, [items, save]);

  // ─── 대본으로 가져오기 (원본 유지, 화면 이동 없음, 단일 undo 단위) ─────────
  const handleImportToScript = () => {
    if (!epId) return;
    const filled = items.filter(it => it.text.trim());
    if (!filled.length) return;

    const epScenes = scenes.filter(s => s.episodeId === epId);
    const lastSeq  = epScenes.length > 0 ? Math.max(...epScenes.map(s => s.sceneSeq || 0)) : 0;
    const epBlocks = scriptBlocks.filter(b => b.episodeId === epId);

    const newBlocks = [];
    const newScenes = [];
    const itemToSceneId = new Map();
    let seqOffset = 1;

    filled.forEach(it => {
      const sceneId  = genId();
      itemToSceneId.set(it.id, sceneId);
      const sceneSeq = lastSeq + seqOffset++;

      // 첫 줄이 씬 헤딩 형식이면 scene_number에 구조화 필드로, 나머지는 action으로
      const lines = it.text.trim().split('\n');
      const firstLine = lines[0].trim();
      const isHeading = looksLikeSceneHeading(firstLine);
      const sceneHeadingContent = isHeading ? firstLine : '';
      const actionContent = isHeading ? lines.slice(1).join('\n').trim() : it.text.trim();
      const parsedFields = isHeading ? parseSceneContent(firstLine) : {};

      newScenes.push({
        id: sceneId, episodeId: epId, projectId: activeProjectId,
        sourceTreatmentItemId: it.id,
        sceneSeq, status: 'draft', tags: [], createdAt: now(), updatedAt: now(),
        content: sceneHeadingContent,
        ...parsedFields,
      });
      newBlocks.push({
        id: genId(), episodeId: epId, projectId: activeProjectId,
        type: 'scene_number', label: '', content: sceneHeadingContent, sceneId,
        createdAt: now(), updatedAt: now(),
        ...parsedFields,
      });
      newBlocks.push({
        id: genId(), episodeId: epId, projectId: activeProjectId,
        type: 'action', label: '', content: actionContent, sceneId,
        createdAt: now(), updatedAt: now(),
      });
    });

    const merged   = [...epBlocks, ...newBlocks];
    let seq        = 0;
    const labelled = merged.map(b => {
      if (b.type === 'scene_number') { seq++; return { ...b, label: `S#${seq}.` }; }
      return b;
    });

    // Update treatment items with import tracking (importedSceneId + importedText)
    const updatedSummaryItems = items.map(it => {
      const sceneId = itemToSceneId.get(it.id);
      if (!sceneId) return it;
      return { ...it, importedSceneId: sceneId, importedText: it.text.trim() };
    });

    // 단일 액션으로 dispatch → 단일 undo 단위 (IMPORT_TREATMENT_TO_SCRIPT은 AUTO_RECORD)
    dispatch({ type: 'IMPORT_TREATMENT_TO_SCRIPT', payload: { episodeId: epId, newScenes, labelled, updatedSummaryItems } });

    // Update local items state with tracking metadata
    setItems(migrateItems(updatedSummaryItems));

    // 원본 트리트먼트 유지 — 화면 이동 없음
    setImporting(false);
    setImportMsg(`${filled.length}개 항목 → ${episode?.number}회 대본에 추가됨`);
    setTimeout(() => setImportMsg(''), 3000);
  };

  if (!activeProjectId) return null;

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ background: 'var(--c-bg)' }}>
      {/* Header bar — 구조/씬리스트와 동일 스타일 */}
      <div className="flex items-center gap-3 shrink-0" style={{ padding: '10px', borderBottom: '1px solid var(--c-border2)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--c-text2)' }}>트리트먼트</span>
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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {importMsg && <span className="text-xs" style={{ color: 'var(--c-accent2)' }}>{importMsg}</span>}
          <button
            onClick={() => {
              const epSceneCount = scriptBlocks.filter(b => b.episodeId === epId && b.type === 'scene_number').length;
              const filledCount = items.filter(it => it.text.trim()).length;
              if (epSceneCount > 0 && epSceneCount > filledCount) {
                setImportWarning(true);
              } else {
                setImporting(true);
              }
            }}
            style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, background: 'transparent', color: 'var(--c-text3)', border: '1px solid var(--c-border3)', cursor: 'pointer' }}
          >대본으로 가져오기</button>
        </div>
      </div>

      {/* Import warning bar */}
      {importWarning && (
        <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ background: '#7f1d1d22', borderBottom: '1px solid #ef444466' }}>
          <span className="text-xs flex-1" style={{ color: '#fca5a5' }}>
            대본에 이미 {scriptBlocks.filter(b => b.episodeId === epId && b.type === 'scene_number').length}개 씬이 있습니다.
            트리트먼트 항목이 더 적어 기존 내용이 손상될 수 있습니다. 그래도 가져오겠습니까?
          </span>
          <button onClick={() => { setImportWarning(false); setImporting(true); }} className="px-3 py-1 rounded text-xs text-white shrink-0" style={{ background: '#ef4444', border: 'none', cursor: 'pointer' }}>가져오기</button>
          <button onClick={() => setImportWarning(false)} className="px-3 py-1 rounded text-xs shrink-0" style={{ color: 'var(--c-text4)', border: '1px solid var(--c-border3)', background: 'transparent', cursor: 'pointer' }}>취소</button>
        </div>
      )}

      {/* Import confirmation bar */}
      {importing && (
        <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ background: 'var(--c-active)', borderBottom: '1px solid var(--c-border2)' }}>
          <span className="text-xs flex-1" style={{ color: 'var(--c-text4)' }}>
            {items.filter(it => it.text.trim()).length}개 항목 → {episode?.number}회 대본에 추가
          </span>
          <button onClick={handleImportToScript} className="px-3 py-1 rounded text-xs text-white" style={{ background: 'var(--c-accent)', border: 'none', cursor: 'pointer' }}>확인</button>
          <button onClick={() => setImporting(false)} className="px-3 py-1 rounded text-xs" style={{ color: 'var(--c-text4)', border: '1px solid var(--c-border3)', background: 'transparent', cursor: 'pointer' }}>취소</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
      <div style={{ padding: '10px 10px 40px' }}>

        {/* Items */}
        <div className="space-y-1.5">
          {items.map((it, idx) => (
            <div key={it.id} className="flex items-start gap-2">
              <div className="flex flex-col items-end shrink-0 mt-[7px] w-9">
                <span
                  className="text-sm select-none tabular-nums"
                  style={{ color: STATUS_COLOR[itemStatusMap.get(it.id)] || 'var(--c-text6)' }}
                >
                  {idx + 1}.
                </span>
                {itemStatusMap.get(it.id) && (
                  <span
                    className="text-[8px] leading-tight"
                    style={{ color: STATUS_COLOR[itemStatusMap.get(it.id)], whiteSpace: 'nowrap' }}
                    title={STATUS_LABEL[itemStatusMap.get(it.id)]}
                  >
                    {STATUS_BADGE[itemStatusMap.get(it.id)]}
                  </span>
                )}
                {it.importedSceneId && itemStatusMap.get(it.id) !== 'deleted' && (
                  <button
                    onClick={() => {
                      dispatch({ type: 'SET_ACTIVE_EPISODE', id: epId });
                      setTimeout(() => dispatch({ type: 'SET_SCROLL_TO_SCENE', id: it.importedSceneId }), 50);
                    }}
                    title="연결된 씬으로 이동"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-accent2)', fontSize: '9px', padding: 0, lineHeight: 1 }}
                  >→씬</button>
                )}
              </div>
              <textarea
                ref={el => {
                  textareaRefs.current[it.id] = el;
                  if (el) autoResize(el);
                }}
                value={it.text}
                rows={1}
                placeholder="줄거리 항목 입력"
                className="flex-1 text-sm resize-none rounded px-3 py-2 outline-none"
                style={{
                  background: 'var(--c-input)',
                  color: 'var(--c-text)',
                  border: '1px solid var(--c-border3)',
                  lineHeight: 1.7,
                  minHeight: '2.4em',
                  overflow: 'hidden',
                }}
                onChange={e => {
                  autoResize(e.target);
                  updateItem(it.id, e.target.value);
                }}
                onKeyDown={e => handleKeyDown(e, it, idx)}
                onPaste={e => handlePaste(e, it, idx)}
              />
              <div className="flex flex-col gap-0.5 shrink-0 mt-1">
                <button
                  onClick={() => moveItem(it.id, -1)}
                  disabled={idx === 0}
                  className="text-[10px] w-5 h-5 rounded flex items-center justify-center"
                  style={{ color: 'var(--c-text6)', background: 'var(--c-tag)', border: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.3 : 1 }}
                >▲</button>
                <button
                  onClick={() => moveItem(it.id, 1)}
                  disabled={idx === items.length - 1}
                  className="text-[10px] w-5 h-5 rounded flex items-center justify-center"
                  style={{ color: 'var(--c-text6)', background: 'var(--c-tag)', border: 'none', cursor: idx === items.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === items.length - 1 ? 0.3 : 1 }}
                >▼</button>
                <button
                  onClick={() => removeItem(it.id)}
                  className="text-[10px] w-5 h-5 rounded flex items-center justify-center"
                  style={{ color: '#f87171', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >✕</button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addItem}
          className="mt-3 w-full py-2 rounded text-sm"
          style={{ color: 'var(--c-text4)', border: '1px dashed var(--c-border3)', background: 'transparent', cursor: 'pointer' }}
        >
          + 항목 추가
        </button>


      </div>
      </div>
      </div>
  );
}
