/**
 * 유료 멤버십 판정.
 *
 * 앱 전체에서 "이 사용자는 지금 유료인가"와 "무료 사용량이 남았는가"는 이 파일을
 * 통해서만 묻는다. 획득 경로(쿠폰/결제)는 서버의 source 컬럼에 기록될 뿐이고,
 * 판정은 만료일 하나로만 한다 — 경로가 늘어도 앱 코드가 바뀌지 않게.
 *
 * 아직 어떤 UI에도 연결되어 있지 않다. 결제 수단이 없으므로 현재 유료 사용자는 없다.
 */

import { supabase } from '../store/supabaseClient';

export const FEATURES = {
  AI_FEEDBACK: 'ai_feedback',
};

// ── 순수 함수 ────────────────────────────────────────────────────────────────

/** 구독 행이 지금 유효한가. 만료일 하나로만 판정한다(source는 보지 않는다). */
export function isSubscriptionActive(row, nowMs = Date.now()) {
  if (!row || !row.expires_at) return false;
  const expires = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expires)) return false;
  return expires > nowMs;
}

/**
 * 사용량 기준 기간 'YYYY-MM'. 서버 RPC와 같은 기준(한국 시간)을 쓴다.
 * UTC로 두면 매월 1일 오전 9시 이전에 지난달 한도가 계속 쓰이는 것처럼 보인다.
 */
export function currentPeriod(date = new Date()) {
  const seoul = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = seoul.getUTCFullYear();
  const m = String(seoul.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * RPC 응답 정규화. 응답이 없거나 형식이 어긋나면 "사용 불가"로 닫는다 —
 * 판정 실패를 허용으로 열어주면 한도가 무의미해진다.
 */
export function normalizeUsageResult(raw) {
  if (!raw || typeof raw !== 'object') {
    return { allowed: false, remaining: 0, isPremium: false, used: 0, reason: 'INVALID_RESPONSE' };
  }
  return {
    allowed: raw.allowed === true,
    remaining: raw.remaining === null || raw.remaining === undefined ? null : Number(raw.remaining),
    isPremium: raw.is_premium === true,
    used: Number(raw.used || 0),
    period: raw.period || null,
    reason: raw.reason || null,
  };
}

/**
 * feature_limits 행 정규화. 행이 없거나 enabled=false 면 한도 0·비활성으로 닫는다 —
 * 표시가 실제 서버 판정보다 후해지면 사용자가 "남았다"고 믿었다가 거부당한다.
 */
export function normalizeFeatureLimit(row) {
  if (!row || row.enabled !== true) {
    return { feature: row?.feature || null, limit: 0, enabled: false };
  }
  const limit = Number(row.free_monthly_limit);
  return {
    feature: row.feature || null,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 0,
    enabled: true,
  };
}

/** 로그인하지 않은 사용자의 고정 응답 — 항상 무료·사용 불가. */
export function anonymousUsageResult() {
  return { allowed: false, remaining: 0, isPremium: false, used: 0, reason: 'AUTH_REQUIRED' };
}

// ── 서버 조회 ────────────────────────────────────────────────────────────────

async function getUserId() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  } catch {
    return null;
  }
}

/**
 * 현재 로그인 사용자가 유료인가.
 * 로그인하지 않았거나 조회에 실패하면 false — 판정 실패는 무료로 닫는다.
 */
export async function hasActiveSubscription() {
  const userId = await getUserId();
  if (!userId) return false;
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('expires_at, source')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return false;
    return isSubscriptionActive(data);
  } catch {
    return false;
  }
}

/**
 * 사용량 판정 + 증가. 유료면 무제한 허용(카운트 없음), 무료면 이번 달 한도 안에서만 허용.
 *
 * 한도는 서버의 feature_limits 에서 읽는다 — 클라이언트가 한도를 넘기던 구조를 없앴다.
 * 등록되지 않은 feature 는 서버가 FEATURE_DISABLED 로 거부한다(화이트리스트).
 * 판정과 증가는 RPC 한 문장에서 처리되므로 동시 호출로 한도를 넘길 수 없다.
 */
export async function checkUsage(feature) {
  const userId = await getUserId();
  if (!userId) return anonymousUsageResult();
  try {
    const { data, error } = await supabase.rpc('check_and_increment_usage', {
      p_feature: feature,
    });
    if (error) {
      return { allowed: false, remaining: 0, isPremium: false, used: 0, reason: 'RPC_ERROR' };
    }
    return normalizeUsageResult(data);
  } catch {
    return { allowed: false, remaining: 0, isPremium: false, used: 0, reason: 'RPC_ERROR' };
  }
}

/**
 * 사용량 기간 키. 서버 `_usage_period(boolean, text)` 와 같은 규칙을 클라이언트에서 다시 구현한 것이다.
 *
 * 서버 함수는 authenticated 에게 EXECUTE 가 없어(revoke 됨) 호출할 수 없기 때문에 복제했다.
 * 즉 서버 규칙이 바뀌면 여기도 함께 고쳐야 하고, 고치지 않으면 어긋난다.
 * 어긋나도 한도가 새지는 않는다 — 이 값은 표시 전용이고 실제 판정과 차감은 전부 서버가 한다.
 */
export function usagePeriodKey(isPremium, resetPeriod, date = new Date()) {
  if (isPremium) return `premium-${currentPeriod(date)}`;
  if (resetPeriod === 'lifetime') return 'lifetime';
  return currentPeriod(date);
}

/**
 * 남은 횟수 조회 — 차감하지 않는다 (표시 전용).
 *
 * checkUsage 는 판정과 동시에 증가시키는 RPC 라 화면 표시에 쓰면 안 된다.
 * 여기서는 본인 행 SELECT 정책이 있는 세 테이블만 읽어 계산한다:
 *   feature_limits(한도·리셋주기) + subscriptions(유료 여부) + usage_counters(쓴 횟수)
 *
 * 조회에 실패하면 { available: false } 로 돌려주되, 호출자는 이것을 기능 차단이 아니라
 * "숫자를 숨김"으로만 다뤄야 한다. 표시 실패가 사용 차단이 되면 안 된다.
 */
export async function getUsageStatus(feature) {
  const unavailable = { available: false, remaining: null, limit: null, isPremium: false, enabled: true };
  const userId = await getUserId();
  if (!userId || !supabase) return unavailable;

  try {
    const [limitRes, subRes] = await Promise.all([
      supabase
        .from('feature_limits')
        .select('feature, free_monthly_limit, premium_monthly_limit, reset_period, enabled')
        .eq('feature', feature)
        .maybeSingle(),
      supabase
        .from('subscriptions')
        .select('expires_at')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (limitRes.error || !limitRes.data) return unavailable;
    const row = limitRes.data;
    if (row.enabled !== true) {
      return { available: true, remaining: 0, limit: 0, isPremium: false, enabled: false };
    }

    const isPremium = !subRes.error && isSubscriptionActive(subRes.data);
    const rawLimit = isPremium ? row.premium_monthly_limit : row.free_monthly_limit;
    // 유료의 premium_monthly_limit 이 null 이면 무제한·무카운트 (서버 _consume_usage 와 동일)
    if (isPremium && (rawLimit === null || rawLimit === undefined)) {
      return { available: true, remaining: null, limit: null, isPremium: true, enabled: true };
    }

    const limit = Number(rawLimit);
    if (!Number.isFinite(limit) || limit <= 0) {
      return { available: true, remaining: 0, limit: 0, isPremium, enabled: true };
    }

    const period = usagePeriodKey(isPremium, row.reset_period);
    const { data: counter, error: counterErr } = await supabase
      .from('usage_counters')
      .select('count')
      .eq('user_id', userId)
      .eq('feature', feature)
      .eq('period', period)
      .maybeSingle();
    if (counterErr) return unavailable;

    const used = Number(counter?.count || 0);
    return {
      available: true,
      remaining: Math.max(limit - used, 0),
      limit,
      isPremium,
      enabled: true,
    };
  } catch {
    return unavailable;
  }
}

/**
 * 기능별 무료 한도 조회 (남은 횟수 표시용).
 * 조회 실패나 미등록 기능은 "사용 불가"로 닫는다 — 표시가 실제 판정보다 후해지면 안 된다.
 */
export async function getFeatureLimit(feature) {
  if (!supabase) return normalizeFeatureLimit(null);
  try {
    const { data, error } = await supabase
      .from('feature_limits')
      .select('feature, free_monthly_limit, enabled')
      .eq('feature', feature)
      .maybeSingle();
    if (error) return normalizeFeatureLimit(null);
    return normalizeFeatureLimit(data);
  } catch {
    return normalizeFeatureLimit(null);
  }
}
