import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',       // 새 버전 배포 시 백그라운드에서 자동 갱신
      injectRegister: 'auto',

      manifest: {
        name: '대본 작업실',
        short_name: '작업실',
        description: '드라마 대본 작성 도구',
        theme_color: '#5a5af5',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },

      workbox: {
        // 빌드 결과물(JS·CSS·HTML·SVG)만 사전 캐시 — 대용량 폰트(TTF)는 런타임 캐시로
        globPatterns: ['**/*.{js,css,html,svg}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // JS 번들 최대 5MB 허용

        runtimeCaching: [
          // ── 외부 API: 항상 네트워크 (오프라인 시 실패해도 앱은 살아있음)
          {
            urlPattern: /^https:\/\/(.*\.supabase\.co|accounts\.google\.com|.*googleapis\.com|pagead2\.googlesyndication\.com|www\.googletagmanager\.com)/,
            handler: 'NetworkOnly',
          },
          // ── 앱 내비게이션 (index.html): 캐시 우선, 네트워크 업데이트
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'navigation-cache',
              networkTimeoutSeconds: 5,
            },
          },
          // ── 정적 자산(폰트·이미지 등): 캐시 우선, 장기 보관
          {
            urlPattern: /\.(?:woff2?|ttf|otf|png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
})
