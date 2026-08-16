import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import path from 'node:path';

// 유료 UI — 있으면 그쪽, 없으면 코어의 스텁 (open-core-boundary.md §5).
// 번들러가 **빌드 시점에** 정하므로 별칭이 맞다. 유료판 빌드는 private
// 저장소가 이 경로에 자기 UI 를 놓고 빌드한다.
const PRO_UI = path.resolve(__dirname, '../../packages/pro-ui/src');
const proAlias = existsSync(PRO_UI) ? PRO_UI : path.resolve(__dirname, './src/pro/stub');

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // EMM 레퍼런스 파서 — 앱 밖 공용 패키지 소스를 직접 소비
      '@emm': path.resolve(__dirname, '../../packages/emm-parser/src'),
      // 유료 화면 모듈 — 없으면 스텁으로 간다(공개판의 정상 동작)
      '@pro': proAlias,
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
