import React from 'react';
import { useApp } from '../../store/AppContext';
import MobileScriptTab from './MobileScriptTab';
import MobileMemoTab, { MobileChecklistPanel } from './MobileMemoTab';
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

const TAB_H     = 56;   // px — 탭바 고정 높이
const OPEN_H    = 280;  // px — 열렸을 때 패널 전체 고정 높이
const CONTENT_H = OPEN_H - TAB_H; // 콘텐츠 영역 = 224px
const BANNER_H  = 24;   // px — 하단 광고 띠 (메모탭 전용)
const AD_W      = '38%'; // 왼쪽 광고
const MENU_W    = '62%'; // 오른쪽 메뉴

export default function MobileBottomPanel({ open, onToggle, tab, onTabChange, onClose }) {
  const { state, dispatch } = useApp();
  const { activeDoc } = state;

  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        display: 'flex', flexDirection: 'column',
        height: `calc(${open ? OPEN_H : TAB_H}px + env(safe-area-inset-bottom, 0px))`,
        maxHeight: `calc(${open ? OPEN_H : TAB_H}px + env(safe-area-inset-bottom, 0px))`,
        minHeight: `calc(${open ? OPEN_H : TAB_H}px + env(safe-area-inset-bottom, 0px))`,
        transition: 'height 0.25s ease, max-height 0.25s ease, min-height 0.25s ease',
        overflow: 'hidden',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      {/* Tab bar */}
      <div data-tour-id="mobile-tabs" style={{
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

      {/* 탭 콘텐츠 */}
      {open && (
        <div data-bottom-panel style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 좌우 2분할: 왼쪽=광고(or 코멘트), 오른쪽=메뉴(or 체크리스트) */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
            {/* 왼쪽: 메모탭=코멘트 / 나머지=광고 — 항상 마운트, CSS로 전환 */}
            <div style={{ width: AD_W, minWidth: 0, flexShrink: 0, overflow: 'hidden', borderRight: '1px solid var(--c-border)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: tab === 'memo' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
                <MobileMemoTab />
              </div>
              <div style={{ display: tab === 'memo' ? 'none' : 'block', height: '100%' }}>
                <AdBanner slot="mobile-bottom-left" mobileHide={false} height={CONTENT_H} />
              </div>
            </div>

            {/* 오른쪽: 메뉴 콘텐츠 / 메모탭=체크리스트 */}
            <div style={{ width: MENU_W, minWidth: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
              {tab === 'script' && (
                <div data-tour-id="left-panel" className="m-panel-content">
                  <MobileScriptTab onClose={onClose} />
                </div>
              )}
              {tab === 'data' && (
                <div className="m-panel-content">
                  {DATA_DOCS.map(({ doc, label }, i) => (
                    <div
                      key={`${doc}-${i}`}
                      className={`m-item${activeDoc === doc ? ' active' : ''}`}
                      onClick={() => { dispatch({ type: 'SET_ACTIVE_DOC', payload: doc }); onClose?.(); }}
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
                      onClick={() => { dispatch({ type: 'SET_ACTIVE_DOC', payload: doc }); onClose?.(); }}
                    >{label}</div>
                  ))}
                </div>
              )}
              {tab === 'memo' && <MobileChecklistPanel />}
            </div>
          </div>

          {/* 하단 광고 띠 — 메모탭 전용 */}
          {tab === 'memo' && (
            <div style={{ height: BANNER_H, minHeight: BANNER_H, maxHeight: BANNER_H, flexShrink: 0, overflow: 'hidden', borderTop: '1px solid var(--c-border)' }}>
              <AdBanner slot="mobile-memo-bottom" mobileHide={false} height={BANNER_H} style={{ height: BANNER_H, maxHeight: BANNER_H }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
