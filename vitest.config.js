import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Edge Function 의 순수 로직(요청 검증·프롬프트 조립)은 함수 폴더에 그대로 두고
    // 여기서 같이 돌린다. Deno 전역을 쓰지 않는 파일만 대상이다.
    include: ['src/**/*.test.js', 'supabase/functions/**/*.test.ts'],
  },
});
