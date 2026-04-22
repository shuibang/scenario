-- shared_scripts 삭제 시 자식 테이블(director_deliveries, director_notes) 자동 정리
-- 기존 FK 제약은 CASCADE가 아니어서 shared_scripts 행 삭제 시 FK 위반 에러가 발생했다.
-- 사용자가 직접 삭제 권한을 가진 parent 행만 지울 수 있고, 그 시점에 같은 script_id를
-- 참조하는 자식 행들만 함께 정리되므로 다른 사용자 데이터에는 영향이 없다.

begin;

alter table public.director_deliveries
  drop constraint if exists director_deliveries_shared_script_id_fkey;
alter table public.director_deliveries
  add constraint director_deliveries_shared_script_id_fkey
    foreign key (shared_script_id)
    references public.shared_scripts(id)
    on delete cascade;

alter table public.director_notes
  drop constraint if exists director_notes_shared_script_id_fkey;
alter table public.director_notes
  add constraint director_notes_shared_script_id_fkey
    foreign key (shared_script_id)
    references public.shared_scripts(id)
    on delete cascade;

commit;
