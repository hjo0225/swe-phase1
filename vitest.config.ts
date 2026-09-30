import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // CSS는 기본적으로 비워서 불러온다. PNG 폰트 내장이 ?raw로 읽는 Pretendard 조각 목록만 실제 내용으로 처리한다.
    css: { include: [/pretendardvariable-dynamic-subset\.css/] },
  },
});
