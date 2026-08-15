/**
 * ai-feedback — 요청 검증과 프롬프트 조립 (순수 로직)
 *
 * Deno 전역(Deno.env, fetch 등)을 쓰지 않는다. 로컬 vitest 에서 그대로 돌려
 * 검증하기 위해서다. 네트워크·인증·한도는 index.ts 가 맡는다.
 */

import { MODES, type Mode } from './prompt.ts';

/**
 * 요청 본문 크기 상한 (바이트).
 *
 * 250 KiB. UTF-8 한글 1자 = 3바이트이므로 약 8만 3천자다.
 * 60분물 1회 대본이 대략 4만자라 시놉시스·인물·이전 피드백을 합쳐도 여유가 있고,
 * 그러면서 한 번 호출의 입력 토큰이 폭주하지 않는 선이다.
 * 상한을 넘기면 잘라내지 않고 거절한다 — 대본을 몰래 자르면 검토자가 없는 뒷부분을
 * "없다"고 판단해 버린다.
 */
export const MAX_BODY_BYTES = 256_000;

/** 이전 회차 피드백은 요약만 받는다. 회차가 쌓여도 입력이 선형으로 늘지 않게. */
export const MAX_PREVIOUS_FEEDBACKS = 20;
export const MAX_PREVIOUS_SUMMARY_CHARS = 2_000;

/** 자료 블록 구분자. 대본 안에 같은 문자열이 나오면 중화한다. */
const BLOCK_TAGS = ['synopsis', 'characters', 'previous_feedback', 'episode'];

export interface PreviousFeedback {
  episodeNumber: number | null;
  summary: string;
}

export interface FeedbackRequest {
  mode: Mode;
  synopsis: string;
  characters: string;
  episodeNumber: number | null;
  episodeContent: string;
  previousFeedbacks: PreviousFeedback[];
}

export type ValidationResult =
  | { ok: true; value: FeedbackRequest }
  | { ok: false; code: string; message: string };

function fail(code: string, message: string): ValidationResult {
  return { ok: false, code, message };
}

/** UTF-8 바이트 길이. Content-Length 를 못 믿는 경우(누락·위조) 실제 본문으로 잰다. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function exceedsSizeLimit(text: string): boolean {
  return byteLength(text) > MAX_BODY_BYTES;
}

/**
 * 자료 안에 구분자와 똑같은 닫는 태그가 있으면 블록을 빠져나간 것처럼 보인다.
 * 사이에 공백을 넣어 태그로 읽히지 않게 한다. 인용될 때 한 글자 차이만 남는다.
 */
export function neutralizeBlockTags(text: string): string {
  let out = text;
  for (const tag of BLOCK_TAGS) {
    out = out.replace(new RegExp(`</\\s*${tag}\\s*>`, 'gi'), `< /${tag}>`);
  }
  return out;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** 회차 번호. 숫자여도 문자열이어도 받되, 정수로 읽히지 않으면 null 로 둔다. */
export function normalizeEpisodeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string') {
    const digits = value.match(/\d+/);
    if (digits) {
      const n = Number(digits[0]);
      if (Number.isInteger(n) && n > 0) return n;
    }
  }
  return null;
}

/**
 * 인물 정보. 클라이언트가 문자열로 줄 수도, 인물 레코드 배열로 줄 수도 있어
 * 둘 다 받아 한 덩어리 텍스트로 만든다. 사진 같은 필드는 애초에 읽지 않는다.
 */
export function normalizeCharacters(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!Array.isArray(value)) return '';

  return value
    .map(item => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      const row = item as Record<string, unknown>;
      const name = asText(row.name).trim();
      const detail = [asText(row.role), asText(row.description)]
        .map(s => s.trim())
        .filter(Boolean)
        .join(' / ');
      if (!name && !detail) return '';
      if (!detail) return name;
      return name ? `${name}: ${detail}` : detail;
    })
    .filter(Boolean)
    .join('\n');
}

function normalizePreviousFeedbacks(value: unknown): PreviousFeedback[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const summary = asText(row.summary).trim();
      if (!summary) return null;
      return {
        episodeNumber: normalizeEpisodeNumber(row.episodeNumber),
        summary: summary.slice(0, MAX_PREVIOUS_SUMMARY_CHARS),
      };
    })
    .filter((row): row is PreviousFeedback => row !== null)
    .slice(-MAX_PREVIOUS_FEEDBACKS); // 회차가 많으면 최근 것부터 남긴다
}

/**
 * 요청 본문 검증.
 *
 * feature 나 한도는 받지 않는다. 그 둘은 서버가 정한다 — 요청에서 읽으면
 * 클라이언트가 자기 한도를 정하게 된다.
 */
export function validateRequest(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('INVALID_BODY', '요청 형식이 올바르지 않습니다.');
  }

  const body = raw as Record<string, unknown>;

  const mode = asText(body.mode).trim();
  if (!MODES.includes(mode as Mode)) {
    return fail('INVALID_MODE', '피드백 모드를 확인해주세요.');
  }

  const episode = (body.episode ?? {}) as Record<string, unknown>;
  if (!episode || typeof episode !== 'object' || Array.isArray(episode)) {
    return fail('EPISODE_REQUIRED', '검토할 회차 대본이 없습니다.');
  }

  const episodeContent = asText(episode.content).trim();
  if (!episodeContent) {
    return fail('EPISODE_REQUIRED', '검토할 회차 대본이 없습니다.');
  }

  return {
    ok: true,
    value: {
      mode: mode as Mode,
      synopsis: asText(body.synopsis).trim(),
      characters: normalizeCharacters(body.characters),
      episodeNumber: normalizeEpisodeNumber(episode.number),
      episodeContent,
      previousFeedbacks: normalizePreviousFeedbacks(body.previousFeedbacks),
    },
  };
}

/**
 * 사용자 메시지 조립.
 *
 * 순서: 시놉시스 → 인물 → 이전 피드백 → 대본.
 * 대본을 마지막에 두는 이유는 가장 길고 가장 자주 바뀌는 자료이기 때문이다.
 * 비어 있는 블록은 아예 넣지 않는다 — 빈 태그를 남기면 모델이 "자료가 있는데 내용이
 * 없다"로 읽고 그 사실을 지적하는 데 분량을 쓴다.
 */
export function buildUserMessage(value: FeedbackRequest): string {
  const parts: string[] = [];

  if (value.synopsis) {
    parts.push(`<synopsis>\n${neutralizeBlockTags(value.synopsis)}\n</synopsis>`);
  }

  if (value.characters) {
    parts.push(`<characters>\n${neutralizeBlockTags(value.characters)}\n</characters>`);
  }

  if (value.previousFeedbacks.length > 0) {
    const body = value.previousFeedbacks
      .map(row => {
        const label = row.episodeNumber === null ? '이전 회차' : `${row.episodeNumber}회`;
        return `[${label}]\n${neutralizeBlockTags(row.summary)}`;
      })
      .join('\n\n');
    parts.push(`<previous_feedback>\n${body}\n</previous_feedback>`);
  }

  const numberAttr = value.episodeNumber === null ? '' : ` number="${value.episodeNumber}"`;
  parts.push(
    `<episode${numberAttr}>\n${neutralizeBlockTags(value.episodeContent)}\n</episode>`,
  );

  const target = value.episodeNumber === null ? '이 회차' : `${value.episodeNumber}회`;
  parts.push(`위 자료를 바탕으로 ${target} 대본을 검토해줘.`);

  return parts.join('\n\n');
}
