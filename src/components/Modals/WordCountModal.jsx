import React, { useMemo } from 'react';
import Modal, { ModalBtn } from './Modal';
import { useApp } from '../../store/AppContext';
import { stripHtml } from '../../utils/textFormat';

export default function WordCountModal({ open, onClose }) {
  const { state } = useApp();
  const { scriptBlocks, activeProjectId, activeEpisodeId, projects, episodes } = state;

  const activeProject = projects?.find(p => p.id === activeProjectId);
  const activeEpisode = episodes?.find(e => e.id === activeEpisodeId);

  const scopeLabel = activeProject
    ? activeEpisode
      ? `${activeProject.title} — ${activeEpisode.title || `${activeEpisode.number}회`}`
      : activeProject.title
    : '—';

  const stats = useMemo(() => {
    const blocks = scriptBlocks.filter(b =>
      b.projectId === activeProjectId && b.episodeId === activeEpisodeId
    );
    const raw = blocks.map(b => stripHtml(b.content || '') || '').join('\n');
    const total = raw.length;
    const noSpace = raw.replace(/\s/g, '').length;
    const lines = blocks.length;
    const scenes = blocks.filter(b => b.type === 'scene_number').length;
    const dialogues = blocks.filter(b => b.type === 'dialogue').length;
    return { total, noSpace, lines, scenes, dialogues };
  }, [scriptBlocks, activeProjectId, activeEpisodeId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="글자수 세기"
      size="sm"
      description={scopeLabel}
      footer={<ModalBtn variant="secondary" onClick={onClose}>닫기</ModalBtn>}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {[
            ['총 글자수 (공백 포함)', stats.total.toLocaleString()],
            ['총 글자수 (공백 제외)', stats.noSpace.toLocaleString()],
            ['총 블록 수', stats.lines.toLocaleString()],
            ['씬 수', stats.scenes.toLocaleString()],
            ['대사 블록 수', stats.dialogues.toLocaleString()],
          ].map(([label, value]) => (
            <tr key={label} style={{ borderBottom: '1px solid var(--c-border2)' }}>
              <td style={{ padding: '8px 4px', color: 'var(--c-text5)' }}>{label}</td>
              <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 600, color: 'var(--c-text2)' }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
