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
})
