import React, { useState, useRef, useCallback } from 'react';
import { useApp } from '../../store/AppContext';
import MobileScriptTab from './MobileScriptTab';
import MobileMemoTab, { MobileChecklistPanel } from './MobileMemoTab';
import AdBanner from '../AdBanner';
import ContestBoard from '../contests/ContestBoard';
import { useNewContestsCount } from '../../hooks/useNewContestsCount';

// tab id 'memo' 는 기존 코드 호환을 위해 유지.
// 좌측 자유메모 영역은 공모전 보드로 교체됐지만, 우측 체크리스트는 그대로.
const TABS = [
  { id: 'script',   icon: '📝', label: '대본' },
  { id: 'data',     icon: '👤', label: '자료' },
  { id: 'plan',     icon: '🗂',  label: '설계' },
  { id: 'feedback', icon: '📋', label: '피드백' },
  { id: 'memo',     icon: '🏆', label: '공모/체크' },
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

function LegacyFeedbackTabContent({ dispatch, onClose }) {
  const { state } = useApp();
  const activeProjectId = state.activeProjectId;
  const [deliveries] = useState(() =>
    getReceivedDeliveries().filter(d => !d.projectId || d.projectId === activeProjectId)
  );

  if (deliveries.length === 0) {
    return (
      <div className="m-panel-content">
        <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--c-text6)', fontSize: 12 }}>
          받은 피드백 노트가 없습니다
        </div>
      </div>
    );
  }

  return (
    <div className="m-panel-content">
      {deliveries.map((d, i) => {
        const date = new Date(d.savedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
        return (
          <div
            key={d.id || i}
            className="m-item"
            onClick={() => {
              localStorage.setItem('drama_active_delivery_id', d.id);
              window.dispatchEvent(new Event('drama_delivery_changed'));
              dispatch({ type: 'SET_ACTIVE_DOC', payload: 'director_notes' });
              onClose?.();
            }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
          >
            <span style={{ fontWeight: 500 }}>{d.title || `피드백 ${i + 1}`}</span>
            <span style={{ fontSize: 10, color: 'var(--c-text6)' }}>코멘트 {d.notes?.length || 0}개 · {date}</span>
          </div>
        );
      })}
    </div>
  );
}

const TAB_H      = 56;   // px — 탭바 고정 높이
const OPEN_H     = 280;  // px — 열렸을 때 패널 전체 고정 높이
const CONTENT_H  = OPEN_H - TAB_H; // 콘텐츠 영역 = 224px
const AD_W       = '25%'; // 왼쪽 광고 (대본 탭 버튼 폭과 동일)
const MENU_W     = '75%'; // 오른쪽 메뉴

function FeedbackTabContent({ dispatch, onClose, activeDoc }) {
  return (
    <div className="m-panel-content">
      <div
        className={`m-item${activeDoc === 'director_notes' ? ' active' : ''}`}
        onClick={() => {
          dispatch({ type: 'SET_ACTIVE_DOC', payload: 'director_notes' });
          onClose?.();
        }}
      >
        피드백 노트
      </div>
    </div>
  );
}

export default function MobileBottomPanel({ open, onToggle, tab, onTabChange, onClose }) {
  const { state, dispatch } = useApp();
  const { activeDoc } = state;
  const newContestsCount = useNewContestsCount({ fetchOnMount: true });

  // ── 공모/체크 분할 드래그
  const [splitPct, setSplitPct] = useState(() => {
    const saved = localStorage.getItem('drama_memo_split');
    const n = saved ? parseInt(saved, 10) : 50;
    return isNaN(n) ? 50 : Math.min(80, Math.max(20, n));
  });
  const splitContainerRef = useRef(null);
  const isDraggingRef = useRef(false);

  const onDividerPointerDown = useCallback((e) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    isDraggingRef.current = true;
    const onMove = (ev) => {
      if (!isDraggingRef.current) return;
      const rect = container.getBoundingClientRect();
      const x = (ev.clientX ?? ev.touches?.[0]?.clientX) - rect.left;
      const pct = Math.round(Math.min(80, Math.max(20, (x / rect.width) * 100)));
      setSplitPct(pct);
      localStorage.setItem('drama_memo_split', String(pct));
    };
    const onUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  return (
    <div
      data-mobile-bottom-panel
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
      }}
    >
      {/* Tab bar */}
      <div data-tour-id="mobile-tabs" style={{
        height: TAB_H, minHeight: TAB_H, flexShrink: 0,
        display: 'flex', alignItems: 'stretch',
        borderBottom: open ? '1px solid var(--c-border2)' : 'none',
        userSelect: 'none', WebkitUserSelect: 'none',
      }}>
        {TABS.map(({ id, icon, label }) => {
          const showContestDot = id === 'memo' && newContestsCount > 0 && !(tab === 'memo' && open);
          return (
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
                position: 'relative',
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1, position: 'relative' }}>
                {icon}
                {showContestDot && (
                  <span style={{
                    position: 'absolute', top: -2, right: -8,
                    minWidth: 14, height: 14, padding: '0 4px',
                    borderRadius: 7, background: '#dc2626', color: '#fff',
                    fontSize: 9, fontWeight: 700, lineHeight: '14px',
                  }}>{newContestsCount > 99 ? '99+' : newContestsCount}</span>
                )}
              </span>
              <span style={{ fontSize: 11, fontWeight: tab === id && open ? 600 : 400 }}>{label}</span>
            </button>
          );
        })}
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
        <div data-bottom-panel style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {tab === 'memo' ? (
            <div ref={splitContainerRef} style={{ position: 'absolute', inset: 0, display: 'flex' }}>
              {/* 좌: 공모전 보드 */}
              <div style={{ width: `${splitPct}%`, overflow: 'hidden', flexShrink: 0 }}>
                <ContestBoard compact />
              </div>
              {/* 드래그 핸들 */}
              <div
                onPointerDown={onDividerPointerDown}
                style={{
                  width: 12, flexShrink: 0, cursor: 'col-resize',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--c-panel)',
                  borderLeft: '1px solid var(--c-border)',
                  borderRight: '1px solid var(--c-border)',
                  touchAction: 'none', userSelect: 'none', zIndex: 1,
                }}
              >
                <span style={{ fontSize: 8, color: 'var(--c-text6)', lineHeight: 1 }}>⋮⋮</span>
              </div>
              {/* 우: 체크리스트 */}
              <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', minWidth: 0 }}>
                <MobileChecklistPanel />
              </div>
            </div>
          ) : (
            <>
              {/* 왼쪽 광고 */}
              <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: AD_W, borderRight: '1px solid var(--c-border)', overflow: 'hidden' }}>
                <AdBanner slot="mobile-bottom-left" mobileHide={false} height={CONTENT_H} />
              </div>
              {/* 오른쪽 메뉴 */}
              <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: MENU_W, overflowY: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
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
                {tab === 'feedback' && (
                  <FeedbackTabContent dispatch={dispatch} onClose={onClose} activeDoc={activeDoc} />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
