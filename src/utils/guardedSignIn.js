/**
 * guardedSignInWithGoogle
 *
 * WebView 환경이면 Google 로그인을 차단하고
 * 전역 커스텀 이벤트('show-webview-modal')를 발생시킨다.
 * App.jsx 루트에서 이 이벤트를 수신해 안내 모달을 표시한다.
 *
 * WebView가 아니면 signInWithGoogle()을 그대로 호출한다.
 */
import { signInWithGoogle } from '../store/supabaseClient';
import { isWebView } from './webViewDetect';

export function guardedSignInWithGoogle() {
  if (isWebView()) {
    window.dispatchEvent(new CustomEvent('show-webview-modal'));
    return;
  }
  signInWithGoogle();
}
