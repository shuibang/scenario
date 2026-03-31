/**
 * v2 RightPanel — Phase 4
 * Shows outline for the active episode (script view).
 * Data: sel.outlineByEpisode → OutlineItem[]
 * Each item shows sceneId, formatted label, status, characters.
 * Click → SET_SCROLL_TO_SCENE → EditorCore scrolls to scene.
 */
import React, { useState, useCallback } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import { sel } from '../store/selectors.js';
import * as A from '../store/actions.js';

const STATUS_COLOR = {
  draft:   'var(--c-text6)',
  writing: '#f59e0b',
  done:    '#22c55e',
};
const STATUS_LABEL = { draft: '미작성', writing: '작성중', done: '완료' };

export default function V2RightPanel() {
  const { state, dispatch } = useStore();
  const { ui } = state;
  const { activeEpisodeId, activeDoc, selectedSceneId } = ui;

  if (activeDoc !== 'script' || !activeEpisodeId) {
    return (
      <div style={{ padding: '12px', fontSize: 12, color: 'var(--c-text6)' }}>
        회차 대본을 열면 씬 개요가 표시됩니다
      </div>
    );
  }

  return <OutlinePanel episodeId={activeEpisodeId} selectedSceneId={selectedSceneId} dispatch={dispatch} state={state} />;
}

function OutlinePanel({ episodeId, selectedSceneId, dispatch, state }) {
  const outline = sel.outlineByEpisode(state, episodeId);
  const chars   = state.entities.characters.byId;

  const handleClick = useCallback((sceneId) => {
    dispatch({ type: A.SET_SELECTED_SCENE, id: sceneId });
    dispatch({ type: A.SET_SCROLL_TO_SCENE, id: sceneId });
  }, [dispatch]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '6px 12px 4px',
        fontSize: 11, fontWeight: 600, color: 'var(--c-text5)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        borderBottom: '1px solid var(--c-border2)',
        flexShrink: 0,
      }}>
        씬 개요 ({outline.length})
      </div>

      {/* Outline list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {outline.length === 0 && (
          <div style={{ padding: '12px', fontSize: 12, color: 'var(--c-text6)' }}>
            본문에서 씬번호(S#)를 추가하면 여기에 표시됩니다
          </div>
        )}
        {outline.map(item => {
          const isSelected = item.sceneId === selectedSceneId;
          const charNames  = item.characterIds
            .map(id => chars[id])
            .filter(Boolean)
            .map(c => c.givenName || c.name || '')
            .filter(Boolean);

          return (
            <OutlineItem
              key={item.sceneId}
              item={item}
              isSelected={isSelected}
              charNames={charNames}
              onClick={() => handleClick(item.sceneId)}
              dispatch={dispatch}
            />
          );
        })}
      </div>
    </div>
  );
}

function OutlineItem({ item, isSelected, charNames, onClick, dispatch }) {
  const [hovering, setHovering] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        padding: '5px 12px',
        cursor: 'pointer',
        background: isSelected ? 'var(--c-active)' : hovering ? 'var(--c-hover)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--c-accent)' : '2px solid transparent',
        transition: 'background 0.1s',
      }}
    >
      {/* Label row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: isSelected ? 'var(--c-accent)' : 'var(--c-text3)', flexShrink: 0 }}>
          {item.label}
        </span>
        <span style={{ fontSize: 11, color: isSelected ? 'var(--c-accent)' : 'var(--c-text2)',
                       overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {item.shortLabel || <span style={{ color: 'var(--c-text6)', fontStyle: 'italic' }}>(미입력)</span>}
        </span>
        {/* Status dot */}
        <span
          style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                   background: STATUS_COLOR[item.status] || 'var(--c-text6)' }}
          title={STATUS_LABEL[item.status] || item.status}
        />
      </div>

      {/* Character tags */}
      {charNames.length > 0 && (
        <div style={{ marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {charNames.slice(0, 4).map(n => (
            <span key={n} style={{
              fontSize: 9, padding: '1px 4px', borderRadius: 2,
              background: 'var(--c-tag)', color: 'var(--c-text5)',
            }}>{n}</span>
          ))}
          {charNames.length > 4 && (
            <span style={{ fontSize: 9, color: 'var(--c-text6)' }}>+{charNames.length - 4}</span>
          )}
        </div>
      )}

      {/* Status quick-toggle (visible on hover/selected) */}
      {(isSelected || hovering) && (
        <StatusToggle
          sceneId={item.sceneId}
          status={item.status}
          dispatch={dispatch}
        />
      )}
    </div>
  );
}

function StatusToggle({ sceneId, status, dispatch }) {
  const statuses = ['draft', 'writing', 'done'];
  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 4 }} onClick={e => e.stopPropagation()}>
      {statuses.map(s => (
        <button
          key={s}
          onMouseDown={e => {
            e.preventDefault();
            dispatch({ type: A.UPDATE_SCENE, payload: { id: sceneId, status: s } });
          }}
          style={{
            fontSize: 9, padding: '1px 5px', borderRadius: 3,
            border: `1px solid ${s === status ? STATUS_COLOR[s] : 'var(--c-border3)'}`,
            background: s === status ? STATUS_COLOR[s] : 'transparent',
            color:      s === status ? '#fff' : 'var(--c-text6)',
            cursor: 'pointer',
          }}
        >{STATUS_LABEL[s]}</button>
      ))}
    </div>
  );
}
