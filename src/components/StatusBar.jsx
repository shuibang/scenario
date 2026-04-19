import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { getBlockPlainText } from '../utils/findReplace';

function Divider() {
  return (
    <span style={{ display: 'inline-block', width: 1, height: 12, background: 'var(--c-border3)', flexShrink: 0, margin: '0 2px' }} />
  );
}

const BLOCK_TYPE_LABEL = {
  scene_number:  '씬',
  action:        '지문',
  dialogue:      '대사',
  character:     '인물',
  parenthetical: '괄호',
};

export default function StatusBar({ hidden }) {
  const { state } = useApp();
  const { scriptBlocks, activeEpisodeId, scenes } = state;

  const [activeBlockId, setActiveBlockId] = useState(null);
  const [activeBlockType, setActiveBlockType] = useState(null);

  // 에디터 내 커서 위치를 document.selectionchange로 추적
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      let node = sel.getRangeAt(0).startContainer;
      // TextNode → Element로 올라가기
      if (node.nodeType !== 1) node = node.parentElement;
      // [data-block-id] 조상 찾기
      while (node) {
        if (node.dataset?.blockId) {
          setActiveBlockId(node.dataset.blockId);
          setActiveBlockType(node.dataset.blockType || null);
          return;
        }
        node = node.parentElement;
      }
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  const stats = useMemo(() => {
    const epBlocks = activeEpisodeId
      ? scriptBlocks.filter(b => b.episodeId === activeEpisodeId)
      : scriptBlocks;

    let charCount = 0;
    let wordCount = 0;
    epBlocks.forEach(b => {
      const text = getBlockPlainText(b);
      charCount += text.length;
      if (text.trim()) wordCount += text.trim().split(/\s+/).filter(Boolean).length;
    });

    // 현재 블록 인덱스 (씬 순번용)
    const activeIdx = activeBlockId
      ? epBlocks.findIndex(b => b.id === activeBlockId)
      : -1;

    // 현재 씬 순번: activeIdx까지 scene_number 블록 수
    let currentSceneNum = 0;
    const upTo = activeIdx >= 0 ? activeIdx : epBlocks.length - 1;
    for (let i = 0; i <= upTo; i++) {
      if (epBlocks[i]?.type === 'scene_number') currentSceneNum++;
    }

    const totalLines = epBlocks.length;
    const currentLine = activeIdx >= 0 ? activeIdx + 1 : totalLines;
    const totalScenes = activeEpisodeId
      ? scenes.filter(s => s.episodeId === activeEpisodeId).length
      : scenes.length;

    return { currentLine, totalLines, currentSceneNum, totalScenes, wordCount, charCount };
  }, [scriptBlocks, activeEpisodeId, activeBlockId, scenes]);

  if (hidden) return null;

  const blockLabel = BLOCK_TYPE_LABEL[activeBlockType] || null;

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
      {/* 왼쪽: 위치 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>줄 {stats.currentLine}/{stats.totalLines}</span>
        <Divider />
        <span>씬 {stats.currentSceneNum || 1}{stats.totalScenes > 0 ? `/${stats.totalScenes}` : ''}</span>
        {blockLabel && (
          <>
            <Divider />
            <span>{blockLabel}</span>
          </>
        )}
      </div>

      {/* 오른쪽: 집계 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>단어 {stats.wordCount.toLocaleString()}</span>
        <Divider />
        <span>문자 {stats.charCount.toLocaleString()}</span>
      </div>
    </div>
  );
}
