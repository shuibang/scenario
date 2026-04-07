import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// import { VitePWA } from 'vite-plugin-pwa'  ← 정식 출시 때 활성화

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA는 베타 종료 후 활성화 예정
  ],
})
