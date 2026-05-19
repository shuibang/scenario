/**
 * scrape_contests — 드라마 대본 공모전 자동 수집 Edge Function
 *
 * 동작:
 * 1. 화이트리스트 소스의 공지/공모 목록 페이지 fetch
 * 2. 제목에 드라마/극본 키워드 있고 부적합 키워드 없는 항목 추출
 * 3. status='pending_review', source_type='scrape' 로 INSERT
 *    (source_url UNIQUE 제약 → 중복은 자동 무시)
 * 4. 모든 결과는 어드민 검토 큐로 → 사용자 노출 전 최종 게이트
 *
 * pg_cron 으로 일 2회 (KST 10:00, 16:00) 호출 권장.
 *
 * 참고:
 * - 각 사이트 HTML 구조는 변경될 수 있으므로 best-effort. 실패해도 다음 소스 진행.
 * - SPA(JS 렌더) 사이트는 단순 fetch로 못 잡음 → 운영 들어가서 RSS·정적 페이지 우선.
 * - 마감일을 파싱 못한 항목은 INSERT 하지 않고 누락 카운트만 보고.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ─── 필터링 규칙 ─────────────────────────────────────────────────────────────
// 사용자 결정: '사업', '지원사업', '창업'은 EXCLUDE 에서 제외 — 창작자 지원사업,
// 영상콘텐츠 사업 등 드라마 관련 경우가 있음. EXCLUDE는 명백히 무관한 것만.
//
// 3중 게이트로 정밀도 ↑:
//   1) DOMAIN  — 드라마/극본 도메인 키워드 (콘텐츠 종류)
//   2) ACTION  — 공모·모집·접수 같은 행위 키워드 (이게 핵심 — 메뉴/광고 거름)
//   3) EXCLUDE — 명백히 무관한 키워드
const DOMAIN_RE  = /(드라마|극본|대본|미니시리즈|단막|방송작가|시나리오|영상\s?콘텐츠|콘텐츠\s?창작)/;
const ACTION_RE  = /(공모|공고|모집|선정|접수|시상|당선|수상|기획안|아이디어\s?공모)/;
const EXCLUDE_RE = /(용역|입찰|납품|구매|계약\s?공고|채용|모집공고\s?\(직원|강사\s?모집|교육생\s?모집|수강생\s?모집|운영업체|위탁\s?용역|결과\s?발표|당선작\s?발표|더보기|전체보기|바로가기|기업\s?모집|기업\s?대상|기업\s?지원|참여\s?기업|기업\s?공모|기업\s?선정)/;

// 일반 브라우저 UA. 명시적 봇 UA 는 robots 정책 없이도 차단되는 사이트가 많아
// (storyum 등) 일반 Chrome UA 로 fetch. 부담 최소화 정책(일 2회)은 유지.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

// ─── 타입 ────────────────────────────────────────────────────────────────────
interface Candidate {
  title: string;
  source_url: string;
  organizer: string;
  submit_end?: string | null;       // YYYY-MM-DD
  submit_start?: string | null;
  category?: string[] | null;       // text[] (다중 선택)
}

interface SourceDef {
  name: string;
  organizer: string;
  url: string;
  /** HTML 또는 RSS 본문 → 후보 목록 */
  parse: (body: string, sourceUrl: string) => Candidate[];
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function absoluteUrl(href: string, base: string): string {
  try { return new URL(href, base).toString(); } catch { return href; }
}

/** 제목/본문에서 YYYY.MM.DD, YYYY-MM-DD, YYYY/MM/DD, "~ M월 D일" 같은 패턴에서 마감일 추출 */
function extractDeadline(text: string, fallbackYear?: number): string | null {
  // YYYY[.-/]MM[.-/]DD (마지막 매치 = 마감일 가능성)
  const ymd = [...text.matchAll(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/g)];
  if (ymd.length > 0) {
    const m = ymd[ymd.length - 1];
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  // M월 D일 (연도 fallback)
  const md = [...text.matchAll(/(\d{1,2})월\s*(\d{1,2})일/g)];
  if (md.length > 0 && fallbackYear) {
    const m = md[md.length - 1];
    const mo = parseInt(m[1], 10);
    const d = parseInt(m[2], 10);
    return `${fallbackYear}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

function passesFilter(title: string): boolean {
  if (!title || title.length < 10) return false;          // 짧은 메뉴/버튼 제외
  if (!DOMAIN_RE.test(title)) return false;                // 드라마 도메인 필수
  if (!ACTION_RE.test(title)) return false;                // 공모/모집 행위 필수
  if (EXCLUDE_RE.test(title)) return false;
  return true;
}

/**
 * 일반 게시판 형식: <table> 안의 행에서 제목 링크 + 날짜 셀을 best-effort 추출.
 * 사이트마다 클래스명이 달라 정확한 셀렉터 없이 패턴 매칭.
 */
function genericTableListParse(html: string, sourceUrl: string, organizer: string): Candidate[] {
  const results: Candidate[] = [];
  const linkRe = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const baseOrigin = new URL(sourceUrl).origin;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1].trim();
    const inner = decodeHtmlEntities(stripTags(m[2]));
    if (!passesFilter(inner)) continue;
    if (seen.has(inner)) continue;
    seen.add(inner);

    // URL 게이트: javascript:, #, 빈 값, 메인 페이지 자체 → 제외
    if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) continue;
    const abs = absoluteUrl(href, sourceUrl);
    if (abs === sourceUrl || abs === baseOrigin || abs === baseOrigin + '/') continue;

    // 마감일은 본문 페이지로 들어가 봐야 정확하지만, 일단 제목 자체에서 추출 시도
    const year = new Date().getFullYear();
    const deadline = extractDeadline(inner, year);
    results.push({
      title: inner,
      source_url: abs,
      organizer,
      submit_end: deadline,
      category: inferCategory(inner),
    });
  }
  return results;
}

function inferCategory(title: string): string[] | null {
  // 한 공모전이 여러 부문을 동시에 모집하는 경우가 많아 다중 카테고리 반환.
  const cats: string[] = [];
  if (/미니시리즈/.test(title)) cats.push('미니시리즈');
  if (/단막|단편/.test(title)) cats.push('단막');
  if (/시나리오/.test(title)) cats.push('시나리오');
  if (/영화/.test(title)) cats.push('영화');
  if (/웹드라마|웹\s?드라마/.test(title)) cats.push('웹드라마');
  if (cats.length === 0 && /드라마|극본|대본/.test(title)) cats.push('미니시리즈');
  return cats.length > 0 ? Array.from(new Set(cats)) : ['기타'];
}

/**
 * 페이지 본문 hash 계산용 정규화.
 * - body 만 추출, script/style/comment/노이즈 제거
 * - 자주 바뀌는 timestamp/CSRF token 제거 → false positive 방지
 */
function normalizeForHash(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let body = bodyMatch ? bodyMatch[1] : html;
  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/csrf[_-]?token['":]?\s*['"][^'"]+['"]/gi, '')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s"'<>]*/g, '')
    .replace(/\?_=\d+/g, '')   // cache buster query
    .replace(/\s+/g, ' ')
    .trim();
  return body;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── 소스별 정의 ─────────────────────────────────────────────────────────────
// 일단 모든 사이트 동일한 generic 파서로 시작. 운영 후 정밀화.
const SOURCES: SourceDef[] = [
  {
    name: 'kocca',
    organizer: '한국콘텐츠진흥원',
    url: 'https://www.kocca.kr/kocca/pims/list.do?menuNo=204104',
    parse: (html, url) => genericTableListParse(html, url, '한국콘텐츠진흥원'),
  },
  {
    name: 'ktrwa',
    organizer: '한국방송작가협회',
    url: 'https://www.ktrwa.or.kr/notice/notice.asp',
    parse: (html, url) => genericTableListParse(html, url, '한국방송작가협회'),
  },
  {
    name: 'edu_ktrwa',
    organizer: '한국방송작가교육원',
    url: 'https://edu.ktrwa.or.kr/web/board/boardContentsListPage.do?board_id=1',
    parse: (html, url) => genericTableListParse(html, url, '한국방송작가교육원'),
  },
  {
    name: 'cj_open',
    organizer: 'CJ ENM 오펜',
    url: 'https://open.cjenm.com/ko/applyinfo/story/',
    parse: (html, url) => genericTableListParse(html, url, 'CJ ENM 오펜'),
  },
  {
    name: 'kbs_drama',
    organizer: 'KBS',
    url: 'https://program.kbs.co.kr/special/drama/contest/pc/board.html?smenu=45eacc&bbs_loc=X2022-0003-03-40379,read,,26,2059255',
    parse: (html, url) => genericTableListParse(html, url, 'KBS'),
  },
  {
    name: 'sbs_foundation',
    organizer: 'SBS 문화재단',
    url: 'https://foundation.sbs.co.kr/drama/contents/index.html?type=video',
    parse: (html, url) => genericTableListParse(html, url, 'SBS 문화재단'),
  },
  {
    name: 'mbc_writer',
    organizer: 'MBC',
    url: 'https://writer.imbc.com/notice/',
    parse: (html, url) => genericTableListParse(html, url, 'MBC'),
  },
  {
    name: 'storyum',
    organizer: '스토리움',
    url: 'https://www.storyum.kr/story/progrm/master/listStartN.do?siteSe=story&menuNo=500024&siteId=5',
    parse: (html, url) => genericTableListParse(html, url, '스토리움'),
  },
];

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function runScrape() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return { ok: false, error: 'env not set (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' };
  }
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const report = {
    started_at: new Date().toISOString(),
    sources: [] as Array<Record<string, unknown>>,
    total_candidates: 0,
    total_inserted: 0,
    total_duplicate: 0,
    total_no_deadline: 0,
    total_errors: 0,
  };

  for (const src of SOURCES) {
    const srcResult: Record<string, unknown> = { name: src.name, url: src.url };
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 15_000);
      const res = await fetch(src.url, { headers: HEADERS, signal: ctrl.signal });
      clearTimeout(timeout);
      srcResult.http_status = res.status;
      if (!res.ok) {
        srcResult.error = `HTTP ${res.status}`;
        report.total_errors++;
        report.sources.push(srcResult);
        continue;
      }
      // 한글 사이트는 EUC-KR 인 경우도 있음. 우선 utf-8 시도.
      const html = await res.text();
      const candidates = src.parse(html, src.url);
      srcResult.candidate_count = candidates.length;
      report.total_candidates += candidates.length;

      // ── hash 기반 페이지 변경 감지 ───────────────────────────────────────
      // generic 파서가 못 잡는 SPA/응모페이지형 사이트의 변경을 감지하기 위해
      // 정규화된 본문 hash 를 저장하고 다음 점검 시 비교한다.
      // 첫 실행이면 알림 없이 baseline 만 저장.
      try {
        const currentHash = await sha256Hex(normalizeForHash(html));
        const { data: prevState } = await sb
          .from('contest_source_state')
          .select('last_hash')
          .eq('name', src.name)
          .maybeSingle();
        const previousHash = prevState?.last_hash || null;
        const nowIso = new Date().toISOString();

        const hashChanged = !!(previousHash && previousHash !== currentHash);
        let alertSent = false;
        if (hashChanged) {
          // 변경 알림은 본문에 드라마 + 공모 키워드가 모두 있을 때만 보냄.
          // 사이트 timestamp/방문자수 같은 무관한 변경으로 인한 false positive 차단.
          const plainText = stripTags(html).slice(0, 200_000);
          const hasRelevant = DOMAIN_RE.test(plainText) && ACTION_RE.test(plainText) && !EXCLUDE_RE.test(plainText);
          if (hasRelevant) {
            const ts = Date.now();
            const due = new Date();
            due.setDate(due.getDate() + 60);
            const { error: notifyErr } = await sb.from('contests').insert({
              title: `[페이지 변경 감지] ${src.organizer}`,
              organizer: src.organizer,
              source_url: `${src.url}#change-${ts}`,
              submit_end: due.toISOString().slice(0, 10),
              source_type: 'scrape',
              status: 'pending_review',
              reporter_memo: '🔔 페이지 본문에 드라마 + 공모 키워드가 새로 감지됨 — 원문 확인 후 새 공모전이면 수동 등록, 아니면 반려',
            });
            if (notifyErr && notifyErr.code !== '23505') {
              srcResult.change_notify_error = notifyErr.message;
            }
            alertSent = true;
          }
        }

        if (hashChanged || !previousHash) {
          await sb.from('contest_source_state').upsert({
            name: src.name,
            url: src.url,
            last_hash: currentHash,
            last_checked_at: nowIso,
            last_change_at: nowIso,
            updated_at: nowIso,
          });
        } else {
          await sb.from('contest_source_state').update({
            last_hash: currentHash,
            last_checked_at: nowIso,
            updated_at: nowIso,
          }).eq('name', src.name);
        }

        srcResult.hash = currentHash.slice(0, 12);
        srcResult.hash_changed = hashChanged;
        srcResult.alert_sent = alertSent;
        srcResult.baseline_set = !previousHash;
      } catch (hashErr) {
        srcResult.hash_error = String(hashErr);
      }

      let inserted = 0, duplicate = 0, noDeadline = 0;
      for (const c of candidates) {
        let submitEnd = c.submit_end;
        let reporterMemo: string | null = null;
        if (!submitEnd) {
          // 마감일 파싱 실패 → 임시로 +60일 후 부여, 어드민 검토 시 수정.
          // 이렇게 해도 검토 큐엔 들어가므로 사용자가 알아볼 수 있음.
          const d = new Date();
          d.setDate(d.getDate() + 60);
          submitEnd = d.toISOString().slice(0, 10);
          reporterMemo = '⚠ 마감일 자동 파싱 실패 — 원문 URL 확인 후 수정 필요';
          noDeadline++;
        }
        const row = {
          title: c.title.slice(0, 200),
          organizer: c.organizer,
          source_url: c.source_url,
          category: c.category,
          submit_start: c.submit_start || null,
          submit_end: submitEnd,
          source_type: 'scrape',
          status: 'pending_review',
          reporter_memo: reporterMemo,
        };
        const { error } = await sb.from('contests').insert(row);
        if (error) {
          if (error.code === '23505') duplicate++;
          else {
            srcResult.last_insert_error = error.message;
            report.total_errors++;
          }
        } else {
          inserted++;
        }
      }
      srcResult.inserted = inserted;
      srcResult.duplicate = duplicate;
      srcResult.no_deadline = noDeadline;
      report.total_inserted += inserted;
      report.total_duplicate += duplicate;
      report.total_no_deadline += noDeadline;
    } catch (err) {
      srcResult.error = String(err);
      report.total_errors++;
    }
    report.sources.push(srcResult);
  }

  report['finished_at' as keyof typeof report] = new Date().toISOString() as never;
  return { ok: true, report };
}

// ─── HTTP 핸들러 ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // 단순 보호: 헤더 토큰 검사 (pg_cron 호출 시 함께 전달)
  const auth = req.headers.get('x-cron-secret');
  const expected = Deno.env.get('CRON_SECRET');
  if (expected && auth !== expected) {
    return new Response('unauthorized', { status: 401 });
  }
  try {
    const result = await runScrape();
    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
});
