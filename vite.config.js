import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildNoticesHtml } from './scripts/buildNoticesHtml.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildVersion = Date.now().toString();
// import { VitePWA } from 'vite-plugin-pwa'  ← 정식 출시 때 활성화

// src/data/announcements.js 단일 소스 → public/notice.html 자동 주입.
// dev: 시작 시 1회 + announcements.js 변경 감지 → 재생성
// prod: vite build의 buildStart 훅에서 1회 실행
function noticesPlugin() {
  const announcementsFile = path.resolve(__dirname, 'src/data/announcements.js');
  let isDev = false;
  return {
    name: 'build-notices',
    config(_, { command }) { isDev = command === 'serve'; },
    async buildStart() {
      try { await buildNoticesHtml({ silent: isDev }); }
      catch (e) { this.error(e); }
    },
    configureServer(server) {
      server.watcher.add(announcementsFile);
      server.watcher.on('change', async (file) => {
        if (path.resolve(file) !== announcementsFile) return;
        try { await buildNoticesHtml(); }
        catch (e) { console.error(e); }
      });
    },
  };
}

// 개발 서버와 빌드 결과물에서 동일한 버전 응답을 제공한다.
function versionPlugin(version) {
  const payload = JSON.stringify({ version });
  return {
    name: 'version-json',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/version.json')) return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(payload);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: payload,
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    versionPlugin(buildVersion),
    noticesPlugin(),
    // PWA는 베타 종료 후 활성화 예정
  ],
  define: {
    'import.meta.env.VITE_BUILD_VERSION': JSON.stringify(buildVersion),
  },
})
