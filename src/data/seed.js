import { genId, now } from '../store/db';

export function createSeedData() {
  const t = now();
  const projectId = genId();
  const ep1Id = genId();
  const ep2Id = genId();
  const char1Id = genId();
  const char2Id = genId();
  const scene1Id = genId();

  const projects = [{
    id: projectId,
    title: '새 작품',
    genre: '',
    status: 'writing',
    createdAt: t,
    updatedAt: t,
  }];

  const episodes = [
    {
      id: ep1Id, projectId, number: 1,
      title: '', majorEpisodes: '', summaryItems: [],
      status: 'draft', createdAt: t, updatedAt: t,
    },
    {
      id: ep2Id, projectId, number: 2,
      title: '', majorEpisodes: '', summaryItems: [],
      status: 'draft', createdAt: t, updatedAt: t,
    },
  ];

  const characters = [
    {
      id: char1Id, projectId,
      surname: '', givenName: '주인공', name: '주인공',
      gender: '', age: '', occupation: '', intro: '',
      role: 'lead', extraFields: [],
      createdAt: t,
    },
    {
      id: char2Id, projectId,
      surname: '', givenName: '상대역', name: '상대역',
      gender: '', age: '', occupation: '', intro: '',
      role: 'lead', extraFields: [],
      createdAt: t,
    },
  ];

  const scenes = [
    {
      id: scene1Id, episodeId: ep1Id, projectId,
      sceneSeq: 1, label: 'S#1.',
      status: 'draft', tags: [], characters: [],
      createdAt: t, updatedAt: t,
    },
  ];

  const scriptBlocks = [
    {
      id: genId(), episodeId: ep1Id, projectId,
      type: 'scene_number', content: '',
      label: 'S#1.', sceneId: scene1Id,
      createdAt: t, updatedAt: t,
    },
    {
      id: genId(), episodeId: ep1Id, projectId,
      type: 'action', content: '',
      label: '', createdAt: t, updatedAt: t,
    },
  ];

  const coverDocs = [{
    id: genId(),
    projectId,
    title: '새 작품',
    subtitle: '',
    writer: '',
    coWriter: '',
    genre: '',
    broadcaster: '',
    note: '',
    createdAt: t,
    updatedAt: t,
  }];

  const synopsisDocs = [{
    id: genId(),
    projectId,
    genre: '',
    theme: '',
    intent: '',
    story: '',
    content: '',
    createdAt: t,
    updatedAt: t,
  }];

  return {
    projects,
    episodes,
    characters,
    scenes,
    scriptBlocks,
    coverDocs,
    synopsisDocs,
  };
}
