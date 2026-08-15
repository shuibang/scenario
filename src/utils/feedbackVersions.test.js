import { describe, expect, it } from 'vitest';
import { buildFeedbackSnapshot, buildFeedbackViewerState, stripCharacterPhotos } from './feedbackVersions';

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

// ── 옵션을 켠 경우: 재축소본만 실린다. 저장된 320px 원본이 실리는 경로는 없다.
describe('buildFeedbackSnapshot — 사진 포함 옵션', () => {
  const SHARE_PHOTO = { dataUrl: 'data:image/jpeg;base64,c21hbGw=', w: 113, h: 160 };

  it('chars + charPhotos가 모두 켜져야 실린다', () => {
    const snap = buildFeedbackSnapshot(
      baseState,
      { chars: true, charPhotos: true },
      { sharePhotos: { c1: SHARE_PHOTO } },
    );
    expect(snap.characters.find(c => c.id === 'c1').photo).toEqual(SHARE_PHOTO);
  });

  it('charPhotos만 켜고 chars가 꺼져 있으면 실리지 않는다', () => {
    const snap = buildFeedbackSnapshot(
      baseState,
      { chars: false, charPhotos: true },
      { sharePhotos: { c1: SHARE_PHOTO } },
    );
    expect(snap.characters.find(c => c.id === 'c1')).not.toHaveProperty('photo');
  });

  it('옵션이 꺼져 있으면 재축소본을 넘겨도 실리지 않는다', () => {
    const snap = buildFeedbackSnapshot(
      baseState,
      { chars: true, charPhotos: false },
      { sharePhotos: { c1: SHARE_PHOTO } },
    );
    expect(JSON.stringify(snap)).not.toContain('data:image');
  });

  it('실린 사진은 재축소본이지 저장된 320px 원본이 아니다', () => {
    const snap = buildFeedbackSnapshot(
      baseState,
      { chars: true, charPhotos: true },
      { sharePhotos: { c1: SHARE_PHOTO } },
    );
    const json = JSON.stringify(snap);
    expect(json).toContain(SHARE_PHOTO.dataUrl);
    expect(json).not.toContain(PHOTO.dataUrl); // 원본 320px data URL
  });

  it('재축소에 실패한 인물은 사진 없이 나간다', () => {
    const snap = buildFeedbackSnapshot(
      baseState,
      { chars: true, charPhotos: true },
      { sharePhotos: {} }, // 전부 실패
    );
    snap.characters.forEach(c => expect(c).not.toHaveProperty('photo'));
  });
});

// ── 하위 호환: 이번 변경 전에 발행된 링크의 스냅샷
describe('기존 링크 하위 호환', () => {
  it('photo 필드도 selections.charPhotos도 없는 옛 스냅샷을 그대로 읽는다', () => {
    const legacy = {
      projects: [{ id: 'p1', title: '옛 작품' }],
      characters: [{ id: 'c1', name: '홍길동' }],
      selections: { cover: true, synopsis: true, chars: true }, // charPhotos 없음
    };
    const viewer = buildFeedbackViewerState(legacy);
    expect(viewer.title).toBe('옛 작품');
    expect(viewer.appState.characters).toHaveLength(1);
    expect(viewer.appState.characters[0]).not.toHaveProperty('photo');
  });

  it('selections가 아예 없는 옛 스냅샷도 깨지지 않는다', () => {
    const viewer = buildFeedbackViewerState({ characters: [{ id: 'c1' }] });
    expect(viewer.appState.characters).toHaveLength(1);
  });

  it('빈 스냅샷도 안전하다', () => {
    expect(() => buildFeedbackViewerState(null)).not.toThrow();
    expect(buildFeedbackViewerState(null).appState.characters).toEqual([]);
  });
});
