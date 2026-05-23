-- 뉴스레터 구독자 테이블
CREATE TABLE IF NOT EXISTS email_subscribers (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text        NOT NULL UNIQUE,
  user_id            uuid        REFERENCES auth.users ON DELETE SET NULL,
  subscribed_at      timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at    timestamptz,
  unsubscribe_token  text        NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex')
);

CREATE INDEX ON email_subscribers (unsubscribe_token);
CREATE INDEX ON email_subscribers (user_id);

-- 공지 내용 미러 테이블 (Edge Function이 읽을 소스)
CREATE TABLE IF NOT EXISTS newsletter_items (
  id          text        PRIMARY KEY,
  date        date        NOT NULL,
  title       text        NOT NULL,
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 발송 로그
CREATE TABLE IF NOT EXISTS newsletter_send_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_at          timestamptz NOT NULL DEFAULT now(),
  subject          text,
  recipient_count  int,
  item_ids         text[]
);

-- RLS
ALTER TABLE email_subscribers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_send_logs ENABLE ROW LEVEL SECURITY;

-- 구독자: 본인 레코드만 읽기/수정
CREATE POLICY "subscribers_self_read"   ON email_subscribers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "subscribers_self_update" ON email_subscribers FOR UPDATE USING (auth.uid() = user_id);

-- 구독 신청은 누구나 (이메일 입력 폼)
CREATE POLICY "subscribers_insert_any"  ON email_subscribers FOR INSERT WITH CHECK (true);

-- newsletter_items·send_logs: 인증된 사용자 읽기 전용 (쓰기는 service role만)
CREATE POLICY "items_read_auth"    ON newsletter_items     FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "logs_read_auth"     ON newsletter_send_logs FOR SELECT USING (auth.role() = 'authenticated');
