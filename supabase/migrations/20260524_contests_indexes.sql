-- contests 테이블 조회 성능 개선
-- submit_end 범위 필터(.gte/.lte) 및 status 필터에 인덱스 추가

create index if not exists idx_contests_submit_end
  on contests (submit_end);

create index if not exists idx_contests_status
  on contests (status);

-- status + submit_end 복합 인덱스 (fetchPastContests: status='closed' + submit_end 범위 필터에 최적)
create index if not exists idx_contests_status_submit_end
  on contests (status, submit_end);
