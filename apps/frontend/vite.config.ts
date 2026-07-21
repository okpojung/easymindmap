import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // EMM 레퍼런스 파서 — 앱 밖 공용 패키지 소스를 직접 소비
      '@emm': path.resolve(__dirname, '../../packages/emm-parser/src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    fs: {
      // packages/emm-parser 소스를 dev 서버가 제공할 수 있게 저장소
      // 루트까지 허용
      allow: [path.resolve(__dirname, '../..')],
    },
  },
});
