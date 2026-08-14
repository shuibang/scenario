-- 뉴스레터 백필분 발송 제외 (1회성 데이터 보정)
--
-- 배경:
--   syncAnnouncements.js의 changelog 파서가 날짜 형식 주석을 인식하지 못해
--   2026-06-06 ~ 2026-06-29 항목 7건이 newsletter_items에 들어가지 않고 있었다.
--   파서를 고쳐 동기화하면 7건이 한꺼번에 들어가는데, weekly-newsletter는
--   마지막 sent_at 이후 created_at인 항목을 모두 고르므로(functions/weekly-newsletter/index.ts:113-130)
--   다음 주간 발송에 6월치가 통째로 나가게 된다.
--
--   과거 7건은 이력 보존을 위해 DB에는 남기되, created_at을 각자의 실제 공개 날짜로
--   내려 발송 대상에서 자연히 빠지게 한다. 최신 1건(cl-2026-08-15)은 건드리지 않는다.
--
-- 실행 순서 (중요):
--   1) node scripts/syncAnnouncements.js   ← 8건이 DB에 들어감
--   2) 이 파일의 UPDATE                     ← 과거 7건만 created_at 하향
--   3) 다음 주간 발송
--   2)를 건너뛰고 3)이 돌면 6월치 7건이 그대로 발송된다.
--
-- 캐스팅 주의:
--   date는 date, created_at은 timestamptz다. date::timestamptz는 세션 TimeZone을
--   따르므로, 세션 설정과 무관하게 UTC 자정으로 고정되도록 (date::timestamp AT TIME ZONE 'UTC')를 쓴다.


-- ────────────────────────────────────────────────────────────────────────────
-- 1) 실행 전 확인 — 대상 7건이 실제로 들어와 있는지, 현재 created_at이 얼마인지
--    7행이 나와야 한다. 행 수가 모자라면 동기화(1단계)가 아직 안 된 것이다.
-- ────────────────────────────────────────────────────────────────────────────
SELECT id,
       date,
       created_at,
       (date::timestamp AT TIME ZONE 'UTC') AS created_at_after_update,
       title
FROM   public.newsletter_items
WHERE  id IN (
         'cl-2026-06-06',
         'cl-2026-06-08',
         'cl-2026-06-10',
         'cl-2026-06-12',
         'cl-2026-06-15',
         'cl-2026-06-17',
         'cl-2026-06-29'
       )
ORDER  BY date;


-- ────────────────────────────────────────────────────────────────────────────
-- 2) 실제 보정 — 위 7건의 created_at만 각자의 date(UTC 자정)로 설정
--    cl-2026-08-15는 목록에 없다. 절대 추가하지 말 것.
--    RETURNING으로 바뀐 행을 눈으로 확인한다 (7행이어야 한다).
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.newsletter_items
SET    created_at = (date::timestamp AT TIME ZONE 'UTC')
WHERE  id IN (
         'cl-2026-06-06',
         'cl-2026-06-08',
         'cl-2026-06-10',
         'cl-2026-06-12',
         'cl-2026-06-15',
         'cl-2026-06-17',
         'cl-2026-06-29'
       )
RETURNING id, date, created_at;


-- ────────────────────────────────────────────────────────────────────────────
-- 3) 실행 후 검증 — 7건은 내려갔고 cl-2026-08-15는 그대로인지
--    기대: 7건 backfilled = true / cl-2026-08-15 backfilled = false
-- ────────────────────────────────────────────────────────────────────────────
SELECT id,
       date,
       created_at,
       (created_at = (date::timestamp AT TIME ZONE 'UTC')) AS backfilled,
       title
FROM   public.newsletter_items
WHERE  id IN (
         'cl-2026-06-06',
         'cl-2026-06-08',
         'cl-2026-06-10',
         'cl-2026-06-12',
         'cl-2026-06-15',
         'cl-2026-06-17',
         'cl-2026-06-29',
         'cl-2026-08-15'
       )
ORDER  BY date;


-- ────────────────────────────────────────────────────────────────────────────
-- 4) 최신 1건이 다음 발송에 실제로 포함되는지 확인
--    weekly-newsletter는 마지막 sent_at 이후 created_at인 항목을 고르고,
--    발송 로그가 하나도 없으면 "지금으로부터 7일 전"을 기준으로 삼는다.
--    will_be_sent 가 true여야 cl-2026-08-15가 나간다.
--    false라면 이미 그 이후에 발송이 돌았다는 뜻이므로, 이 항목의 created_at을
--    now()로 올려야 한다 (그때는 아래 주석의 쿼리를 쓴다).
-- ────────────────────────────────────────────────────────────────────────────
SELECT (SELECT max(sent_at) FROM public.newsletter_send_logs)              AS last_sent_at,
       i.created_at                                                        AS latest_item_created_at,
       i.created_at > COALESCE(
         (SELECT max(sent_at) FROM public.newsletter_send_logs),
         now() - interval '7 days'
       )                                                                   AS will_be_sent
FROM   public.newsletter_items i
WHERE  i.id = 'cl-2026-08-15';

-- (필요할 때만) 최신 항목이 발송 기준보다 과거로 밀렸을 경우 되살리기
-- UPDATE public.newsletter_items
-- SET    created_at = now()
-- WHERE  id = 'cl-2026-08-15'
-- RETURNING id, date, created_at;
