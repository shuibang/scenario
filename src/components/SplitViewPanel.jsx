import React, { useState } from 'react';
import CharacterPanel from './CharacterPanel';
import ResourcePanel from './ResourcePanel';
import StructurePage from './StructurePage';
import SceneListPage from './SceneListPage';
import TreatmentPage from './TreatmentPage';
import BiographyPage from './BiographyPage';
import RelationshipsPage from './RelationshipsPage';
import DirectorNotesPage from './DirectorNotesPage';

const TABS = [
  { id: 'main',           label: '본문',       group: '본문' },
  { id: 'characters',     label: '인물',       group: '자료' },
  { id: 'biography',      label: '인물이력서', group: '자료' },
  { id: 'relationships',  label: '인물관계도', group: '자료' },
  { id: 'resources',      label: '자료수집',   group: '자료' },
  { id: 'scenelist',      label: '씬리스트',   group: '설계' },
  { id: 'treatment',      label: '트리트먼트', group: '설계' },
  { id: 'structure',      label: '구조',       group: '설계' },
  { id: 'director_notes', label: '피드백',     group: '피드백' },
];

const ALL_GROUPS = ['본문', '자료', '설계', '피드백'];

function PanelContent({ docId }) {
  if (docId === 'characters')     return <CharacterPanel />;
  if (docId === 'biography')      return <BiographyPage />;
  if (docId === 'relationships')  return <RelationshipsPage />;
  if (docId === 'resources')      return <ResourcePanel />;
  if (docId === 'scenelist')      return <SceneListPage />;
  if (docId === 'treatment')      return <TreatmentPage />;
  if (docId === 'structure')      return <StructurePage />;
  if (docId === 'director_notes') return <DirectorNotesPage />;
  return null;
}

export default function SplitViewPanel({ defaultTab, centerPanelNode, borderRight }) {
  const initTab = defaultTab ?? (centerPanelNode ? 'main' : 'characters');
  const [activeTab, setActiveTab] = useState(initTab);

  const visibleTabs   = centerPanelNode ? TABS : TABS.filter(t => t.id !== 'main');
  const visibleGroups = centerPanelNode ? ALL_GROUPS : ALL_GROUPS.filter(g => g !== '본문');

  return (
    <div style={{
      flex: 1, minWidth: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--c-bg)', overflow: 'hidden',
      borderRight: borderRight ? '1px solid var(--c-border)' : undefined,
    }}>
      {/* 탭 바 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        height: 36,
        borderBottom: '1px solid var(--c-border2)',
        background: 'var(--c-header)',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        flexShrink: 0,
        gap: 1,
        padding: '0 6px',
      }}>
        {visibleGroups.map(group => {
          const groupTabs = visibleTabs.filter(t => t.group === group);
          return (
            <React.Fragment key={group}>
              <span style={{ fontSize: 9, color: 'var(--c-text6)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px', flexShrink: 0 }}>
                {group}
              </span>
              {groupTabs.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      height: 26,
                      padding: '0 8px',
                      fontSize: 11,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'var(--c-accent)' : 'var(--c-text4)',
                      background: isActive ? 'var(--c-active)' : 'transparent',
                      border: 'none',
                      borderRadius: 5,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      transition: 'background 120ms, color 120ms',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-hover)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {tab.label}
                  </button>
                );
              })}
              <div style={{ width: 1, height: 14, background: 'var(--c-border3)', flexShrink: 0, margin: '0 2px' }} />
            </React.Fragment>
          );
        })}
      </div>

      {/* 본문(CenterPanel): 항상 마운트, 탭 전환 시 CSS로 숨김 */}
      {centerPanelNode && (
        <div style={{
          flex: activeTab === 'main' ? 1 : 0,
          minHeight: 0,
          display: activeTab === 'main' ? 'flex' : 'none',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}>
          {centerPanelNode}
        </div>
      )}

      {/* 기타 패널 콘텐츠 */}
      {activeTab !== 'main' && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
          <PanelContent docId={activeTab} />
        </div>
      )}
    </div>
  );
}
