/**
 * .djs 포맷에 aiFeedbacks 를 더하면서 주장한 호환성을 테스트로 잠가둔다.
 * 보호 대상 포맷이라, 여기가 깨지면 기존 저장본이 깨진다는 뜻이다.
 */
import { describe, it, expect } from 'vitest';
import {
  serializeProject,
  deserializeProject,
  mergeImportedProject,
  combineProjectsToState,
} from './projectSerializer';

const state = {
  projects: [{ id: 'p1', title: '내 대본' }],
  episodes: [{ id: 'e1', projectId: 'p1', number: 1 }],
  characters: [{ id: 'c1', projectId: 'p1', name: '민수' }],
  scenes: [],
  scriptBlocks: [],
  coverDocs: [],
  synopsisDocs: [],
  resources: [],
  workTimeLogs: [],
  checklistItems: [],
  aiFeedbacks: [
    { id: 'f1', projectId: 'p1', episodeId: 'e1', episodeNumber: 1, mode: 'production', feedback: '## 지적', createdAt: '2026-08-16T00:00:00.000Z' },
    { id: 'f2', projectId: 'other', episodeId: 'x', episodeNumber: 1, mode: 'contest', feedback: '## 남의 것', createdAt: '2026-08-16T00:00:00.000Z' },
  ],
  trash: {},
};

describe('.djs 의 aiFeedbacks', () => {
  it('내보낼 때 해당 대본 것만 실린다', () => {
    const out = serializeProject(state, 'p1');
    expect(out.aiFeedbacks).toHaveLength(1);
    expect(out.aiFeedbacks[0].id).toBe('f1');
  });

  it('version 은 1 그대로다 (키만 늘렸다)', () => {
    expect(serializeProject(state, 'p1').version).toBe(1);
  });

  it('내보낸 파일을 그대로 다시 읽을 수 있다', () => {
    const parsed = deserializeProject(serializeProject(state, 'p1'));
    expect(parsed.aiFeedbacks[0].feedback).toBe('## 지적');
  });

  it('aiFeedbacks 가 없는 구버전 파일도 읽힌다 (빈 배열로 채움)', () => {
    const old = serializeProject(state, 'p1');
    delete old.aiFeedbacks;
    const parsed = deserializeProject(old);
    expect(parsed.aiFeedbacks).toEqual([]);
  });

  it('사본으로 가져오면 episodeId 가 새 회차 ID 로 다시 연결된다', () => {
    const imported = deserializeProject(serializeProject(state, 'p1'));
    const next = mergeImportedProject(
      { projects: [], episodes: [], characters: [], scenes: [], scriptBlocks: [], coverDocs: [], synopsisDocs: [], resources: [], workTimeLogs: [], checklistItems: [], aiFeedbacks: [], trash: {} },
      imported,
      'newId',
    );
    const newEpisodeId = next.episodes[0].id;
    expect(next.aiFeedbacks).toHaveLength(1);
    expect(next.aiFeedbacks[0].episodeId).toBe(newEpisodeId);
    expect(next.aiFeedbacks[0].episodeId).not.toBe('e1');
    // 회차 번호는 표시용 스냅샷이라 그대로 둔다
    expect(next.aiFeedbacks[0].episodeNumber).toBe(1);
  });

  it('Drive 의 대본별 payload 를 합칠 때도 따라온다', () => {
    const combined = combineProjectsToState([serializeProject(state, 'p1')]);
    expect(combined.aiFeedbacks).toHaveLength(1);
    expect(combined.aiFeedbacks[0].id).toBe('f1');
  });
});
