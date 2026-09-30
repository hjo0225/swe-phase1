import { defineConfig } from 'vitest/config';

// 실제 Electron 앱(out/)을 띄우는 E2E. `pnpm test:e2e`가 먼저 빌드한다.
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
