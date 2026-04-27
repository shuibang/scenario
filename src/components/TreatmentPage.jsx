import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store/AppContext';
import { genId, now } from '../store/db';
import { parseSceneContent } from '../utils/sceneResolver';
import { isMultiEpisode } from '../utils/projectTypes';
import UnifiedTagPicker from './UnifiedTagPicker';
import EmotionTagPicker from './EmotionTagPicker';
import TreatmentBoardView from './TreatmentBoardView';
import { getChipInlineStyle } from '../utils/emotionColor';
import { BUILTIN_GUIDES } from '../data/structureTags';

// ─── Import status ────────────────────────────────────────────────────────────
const STATUS_COLOR = { imported: 'var(--c-accent2)', modified: '#f59e0b', deleted: '#ef4444' };
const STATUS_LABEL = { imported: '변환됨', modified: '수정됨', deleted: '씬 삭제됨' };
const STATUS_BADGE = { imported: '✓', modified: '△', deleted: '✕' };
const TREATMENT_HELP_AUTO_COUNT_KEY = 'drama_treatment_help_auto_count';
const TREATMENT_HELP_AUTO_LAST_AT_KEY = 'drama_treatment_help_auto_last_at';
// Shell이 isMobile/isTablet/PC 분기에서 다른 트리를 반환해 viewport 임계점 통과 시
// TreatmentPage가 remount → useState reset되는 것을 방어. 다른 페이지에서 같은 패턴이
// 필요하면 'drama_<page>_view_mode' 키 컨벤션을 따를 것.
const TREATMENT_VIEW_MODE_KEY = 'drama_treatment_view_mode';

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
    return [{ id: genId(), text: '', order: 0, emotionTags: [], structureTags: [] }];
  return raw.map((it, i) => ({
    ...it,                       // preserve all fields (importedSceneId, importedText, etc.)
    id:    it.id    || genId(),
    text:  it.text  ?? '',
    order: it.order ?? i,
    emotionTags:   Array.isArray(it.emotionTags)   ? it.emotionTags   : [],
    structureTags: Array.isArray(it.structureTags) ? it.structureTags : [],
  }));
}

function structureTagColor(beat) {
  for (const g of BUILTIN_GUIDES) {
    if (g.beats.includes(beat)) return g.color;
  }
  return '#6b7280';
}

// ─── TreatmentPage ────────────────────────────────────────────────────────────
// 회차별 숫자 개요형 줄거리 문서
// 데이터: episode.summaryItems = [{id, text, order}, ...]
// "대본으로 가져오기": 각 항목 → 씬번호 + 지문 블록 (원본 유지)
export default function TreatmentPage() {
  const { state, dispatch } = useApp();
  const { episodes, scriptBlocks, scenes, projects, activeProjectId } = state;

  const activeProject = projects?.find(p => p.id === activeProjectId);
  const isSeries = isMultiEpisode(activeProject?.projectType);
  const totalEpisodes = activeProject?.totalEpisodes || 0;

  const projectEpisodes = episodes
    .filter(e => e.projectId === activeProjectId)
    .sort((a, b) => a.number - b.number);
  const highestEpisodeNumber = projectEpisodes.reduce((max, ep) => Math.max(max, ep.number || 0), 0);
  const visibleEpisodeCount = isSeries
    ? Math.max(totalEpisodes, highestEpisodeNumber, 1)
    : Math.max(highestEpisodeNumber, 1);
  const nextEpisodeNumber = Math.max(totalEpisodes, highestEpisodeNumber, 0) + 1;

  // 미니시리즈: totalEpisodes 중 아직 생성 안 된 회차 번호 목록
  const existingNums = new Set(projectEpisodes.map(e => e.number));
  const missingNums = isSeries
    ? Array.from({ length: visibleEpisodeCount }, (_, i) => i + 1).filter(n => !existingNums.has(n))
    : [];

  const [selectedEpId, setSelectedEpId] = useState('all');
  const epId   = selectedEpId === 'all' ? null : (selectedEpId || projectEpisodes[0]?.id);
  const episode = episodes.find(e => e.id === epId);

  // 'list' | 'board' — Phase A: 보드는 표시 + 카드 클릭으로 리스트 전환만 (드래그 X)
  // localStorage persist: viewport 임계점에서 Shell remount 발생해도 새 instance가 복원
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(TREATMENT_VIEW_MODE_KEY) === 'board' ? 'board' : 'list';
    } catch { return 'list'; }
  });
  useEffect(() => {
    try { localStorage.setItem(TREATMENT_VIEW_MODE_KEY, viewMode); } catch {}
  }, [viewMode]);

  useEffect(() => {
    setSelectedEpId('all');
  }, [activeProjectId]);

  const handleEpSelect = (val) => {
    if (val === 'all') { setSelectedEpId('all'); return; }
    if (val.startsWith('__new__')) {
      const num = parseInt(val.replace('__new__', ''), 10);
      const ep = {
        id: genId(), projectId: activeProjectId, number: num,
        title: '', majorEpisodes: '', summaryItems: [],
        status: 'draft', createdAt: now(), updatedAt: now(),
      };
      dispatch({ type: 'ADD_EPISODE', payload: ep });
      dispatch({ type: 'SET_ACTIVE_EPISODE', id: ep.id });
      setSelectedEpId(ep.id);
      return;
    }
    setSelectedEpId(val);
  };

  const createEpisodeForNumber = useCallback((num, { expandProject = false } = {}) => {
    const existing = projectEpisodes.find(e => e.number === num);
    if (existing) return existing;

    if (expandProject && isSeries && activeProjectId && totalEpisodes < num) {
      dispatch({ type: 'UPDATE_PROJECT', payload: { id: activeProjectId, totalEpisodes: num } });
    }

    const ep = {
      id: genId(), projectId: activeProjectId, number: num,
      title: '', majorEpisodes: '', summaryItems: [],
      status: 'draft', createdAt: now(), updatedAt: now(),
    };
    dispatch({ type: 'ADD_EPISODE', payload: ep });
    return ep;
  }, [projectEpisodes, activeProjectId, dispatch, isSeries, totalEpisodes]);

  const handleAddEpisodeInAllView = useCallback(() => {
    createEpisodeForNumber(nextEpisodeNumber, { expandProject: true });
  }, [createEpisodeForNumber, nextEpisodeNumber]);

  const [items, setItems]       = useState([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef(null);
  useEffect(() => {
    if (!helpOpen) return;
    const handler = (e) => { if (!helpRef.current?.contains(e.target)) setHelpOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [helpOpen]);

  useEffect(() => {
    try {
      const openedCount = Number(localStorage.getItem(TREATMENT_HELP_AUTO_COUNT_KEY) || '0');
      const lastOpenedAt = Number(localStorage.getItem(TREATMENT_HELP_AUTO_LAST_AT_KEY) || '0');
      const nowTs = Date.now();

      if (openedCount >= 2) return;
      if (nowTs - lastOpenedAt < 1500) return;

      localStorage.setItem(TREATMENT_HELP_AUTO_COUNT_KEY, String(openedCount + 1));
      localStorage.setItem(TREATMENT_HELP_AUTO_LAST_AT_KEY, String(nowTs));
      setHelpOpen(true);
    } catch {
      setHelpOpen(true);
    }
  }, []);

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

  // Slash-triggered tag pickers (single-episode view)
  // unifiedPicker: { itemId, top, left }
  // emotionPicker: { itemId, top, left, initialWord, existingTag }
  const [unifiedPicker, setUnifiedPicker] = useState(null);
  const [emotionPicker, setEmotionPicker] = useState(null);

  // textarea refs for focus control after state updates
  const textareaRefs   = useRef({});
  const pendingFocus   = useRef(null); // { id, cursor }

  // Keep a ref to scriptBlocks so save() can access the latest value without re-creating
  const scriptBlocksRef = useRef(scriptBlocks);
  useEffect(() => { scriptBlocksRef.current = scriptBlocks; }, [scriptBlocks]);

  // ─── stale-epId guard (회차 삭제 시 fallback) ────────────────────────────
  useEffect(() => {
    if (!selectedEpId || selectedEpId === 'all') return;
    if (!episodes.some(e => e.id === selectedEpId)) {
      setSelectedEpId(projectEpisodes[0]?.id || null);
    }
  }, [episodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load items when episode changes ─────────────────────────────────────
  useEffect(() => {
    if (selectedEpId === 'all') { setItems([]); return; }
    if (!episode) return;
    setItems(migrateItems(episode.summaryItems));
  }, [epId, episode?.id, selectedEpId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 전체 보기: 모든 회차 항목을 회차별로 묶어서 표시 (빈 항목 1개는 항상 유지)
  const allEpItems = useMemo(() => {
    if (selectedEpId !== 'all') return null;
    const numbers = isSeries && visibleEpisodeCount > 0
      ? Array.from({ length: visibleEpisodeCount }, (_, i) => i + 1)
      : (projectEpisodes.length ? projectEpisodes.map(ep => ep.number) : [1]);

    return numbers.map((episodeNumber) => {
      const ep = projectEpisodes.find(candidate => candidate.number === episodeNumber) || null;
      return {
        ep,
        episodeNumber,
        isMissing: !ep,
        items: ep
          ? (migrateItems(ep.summaryItems).length
              ? migrateItems(ep.summaryItems)
              : [{ id: genId(), text: '', order: 0 }])
          : [],
      };
    });
  }, [selectedEpId, projectEpisodes, isSeries, visibleEpisodeCount]); // eslint-disable-line react-hooks/exhaustive-deps
  const allViewItemIds = useMemo(
    () => (allEpItems ? allEpItems.flatMap(({ items }) => items.map(it => it.id)) : []),
    [allEpItems]
  );

  // ── Shared sync helper: action 블록 텍스트/감정태그 + scene 구조태그를 items에 맞춰 재반영
  const applyTreatmentSync = useCallback((targetEpId, newItems) => {
    if (!targetEpId) return;
    if (localStorage.getItem('drama_treatmentSync') !== 'sync') return;
    const epBlocks = scriptBlocksRef.current.filter(b => b.episodeId === targetEpId);
    let blocksChanged = false;
    const updatedBlocks = epBlocks.map(block => {
      const item = newItems.find(it => it.importedSceneId === block.sceneId);
      if (!item) return block;
      if (block.type === 'action') {
        const firstEmotion = (item.emotionTags || [])[0] || null;
        const textDiffers = item.text.trim() !== block.content?.trim();
        const tagDiffers = JSON.stringify(block.emotionTag || null) !== JSON.stringify(firstEmotion);
        if (textDiffers || tagDiffers) {
          blocksChanged = true;
          return { ...block, content: item.text.trim(), emotionTag: firstEmotion, updatedAt: now() };
        }
      }
      return block;
    });
    if (blocksChanged) {
      dispatch({ type: 'SET_BLOCKS', episodeId: targetEpId, payload: updatedBlocks });
    }
    newItems.forEach(it => {
      if (!it.importedSceneId) return;
      const scene = scenes.find(s => s.id === it.importedSceneId && s.episodeId === targetEpId);
      if (!scene) return;
      const desired = it.structureTags || [];
      const current = scene.tags || [];
      const same = desired.length === current.length && desired.every(t => current.includes(t));
      if (!same) {
        dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, tags: desired } });
      }
    });
  }, [dispatch, scenes]);

  // 전체 뷰 전용 저장 — 특정 epId 기준
  const saveForEp = useCallback((targetEpId, newItems, record = false) => {
    if (!targetEpId) return;
    dispatch({ type: 'UPDATE_EPISODE', payload: { id: targetEpId, summaryItems: newItems }, _record: record });
    applyTreatmentSync(targetEpId, newItems);
  }, [dispatch, applyTreatmentSync]);

  const updateItemForEp = useCallback((targetEpId, epItems, id, text) => {
    saveForEp(targetEpId, epItems.map(it => it.id === id ? { ...it, text } : it));
  }, [saveForEp]);

  const addItemForEp = useCallback((targetEpId, epItems) => {
    saveForEp(targetEpId, [...epItems, { id: genId(), text: '', order: epItems.length }], true);
  }, [saveForEp]);

  // Fetch the latest items for an episode (used by tag mutation handlers that may be
  // invoked after a picker opens, so a captured `epItems` snapshot could be stale).
  const getLatestItemsForEp = useCallback((targetEpId) => {
    const ep = episodes.find(e => e.id === targetEpId);
    return ep ? migrateItems(ep.summaryItems) : [];
  }, [episodes]);

  const addEmotionTagForEp = useCallback((targetEpId, itemId, tag) => {
    const latest = getLatestItemsForEp(targetEpId);
    const newItems = latest.map(it => {
      if (it.id !== itemId) return it;
      const existing = it.emotionTags || [];
      const idx = existing.findIndex(t => t.word === tag.word);
      const nextTags = idx >= 0
        ? existing.map((t, i) => (i === idx ? tag : t))
        : [...existing, tag];
      return { ...it, emotionTags: nextTags };
    });
    saveForEp(targetEpId, newItems, true);
  }, [getLatestItemsForEp, saveForEp]);

  const removeEmotionTagForEp = useCallback((targetEpId, itemId, word) => {
    const latest = getLatestItemsForEp(targetEpId);
    const newItems = latest.map(it => {
      if (it.id !== itemId) return it;
      return { ...it, emotionTags: (it.emotionTags || []).filter(t => t.word !== word) };
    });
    saveForEp(targetEpId, newItems, true);
  }, [getLatestItemsForEp, saveForEp]);

  const addStructureTagForEp = useCallback((targetEpId, itemId, beat) => {
    const latest = getLatestItemsForEp(targetEpId);
    const newItems = latest.map(it => {
      if (it.id !== itemId) return it;
      const existing = it.structureTags || [];
      if (existing.includes(beat)) return it;
      return { ...it, structureTags: [...existing, beat] };
    });
    saveForEp(targetEpId, newItems, true);
  }, [getLatestItemsForEp, saveForEp]);

  const removeStructureTagForEp = useCallback((targetEpId, itemId, beat) => {
    const latest = getLatestItemsForEp(targetEpId);
    const newItems = latest.map(it => {
      if (it.id !== itemId) return it;
      return { ...it, structureTags: (it.structureTags || []).filter(b => b !== beat) };
    });
    saveForEp(targetEpId, newItems, true);
  }, [getLatestItemsForEp, saveForEp]);

  useEffect(() => {
    if (selectedEpId === 'all') {
      setImporting(false);
      setImportWarning(false);
    }
  }, [selectedEpId]);

  // ─── Focus pending textarea after items change ────────────────────────────
  // 단일회차 뷰: items state 변경 시 / 전체뷰: saveForEp가 dispatch만 하므로
  // state.episodes 변경 시점에 effect가 발화해야 함 → 두 dep 모두 포함.
  // pendingFocus null 가드가 있어 미관련 렌더에서 발화해도 부작용 없음.
  useEffect(() => {
    if (!pendingFocus.current) return;
    const { id, cursor, scroll } = pendingFocus.current;
    const el = textareaRefs.current[id];
    if (!el) return; // 아직 마운트 안 됨 → 다음 발화 대기 (보드→리스트 전환 후 발화 보장)
    pendingFocus.current = null;
    el.focus();
    try { el.setSelectionRange(cursor, cursor); } catch {}
    if (scroll) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [items, episodes, viewMode]);

  // ─── Persist to episode.summaryItems ─────────────────────────────────────
  // record=true → structural change (split/merge/move/paste), recorded in undo stack
  // record=false → text typing, not recorded
  const save = useCallback((newItems, record = false) => {
    setItems(newItems);
    dispatch({ type: 'UPDATE_EPISODE', payload: { id: epId, summaryItems: newItems }, _record: record });
    applyTreatmentSync(epId, newItems);
  }, [epId, dispatch, applyTreatmentSync]);

  // ─── Tag mutation helpers (single-episode view) ──────────────────────────
  const addEmotionTagToItem = useCallback((itemId, tag) => {
    const newItems = items.map(it => {
      if (it.id !== itemId) return it;
      const existing = it.emotionTags || [];
      const idx = existing.findIndex(t => t.word === tag.word);
      const nextTags = idx >= 0
        ? existing.map((t, i) => (i === idx ? tag : t))   // replace existing word
        : [...existing, tag];
      return { ...it, emotionTags: nextTags };
    });
    save(newItems, true);
  }, [items, save]);

  const removeEmotionTagFromItem = useCallback((itemId, word) => {
    const newItems = items.map(it => {
      if (it.id !== itemId) return it;
      return { ...it, emotionTags: (it.emotionTags || []).filter(t => t.word !== word) };
    });
    save(newItems, true);
  }, [items, save]);

  const addStructureTagToItem = useCallback((itemId, beat) => {
    const newItems = items.map(it => {
      if (it.id !== itemId) return it;
      const existing = it.structureTags || [];
      if (existing.includes(beat)) return it;
      return { ...it, structureTags: [...existing, beat] };
    });
    save(newItems, true);
  }, [items, save]);

  const removeStructureTagFromItem = useCallback((itemId, beat) => {
    const newItems = items.map(it => {
      if (it.id !== itemId) return it;
      return { ...it, structureTags: (it.structureTags || []).filter(b => b !== beat) };
    });
    save(newItems, true);
  }, [items, save]);

  // ─── Auto-resize textarea ─────────────────────────────────────────────────
  const autoResize = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  const focusTextareaById = useCallback((id, cursor = 0) => {
    const el = textareaRefs.current[id];
    if (!el) return false;
    el.focus();
    try { el.setSelectionRange(cursor, cursor); } catch {}
    return true;
  }, []);

  const moveBetweenItems = useCallback((orderedIds, currentId, direction) => {
    const currentIndex = orderedIds.indexOf(currentId);
    if (currentIndex < 0) return false;
    const targetId = orderedIds[currentIndex + direction];
    if (!targetId) return false;
    const targetEl = textareaRefs.current[targetId];
    const cursor = direction < 0 ? (targetEl?.value?.length ?? 0) : 0;
    return focusTextareaById(targetId, cursor);
  }, [focusTextareaById]);

  const handleArrowNavigation = useCallback((e, orderedIds, currentId) => {
    if (e.nativeEvent.isComposing) return false;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;

    const start = e.target.selectionStart;
    const end = e.target.selectionEnd;
    const valueLength = e.target.value.length;

    if (start !== end) return false;

    if (e.key === 'ArrowUp' && start === 0) {
      const moved = moveBetweenItems(orderedIds, currentId, -1);
      if (moved) e.preventDefault();
      return moved;
    }

    if (e.key === 'ArrowDown' && start === valueLength) {
      const moved = moveBetweenItems(orderedIds, currentId, 1);
      if (moved) e.preventDefault();
      return moved;
    }

    return false;
  }, [moveBetweenItems]);

  // ─── Keyboard: Enter → split, Backspace at 0 → merge ────────────────────
  const handleKeyDown = useCallback((e, it, idx) => {
    if (e.nativeEvent.isComposing) return;

    // Slash → open unified tag picker
    // Trigger when '/' is typed at the start of the line or right after whitespace
    if (e.key === '/' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const pos = e.target.selectionStart;
      const end = e.target.selectionEnd;
      if (pos === end) {
        const before = it.text.slice(0, pos);
        const prevChar = before.slice(-1);
        const atTriggerPos = pos === 0 || prevChar === '\n' || /\s/.test(prevChar);
        if (atTriggerPos) {
          e.preventDefault();
          const rect = e.target.getBoundingClientRect();
          setUnifiedPicker({
            itemId: it.id,
            top: rect.bottom + 4,
            left: rect.left,
          });
          return;
        }
      }
    }

    if (handleArrowNavigation(e, items.map(item => item.id), it.id)) return;

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
  }, [items, save, handleArrowNavigation]);

  const handleAllViewKeyDown = useCallback((e, epId, itemId) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === '/' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const pos = e.target.selectionStart;
      const end = e.target.selectionEnd;
      if (pos === end) {
        const value = e.target.value || '';
        const before = value.slice(0, pos);
        const prevChar = before.slice(-1);
        const atTriggerPos = pos === 0 || prevChar === '\n' || /\s/.test(prevChar);
        if (atTriggerPos) {
          e.preventDefault();
          const rect = e.target.getBoundingClientRect();
          setUnifiedPicker({
            itemId,
            epId,
            top: rect.bottom + 4,
            left: rect.left,
          });
          return;
        }
      }
    }

    // Enter → split into new item (mirrors single-episode view).
    // Shift+Enter falls through → textarea default = newline within item.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const epItems = getLatestItemsForEp(epId);
      const idx = epItems.findIndex(it => it.id === itemId);
      if (idx < 0) return;
      const it = epItems[idx];
      const pos = e.target.selectionStart;
      const before = it.text.slice(0, pos);
      const after = it.text.slice(pos);
      const newId = genId();
      const newItems = [
        ...epItems.slice(0, idx),
        { ...it, text: before },
        { id: newId, text: after, order: idx + 1 },
        ...epItems.slice(idx + 1),
      ];
      pendingFocus.current = { id: newId, cursor: 0 };
      saveForEp(epId, newItems, true);
      return;
    }

    // Backspace at start of non-first item → merge into previous item.
    // Empty-item special case is the same shape: '' merged into prev = prev unchanged → 항목만 삭제.
    if (e.key === 'Backspace') {
      const pos = e.target.selectionStart;
      const end = e.target.selectionEnd;
      if (pos === 0 && end === 0) {
        const epItems = getLatestItemsForEp(epId);
        const idx = epItems.findIndex(it => it.id === itemId);
        if (idx > 0) {
          e.preventDefault();
          const it = epItems[idx];
          const prev = epItems[idx - 1];
          const cursor = prev.text.length;
          const merged = { ...prev, text: prev.text + it.text };
          const newItems = [
            ...epItems.slice(0, idx - 1),
            merged,
            ...epItems.slice(idx + 1),
          ];
          pendingFocus.current = { id: prev.id, cursor };
          saveForEp(epId, newItems, true);
          return;
        }
      }
    }

    // Delete at end of non-last item → merge with next item.
    if (e.key === 'Delete') {
      const epItems = getLatestItemsForEp(epId);
      const idx = epItems.findIndex(it => it.id === itemId);
      if (idx >= 0 && idx < epItems.length - 1) {
        const it = epItems[idx];
        const pos = e.target.selectionStart;
        if (pos === it.text.length && e.target.selectionEnd === pos) {
          e.preventDefault();
          const next = epItems[idx + 1];
          const cursor = it.text.length;
          const merged = { ...it, text: it.text + next.text };
          const newItems = [
            ...epItems.slice(0, idx),
            merged,
            ...epItems.slice(idx + 2),
          ];
          pendingFocus.current = { id: it.id, cursor };
          saveForEp(epId, newItems, true);
          return;
        }
      }
    }

    handleArrowNavigation(e, allViewItemIds, itemId);
  }, [allViewItemIds, getLatestItemsForEp, saveForEp, handleArrowNavigation]);

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

  // ─── 보드 카드 클릭 → 리스트 뷰로 전환 + 해당 항목 포커스 ─────────────────
  // 단일 회차 보드: 같은 회차 리스트로
  // 전체뷰 보드: 전체뷰 리스트로 (모든 textarea가 마운트되므로 ref로 직접 포커스)
  const handleCardClick = useCallback((targetEpId, itemId) => {
    if (selectedEpId !== 'all' && targetEpId && targetEpId !== epId) {
      setSelectedEpId(targetEpId);
    }
    pendingFocus.current = { id: itemId, cursor: 0, scroll: true };
    setViewMode('list');
  }, [selectedEpId, epId]);

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

      const emotionTags = Array.isArray(it.emotionTags) ? it.emotionTags : [];
      const structureTags = Array.isArray(it.structureTags) ? it.structureTags : [];
      const firstEmotion = emotionTags[0] || null;

      newScenes.push({
        id: sceneId, episodeId: epId, projectId: activeProjectId,
        sourceTreatmentItemId: it.id,
        sceneSeq, status: 'draft',
        tags: [...structureTags],
        emotionTags: [...emotionTags],
        createdAt: now(), updatedAt: now(),
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
        emotionTag: firstEmotion,
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

  const canImportToScript = selectedEpId !== 'all' && !!epId;

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ background: 'var(--c-bg)' }}>
      {/* Header bar — 구조/씬리스트와 동일 스타일 */}
      <div className="flex items-center gap-3 shrink-0" style={{ padding: '10px', borderBottom: '1px solid var(--c-border2)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--c-text2)' }}>트리트먼트</span>
        <div ref={helpRef} style={{ position: 'relative', display: 'inline-flex' }}>
          <button onClick={() => setHelpOpen(v => !v)} title="도움말" style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--c-border3)', background: helpOpen ? 'var(--c-active)' : 'transparent', color: 'var(--c-text5)', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}>?</button>
          {helpOpen && (
            <div style={{ position: 'absolute', top: '24px', left: 0, zIndex: 200, background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '10px 14px', width: 260, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--c-text3)' }}>트리트먼트 안내</div>
              {[
                '각 씬의 내용을 간략히 작성하세요.',
                '전체회차에서는 여러 회차를 한 화면에서 정리할 수 있습니다.',
                isSeries ? '회차 추가는 새 회차를 만드는 버튼이고, 각 회차 아래 내용 추가는 그 회차 안의 항목만 늘립니다.' : '개별 회차를 선택해 항목을 정리할 수 있습니다.',
                '대본으로 가져오기는 개별 회차 선택 상태에서만 사용할 수 있습니다.',
                '바깥 화면을 터치하거나 클릭하면 이 안내가 닫힙니다.',
              ].map((t, i) => (
                <div key={i} className="text-[11px] leading-relaxed" style={{ color: 'var(--c-text5)' }}>· {t}</div>
              ))}
            </div>
          )}
        </div>
        <select
          value={selectedEpId === 'all' ? 'all' : (epId || '')}
          onChange={e => handleEpSelect(e.target.value)}
          className="text-xs rounded outline-none px-2 py-1"
          style={{ background: 'var(--c-input)', color: 'var(--c-text2)', border: '1px solid var(--c-border3)' }}
        >
          <option value="all">전체</option>
          {projectEpisodes.map(ep => (
            <option key={ep.id} value={ep.id}>{ep.number}회 {ep.title || ''}</option>
          ))}
          {missingNums.map(n => (
            <option key={`__new__${n}`} value={`__new__${n}`}>자동생성 : {n}회</option>
          ))}
        </select>
        {selectedEpId === 'all' && isSeries && (
          <button
            onClick={handleAddEpisodeInAllView}
            className="px-2.5 py-1 rounded text-xs"
            style={{
              color: 'var(--c-text3)',
              border: '1px solid var(--c-border3)',
              background: 'transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            + {nextEpisodeNumber}회차 추가
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* 뷰 모드 탭 (리스트/보드) */}
          <div style={{ display: 'inline-flex', border: '1px solid var(--c-border3)', borderRadius: 4, overflow: 'hidden' }}>
            <button
              onClick={() => setViewMode('list')}
              title="리스트 뷰"
              style={{
                padding: '3px 8px', fontSize: 11, lineHeight: 1.4,
                background: viewMode === 'list' ? 'var(--c-active)' : 'transparent',
                color: viewMode === 'list' ? 'var(--c-text2)' : 'var(--c-text5)',
                border: 'none', cursor: 'pointer',
              }}
            >리스트</button>
            <button
              onClick={() => setViewMode('board')}
              title="보드 뷰"
              style={{
                padding: '3px 8px', fontSize: 11, lineHeight: 1.4,
                background: viewMode === 'board' ? 'var(--c-active)' : 'transparent',
                color: viewMode === 'board' ? 'var(--c-text2)' : 'var(--c-text5)',
                border: 'none', borderLeft: '1px solid var(--c-border3)', cursor: 'pointer',
              }}
            >보드</button>
          </div>
          {importMsg && <span className="text-xs" style={{ color: 'var(--c-accent2)' }}>{importMsg}</span>}
          <button
            disabled={!canImportToScript}
            onClick={() => {
              if (!canImportToScript) return;
              const epSceneCount = scriptBlocks.filter(b => b.episodeId === epId && b.type === 'scene_number').length;
              const filledCount = items.filter(it => it.text.trim()).length;
              if (epSceneCount > 0 && epSceneCount > filledCount) {
                setImportWarning(true);
              } else {
                setImporting(true);
              }
            }}
            title={canImportToScript ? '현재 회차의 트리트먼트를 대본에 추가합니다.' : '대본으로 가져오기는 개별 회차에서만 사용할 수 있습니다.'}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              fontSize: 11,
              background: 'transparent',
              color: canImportToScript ? 'var(--c-text3)' : 'var(--c-text6)',
              border: '1px solid var(--c-border3)',
              cursor: canImportToScript ? 'pointer' : 'not-allowed',
              opacity: canImportToScript ? 1 : 0.55,
            }}
          >대본으로 가져오기</button>
        </div>
      </div>

      {/* Import warning bar */}
      {importWarning && (
        <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ background: 'var(--c-active)', borderBottom: '1px solid var(--c-border2)' }}>
          <span className="text-xs flex-1" style={{ color: 'var(--c-text4)' }}>
            트리트먼트 항목이 {episode?.number}회 대본 하단에 추가됩니다. (기존 씬 {scriptBlocks.filter(b => b.episodeId === epId && b.type === 'scene_number').length}개 유지)
          </span>
          <button onClick={() => { setImportWarning(false); setImporting(true); }} className="px-3 py-1 rounded text-xs text-white shrink-0" style={{ background: 'var(--c-accent)', border: 'none', cursor: 'pointer' }}>확인</button>
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

        {/* 보드 뷰 — 표시 + 카드 클릭으로 리스트 전환 (Phase A) */}
        {viewMode === 'board' && (
          <TreatmentBoardView
            groups={
              allEpItems
                ? allEpItems
                : (episode
                    ? [{ ep: episode, episodeNumber: episode.number, isMissing: false, items }]
                    : [])
            }
            onCardClick={handleCardClick}
            onCreateEpisode={createEpisodeForNumber}
          />
        )}

        {/* 전체 보기 */}
        {viewMode === 'list' && allEpItems && allEpItems.map(({ ep, episodeNumber, isMissing, items: epItems }) => (
          <div key={ep?.id || `missing-${episodeNumber}`} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text3)', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--c-border2)' }}>
              {episodeNumber}회 {ep?.title || ''}
            </div>
            {isMissing ? (
              <div
                style={{
                  border: '1px dashed var(--c-border3)',
                  borderRadius: 8,
                  padding: '14px 12px',
                  background: 'var(--c-card)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--c-text5)' }}>
                  아직 생성되지 않은 회차입니다. 이 버튼으로 회차를 만들면 바로 이 자리에서 내용을 이어서 작성할 수 있습니다.
                </div>
                <button
                  onClick={() => createEpisodeForNumber(episodeNumber)}
                  className="shrink-0 px-3 py-1.5 rounded text-xs"
                  style={{
                    color: 'var(--c-text3)',
                    border: '1px solid var(--c-border3)',
                    background: 'transparent',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {episodeNumber}회차 추가
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  {epItems.map((it, idx) => (
                    <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 11, color: 'var(--c-text6)', minWidth: 24, textAlign: 'right', marginTop: 6 }}>{idx + 1}.</span>
                      <div className="flex-1 flex flex-col gap-1 min-w-0">
                        <textarea
                          value={it.text}
                          rows={1}
                          placeholder="줄거리 항목 입력 (/ 로 태그 추가)"
                          className="w-full text-xs resize-none rounded px-3 py-1.5 outline-none"
                          style={{ background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-border3)', lineHeight: 1.5, minHeight: '2em', overflow: 'hidden' }}
                          ref={el => {
                            textareaRefs.current[it.id] = el;
                            if (el) autoResize(el);
                          }}
                          onChange={e => { autoResize(e.target); updateItemForEp(ep.id, epItems, it.id, e.target.value); }}
                          onKeyDown={e => handleAllViewKeyDown(e, ep.id, it.id)}
                        />
                        {((it.emotionTags && it.emotionTags.length) || (it.structureTags && it.structureTags.length)) ? (
                          <div className="flex flex-wrap gap-1 px-1">
                            {(it.emotionTags || []).map(tag => (
                              <span
                                key={`em-${tag.word}`}
                                onClick={() => {
                                  const el = textareaRefs.current[it.id];
                                  const rect = el?.getBoundingClientRect();
                                  setEmotionPicker({
                                    itemId: it.id,
                                    epId: ep.id,
                                    top: (rect?.bottom ?? 0) + 4,
                                    left: rect?.left ?? 0,
                                    existingTag: tag,
                                    initialWord: tag.word,
                                  });
                                }}
                                style={{
                                  ...getChipInlineStyle(tag.color, tag.intensity),
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '1px 6px',
                                  borderRadius: 999,
                                  fontSize: 10,
                                  lineHeight: 1.5,
                                  cursor: 'pointer',
                                }}
                                title="클릭하여 수정"
                              >
                                {tag.word}
                                <button
                                  onClick={(e) => { e.stopPropagation(); removeEmotionTagForEp(ep.id, it.id, tag.word); }}
                                  style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 10, padding: 0, lineHeight: 1, opacity: 0.7 }}
                                  title="삭제"
                                >×</button>
                              </span>
                            ))}
                            {(it.structureTags || []).map(beat => (
                              <span
                                key={`st-${beat}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  fontSize: 10,
                                  lineHeight: 1.5,
                                  color: '#fff',
                                  background: structureTagColor(beat),
                                }}
                              >
                                {beat}
                                <button
                                  onClick={() => removeStructureTagForEp(ep.id, it.id, beat)}
                                  style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 10, padding: 0, lineHeight: 1, opacity: 0.75 }}
                                  title="삭제"
                                >×</button>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => addItemForEp(ep.id, epItems)}
                  className="mt-2 w-full py-1.5 rounded text-xs"
                  style={{ color: 'var(--c-text5)', border: '1px dashed var(--c-border3)', background: 'transparent', cursor: 'pointer' }}
                >+ {episodeNumber}회차 안 내용 추가</button>
              </>
            )}
          </div>
        ))}

        {/* 단일 회차 Items */}
        {viewMode === 'list' && !allEpItems && <div className="space-y-1.5">
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
              <div className="flex-1 flex flex-col gap-1 min-w-0">
                <textarea
                  ref={el => {
                    textareaRefs.current[it.id] = el;
                    if (el) autoResize(el);
                  }}
                  value={it.text}
                  rows={1}
                  placeholder="줄거리 항목 입력 (/ 로 태그 추가)"
                  className="w-full text-xs resize-none rounded px-3 py-1.5 outline-none"
                  style={{
                    background: 'var(--c-input)',
                    color: 'var(--c-text)',
                    border: '1px solid var(--c-border3)',
                    lineHeight: 1.5,
                    minHeight: '2em',
                    overflow: 'hidden',
                  }}
                  onChange={e => {
                    autoResize(e.target);
                    updateItem(it.id, e.target.value);
                  }}
                  onKeyDown={e => handleKeyDown(e, it, idx)}
                  onPaste={e => handlePaste(e, it, idx)}
                />
                {((it.emotionTags && it.emotionTags.length) || (it.structureTags && it.structureTags.length)) ? (
                  <div className="flex flex-wrap gap-1 px-1">
                    {(it.emotionTags || []).map(tag => (
                      <span
                        key={`em-${tag.word}`}
                        onClick={() => {
                          const el = textareaRefs.current[it.id];
                          const rect = el?.getBoundingClientRect();
                          setEmotionPicker({
                            itemId: it.id,
                            top: (rect?.bottom ?? 0) + 4,
                            left: rect?.left ?? 0,
                            existingTag: tag,
                            initialWord: tag.word,
                          });
                        }}
                        style={{
                          ...getChipInlineStyle(tag.color, tag.intensity),
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '1px 6px',
                          borderRadius: 999,
                          fontSize: 10,
                          lineHeight: 1.5,
                          cursor: 'pointer',
                        }}
                        title="클릭하여 수정"
                      >
                        {tag.word}
                        <button
                          onClick={(e) => { e.stopPropagation(); removeEmotionTagFromItem(it.id, tag.word); }}
                          style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 10, padding: 0, lineHeight: 1, opacity: 0.7 }}
                          title="삭제"
                        >×</button>
                      </span>
                    ))}
                    {(it.structureTags || []).map(beat => (
                      <span
                        key={`st-${beat}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '1px 6px',
                          borderRadius: 4,
                          fontSize: 10,
                          lineHeight: 1.5,
                          color: '#fff',
                          background: structureTagColor(beat),
                        }}
                      >
                        {beat}
                        <button
                          onClick={() => removeStructureTagFromItem(it.id, beat)}
                          style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 10, padding: 0, lineHeight: 1, opacity: 0.75 }}
                          title="삭제"
                        >×</button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
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
        </div>}

        {viewMode === 'list' && !allEpItems && <button
          onClick={addItem}
          className="mt-3 w-full py-2 rounded text-sm"
          style={{ color: 'var(--c-text4)', border: '1px dashed var(--c-border3)', background: 'transparent', cursor: 'pointer' }}
        >
          + 항목 추가
        </button>}


      </div>
      </div>

      {/* Unified tag picker (slash-triggered) */}
      {unifiedPicker && (() => {
        const isAllView = !!unifiedPicker.epId;
        const pickerItem = isAllView
          ? getLatestItemsForEp(unifiedPicker.epId).find(it => it.id === unifiedPicker.itemId)
          : items.find(it => it.id === unifiedPicker.itemId);
        const safeLeft = Math.min(unifiedPicker.left, window.innerWidth - 272);
        return (
          <UnifiedTagPicker
            position={{ top: unifiedPicker.top, left: safeLeft }}
            currentStructureTags={pickerItem?.structureTags || []}
            onAddStructure={(beat) => {
              if (isAllView) addStructureTagForEp(unifiedPicker.epId, unifiedPicker.itemId, beat);
              else addStructureTagToItem(unifiedPicker.itemId, beat);
              setUnifiedPicker(null);
            }}
            onOpenFullPicker={(word) => {
              setEmotionPicker({
                itemId: unifiedPicker.itemId,
                epId: unifiedPicker.epId,
                top: unifiedPicker.top,
                left: unifiedPicker.left,
                initialWord: word,
                existingTag: null,
              });
              setUnifiedPicker(null);
            }}
            onClose={() => setUnifiedPicker(null)}
          />
        );
      })()}

      {/* Emotion tag picker (3-step) */}
      {emotionPicker && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 299 }}
            onMouseDown={(e) => { e.preventDefault(); setEmotionPicker(null); }}
          />
          <div style={{
            position: 'fixed',
            top: emotionPicker.top,
            left: Math.min(emotionPicker.left, window.innerWidth - 296),
            zIndex: 300,
          }}>
            <EmotionTagPicker
              existingTag={emotionPicker.existingTag}
              initialWord={emotionPicker.initialWord || ''}
              onSelect={(tag) => {
                if (emotionPicker.epId) addEmotionTagForEp(emotionPicker.epId, emotionPicker.itemId, tag);
                else addEmotionTagToItem(emotionPicker.itemId, tag);
                setEmotionPicker(null);
              }}
              onClose={() => setEmotionPicker(null)}
            />
          </div>
        </>,
        document.body
      )}
      </div>
  );
}
