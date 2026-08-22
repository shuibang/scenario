/**
 * ai-feedback Edge Function 호출.
 *
 * 한도 차감은 서버가 한다(admin_check_and_increment_usage). 그러므로 이 경로에서
 * membership.js 의 checkUsage 를 부르면 안 된다 — 그것도 차감하는 RPC 라 한 번 요청에
 * 두 번 차감되고, 무료는 평생 1회라 결과를 받기도 전에 한도가 사라진다.
 * 판정은 오직 서버 응답(remaining, 402)으로만 안다.
 */
import { supabase } from '../store/supabaseClient';
import { describeAiFeedbackError } from './aiFeedback';

/**
 * @returns {Promise<{ ok: true, feedback: string, remaining: number|null, isPremium: boolean }
 *                 | { ok: false, code: string, message: string, retryable: boolean }>}
 */
export async function requestAiFeedback(body) {
  if (!supabase) {
    return { ok: false, code: 'NO_SUPABASE', message: '지금은 AI 피드백을 사용할 수 없습니다.', retryable: false };
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', retryable: false };
  }

  const { data, error } = await supabase.functions.invoke('ai-feedback', {
    method: 'POST',
    body,
  });

  if (error) {
    // FunctionsHttpError 는 context 에 원본 Response 를 담고 있다. 상태 코드와 본문을
    // 여기서 꺼내야 402/403/502 를 구분할 수 있다 — error.message 만으로는 못 가른다.
    const status = error.context?.status ?? 0;
    let payload = null;
    try {
      payload = await error.context?.json?.();
    } catch {}
    return { ok: false, ...describeAiFeedbackError(status, payload) };
  }

  const feedback = typeof data?.feedback === 'string' ? data.feedback.trim() : '';
  if (!feedback) {
    // 200 인데 본문이 비어 있는 경우. 서버가 환불했는지 알 수 없으므로 재시도를 권하되
    // 결과를 저장하지는 않는다.
    return { ok: false, ...describeAiFeedbackError(502, null) };
  }

  return {
    ok: true,
    feedback,
    remaining: data?.remaining === null || data?.remaining === undefined ? null : Number(data.remaining),
    isPremium: data?.isPremium === true,
  };
}
