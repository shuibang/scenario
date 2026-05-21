/**
 * 베타테스트 한달차 설문 이벤트 (2만원 커피쿠폰 추첨).
 * 마감일 2026-05-31 (KST) — 6/1 0시부터 종료.
 *
 * 마감 후에는:
 *  - 설문의 경품 안내 + 작업현황 링크 + 전화번호 문항이 사라지고
 *  - 에디터 좌측 패널의 EVENT 배너(FeedbackButtons)가 사라진다.
 * 단일 소스(이 파일)에서 마감 시각을 관리한다.
 */
export const SURVEY_EVENT_END = new Date('2026-06-01T00:00:00').getTime();

export function isSurveyEventActive() {
  return Date.now() < SURVEY_EVENT_END;
}
