import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// main/preload 의존성은 기본으로 외부화된다(externalizeDeps: true) → better-sqlite3는 번들되지 않는다.
export default defineConfig({
  main: {},
  preload: {},
  renderer: { plugins: [react()] },
});
