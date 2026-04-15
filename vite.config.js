import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync } from 'fs'
// import { VitePWA } from 'vite-plugin-pwa'  ← 정식 출시 때 활성화

// 빌드 시 public/version.json에 타임스탬프 기반 버전 기록
function versionPlugin() {
  return {
    name: 'version-json',
    buildStart() {
      const version = Date.now().toString();
      writeFileSync('public/version.json', JSON.stringify({ version }));
    },
  };
}

const buildVersion = Date.now().toString();

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    versionPlugin(),
    // PWA는 베타 종료 후 활성화 예정
  ],
  define: {
    'import.meta.env.VITE_BUILD_VERSION': JSON.stringify(buildVersion),
  },
  build: {
    // 소스맵 완전 비활성화 (프로덕션 코드 노출 방지)
    sourcemap: false,
    // Terser 난독화
    minify: 'terser',
    terserOptions: {
      compress: {
        // console.log / debugger 구문 제거
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.info', 'console.warn', 'console.error', 'console.debug'],
        passes: 2,
      },
      mangle: {
        // 변수명·함수명 난독화
        toplevel: true,
        // _로 시작하는 내부 프로퍼티명만 난독화 (외부 API·React prop 안전 보호)
        properties: {
          regex: /^_/,
        },
      },
      format: {
        // 주석 전체 제거
        comments: false,
      },
    },
  },
})
