import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { getBlockPlainText } from '../utils/findReplace';

function Divider() {
  return (
    <span style={{ display: 'inline-block', width: 1, height: 12, background: 'var(--c-border3)', flexShrink: 0, margin: '0 2px' }} />
  );
}

const LINES_PER_PAGE_SCRIPT  = 55; // 블록 기준 1페이지
const LINES_PER_PAGE_SYNOPSIS = 30; // 줄 기준 1페이지

export default function StatusBar({ hidden }) {
  const { state } = useApp();
  const { scriptBlocks, activeEpisodeId, scenes, activeDoc, synopsisDocs, activeProjectId, characters } = state;

  const [activeBlockId, setActiveBlockId] = useState(null);

  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      let node = sel.getRangeAt(0).startContainer;
      if (node.nodeType !== 1) node = node.parentElement;
      while (node) {
        if (node.dataset?.blockId) { setActiveBlockId(node.dataset.blockId); return; }
        node = node.parentElement;
      }
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  const stats = useMemo(() => {
    if (activeDoc === 'script' && activeEpisodeId) {
      const epBlocks = scriptBlocks.filter(b => b.episodeId === activeEpisodeId);
      let rawText = '';
      epBlocks.forEach(b => { rawText += getBlockPlainText(b); });
      const charCount      = rawText.replace(/\s/g, '').length;
      const charCountSpace = rawText.length;

      const activeIdx = activeBlockId ? epBlocks.findIndex(b => b.id === activeBlockId) : -1;
      let currentSceneNum = 0;
      const upTo = activeIdx >= 0 ? activeIdx : epBlocks.length - 1;
      for (let i = 0; i <= upTo; i++) {
        if (epBlocks[i]?.type === 'scene_number') currentSceneNum++;
      }

      const totalLines  = epBlocks.length;
      const currentLine = activeIdx >= 0 ? activeIdx + 1 : totalLines;
      const totalScenes = scenes.filter(s => s.episodeId === activeEpisodeId).length;
      const totalPages  = Math.max(1, Math.ceil(totalLines / LINES_PER_PAGE_SCRIPT));
      const currentPage = Math.max(1, Math.ceil(currentLine / LINES_PER_PAGE_SCRIPT));

      return { mode: 'script', currentPage, totalPages, currentSceneNum: currentSceneNum || 1, totalScenes, charCount, charCountSpace };
    }

    if (activeDoc === 'synopsis') {
      const doc = synopsisDocs?.find(d => d.projectId === activeProjectId);
      if (!doc) return null;
      const projectChars = (characters || []).filter(c => c.projectId === activeProjectId);
      const charIntros   = projectChars.map(c => c.intro ?? c.description ?? '').filter(Boolean);
      const parts = [doc.genre, doc.theme, doc.logline, doc.intent, doc.story || doc.content, ...charIntros].filter(Boolean);
      const body       = parts.join('\n');
      const plainBody  = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
      const charCount      = plainBody.replace(/\s/g, '').length;
      const charCountSpace = plainBody.length;
      const wordCount      = plainBody.trim() ? plainBody.trim().split(/\s+/).length : 0;
      const bodyLines  = plainBody ? plainBody.split('\n') : [];
      const totalLines = Math.max(1, bodyLines.length);
      const totalPages = Math.max(1, Math.ceil(totalLines / LINES_PER_PAGE_SYNOPSIS));
      return { mode: 'synopsis', currentPage: 1, totalPages, currentLine: totalLines, totalLines, charCount, charCountSpace, wordCount };
    }

    return null;
  }, [activeDoc, scriptBlocks, activeEpisodeId, scenes, activeBlockId, synopsisDocs, activeProjectId, characters]);

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
        {stats.mode === 'script' && (
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
