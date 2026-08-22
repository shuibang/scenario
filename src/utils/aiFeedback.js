/**
 * AI 피드백 — 요청 자료 조립과 결과 정리 (순수 함수).
 *
 * 네트워크·React·저장소를 건드리지 않는다. 호출은 aiFeedbackClient.js,
 * 화면은 AiFeedbackModal.jsx 가 맡는다. 여기 있는 것은 전부 테스트 대상이다.
 *
 * 서버(supabase/functions/ai-feedback)와 짝을 이루는 값이 둘 있다:
 *   - MAX_CONTENT_CHARS : 전송 전에 클라이언트가 먼저 막는다
 *   - TOO_LONG_MESSAGE  : 걸렸을 때 보여줄 문구
 * 서버 request.ts 와 같은 값이며, 어느 쪽을 고치든 함께 고쳐야 한다.
 */

export const MODE_PRODUCTION = 'production';
export const MODE_CONTEST = 'contest';

export const MODES = [MODE_PRODUCTION, MODE_CONTEST];

export const MODE_LABELS = {
  [MODE_PRODUCTION]: '제작사',
  [MODE_CONTEST]: '공모전',
};

/**
 * 대본 분량 상한. 서버 request.ts 의 MAX_CONTENT_CHARS 와 같은 값이다.
 *
 * 이 숫자를 화면 어디에도 쓰지 않는다. 상한을 알리면 "최대한 채워 넣자"는 유인이 되므로
 * 사전 안내·툴팁에 숫자를 넣지 않고, 걸렸을 때만 숫자 없이 안내한다.
 */
export const MAX_CONTENT_CHARS = 100_000;

/** 분량 초과 안내. 숫자를 넣지 않는다(위 참조). */
export const TOO_LONG_MESSAGE = '한 번에 요청할 수 있는 분량을 넘었습니다. 회차 단위로 요청해 주세요.';

/**
 * 이전 피드백으로 함께 보낼 회차 수. 서버 상한(20)보다 낮게 잡는다 —
 * 회차가 쌓여도 입력이 길어지지 않게 하고, 오래된 지적이 이번 회차 판단을 끌고 가지 않게 한다.
 */
export const MAX_PREVIOUS_EPISODES = 5;

/** 요약 1건의 길이 상한. 서버 MAX_PREVIOUS_SUMMARY_CHARS 와 같은 값. */
export const MAX_PREVIOUS_SUMMARY_CHARS = 2_000;

// ─── 자료 조립 ───────────────────────────────────────────────────────────────

function text(value) {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

/** 시놉시스 HTML 에서 태그를 걷어낸다. 저장은 contenteditable HTML 이라 그대로 보내면 태그가 섞인다. */
function stripHtml(value) {
  return text(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 시놉시스 문서 → 텍스트.
 * 항목명을 붙여 보낸다. 어느 항목이 비어 있는지를 검토자가 알 수 있어야 하지만,
 * 빈 항목까지 넣으면 "내용이 없다"는 지적에 분량을 쓰므로 채워진 항목만 넣는다.
 */
export function buildSynopsisText(doc) {
  if (!doc) return '';
  const rows = [
    ['장르', doc.genre],
    ['주제', doc.theme],
    ['로그라인', doc.logline],
    ['기획의도', doc.intent],
    ['줄거리', doc.story ?? doc.content],
  ];
  return rows
    .map(([label, value]) => {
      const body = stripHtml(value);
      return body ? `${label}: ${body}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * 인물 카드 → 텍스트. 사진(photo)은 읽지 않는다 — 검토에 쓰이지 않고 용량만 키운다.
 * 인물 레코드는 surname/givenName/name/gender/age/occupation/roles/intro/extraFields 형태다.
 */
export function buildCharactersText(characters) {
  if (!Array.isArray(characters)) return '';
  return characters
    .map((char) => {
      if (!char) return '';
      const name = text(char.name).trim() || `${text(char.surname)}${text(char.givenName)}`.trim();
      const facts = [
        text(char.gender).trim(),
        text(char.age).trim(),
        text(char.occupation).trim(),
        Array.isArray(char.roles) ? char.roles.filter(Boolean).join(', ') : text(char.roles).trim(),
      ].filter(Boolean);
      const extras = Array.isArray(char.extraFields)
        ? char.extraFields
            .map((f) => {
              const key = text(f?.label ?? f?.key).trim();
              const value = text(f?.value).trim();
              if (!value) return '';
              return key ? `${key}: ${value}` : value;
            })
            .filter(Boolean)
        : [];
      const intro = stripHtml(char.intro ?? char.description);

      const head = [name, facts.join(' / ')].filter(Boolean).join(' (') + (facts.length ? ')' : '');
      const body = [intro, ...extras].filter(Boolean).join('\n');
      if (!head && !body) return '';
      return body ? `${head}\n${body}` : head;
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * 회차 대본 블록 → 텍스트.
 *
 * 씬 번호를 반드시 살린다. 씬 번호가 없으면 검토자가 지적 위치를 특정하지 못해
 * 피드백에 씬 인용이 붙지 않는다(시스템 프롬프트 4번 원칙).
 * 저장된 block.label 을 믿지 않고 순서대로 다시 매긴다 — label 은 편집기 렌더 시점에
 * 갱신되는 값이라 저장본에는 낡은 값이 남아 있을 수 있다.
 */
export function buildEpisodeText(blocks, characters) {
  if (!Array.isArray(blocks)) return '';
  const charById = new Map(
    (Array.isArray(characters) ? characters : []).filter((c) => c?.id).map((c) => [c.id, c]),
  );
  const lines = [];
  let sceneSeq = 0;

  for (const block of blocks) {
    if (!block) continue;
    const body = text(block.content).trim();
    switch (block.type) {
      case 'scene_number': {
        sceneSeq += 1;
        lines.push('');
        lines.push(`S#${sceneSeq}. ${body}`.trim());
        break;
      }
      case 'action':
        if (body) lines.push(body);
        break;
      case 'dialogue': {
        const name =
          (block.characterId && charById.get(block.characterId)?.name) ||
          text(block.characterName).trim();
        if (name) lines.push(name);
        if (body) lines.push(body);
        break;
      }
      case 'parenthetical':
        if (body) lines.push(`(${body})`);
        break;
      case 'transition':
        if (body) lines.push(body);
        break;
      default:
        if (body) lines.push(body);
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 분량 초과 여부. 서버와 같은 글자 수 기준. */
export function exceedsContentLimit(content) {
  return text(content).length > MAX_CONTENT_CHARS;
}

// ─── 이전 피드백 ─────────────────────────────────────────────────────────────

/**
 * 결과 전문에서 요약을 뽑는다. 전문을 그대로 보내면 회차가 쌓일수록 입력이 선형으로 커진다.
 *
 * 시스템 프롬프트가 "제목과 항목으로 구조를 잡되"라고 지시하므로 결과에는 제목 줄이 있다.
 * 그 제목 줄만 모으면 "무엇을 지적했는지" 목록이 된다. 제목이 없는 응답(짧게 쓴 경우)은
 * 앞부분 발췌로 폴백한다 — 요약이 없는 것보다 발췌라도 있는 편이 낫다.
 */
export function extractFeedbackSummary(feedback, maxChars = MAX_PREVIOUS_SUMMARY_CHARS) {
  const full = text(feedback).trim();
  if (!full) return '';

  const headings = full
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^#{1,6}\s+\S/.test(line) || /^\d+[.)]\s+\S/.test(line) || /^[-*]\s+\S/.test(line))
    .map((line) => line.replace(/^#{1,6}\s+/, '').replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);

  const summary = headings.length > 0 ? headings.join('\n') : full;
  return summary.slice(0, maxChars);
}

/**
 * 서버로 보낼 이전 피드백 목록을 고른다.
 *
 * 규칙:
 *   1. 같은 대본(projectId)의 기록만
 *   2. 회차당 가장 최근 1건만 — 같은 회차를 여러 번 돌렸으면 마지막 것. 중복 지적을 줄인다
 *   3. 이번에 요청할 회차는 제외 — 자기 자신을 "이전 피드백"으로 주면 같은 말을 반복한다
 *   4. 회차 번호 오름차순으로 정렬한 뒤 뒤에서 MAX_PREVIOUS_EPISODES 개만
 *      (서버가 배열 끝에서 자르므로 오름차순으로 보내야 최신 회차가 살아남는다)
 */
export function selectPreviousFeedbacks(aiFeedbacks, { projectId, excludeEpisodeId } = {}) {
  const rows = (Array.isArray(aiFeedbacks) ? aiFeedbacks : []).filter(
    (row) =>
      row &&
      row.projectId === projectId &&
      (!excludeEpisodeId || row.episodeId !== excludeEpisodeId) &&
      text(row.feedback).trim(),
  );

  // 회차당 최근 1건. episodeId 가 없는 기록은 회차 번호를 키로 삼는다.
  const latestByEpisode = new Map();
  for (const row of rows) {
    const key = row.episodeId || `n:${row.episodeNumber ?? ''}`;
    const current = latestByEpisode.get(key);
    if (!current || new Date(row.createdAt || 0) >= new Date(current.createdAt || 0)) {
      latestByEpisode.set(key, row);
    }
  }

  return [...latestByEpisode.values()]
    .sort((a, b) => {
      const an = Number(a.episodeNumber) || 0;
      const bn = Number(b.episodeNumber) || 0;
      if (an !== bn) return an - bn;
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    })
    .slice(-MAX_PREVIOUS_EPISODES)
    .map((row) => ({
      episodeNumber: Number.isInteger(Number(row.episodeNumber)) ? Number(row.episodeNumber) : null,
      summary: extractFeedbackSummary(row.feedback),
    }))
    .filter((row) => row.summary);
}

// ─── 요청 본문 ───────────────────────────────────────────────────────────────

/**
 * 전송할 본문을 만든다.
 *
 * 반환은 { ok: true, body } 또는 { ok: false, reason, message } 다. 분량 초과는 여기서
 * 걸러 전송 자체를 하지 않는다 — 서버까지 갔다가 400 을 받아도 결과는 같지만,
 * 굳이 대본 전문을 실어 보낼 이유가 없다.
 */
export function buildAiFeedbackRequest({
  mode,
  synopsisDoc,
  characters,
  episode,
  episodeBlocks,
  aiFeedbacks,
  projectId,
}) {
  if (!MODES.includes(mode)) {
    return { ok: false, reason: 'INVALID_MODE', message: '피드백 모드를 확인해주세요.' };
  }
  if (!episode) {
    return { ok: false, reason: 'EPISODE_REQUIRED', message: '검토할 회차를 선택해주세요.' };
  }

  const content = buildEpisodeText(episodeBlocks, characters);
  if (!content) {
    return { ok: false, reason: 'EPISODE_REQUIRED', message: '선택한 회차에 대본 내용이 없습니다.' };
  }
  if (exceedsContentLimit(content)) {
    return { ok: false, reason: 'CONTENT_TOO_LONG', message: TOO_LONG_MESSAGE };
  }

  return {
    ok: true,
    body: {
      mode,
      synopsis: buildSynopsisText(synopsisDoc),
      characters: buildCharactersText(characters),
      episode: {
        number: Number.isInteger(Number(episode.number)) ? Number(episode.number) : null,
        content,
      },
      previousFeedbacks: selectPreviousFeedbacks(aiFeedbacks, {
        projectId,
        excludeEpisodeId: episode.id,
      }),
    },
  };
}

// ─── 오류 문구 ───────────────────────────────────────────────────────────────

/**
 * 서버 응답 → 화면 문구와 재시도 가능 여부.
 *
 * 분량 초과만 reason 키를 쓰고 나머지는 error 키를 쓴다(서버 README). 양쪽을 다 본다.
 * 재시도를 권하는 것은 502 뿐이다 — 차감이 되돌려진 상태라 다시 눌러도 손해가 없다.
 * 402/403 은 다시 눌러도 결과가 같으므로 재시도 버튼을 주지 않는다.
 */
export function describeAiFeedbackError(status, payload) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const code = text(body.reason || body.error).trim();
  const serverMessage = text(body.message).trim();

  if (code === 'CONTENT_TOO_LONG') {
    return { code, message: TOO_LONG_MESSAGE, retryable: false };
  }
  if (status === 402 || code === 'LIMIT_REACHED') {
    return {
      code: 'LIMIT_REACHED',
      message: serverMessage || 'AI 피드백을 사용할 수 있는 횟수를 모두 썼습니다.',
      retryable: false,
    };
  }
  if (status === 403 || code === 'FEATURE_DISABLED') {
    return {
      code: 'FEATURE_DISABLED',
      message: serverMessage || '지금은 AI 피드백을 사용할 수 없습니다.',
      retryable: false,
    };
  }
  if (status === 401) {
    return { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', retryable: false };
  }
  if (status === 413 || code === 'REQUEST_TOO_LARGE') {
    return { code: 'REQUEST_TOO_LARGE', message: TOO_LONG_MESSAGE, retryable: false };
  }
  if (status === 400) {
    return { code: code || 'INVALID_BODY', message: serverMessage || '요청 형식을 확인해주세요.', retryable: false };
  }
  if (status === 503 || code === 'NOT_CONFIGURED') {
    return {
      code: 'NOT_CONFIGURED',
      message: '지금은 AI 피드백을 사용할 수 없습니다. 잠시 후 다시 시도해주세요.',
      retryable: true,
    };
  }
  // 502(AI_FAILED / AI_EMPTY)와 그 밖의 오류. 차감은 되돌려진 상태라 재시도를 권한다.
  return {
    code: code || 'AI_FAILED',
    message: serverMessage || '검토에 실패했습니다. 횟수는 차감되지 않았으니 다시 시도해주세요.',
    retryable: true,
  };
}
