// 산출물 마무리 — tsc 가 하지 않는 두 가지 (2026-08-18).
//
// ① dist/cjs 를 **CommonJS 로 못 박는다.**
//    이 패키지는 `"type": "module"` 이라 그 아래 `.js` 는 전부 ESM 으로
//    해석된다. tsc 가 CJS 로 뽑아 놔도 Node 는 ESM 으로 읽고
//    `exports is not defined` 로 죽는다. 폴더에 package.json 한 장을 놓아
//    **그 폴더만** CJS 라고 알린다 — Node 가 정한 방법이다.
//
// ② ESM 산출물의 상대 경로에 **`.js` 를 붙인다.**
//    tsc 는 `from './model'` 을 그대로 남기는데, Node 의 ESM 해석은
//    **확장자를 요구한다**(`ERR_MODULE_NOT_FOUND`). 번들러는 알아서
//    붙여 주기 때문에 vite 로만 쓰던 동안에는 드러나지 않았다.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');

// ①
const cjs = join(dist, 'cjs');
mkdirSync(cjs, { recursive: true });
writeFileSync(join(cjs, 'package.json'), `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);

// ②
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
let fixed = 0;
for (const file of walk(join(dist, 'esm')).filter((f) => f.endsWith('.js'))) {
  const before = readFileSync(file, 'utf8');
  // `from './x'` · `import('./x')` 만 건드린다. 이미 확장자가 있으면 둔다.
  const after = before.replace(
    /(from\s+|import\()(['"])(\.\.?\/[^'"]*?)(['"])/g,
    (m, kw, q1, spec, q2) => (/\.[a-z]+$/i.test(spec) ? m : `${kw}${q1}${spec}.js${q2}`),
  );
  if (after !== before) { writeFileSync(file, after); fixed += 1; }
}
console.log(`산출물 마무리 — dist/cjs 를 CJS 로 표시, ESM 상대경로 ${fixed}개 파일에 .js 추가`);
