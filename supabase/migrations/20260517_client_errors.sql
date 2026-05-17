begin;

-- ─── client_errors — 클라이언트 자동 오류 캡처 ─────────────────────────────
-- window.onerror / unhandledrejection / React ErrorBoundary 에서 자동 insert.
-- 사용자가 직접 오류 보고를 하지 않아도 운영자가 대략적인 상황을 파악할 수 있음.
--
-- 보호:
--   - anon insert 허용 (로그인 안 한 사용자의 오류도 잡아야 함)
--   - admin만 SELECT (public.is_admin_user())
--   - 클라이언트에서 rate limit + dedup + PII 마스킹 처리하므로 서버는 단순 저장
--   - message/stack은 클라이언트가 4KB로 잘라서 보냄
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.client_errors (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid null references auth.users(id) on delete set null,
  session_id  text not null check (char_length(session_id) between 1 and 64),
  source      text not null check (source in ('window', 'promise', 'react', 'manual')),
  message     text not null check (char_length(message) between 1 and 4000),
  stack       text null check (stack is null or char_length(stack) <= 4000),
  url         text null check (url is null or char_length(url) <= 500),
  user_agent  text null check (user_agent is null or char_length(user_agent) <= 500),
  fingerprint text not null check (char_length(fingerprint) between 1 and 128)
);

-- 그룹핑·최근 발생 조회 인덱스
create index if not exists client_errors_fingerprint_created_idx
  on public.client_errors(fingerprint, created_at desc);

create index if not exists client_errors_created_idx
  on public.client_errors(created_at desc);

-- RLS 활성화
alter table public.client_errors enable row level security;

-- INSERT 정책 — 모두 허용 (anon 포함). 클라이언트가 rate limit 책임짐.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_errors' and policyname = 'client_errors_anyone_insert'
  ) then
    create policy client_errors_anyone_insert on public.client_errors
      for insert to anon, authenticated
      with check (true);
  end if;
end $$;

-- SELECT 정책 — 어드민만
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_errors' and policyname = 'client_errors_admin_select'
  ) then
    create policy client_errors_admin_select on public.client_errors
      for select to authenticated
      using (public.is_admin_user());
  end if;
end $$;

commit;

-- ─── 검증 (수동) ────────────────────────────────────────────────────────────
-- 1) anon 세션에서 insert 시도 → 1행 추가 성공
-- 2) anon 세션에서 select * → 0행 (admin select 정책으로 차단)
-- 3) 관리자 이메일로 로그인 → select * 시 실제 데이터 보임
