/**
 * 어드민 뱃지(빨간점) 헬퍼
 *
 * 메뉴바의 🛠 관리자 아이콘 옆에 표시할 unread 표시용.
 * Supabase RPC `get_admin_unread_counts` 한 번 호출로 3개 지표를 가져온다.
 *   - unresolved_error_reports : 미해결 사용자 오류 보고
 *   - unresolved_client_errors : 미해결 자동 수집 오류
 *   - new_survey_responses     : last_visit_at 이후 새 설문 응답
 *
 * 어드민이 대시보드에 진입하면 `markAdminVisited()` 로 last_visit_at 갱신 →
 * 다음 fetch 부터 new_survey_responses 가 0 으로 떨어진다.
 * (오류 카운트는 admin UI 에서 '확인' 토글로 resolved_at 마킹 시 줄어듦.)
 */

import { supabase } from '../store/supabaseClient';

export async function fetchAdminUnreadCounts() {
  if (!supabase) return { total: 0, breakdown: null };
  try {
    const { data, error } = await supabase.rpc('get_admin_unread_counts');
    if (error) {
      // 비admin 이면 NOT_ADMIN — 조용히 0 반환
      return { total: 0, breakdown: null };
    }
    const err = Number(data?.unresolved_error_reports || 0);
    const cli = Number(data?.unresolved_client_errors || 0);
    const sur = Number(data?.new_survey_responses || 0);
    return {
      total: err + cli + sur,
      breakdown: {
        unresolved_error_reports: err,
        unresolved_client_errors: cli,
        new_survey_responses: sur,
      },
    };
  } catch {
    return { total: 0, breakdown: null };
  }
}

export async function markAdminVisited() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('mark_admin_visited');
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}
