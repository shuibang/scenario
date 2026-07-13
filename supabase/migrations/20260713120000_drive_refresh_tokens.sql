begin;

-- ─── Google Drive refresh_token 서버측 보관 ─────────────────────────────────
-- Supabase refreshSession()이 Google provider_token을 실제로 재발급하지
-- 못하는 known limitation 우회용. refresh_token을 저장해두고
-- Edge Function(refresh-drive-token)이 Google OAuth 토큰 엔드포인트를
-- 직접 호출해 access_token을 재발급한다.
--
-- RLS는 활성화하되 정책은 두지 않는다 — 클라이언트(anon/authenticated)의
-- 직접 SELECT/INSERT/UPDATE/DELETE를 전부 차단하고, 저장은 아래
-- SECURITY DEFINER RPC를 통해서만, 조회는 SERVICE_ROLE_KEY를 쓰는
-- Edge Function을 통해서만 가능하게 한다. (의도적으로 정책 없음)
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists public.drive_refresh_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.drive_refresh_tokens enable row level security;

-- ─── 저장용 RPC ──────────────────────────────────────────────────────────────
-- 로그인한 본인의 refresh_token만 upsert 가능. auth.uid() 미인증이면 예외.
create or replace function public.store_drive_refresh_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.drive_refresh_tokens (user_id, refresh_token, updated_at)
  values (auth.uid(), p_token, now())
  on conflict (user_id)
  do update set refresh_token = excluded.refresh_token,
                updated_at = now();
end;
$$;

revoke all on function public.store_drive_refresh_token(text) from anon;

commit;
