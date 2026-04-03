import React, { useRef } from 'react';
import { useApp } from '../../store/AppContext';
import MobileScriptTab from './MobileScriptTab';
import MobileMemoTab from './MobileMemoTab';
import AdBanner from '../AdBanner';

const TABS = [
  { id: 'script', icon: '📝', label: '대본' },
  { id: 'data',   icon: '👤', label: '자료' },
  { id: 'plan',   icon: '🗂',  label: '설계' },
  { id: 'memo',   icon: '✏️',  label: '메모' },
];

const DATA_DOCS = [
  { doc: 'characters',    label: '인물' },
  { doc: 'biography',     label: '인물이력서' },
  { doc: 'relationships', label: '인물관계도' },
  { doc: 'resources',     label: '자료수집' },
];

const PLAN_DOCS = [
  { doc: 'structure',  label: '구조' },
  { doc: 'treatment',  label: '트리트먼트' },
  { doc: 'scenelist',  label: '씬리스트' },
];

const TAB_H    = 56;   // px — 탭바 고정 높이
const OPEN_H   = 280;  // px — 열렸을 때 패널 전체 고정 높이
const BANNER_H = 56;   // px — 하단 광고 고정 높이
const CONTENT_H = OPEN_H - TAB_H - BANNER_H; // 콘텐츠 영역 = 168px

export default function MobileBottomPanel({ open, onToggle, tab, onTabChange }) {
  const { state, dispatch } = useApp();
  const { activeDoc } = state;

  // Swipe up = open, swipe down = close
  const touchStartY = useRef(null);
  const handleTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e) => {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    if (Math.abs(dy) < 20) return;
    if (dy < 0 && !open) onToggle();
    if (dy > 0 && open)  onToggle();
  };

  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        display: 'flex', flexDirection: 'column',
        height: open ? OPEN_H : TAB_H,
        transition: 'height 0.25s ease',
        overflow: 'hidden',
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Tab bar */}
      <div style={{
        height: TAB_H, minHeight: TAB_H, flexShrink: 0,
        display: 'flex', alignItems: 'stretch',
        borderBottom: open ? '1px solid var(--c-border2)' : 'none',
      }}>
        {TABS.map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => { onTabChange(id); if (!open) onToggle(); }}
            style={{
              flex: 1,
              background: tab === id && open ? 'var(--c-active)' : 'none',
              border: 'none', borderRight: '1px solid var(--c-border)',
              cursor: 'pointer',
              color: tab === id && open ? 'var(--c-accent)' : 'var(--c-text5)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 4,
              WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
            <span style={{ fontSize: 11, fontWeight: tab === id && open ? 600 : 400 }}>{label}</span>
          </button>
        ))}
        <button
          onClick={onToggle}
          onContextMenu={e => e.preventDefault()}
          style={{
            background: 'none', border: 'none',
            borderLeft: '1px solid var(--c-border)',
            color: 'var(--c-text5)', fontSize: 16,
            padding: '0 14px', cursor: 'pointer', flexShrink: 0,
            WebkitTapHighlightColor: 'transparent',
          }}
        >{open ? '▾' : '▴'}</button>
      </div>

      {/* 탭 콘텐츠 — 고정 높이로 모든 탭 통일 */}
      {open && (
        <>
          <div data-bottom-panel
            style={{ height: CONTENT_H, minHeight: CONTENT_H, overflowY: 'auto', touchAction: 'pan-y' }}
          >
            {tab === 'script' && (
              <div data-tour-id="left-panel" className="m-panel-content">
                <MobileScriptTab />
              </div>
            )}
            {tab === 'data' && (
              <div className="m-panel-content">
                {DATA_DOCS.map(({ doc, label }, i) => (
                  <div
                    key={`${doc}-${i}`}
                    className={`m-item${activeDoc === doc ? ' active' : ''}`}
                    onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: doc })}
                  >{label}</div>
                ))}
              </div>
            )}
            {tab === 'plan' && (
              <div className="m-panel-content">
                {PLAN_DOCS.map(({ doc, label }) => (
                  <div
                    key={doc}
                    className={`m-item${activeDoc === doc ? ' active' : ''}`}
                    onClick={() => dispatch({ type: 'SET_ACTIVE_DOC', payload: doc })}
                  >{label}</div>
                ))}
              </div>
            )}
            {tab === 'memo' && (
              <div className="m-panel-content">
                <MobileMemoTab />
              </div>
            )}
          </div>

          {/* 하단 광고 — 고정 높이 */}
          <div style={{ height: BANNER_H, minHeight: BANNER_H, flexShrink: 0, overflow: 'hidden' }}>
            <AdBanner slot="mobile-bottom" mobileHide={false} height={BANNER_H} />
          </div>
        </>
      )}
    </div>
  );
}
