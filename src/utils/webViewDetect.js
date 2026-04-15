/**
 * WebView 환경 감지
 * 카카오톡·인스타그램·네이버·라인 등 인앱 브라우저에서는
 * Google OAuth 팝업/리디렉트가 차단되므로 사전에 감지한다.
 */
const WEBVIEW_RE = /KAKAOTALK|Instagram|NAVER|Line|FB_IAB|FB_AN|WebView|MicroMessenger/i;
const WV_TOKEN_RE = /\bwv\b/; // Android WebView 토큰 (예: "; wv)")

export function isWebView() {
  const ua = navigator.userAgent;
  return WEBVIEW_RE.test(ua) || WV_TOKEN_RE.test(ua);
}
