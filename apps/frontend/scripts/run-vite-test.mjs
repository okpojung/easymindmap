#!/usr/bin/env node
// Vite 의 SSR 로더로 단위 시험 파일을 실행한다 (2026-09-15).
//
// tsx 는 `import.meta.env` 를 모른다 — `importMapFile` 처럼 모듈 사슬 어딘가에
// `import.meta.env.VITE_*` 를 읽는 파일(supabaseAuth 등)이 있으면 tsx 에서는
// 첫 줄에서 죽는다. Vite 로 불러오면 별칭(@/, @emm/)·env 가 앱과 같은 규칙으로
// 풀린다. 시험 파일은 실패하면 process.exit(1) 을 부르는 tsx 시험과 같은 꼴이다.
//   node scripts/run-vite-test.mjs src/utils/importMapFile.test.ts
import { createServer } from 'vite';
import path from 'node:path';

const file = process.argv[2];
if (!file) { console.error('사용법: node scripts/run-vite-test.mjs <시험 파일>'); process.exit(2); }
const server = await createServer({
  configFile: path.resolve('vite.config.ts'),
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
});
try {
  await server.ssrLoadModule('/' + path.relative(process.cwd(), path.resolve(file)).replace(/\\/g, '/'));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await server.close();
}
