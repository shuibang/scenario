begin;

-- ─── contests.category : text → text[] (다중 선택 지원) ──────────────────────
-- 한 공모전이 단막·미니시리즈·영화 등 여러 부문을 동시에 모집하는 경우가 많아
-- 단일 값으로는 표현 부족. 배열로 전환.
-- 기존 단일 값은 1요소 배열로 자동 변환.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='contests' and column_name='category'
      and data_type = 'text'
  ) then
    alter table public.contests
      alter column category type text[]
      using case
        when category is null or btrim(category) = '' then null
        else array[btrim(category)]
      end;
  end if;
end $$;

commit;
