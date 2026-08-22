import { describe, it, expect } from 'vitest';
import {
  MAX_CONTENT_CHARS,
  MAX_PREVIOUS_EPISODES,
  MAX_PREVIOUS_SUMMARY_CHARS,
  MODE_PRODUCTION,
  TOO_LONG_MESSAGE,
  buildAiFeedbackRequest,
  buildCharactersText,
  buildEpisodeText,
  buildSynopsisText,
  describeAiFeedbackError,
  exceedsContentLimit,
  extractFeedbackSummary,
  selectPreviousFeedbacks,
} from './aiFeedback';

// ─── 회차 대본 텍스트 ────────────────────────────────────────────────────────
describe('buildEpisodeText', () => {
  const characters = [{ id: 'c1', name: '민수' }];

  it('씬 번호를 S#n 으로 보존한다 (피드백에 씬 인용이 붙으려면 필수)', () => {
    const blocks = [
      { type: 'scene_number', content: '카페 / 낮' },
      { type: 'action', content: '민수가 들어온다.' },
      { type: 'scene_number', content: '거리 / 밤' },
      { type: 'action', content: '비가 내린다.' },
    ];
    const text = buildEpisodeText(blocks, characters);
    expect(text).toContain('S#1. 카페 / 낮');
    expect(text).toContain('S#2. 거리 / 밤');
  });

  it('저장된 label 이 낡았어도 순서대로 다시 매긴다', () => {
    const blocks = [
      { type: 'scene_number', content: '카페', label: 'S#7.' },
      { type: 'scene_number', content: '거리', label: 'S#9.' },
    ];
    const text = buildEpisodeText(blocks, characters);
    expect(text).toContain('S#1. 카페');
    expect(text).toContain('S#2. 거리');
    expect(text).not.toContain('S#7');
    expect(text).not.toContain('S#9');
  });

  it('대사는 characterId 로 인물 이름을 찾고, 없으면 characterName 을 쓴다', () => {
    const blocks = [
      { type: 'dialogue', characterId: 'c1', content: '왔어?' },
      { type: 'dialogue', characterName: '영희', content: '응.' },
    ];
    const text = buildEpisodeText(blocks, characters);
    expect(text).toContain('민수\n왔어?');
    expect(text).toContain('영희\n응.');
  });

  it('지문 괄호를 붙이고 빈 블록은 버린다', () => {
    const blocks = [
      { type: 'parenthetical', content: '작게' },
      { type: 'action', content: '   ' },
      { type: 'action', content: '문이 닫힌다.' },
    ];
    const text = buildEpisodeText(blocks, characters);
    expect(text).toContain('(작게)');
    expect(text).toContain('문이 닫힌다.');
    expect(text.split('\n').filter((l) => l.trim() === '').length).toBeLessThan(3);
  });

  it('블록이 없으면 빈 문자열', () => {
    expect(buildEpisodeText([], [])).toBe('');
    expect(buildEpisodeText(null, null)).toBe('');
  });
});

// ─── 시놉시스 / 인물 ─────────────────────────────────────────────────────────
describe('buildSynopsisText', () => {
  it('채워진 항목만 항목명과 함께 넣는다', () => {
    const text = buildSynopsisText({ genre: '스릴러', theme: '', logline: '한 남자가 쫓긴다', story: '' });
    expect(text).toContain('장르: 스릴러');
    expect(text).toContain('로그라인: 한 남자가 쫓긴다');
    expect(text).not.toContain('주제:');
    expect(text).not.toContain('줄거리:');
  });

  it('HTML 태그를 걷어낸다', () => {
    const text = buildSynopsisText({ story: '<div>첫 줄</div><div>둘째 줄</div>' });
    expect(text).toContain('첫 줄');
    expect(text).toContain('둘째 줄');
    expect(text).not.toContain('<div>');
  });

  it('구형 문서의 content 필드를 줄거리로 읽는다', () => {
    expect(buildSynopsisText({ content: '옛 줄거리' })).toBe('줄거리: 옛 줄거리');
  });

  it('문서가 없으면 빈 문자열', () => {
    expect(buildSynopsisText(null)).toBe('');
  });
});

describe('buildCharactersText', () => {
  it('사진은 절대 싣지 않는다', () => {
    const text = buildCharactersText([
      { name: '민수', intro: '주인공', photo: 'data:image/png;base64,AAAA' },
    ]);
    expect(text).toContain('민수');
    expect(text).not.toContain('data:image');
    expect(text).not.toContain('base64');
  });

  it('이름과 기본 정보, 소개를 함께 담는다', () => {
    const text = buildCharactersText([
      { name: '민수', gender: '남', age: '30대', occupation: '형사', roles: ['주연'], intro: '집요하다' },
    ]);
    expect(text).toContain('민수');
    expect(text).toContain('남');
    expect(text).toContain('형사');
    expect(text).toContain('주연');
    expect(text).toContain('집요하다');
  });

  it('name 이 없으면 surname + givenName 으로 만든다', () => {
    expect(buildCharactersText([{ surname: '김', givenName: '민수' }])).toContain('김민수');
  });

  it('배열이 아니면 빈 문자열', () => {
    expect(buildCharactersText(null)).toBe('');
  });
});

// ─── 분량 상한 ───────────────────────────────────────────────────────────────
describe('분량 상한', () => {
  it('상한 이하는 통과, 초과는 걸린다', () => {
    expect(exceedsContentLimit('가'.repeat(MAX_CONTENT_CHARS))).toBe(false);
    expect(exceedsContentLimit('가'.repeat(MAX_CONTENT_CHARS + 1))).toBe(true);
  });

  it('안내 문구에 숫자를 넣지 않는다', () => {
    expect(TOO_LONG_MESSAGE).not.toMatch(/\d/);
  });
});

// ─── 이전 피드백 요약 ────────────────────────────────────────────────────────
describe('extractFeedbackSummary', () => {
  it('제목 줄만 뽑아 목록으로 만든다 (전문을 보내지 않는다)', () => {
    const full = [
      '## 인물 동기',
      '민수가 왜 거절하는지 대사 안에서 드러나지 않는다. 아주 긴 본문이 이어진다.',
      '',
      '## 씬 전환',
      'S#3 에서 시간이 건너뛴다.',
    ].join('\n');
    const summary = extractFeedbackSummary(full);
    expect(summary).toContain('인물 동기');
    expect(summary).toContain('씬 전환');
    expect(summary).not.toContain('아주 긴 본문이 이어진다');
  });

  it('번호·불릿 항목도 제목으로 인정한다', () => {
    const summary = extractFeedbackSummary('1. 첫 지적\n본문\n- 둘째 지적\n본문');
    expect(summary).toContain('첫 지적');
    expect(summary).toContain('둘째 지적');
    expect(summary).not.toContain('본문');
  });

  it('제목이 없으면 앞부분 발췌로 폴백한다', () => {
    const summary = extractFeedbackSummary('제목 없는 짧은 검토 결과입니다.');
    expect(summary).toBe('제목 없는 짧은 검토 결과입니다.');
  });

  it('상한 길이에서 자른다', () => {
    const summary = extractFeedbackSummary('가'.repeat(MAX_PREVIOUS_SUMMARY_CHARS + 500));
    expect(summary.length).toBe(MAX_PREVIOUS_SUMMARY_CHARS);
  });

  it('빈 입력은 빈 문자열', () => {
    expect(extractFeedbackSummary('')).toBe('');
    expect(extractFeedbackSummary(null)).toBe('');
  });
});

// ─── 이전 피드백 선별 ────────────────────────────────────────────────────────
describe('selectPreviousFeedbacks', () => {
  const row = (over) => ({
    projectId: 'p1',
    episodeId: 'e1',
    episodeNumber: 1,
    mode: MODE_PRODUCTION,
    feedback: '## 지적',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  });

  it('다른 대본의 기록은 제외한다', () => {
    const result = selectPreviousFeedbacks(
      [row(), row({ projectId: 'p2', episodeId: 'x' })],
      { projectId: 'p1' },
    );
    expect(result).toHaveLength(1);
  });

  it('이번에 요청할 회차는 제외한다', () => {
    const result = selectPreviousFeedbacks([row({ episodeId: 'e1' })], {
      projectId: 'p1',
      excludeEpisodeId: 'e1',
    });
    expect(result).toEqual([]);
  });

  it('같은 회차를 여러 번 돌렸으면 가장 최근 1건만 남긴다', () => {
    const result = selectPreviousFeedbacks(
      [
        row({ createdAt: '2026-08-01T00:00:00.000Z', feedback: '## 옛것' }),
        row({ createdAt: '2026-08-10T00:00:00.000Z', feedback: '## 새것' }),
      ],
      { projectId: 'p1' },
    );
    expect(result).toHaveLength(1);
    expect(result[0].summary).toContain('새것');
  });

  it('회차 번호 오름차순으로 정렬한다 (서버가 배열 끝을 남기므로)', () => {
    const result = selectPreviousFeedbacks(
      [
        row({ episodeId: 'e3', episodeNumber: 3 }),
        row({ episodeId: 'e1', episodeNumber: 1 }),
        row({ episodeId: 'e2', episodeNumber: 2 }),
      ],
      { projectId: 'p1' },
    );
    expect(result.map((r) => r.episodeNumber)).toEqual([1, 2, 3]);
  });

  it('최근 MAX_PREVIOUS_EPISODES 회차만 남긴다', () => {
    const rows = Array.from({ length: MAX_PREVIOUS_EPISODES + 4 }, (_, i) =>
      row({ episodeId: `e${i + 1}`, episodeNumber: i + 1 }),
    );
    const result = selectPreviousFeedbacks(rows, { projectId: 'p1' });
    expect(result).toHaveLength(MAX_PREVIOUS_EPISODES);
    // 잘려나가는 쪽은 오래된 회차여야 한다
    expect(result[result.length - 1].episodeNumber).toBe(MAX_PREVIOUS_EPISODES + 4);
  });

  it('전문이 아니라 요약을 담는다', () => {
    const long = '## 인물 동기\n' + '가'.repeat(5000);
    const result = selectPreviousFeedbacks([row({ feedback: long })], { projectId: 'p1' });
    expect(result[0].summary).toBe('인물 동기');
  });

  it('입력이 비어 있으면 빈 배열', () => {
    expect(selectPreviousFeedbacks(null, { projectId: 'p1' })).toEqual([]);
    expect(selectPreviousFeedbacks([], { projectId: 'p1' })).toEqual([]);
  });
});

// ─── 요청 본문 조립 ──────────────────────────────────────────────────────────
describe('buildAiFeedbackRequest', () => {
  const base = {
    mode: MODE_PRODUCTION,
    synopsisDoc: { genre: '스릴러' },
    characters: [{ id: 'c1', name: '민수', photo: 'data:image/png;base64,AA' }],
    episode: { id: 'e1', number: 2 },
    episodeBlocks: [
      { type: 'scene_number', content: '카페' },
      { type: 'dialogue', characterId: 'c1', content: '왔어?' },
    ],
    aiFeedbacks: [],
    projectId: 'p1',
  };

  it('정상 입력이면 서버 형식대로 만든다', () => {
    const result = buildAiFeedbackRequest(base);
    expect(result.ok).toBe(true);
    expect(result.body.mode).toBe(MODE_PRODUCTION);
    expect(result.body.episode.number).toBe(2);
    expect(result.body.episode.content).toContain('S#1. 카페');
    expect(result.body.characters).toContain('민수');
    expect(result.body.previousFeedbacks).toEqual([]);
  });

  it('본문 어디에도 사진이 실리지 않는다', () => {
    const result = buildAiFeedbackRequest(base);
    expect(JSON.stringify(result.body)).not.toContain('base64');
  });

  it('분량 초과는 전송하지 않고 숫자 없는 문구로 막는다', () => {
    const result = buildAiFeedbackRequest({
      ...base,
      episodeBlocks: [{ type: 'action', content: '가'.repeat(MAX_CONTENT_CHARS + 1) }],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('CONTENT_TOO_LONG');
    expect(result.message).toBe(TOO_LONG_MESSAGE);
    expect(result.message).not.toMatch(/\d/);
  });

  it('빈 회차는 막는다', () => {
    const result = buildAiFeedbackRequest({ ...base, episodeBlocks: [] });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('EPISODE_REQUIRED');
  });

  it('모르는 모드는 막는다', () => {
    const result = buildAiFeedbackRequest({ ...base, mode: 'whatever' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('INVALID_MODE');
  });

  it('회차 번호가 없으면 null 로 보낸다', () => {
    const result = buildAiFeedbackRequest({ ...base, episode: { id: 'e1' } });
    expect(result.ok).toBe(true);
    expect(result.body.episode.number).toBeNull();
  });
});

// ─── 오류 해석 ───────────────────────────────────────────────────────────────
describe('describeAiFeedbackError', () => {
  it('402 한도 소진은 재시도를 권하지 않는다', () => {
    const result = describeAiFeedbackError(402, { error: 'LIMIT_REACHED', message: '한도를 다 썼습니다.' });
    expect(result.code).toBe('LIMIT_REACHED');
    expect(result.retryable).toBe(false);
  });

  it('403 기능 비활성도 재시도를 권하지 않는다', () => {
    expect(describeAiFeedbackError(403, { error: 'FEATURE_DISABLED' }).retryable).toBe(false);
  });

  it('502 는 차감이 되돌려진 상태라 재시도를 권한다', () => {
    expect(describeAiFeedbackError(502, { error: 'AI_FAILED' }).retryable).toBe(true);
  });

  it('분량 초과는 reason 키로 오고 숫자 없는 문구를 쓴다', () => {
    const result = describeAiFeedbackError(400, { reason: 'CONTENT_TOO_LONG', message: '서버 문구' });
    expect(result.code).toBe('CONTENT_TOO_LONG');
    expect(result.message).toBe(TOO_LONG_MESSAGE);
    expect(result.message).not.toMatch(/\d/);
  });

  it('413 도 같은 안내로 모은다 (사용자가 할 일이 같다)', () => {
    expect(describeAiFeedbackError(413, { error: 'REQUEST_TOO_LARGE' }).message).toBe(TOO_LONG_MESSAGE);
  });

  it('본문이 없어도 죽지 않는다', () => {
    const result = describeAiFeedbackError(500, null);
    expect(result.message).toBeTruthy();
    expect(result.retryable).toBe(true);
  });
});
