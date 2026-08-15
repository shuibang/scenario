/**
 * Drive 목록 조회 실패를 사용자에게 알릴지 판단한다.
 *
 * 스냅샷 패널은 로컬 스냅샷과 Drive 백업을 합쳐 보여주므로, Drive만 실패한 경우
 * 로컬 목록은 그대로 두고 안내만 덧붙이는 부분 실패로 다룬다.
 *
 * 예외 하나: Drive를 한 번도 연결하지 않은 사용자에게 "연결이 만료되었다"는 안내는
 * 사실과 다르다. 토큰이 없는 경우(unauthed)는 로그인 상태일 때만 알린다.
 */

import { LIST_UNAUTHED } from './driveListResult';

export function shouldShowDriveListNotice(result, { loggedIn = false } = {}) {
  if (!result || result.ok) return false;
  if (result.reason === LIST_UNAUTHED && !loggedIn) return false;
  return true;
}
