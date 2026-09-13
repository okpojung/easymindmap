import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * 홈페이지(`www.easymindmap.org`) — 앱과 **다른 앱**이다 (27a §0.5).
 *
 * ★ **번들을 `/site-assets/` 아래에 둔다.** 같은 도메인에서 `/p/{id}` 를
 *   기존 앱으로 프록시하는데(§0.4 ⑵, B안), 그 앱의 번들은 `/assets/` 를
 *   쓴다. 둘 다 `/assets/` 면 한쪽이 다른 쪽을 가린다 — 나눠 둬야 한
 *   도메인 안에서 두 앱이 섞여 살 수 있다.
 */
export default defineConfig({
  base: '/site-assets/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: { assetsDir: '.' },
  server: { port: 5174, host: true },
});
