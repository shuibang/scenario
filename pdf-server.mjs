/**
 * pdf-server.mjs — Puppeteer PDF generation server
 *
 * Install deps (별도로 한 번만):
 *   npm install puppeteer express cors
 *
 * Run:
 *   node pdf-server.mjs
 *
 * Listens on PORT env var (default 3001).
 * The frontend reads VITE_PDF_SERVER_URL (default http://localhost:3001).
 *
 * Endpoint:
 *   POST /pdf
 *   Body: { html: string, baseUrl?: string, filename?: string }
 *   Response: application/pdf
 */

import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let puppeteer, express, cors;
try {
  puppeteer = (await import('puppeteer')).default;
  express   = (await import('express')).default;
  cors      = (await import('cors')).default;
} catch {
  console.error('[pdf-server] 필수 패키지가 없습니다. 아래 명령을 실행하세요:');
  console.error('  npm install puppeteer express cors');
  process.exit(1);
}

const PORT = process.env.PORT || 3001;

// ─── Puppeteer browser (재사용) ────────────────────────────────────────────────
let _browser = null;
async function getBrowser() {
  if (!_browser || !_browser.connected) {
    _browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
  }
  return _browser;
}

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();

app.use(cors());                               // 모든 origin 허용 (로컬 개발용)
app.use(express.json({ limit: '20mb' }));      // HTML payload 최대 20MB

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/pdf', async (req, res) => {
  const { html, baseUrl, filename = '대본.pdf' } = req.body || {};

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'html 필드가 필요합니다' });
  }

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'networkidle0',
      // baseUrl을 지정하면 /fonts/... 같은 상대 경로 리소스를 로드할 수 있음
      ...(baseUrl ? { url: baseUrl } : {}),
    });

    const pdfBuffer = await page.pdf({
      format:          'A4',
      printBackground: true,
      preferCSSPageSize: true,  // @page CSS 우선 적용
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[pdf-server] PDF 생성 실패:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[pdf-server] PDF 서버 실행 중: http://localhost:${PORT}`);
  console.log(`[pdf-server] 헬스체크: http://localhost:${PORT}/health`);
});

// 종료 시 브라우저 정리
process.on('SIGINT',  async () => { await _browser?.close(); process.exit(0); });
process.on('SIGTERM', async () => { await _browser?.close(); process.exit(0); });
