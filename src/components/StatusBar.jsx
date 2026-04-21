import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { getBlockPlainText } from '../utils/findReplace';
import { buildPrintModel } from '../print/PrintModel';
import { getLayoutMetrics, paginate, tokenizeSection } from '../print/LineTokenizer';

function Divider() {
  return (
    <span style={{ display: 'inline-block', width: 1, height: 12, background: 'var(--c-border3)', flexShrink: 0, margin: '0 2px' }} />
  );
}

function stripHtmlForPagination(html) {
  return (html || '')
    .replace(/&lt;br\s*\/?&gt;/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/&lt;[^&]*&gt;/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function wrapText(text, maxChars) {
  if (!text) return [''];
  const result = [];
  for (const rawLine of text.split('\n')) {
    if (!rawLine) {
      result.push('');
      continue;
    }
    let remaining = rawLine;
    while (remaining.length > maxChars) {
      let cut = maxChars;
      while (cut > 0 && remaining[cut] !== ' ') cut--;
      if (cut === 0) cut = maxChars;
      result.push(remaining.slice(0, cut).trimEnd());
      remaining = remaining.slice(cut).trimStart();
    }
    result.push(remaining);
  }
  return result.length ? result : [''];
}

function getWrappedLinesForBlock(block, metrics) {
  if (!block) return [''];
  const plain = stripHtmlForPagination(block.content || '');

  switch (block.type) {
    case 'action':
      return wrapText(plain, Math.max(1, metrics.charsPerLine - 2));
    case 'dialogue':
      return wrapText(plain, Math.max(1, metrics.charsInSpeech));
    case 'parenthetical':
      return wrapText(`(${plain})`, Math.max(1, metrics.charsInSpeech));
    case 'scene_number':
    case 'scene_ref':
    case 'transition':
      return [plain || ''];
    default:
      return wrapText(plain, Math.max(1, metrics.charsPerLine));
  }
}

function getLineIndexForOffset(block, metrics, offset) {
  const lines = getWrappedLinesForBlock(block, metrics);
  let remaining = Math.max(0, offset);

  for (let i = 0; i < lines.length; i++) {
    const lineLen = lines[i].length;
    if (remaining <= lineLen) return i;
    remaining -= lineLen;
    if (remaining > 0) remaining -= 1;
  }

  return Math.max(0, lines.length - 1);
}

function findPageForBlockLine(pages, blockId, lineIndex) {
  for (let i = 0; i < pages.length; i++) {
    const hit = pages[i].some(token =>
      token.sourceBlockId === blockId &&
      (token.sourceLineIndex ?? 0) === lineIndex
    );
    if (hit) return i + 1;
  }

  for (let i = 0; i < pages.length; i++) {
    if (pages[i].some(token => token.sourceBlockId === blockId)) return i + 1;
  }

  return null;
}

export default function StatusBar({ hidden }) {
  const { state } = useApp();
  const {
    activeDoc,
    activeEpisodeId,
    activeProjectId,
    characters,
    coverDocs,
    episodes,
    projects,
    scenes,
    scriptBlocks,
    stylePreset,
    synopsisDocs,
  } = state;

  const [activeCursor, setActiveCursor] = useState({ blockId: null, offset: 0 });
  const [synopsisScroll, setSynopsisScroll] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 });

  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;

      let node = sel.getRangeAt(0).startContainer;
      if (node.nodeType !== 1) node = node.parentElement;

      while (node) {
        if (node.dataset?.blockId) {
          let offset = 0;
          try {
            const range = sel.getRangeAt(0);
            const before = range.cloneRange();
            before.selectNodeContents(node);
            before.setEnd(range.startContainer, range.startOffset);
            offset = before.toString().length;
          } catch {
            offset = 0;
          }

          setActiveCursor(prev =>
            prev.blockId === node.dataset.blockId && prev.offset === offset
              ? prev
              : { blockId: node.dataset.blockId, offset }
          );
          return;
        }
        node = node.parentElement;
      }

      setActiveCursor(prev => (prev.blockId === null && prev.offset === 0 ? prev : { blockId: null, offset: 0 }));
    };

    document.addEventListener('selectionchange', handler);
    document.addEventListener('focusin', handler);
    return () => {
      document.removeEventListener('selectionchange', handler);
      document.removeEventListener('focusin', handler);
    };
  }, []);

  useEffect(() => {
    if (activeDoc !== 'synopsis') return undefined;

    let cleanup = null;
    let rafId = 0;

    const attach = () => {
      const el = document.querySelector('[data-synopsis-scroll]');
      if (!el) return false;

      const update = () => {
        setSynopsisScroll({
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        });
      };

      const ro = new ResizeObserver(update);
      ro.observe(el);
      el.addEventListener('scroll', update, { passive: true });
      update();

      cleanup = () => {
        ro.disconnect();
        el.removeEventListener('scroll', update);
      };
      return true;
    };

    if (!attach()) {
      rafId = requestAnimationFrame(() => { attach(); });
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      cleanup?.();
    };
  }, [activeDoc, activeProjectId]);

  const stats = useMemo(() => {
    const metrics = getLayoutMetrics(stylePreset || {});

    if (activeDoc === 'script' && activeEpisodeId) {
      const epBlocks = scriptBlocks.filter(b => b.episodeId === activeEpisodeId);
      const rawText = epBlocks.map(getBlockPlainText).join('');
      const charCount = rawText.replace(/\s/g, '').length;
      const charCountSpace = rawText.length;

      const selections = {
        cover: false,
        synopsis: false,
        episodes: { [activeEpisodeId]: true },
        chars: false,
        biography: false,
        treatment: false,
      };

      const printModel = buildPrintModel(
        { projects, episodes, scriptBlocks, characters, coverDocs, synopsisDocs, scenes, activeProjectId },
        selections,
        stylePreset || {}
      );
      const section = printModel.sections.find(sec => sec.type === 'episode' && sec.episodeId === activeEpisodeId);
      const printBlocks = section?.blocks || [];
      const tokens = section ? tokenizeSection(section, metrics) : [];
      const pages = tokens.length ? paginate(tokens, metrics, 'episode') : [[]];
      const totalPages = Math.max(1, pages.length || 1);

      let currentPage = totalPages;
      if (activeCursor.blockId) {
        const activePrintBlock = printBlocks.find(b => b.id === activeCursor.blockId);
        if (activePrintBlock) {
          const lineIndex = getLineIndexForOffset(activePrintBlock, metrics, activeCursor.offset);
          currentPage = findPageForBlockLine(pages, activePrintBlock.id, lineIndex) ?? totalPages;
        }
      }

      const activeScenes = scenes
        .filter(s => s.episodeId === activeEpisodeId && !s.deleted)
        .sort((a, b) => (a.sceneSeq ?? 0) - (b.sceneSeq ?? 0));
      const activeSceneIds = new Set(activeScenes.map(s => s.id));
      const upTo = activeCursor.blockId
        ? epBlocks.findIndex(b => b.id === activeCursor.blockId)
        : epBlocks.length - 1;

      let lastSceneId = null;
      for (let i = 0; i <= upTo; i++) {
        const block = epBlocks[i];
        if (block?.type === 'scene_number' && activeSceneIds.has(block.sceneId)) {
          lastSceneId = block.sceneId;
        }
      }

      const resolvedSceneNum = lastSceneId
        ? activeScenes.findIndex(scene => scene.id === lastSceneId) + 1
        : 0;
      const totalScenes = activeScenes.length;
      const currentSceneNum = totalScenes > 0 ? Math.max(1, resolvedSceneNum) : 0;

      return { mode: 'script', currentPage, totalPages, currentSceneNum, totalScenes, charCount, charCountSpace };
    }

    if (activeDoc === 'synopsis') {
      const doc = synopsisDocs?.find(d => d.projectId === activeProjectId);
      if (!doc) return null;

      const projectChars = (characters || []).filter(c => c.projectId === activeProjectId);
      const charIntros = projectChars.map(c => c.intro ?? c.description ?? '').filter(Boolean);
      const parts = [doc.genre, doc.theme, doc.logline, doc.intent, doc.story || doc.content, ...charIntros].filter(Boolean);
      const body = parts.join('\n');
      const plainBody = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
      const charCount = plainBody.replace(/\s/g, '').length;
      const charCountSpace = plainBody.length;

      const selections = {
        cover: false,
        synopsis: true,
        episodes: {},
        chars: false,
        biography: false,
        treatment: false,
      };

      const printModel = buildPrintModel(
        { projects, episodes, scriptBlocks, characters, coverDocs, synopsisDocs, scenes, activeProjectId },
        selections,
        stylePreset || {}
      );
      const section = printModel.sections.find(sec => sec.type === 'synopsis');
      const tokens = section ? tokenizeSection(section, metrics) : [];
      const pages = tokens.length ? paginate(tokens, metrics, 'synopsis') : [[]];
      const totalPages = Math.max(1, pages.length || 1);

      const { scrollTop, scrollHeight, clientHeight } = synopsisScroll;
      const ratio = scrollHeight <= clientHeight ? 0 : scrollTop / (scrollHeight - clientHeight);
      const currentPage = totalPages <= 1
        ? 1
        : Math.min(totalPages, Math.max(1, Math.floor(ratio * totalPages) + 1));

      return { mode: 'synopsis', currentPage, totalPages, charCount, charCountSpace };
    }

    return null;
  }, [
    activeCursor.blockId,
    activeCursor.offset,
    activeDoc,
    activeEpisodeId,
    activeProjectId,
    characters,
    coverDocs,
    episodes,
    projects,
    scenes,
    scriptBlocks,
    stylePreset,
    synopsisDocs,
    synopsisScroll,
  ]);

  if (hidden || !stats) return null;

  return (
    <div
      className="no-print select-none"
      style={{
        height: 26,
        borderTop: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: 11,
        color: 'var(--c-text5)',
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.01em',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>페이지 {stats.currentPage}/{stats.totalPages}</span>
        {stats.mode === 'script' && stats.totalScenes > 0 && (
          <>
            <Divider />
            <span>씬 {stats.currentSceneNum}/{stats.totalScenes}</span>
          </>
        )}
      </div>
      <div>
        <span>글자 {stats.charCount.toLocaleString('ko-KR')} (공백 포함 {stats.charCountSpace.toLocaleString('ko-KR')})</span>
      </div>
    </div>
  );
}
