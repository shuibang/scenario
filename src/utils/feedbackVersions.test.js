import { describe, expect, it } from 'vitest';
import { buildFeedbackSnapshot, stripCharacterPhotos } from './feedbackVersions';

const PHOTO = { dataUrl: 'data:image/jpeg;base64,aGk=', w: 226, h: 320, updatedAt: 1 };

const baseState = {
  projects: [{ id: 'p1', title: '작품' }],
  episodes: [{ id: 'e1', projectId: 'p1' }],
  characters: [
    { id: 'c1', projectId: 'p1', name: '홍길동', photo: PHOTO },
    { id: 'c2', projectId: 'p1', name: '김철수' },
    { id: 'c3', projectId: 'p2', name: '다른작품', photo: PHOTO },
  ],
  scenes: [], scriptBlocks: [], coverDocs: [], synopsisDocs: [],
  activeProjectId: 'p1',
  stylePreset: {},
};

describe('stripCharacterPhotos', () => {
  it('photo 필드를 제거한다', () => {
    const out = stripCharacterPhotos([{ id: 'c1', name: 'A', photo: PHOTO }]);
    expect(out[0]).not.toHaveProperty('photo');
    expect(out[0].name).toBe('A');
  });

  it('다른 필드는 그대로 둔다', () => {
    const input = { id: 'c1', name: 'A', roles: ['lead'], relPos: { x: 1, y: 2 }, photo: PHOTO };
    expect(stripCharacterPhotos([input])[0]).toEqual({ id: 'c1', name: 'A', roles: ['lead'], relPos: { x: 1, y: 2 } });
  });

  it('사진 없는 인물·빈 배열·null을 안전하게 처리한다', () => {
    expect(stripCharacterPhotos([{ id: 'c1' }])[0]).toEqual({ id: 'c1' });
    expect(stripCharacterPhotos([])).toEqual([]);
    expect(stripCharacterPhotos(null)).toEqual([]);
  });

  it('원본 배열을 변형하지 않는다', () => {
    const input = [{ id: 'c1', photo: PHOTO }];
    stripCharacterPhotos(input);
    expect(input[0].photo).toBe(PHOTO);
  });
});

// ── 핵심 보장: 체크하지 않으면 사진은 payload에 아예 없어야 한다.
describe('buildFeedbackSnapshot — 사진 미포함 보장', () => {
  it('snapshot의 어떤 캐릭터에도 photo 필드가 없다', () => {
    const snap = buildFeedbackSnapshot(baseState, { cover: true, chars: true });
    expect(snap.characters).toHaveLength(2); // 현재 작품만
    snap.characters.forEach(c => expect(c).not.toHaveProperty('photo'));
  });

  it('직렬화한 payload 문자열에 data URL이 남지 않는다', () => {
    const json = JSON.stringify(buildFeedbackSnapshot(baseState, { chars: true }));
    expect(json).not.toContain('data:image');
    expect(json).not.toContain('base64');
  });

  it('selections와 무관하게 제외된다 (chars 꺼짐/켜짐 모두)', () => {
    [{ chars: true }, { chars: false }, {}].forEach(selections => {
      const json = JSON.stringify(buildFeedbackSnapshot(baseState, selections));
      expect(json).not.toContain('data:image');
    });
  });

  it('사진 외 인물 정보는 그대로 실린다', () => {
    const snap = buildFeedbackSnapshot(baseState, { chars: true });
    expect(snap.characters.map(c => c.name)).toEqual(['홍길동', '김철수']);
  });

  it('다른 작품의 인물은 애초에 포함되지 않는다', () => {
    const snap = buildFeedbackSnapshot(baseState, { chars: true });
    expect(snap.characters.find(c => c.id === 'c3')).toBeUndefined();
  });
});
