/**
 * pdfViaServer — PDF export via Puppeteer server.
 *
 * Set VITE_PDF_SERVER_URL in .env to point at your PDF server.
 * Default: http://localhost:3001 (local dev)
 *
 * If the server is unreachable, falls back to browser print dialog.
 */

import { buildPrintHtml } from './buildPrintHtml';
import { buildPrintModel } from './PrintModel';

const SERVER_URL = (import.meta.env?.VITE_PDF_SERVER_URL || 'http://localhost:3001').replace(/\/$/, '');

console.log('[pdfViaServer] PDF 서버 URL:', SERVER_URL);

/**
 * exportPdf(appState, selections, { onStep })
 * Calls the Puppeteer server and downloads the resulting PDF.
 * Falls back to window.print() if the server is unavailable.
 */
export async function exportPdf(appState, selections, { onStep = () => {} } = {}) {
  const preset = appState?.stylePreset || {};

  onStep('HTML 생성');
  const html      = buildPrintHtml(appState, selections);
  const model     = buildPrintModel(appState, selections, preset);
  const filename  = `${model.projectTitle}.pdf`;
  const baseUrl   = window.location.origin;

  const endpoint = `${SERVER_URL}/pdf`;
  console.log('[pdfViaServer] fetch 요청 시작 →', endpoint, { filename, baseUrl });

  onStep('PDF 변환');
  let blob;
  try {
    const res = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ html, baseUrl, filename }),
    });
    console.log('[pdfViaServer] 응답 상태:', res.status, res.ok ? 'OK' : 'FAIL');
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      throw new Error(error || `서버 오류 (${res.status})`);
    }
    blob = await res.blob();
    console.log('[pdfViaServer] PDF blob 수신 완료, size:', blob.size, 'bytes');
  } catch (err) {
    // ── Fallback: browser print dialog ───────────────────────────────────────
    console.warn('[pdfViaServer] 서버 연결 실패 — 브라우저 인쇄 창으로 대체합니다.', err.message);
    const win = window.open('', '_blank');
    if (!win) throw new Error('팝업이 차단되었습니다. 팝업을 허용하거나 PDF 서버를 실행하세요.');
    win.document.write(html);
    win.document.close();
    win.focus();
    // 폰트 로드 후 인쇄 (짧은 지연)
    setTimeout(() => { win.print(); }, 500);
    return;
  }

  onStep('다운로드');
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * isPdfServerAvailable() → Promise<boolean>
 * Quick health-check (used to show UI hint).
 */
export async function isPdfServerAvailable() {
  try {
    const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
