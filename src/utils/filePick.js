/**
 * 파일 선택 다이얼로그 헬퍼.
 *
 * DOM에 붙이지 않은(detached) input을 click()하면 일부 브라우저(iPad Safari 등)에서
 * 첫 호출의 change 이벤트가 유실된다 — 다이얼로그는 뜨고 닫히는데 핸들러가 불리지 않아
 * "아무 일도 일어나지 않는" 무음 실패가 된다. 그래서 반드시 DOM에 부착한 뒤 click하고,
 * 사용이 끝나면 제거한다.
 *
 * display:none은 쓰지 않는다 — 일부 브라우저에서 숨겨진 input의 click이 무시된다.
 * 화면 밖 + opacity:0으로 감춘다.
 */

import { reportError } from './errorTracker';

export const PICK_SELECTED = 'selected';
export const PICK_CANCELED = 'canceled';
export const PICK_LOST     = 'lost';

/**
 * 어떤 이벤트가 왔는지로 결과를 분류하는 순수 함수.
 * - 파일이 있으면 선택 성공
 * - cancel 이벤트, 또는 change가 왔는데 파일이 없으면 사용자 취소(정상 흐름)
 * - 다이얼로그가 닫혔는데 아무 이벤트도 오지 않았으면 유실(버그)
 */
export function classifyFilePick({ changeFired = false, cancelFired = false, hasFile = false } = {}) {
  if (hasFile) return PICK_SELECTED;
  if (cancelFired || changeFired) return PICK_CANCELED;
  return PICK_LOST;
}

/**
 * 파일 선택 다이얼로그를 열고 결과를 콜백으로 알린다.
 * 반드시 사용자 제스처(클릭 핸들러) 안에서 동기적으로 호출해야 한다.
 *
 * @returns {() => void} 정리 함수 — 언마운트 시 호출하면 input과 리스너를 제거한다.
 */
// 포커스가 돌아온 뒤 이만큼 아무 이벤트도 없으면 "유실 의심"으로 알린다.
// 짧게 잡으면 오탐이 난다 — 태블릿에서 다이얼로그를 열어둔 채 다른 앱에 갔다 오는 것은
// 흔한 동작이고, 그때 포커스만 돌아온다. 오탐은 사용자가 고른 파일을 버리므로
// 미탐보다 훨씬 나쁘다. 넉넉히 잡고, 알린 뒤에도 picker는 계속 살려둔다.
const LOST_NOTICE_MS = 10_000;

export function openFilePicker({
  accept = '',
  onFile,
  onCancel,
  onLost,
  lostNoticeMs = LOST_NOTICE_MS,
} = {}) {
  const input = document.createElement('input');
  input.type = 'file';
  if (accept) input.accept = accept;
  // 화면 밖으로 숨긴다 (display:none 금지 — iOS에서 click이 무시될 수 있다)
  input.style.cssText = 'position:fixed;top:0;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;
  document.body.appendChild(input);

  let changeFired = false;
  let cancelFired = false;
  let settled = false;      // 종료 콜백(onFile/onCancel)이 나갔는가
  let lostNotified = false; // 유실 의심을 이미 알렸는가
  let lostTimer = null;

  const cleanup = () => {
    clearTimeout(lostTimer);
    input.removeEventListener('change', onChange);
    input.removeEventListener('cancel', onCancelEvent);
    window.removeEventListener('focus', onWindowFocus);
    if (input.parentNode) input.parentNode.removeChild(input);
  };

  // 종료는 change/cancel 이벤트로만 한다. 어떤 경로로 끝나든 cleanup을 먼저 돌려
  // input이 DOM에 남지 않게 하고, 콜백은 정확히 한 번만 호출한다.
  const settle = (file) => {
    if (settled) return;
    settled = true;
    const result = classifyFilePick({ changeFired, cancelFired, hasFile: !!file });
    cleanup();
    if (result === PICK_SELECTED) onFile?.(file);
    else onCancel?.(); // 취소는 정상 흐름 — 오류로 보고하지 않는다
  };

  function onChange(e) {
    changeFired = true;
    settle(e.target.files?.[0] || null);
  }

  function onCancelEvent() {
    cancelFired = true;
    settle(null);
  }

  // 포커스가 돌아왔는데 한참 아무 이벤트도 없으면 "유실 의심"을 알린다.
  // 다만 picker를 닫지는 않는다 — 사용자가 다이얼로그를 열어둔 채 앱을 오갔을 뿐일 수
  // 있고, 그때 정리해버리면 뒤늦게 고른 파일이 통째로 버려진다(오탐 비용이 크다).
  function onWindowFocus() {
    if (settled || lostNotified) return;
    clearTimeout(lostTimer);
    lostTimer = setTimeout(() => {
      if (settled || lostNotified) return;
      lostNotified = true;
      reportError({
        source: 'filePick.openFilePicker',
        message: `파일 선택 이벤트 유실 의심 (accept=${accept || '*'})`,
      })?.catch?.(() => {});
      onLost?.();
      // picker는 계속 살려둔다 — 늦게 change가 오면 그때 정상 처리된다.
    }, lostNoticeMs);
  }

  input.addEventListener('change', onChange);
  input.addEventListener('cancel', onCancelEvent);
  window.addEventListener('focus', onWindowFocus);

  input.click();

  return () => { if (!settled) { settled = true; cleanup(); } };
}
