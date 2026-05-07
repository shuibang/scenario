import { describe, it, expect } from 'vitest';
import { buildProjectConflicts } from './projectConflict';

function baseProject(overrides = {}) {
  return {
    id: 'project-1',
    title: 'Project One',
    updatedAt: '2026-05-06T13:22:00.000Z',
    ...overrides,
  };
}

function baseEpisode(overrides = {}) {
  return {
    id: 'episode-1',
    projectId: 'project-1',
    number: 1,
    title: 'Episode 1',
    updatedAt: '2026-05-06T13:22:00.000Z',
    ...overrides,
  };
}

function baseScriptBlock(overrides = {}) {
  return {
    id: 'block-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    type: 'action',
    content: 'Opening line',
    updatedAt: '2026-05-06T13:22:00.000Z',
    ...overrides,
  };
}

function makeState(overrides = {}) {
  return {
    projects: [baseProject()],
    episodes: [baseEpisode()],
    characters: [],
    scenes: [],
    scriptBlocks: [baseScriptBlock()],
    coverDocs: [],
    synopsisDocs: [],
    resources: [],
    workTimeLogs: [],
    checklistItems: [],
    trash: {},
    savedAt: '2026-05-06T13:22:00.000Z',
    ...overrides,
  };
}

describe('buildProjectConflicts', () => {
  it('does not report a conflict when non-order-sensitive arrays are reordered', () => {
    const localState = makeState({
      resources: [
        { id: 'resource-2', projectId: 'project-1', label: 'B', url: 'https://b.test', updatedAt: '2026-05-06T13:23:00.000Z' },
        { id: 'resource-1', projectId: 'project-1', label: 'A', url: 'https://a.test', optionalNote: undefined, updatedAt: '2026-05-06T13:24:00.000Z' },
      ],
      checklistItems: [
        { id: 'check-2', projectId: 'project-1', text: 'Second', done: true, updatedAt: '2026-05-06T13:24:00.000Z' },
        { id: 'check-1', projectId: 'project-1', text: 'First', done: false, updatedAt: '2026-05-06T13:23:00.000Z' },
      ],
    });
    const driveState = makeState({
      resources: [
        { id: 'resource-1', projectId: 'project-1', label: 'A', url: 'https://a.test', updatedAt: '2026-05-06T13:24:00.000Z' },
        { id: 'resource-2', projectId: 'project-1', label: 'B', url: 'https://b.test', updatedAt: '2026-05-06T13:23:00.000Z' },
      ],
      checklistItems: [
        { id: 'check-1', projectId: 'project-1', text: 'First', done: false, updatedAt: '2026-05-06T13:23:00.000Z' },
        { id: 'check-2', projectId: 'project-1', text: 'Second', done: true, updatedAt: '2026-05-06T13:24:00.000Z' },
      ],
    });

    expect(buildProjectConflicts(localState, driveState)).toEqual([]);
  });

  it('reports a conflict when script content changes even if savedAt matches', () => {
    const localState = makeState({
      scriptBlocks: [baseScriptBlock({ content: 'Local script line' })],
      savedAt: '2026-05-06T13:22:00.000Z',
    });
    const driveState = makeState({
      scriptBlocks: [baseScriptBlock({ content: 'Drive script line' })],
      savedAt: '2026-05-06T13:22:00.000Z',
    });

    expect(buildProjectConflicts(localState, driveState)).toEqual([
      {
        projectId: 'project-1',
        title: 'Project One',
        kind: 'conflict',
        local: { updatedAt: '2026-05-06T13:22:00.000Z' },
        drive: {
          updatedAt: '2026-05-06T13:22:00.000Z',
          savedAt: '2026-05-06T13:22:00.000Z',
        },
      },
    ]);
  });

  it('treats script block order as meaningful', () => {
    const localState = makeState({
      scriptBlocks: [
        baseScriptBlock({ id: 'block-1', content: 'First line' }),
        baseScriptBlock({ id: 'block-2', content: 'Second line' }),
      ],
    });
    const driveState = makeState({
      scriptBlocks: [
        baseScriptBlock({ id: 'block-2', content: 'Second line' }),
        baseScriptBlock({ id: 'block-1', content: 'First line' }),
      ],
    });

    expect(buildProjectConflicts(localState, driveState)).toHaveLength(1);
    expect(buildProjectConflicts(localState, driveState)[0]?.kind).toBe('conflict');
  });

  it('does not report a conflict when only volatile timestamps differ', () => {
    const localState = makeState({
      projects: [baseProject({ updatedAt: '2026-05-06T13:30:00.000Z' })],
      episodes: [baseEpisode({ updatedAt: '2026-05-06T13:30:00.000Z' })],
      scriptBlocks: [baseScriptBlock({ updatedAt: '2026-05-06T13:30:00.000Z' })],
      savedAt: '2026-05-06T13:30:00.000Z',
    });
    const driveState = makeState({
      projects: [baseProject({ updatedAt: '2026-05-06T13:22:00.000Z' })],
      episodes: [baseEpisode({ updatedAt: '2026-05-06T13:22:00.000Z' })],
      scriptBlocks: [baseScriptBlock({ updatedAt: '2026-05-06T13:22:00.000Z' })],
      savedAt: '2026-05-06T13:22:00.000Z',
    });

    expect(buildProjectConflicts(localState, driveState)).toEqual([]);
  });

  it('separates localOnly and driveOnly projects', () => {
    const localState = {
      ...makeState(),
      projects: [baseProject({ id: 'local-project', title: 'Local Project' })],
      episodes: [baseEpisode({ id: 'local-episode', projectId: 'local-project' })],
      scriptBlocks: [baseScriptBlock({ id: 'local-block', projectId: 'local-project', episodeId: 'local-episode' })],
    };
    const driveState = {
      ...makeState(),
      projects: [baseProject({ id: 'drive-project', title: 'Drive Project' })],
      episodes: [baseEpisode({ id: 'drive-episode', projectId: 'drive-project' })],
      scriptBlocks: [baseScriptBlock({ id: 'drive-block', projectId: 'drive-project', episodeId: 'drive-episode' })],
    };

    expect(buildProjectConflicts(localState, driveState)).toEqual([
      {
        projectId: 'local-project',
        title: 'Local Project',
        kind: 'localOnly',
        local: { updatedAt: '2026-05-06T13:22:00.000Z' },
      },
      {
        projectId: 'drive-project',
        title: 'Drive Project',
        kind: 'driveOnly',
        drive: {
          updatedAt: '2026-05-06T13:22:00.000Z',
          savedAt: '2026-05-06T13:22:00.000Z',
        },
      },
    ]);
  });
});
