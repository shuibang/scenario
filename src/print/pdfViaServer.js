/**
 * pdfViaServer — PDF export via Puppeteer server.
 *
 * Set VITE_PDF_SERVER_URL in .env to point at your PDF server.
 * Default: http://localhost:3001 (local dev)
 *
 * Fallback (서버 없을 때):
 *   hidden iframe으로 현재 페이지에서 바로 window.print() 실행.
 *   새 창 없음 → 팝업 차단 없음.
 *   iframe이 현재 origin에 삽입되므로 /fonts/... 폰트도 정상 로드.
 */

import { buildPrintHtml } from './buildPrintHtml';
import { buildPrintModel } from './PrintModel';

const SERVER_URL = (import.meta.env?.VITE_PDF_SERVER_URL || 'http://localhost:3001').replace(/\/$/, '');

// ─── Hidden iframe 인쇄 ───────────────────────────────────────────────────────
// 팝업 없이 현재 페이지에서 인쇄 다이얼로그 실행.
// iframe은 현재 origin 내에 삽입되므로 폰트 등 상대 경로 리소스 정상 로드.
function printViaIframe(html) {
  return new Promise(resolve => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:1px;height:1px;border:none;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    const doPrint = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      // 인쇄 다이얼로그가 닫힌 뒤 iframe 제거 (afterprint 이벤트 or 타임아웃)
      const cleanup = () => {
        document.body.removeChild(iframe);
        resolve();
      };
      iframe.contentWindow.addEventListener('afterprint', cleanup, { once: true });
      setTimeout(cleanup, 60_000); // 최대 1분 후 강제 정리
    };

    // readyState가 이미 complete이면 바로, 아니면 onload 대기 후 실행
    if (doc.readyState === 'complete') {
      // 폰트 로드 대기 (짧은 지연)
      setTimeout(doPrint, 300);
    } else {
      iframe.onload = () => setTimeout(doPrint, 300);
      // onload가 발화하지 않는 경우 안전 폴백
      setTimeout(doPrint, 1000);
    }
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * exportPdf(appState, selections, { onStep })
 * 1순위: Puppeteer 서버 → PDF 다운로드
 * 폴백:  hidden iframe → window.print() (팝업 없음)
 */
export async function exportPdf(appState, selections, { onStep = () => {} } = {}) {
  const preset = appState?.stylePreset || {};

  onStep('HTML 생성');
  const html     = buildPrintHtml(appState, selections);
  const model    = buildPrintModel(appState, selections, preset);
  const filename = `${model.projectTitle}.pdf`;
  const baseUrl  = window.location.origin;

  const endpoint = `${SERVER_URL}/pdf`;

  onStep('PDF 변환');
  try {
    const res = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ html, baseUrl, filename }),
      signal:  AbortSignal.timeout(30_000), // 30초 타임아웃
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      throw new Error(error || `서버 오류 (${res.status})`);
    }
    const blob = await res.blob();

    onStep('다운로드');
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

  } catch (err) {
    // ── Fallback: hidden iframe 인쇄 (팝업 없음) ─────────────────────────────
    console.warn('[pdfViaServer] 서버 연결 실패 — iframe 인쇄로 대체합니다.', err.message);
    onStep('인쇄 준비');
    await printViaIframe(html);
  }
}

/**
 * isPdfServerAvailable() → Promise<boolean>
 * Quick health-check.
 */
export async function isPdfServerAvailable() {
  try {
    const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
