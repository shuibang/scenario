import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { getBlockPlainText } from '../utils/findReplace';
import { getLayoutMetrics } from '../print/LineTokenizer';

function Divider() {
  return (
    <span style={{ display: 'inline-block', width: 1, height: 12, background: 'var(--c-border3)', flexShrink: 0, margin: '0 2px' }} />
  );
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ');
}

export default function StatusBar({ hidden }) {
  const { state } = useApp();
  const {
    scriptBlocks, activeEpisodeId, scenes,
    activeDoc, activeProjectId, stylePreset,
    coverDocs, synopsisDocs, characters, episodes,
  } = state;

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

  const metrics = useMemo(() => getLayoutMetrics(stylePreset), [stylePreset]);

  const stats = useMemo(() => {
    const lpp = metrics.linesPerPage || 37;

    // ── 회차 대본
    if (activeDoc === 'script' && activeEpisodeId) {
      const epBlocks = scriptBlocks.filter(b => b.episodeId === activeEpisodeId);
      let charCount = 0;
      epBlocks.forEach(b => { charCount += getBlockPlainText(b).length; });

      const activeIdx = activeBlockId ? epBlocks.findIndex(b => b.id === activeBlockId) : -1;
      const totalLines = epBlocks.length;
      const currentLine = activeIdx >= 0 ? activeIdx + 1 : totalLines;

      const totalScenes = scenes.filter(s => s.episodeId === activeEpisodeId).length;
      let currentSceneNum = 0;
      const upTo = activeIdx >= 0 ? activeIdx : epBlocks.length - 1;
      for (let i = 0; i <= upTo; i++) {
        if (epBlocks[i]?.type === 'scene_number') currentSceneNum++;
      }

      const totalPages = Math.max(1, Math.ceil(totalLines / lpp));
      const currentPage = Math.max(1, Math.ceil(currentLine / lpp));

      return {
        left: [
          `페이지 ${currentPage}/${totalPages}`,
          `씬 ${currentSceneNum || 1}/${totalScenes || 1}`,
          `줄 ${currentLine}/${totalLines}`,
        ],
        right: `글자 ${charCount.toLocaleString()}`,
      };
    }

    // ── 표지
    if (activeDoc === 'cover') {
      const coverDoc = coverDocs.find(d => d.projectId === activeProjectId);
      if (!coverDoc) return null;
      const allFields = [...(coverDoc.fields || []), ...(coverDoc.customFields || [])].filter(f => f.value);
      const charCount = allFields.reduce((s, f) => s + stripHtml(f.value).length, 0);
      const lineCount = allFields.length;
      return {
        left: [`페이지 1/1`, `줄 ${lineCount}`],
        right: `글자 ${charCount.toLocaleString()}`,
      };
    }

    // ── 시놉시스
    if (activeDoc === 'synopsis') {
      const synDoc = synopsisDocs.find(d => d.projectId === activeProjectId);
      const text = synDoc
        ? [synDoc.genre, synDoc.theme, synDoc.intent, synDoc.story || synDoc.content]
            .filter(Boolean).map(stripHtml).join('\n')
        : '';
      const charCount = text.replace(/\s/g, '').length;
      const lineCount = text.split('\n').filter(l => l.trim()).length;
      const totalPages = Math.max(1, Math.ceil(lineCount / lpp));
      return {
        left: [`페이지 1/${totalPages}`, `줄 ${lineCount}`],
        right: `글자 ${charCount.toLocaleString()}`,
      };
    }

    // ── 등장인물: 숨김
    if (activeDoc === 'characters') {
      return null;
    }

    // ── 그 외 (resources 등)
    return null;
  }, [activeDoc, activeEpisodeId, activeBlockId, scriptBlocks, scenes, stylePreset,
      coverDocs, synopsisDocs, characters, activeProjectId, metrics]);

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
        {stats.left.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Divider />}
            <span>{item}</span>
          </React.Fragment>
        ))}
      </div>
      <div>
        <span>{stats.right}</span>
      </div>
    </div>
  );
}
