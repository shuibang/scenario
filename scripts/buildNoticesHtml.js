/**
 * src/data/announcements.js 단일 소스 → public/notice.html 자동 주입
 *
 * 단독 실행:  node scripts/buildNoticesHtml.js
 * Vite 통합:  vite.config.js의 noticesPlugin이 buildStart/configureServer에서 호출
 *
 * notice.html에 다음 두 마커 사이의 영역을 통째로 치환:
 *   <!-- ANNOUNCEMENTS_START -->
 *   <!-- ANNOUNCEMENTS_END -->
 *
 * 본문 변환 규칙:
 *   - HTML 특수문자 escape
 *   - \n\n   → 단락 분리(<p>)
 *   - \n     → 줄바꿈(<br>)
 *   - 풍부한 마크업(ul/ol/section-head 등)은 표현 안 함 — 단일 소스 우선, 모달과 동일한 plain 형식
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DATA_FILE   = path.resolve(ROOT, 'src/data/announcements.js');
const NOTICE_FILE = path.resolve(ROOT, 'public/notice.html');

const START = '<!-- ANNOUNCEMENTS_START -->';
const END   = '<!-- ANNOUNCEMENTS_END -->';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function contentToHtml(content) {
  // 단락 = 빈 줄(\n\n+) 기준. 단락 내 \n은 <br>.
  const paragraphs = String(content || '').split(/\n{2,}/);
  return paragraphs
    .filter(p => p.length > 0)
    .map(p => `        <p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function renderEntry(a, isFirst) {
  const hasBadge = !!a.badge;
  const open = a.open ?? isFirst;
  const urgentClass = hasBadge ? ' urgent' : '';
  const badgeHtml = hasBadge ? `<span class="urgent-badge">${escapeHtml(a.badge)}</span>` : '';
  return `  <div class="notice-entry${urgentClass}">
    <details${open ? ' open' : ''}>
      <summary>
        <div class="notice-meta">
          <div class="notice-date">${escapeHtml(a.date)}</div>
          <div class="notice-title">${escapeHtml(a.title)}</div>
        </div>
        ${badgeHtml}
        <span class="arrow">▶</span>
      </summary>
      <div class="notice-body">
${contentToHtml(a.content)}
      </div>
    </details>
  </div>`;
}

export async function buildNoticesHtml({ silent = false } = {}) {
  // 캐시 우회 — Vite plugin이 watcher로 재호출할 때 항상 최신 데이터 로드
  const dataUrl = `${pathToFileURL(DATA_FILE).href}?t=${Date.now()}`;
  const mod = await import(dataUrl);
  const announcements = mod.announcements;
  if (!Array.isArray(announcements)) {
    throw new Error(`[buildNoticesHtml] expected 'announcements' export to be an array, got ${typeof announcements}`);
  }

  // id 중복 검증 — 같은 id 두 항목이 있으면 배너 dismiss 로직(localStorage 키 = id)이
  // 한 항목 닫았는데 다른 항목도 함께 숨겨지는 사고가 발생함. 빌드 시 즉시 차단.
  const seen = new Map();
  for (let i = 0; i < announcements.length; i++) {
    const a = announcements[i];
    if (!a?.id) {
      throw new Error(`[buildNoticesHtml] announcements[${i}]에 id가 없습니다.`);
    }
    if (seen.has(a.id)) {
      throw new Error(
        `[buildNoticesHtml] 중복 id '${a.id}' 발견 — announcements[${seen.get(a.id)}] 와 [${i}]. ` +
        '모든 항목은 unique한 id가 필요합니다 (배너 dismiss 충돌 방지).'
      );
    }
    seen.set(a.id, i);
  }

  const html = readFileSync(NOTICE_FILE, 'utf8');
  const startIdx = html.indexOf(START);
  const endIdx = html.indexOf(END);
  if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) {
    throw new Error(`[buildNoticesHtml] '${START}' / '${END}' marker pair not found in public/notice.html`);
  }

  const before = html.slice(0, startIdx + START.length);
  const after  = html.slice(endIdx);

  const entries = announcements.map((a, i) => renderEntry(a, i === 0)).join('\n\n');
  const generated = `\n  <!-- 자동 생성됨 — src/data/announcements.js 수정 후 vite가 재생성 -->\n${entries}\n  `;
  const next = before + generated + after;

  if (next === html) {
    if (!silent) console.log('[buildNoticesHtml] no change — skipped');
    return;
  }
  writeFileSync(NOTICE_FILE, next, 'utf8');
  if (!silent) console.log(`[buildNoticesHtml] wrote ${announcements.length} entries → public/notice.html`);
}

// CLI 진입
const invokedDirectly = (() => {
  try { return import.meta.url === pathToFileURL(process.argv[1] || '').href; }
  catch { return false; }
})();
if (invokedDirectly) {
  buildNoticesHtml().catch(err => { console.error(err); process.exit(1); });
}
