# scrape_contests Edge Function

드라마 대본 공모전 자동 수집 → 어드민 검토 큐 (`contests.status='pending_review'`).

## 배포

```bash
# Supabase CLI 설치 후
supabase functions deploy scrape_contests --project-ref <PROJECT_REF>

# 환경변수 설정 (Supabase 대시보드 → Edge Functions → Secrets)
supabase secrets set CRON_SECRET=<랜덤문자열> --project-ref <PROJECT_REF>
# SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 자동 제공됨
```

## 수동 호출 (테스트)

```bash
curl -X POST https://<PROJECT_REF>.functions.supabase.co/scrape_contests \
  -H "x-cron-secret: <위에서 설정한 값>"
```

응답: `{ ok, report: { sources: [...], total_inserted, total_duplicate, total_no_deadline, total_errors } }`

## pg_cron 자동 실행 등록

Supabase 대시보드 SQL Editor에서:

```sql
-- 확장 활성화 (1회)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 일 2회 (KST 10:00 = UTC 01:00, KST 16:00 = UTC 07:00)
select cron.schedule(
  'scrape-contests-morning',
  '0 1 * * *',
  $$
    select net.http_post(
      url := 'https://<PROJECT_REF>.functions.supabase.co/scrape_contests',
      headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
    );
  $$
);

select cron.schedule(
  'scrape-contests-afternoon',
  '0 7 * * *',
  $$
    select net.http_post(
      url := 'https://<PROJECT_REF>.functions.supabase.co/scrape_contests',
      headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
    );
  $$
);

-- 마감 자동 처리 (일 1회, KST 00:05)
select cron.schedule(
  'contests-close-expired',
  '5 15 * * *',  -- UTC 15:05 = KST 00:05
  $$ select public.close_expired_contests(); $$
);
```

## 소스 화이트리스트 (1차)

| name | 기관 | 비고 |
|---|---|---|
| kocca | 한국콘텐츠진흥원 | 사업공고 페이지 |
| ktrwa | 한국방송작가협회 | 공지사항 |
| edu_ktrwa | 한국방송작가교육원 | 공지사항 (사용자 요청) |
| opentvbase | CJ ENM 오펜 | 공지 |
| kbs / mbc / sbs | 방송사 | 채용/공모 |

## 필터링 규칙

- **INCLUDE**: 드라마, 극본, 대본, 미니시리즈, 단막, 방송작가, 시나리오, 영상콘텐츠, 콘텐츠창작
- **EXCLUDE**: 용역, 입찰, 납품, 구매, 계약공고, 채용, 교육생/수강생 모집, 강사 모집, 운영업체, 위탁용역
- 사용자 결정: '사업', '지원사업', '창업' 은 EXCLUDE 에서 제외 (창작자 지원사업·영상콘텐츠 사업 등 드라마 관련 케이스 포함)

## 운영 노트

- 모든 결과는 `status='pending_review'` 로 들어감 → 어드민이 [공모 검토] 탭에서 승인해야 사용자에게 노출됨
- `source_url` UNIQUE 제약 → 중복 INSERT 는 자동 무시 (idempotent)
- 마감일 파싱 못한 항목은 INSERT 안 함 (`no_deadline` 카운트로 보고만)
- 사이트별 HTML 구조 변경 / 접근 차단 / SPA 렌더 등으로 candidate 0건이 나올 수 있음 — 정상. 정밀 파서는 운영하며 추가.
- 시작은 generic 파서 1개 — 정확도는 어드민 게이트가 마지막 방어선.
