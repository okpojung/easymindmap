#!/usr/bin/env node
// EMM 파서 원본을 apps/api/src/emm/ 로 복사한다 (그리고 --check 로 어긋남을 잡는다).
//
// ── 왜 복사하는가 (2026-09-04) ────────────────────────────────────
// MCP 의 `create_map` 은 **EMM 마크다운을 받아 맵으로 바꾼다.** 그 변환의
// 단일 원본은 `packages/emm-parser` 다 — 프런트엔드는 vite 별칭('@emm')
// 으로 그 **소스**를 그대로 컴파일해 쓴다.
//
// API 는 그 길을 쓸 수 없다. 두 가지 때문이다.
//   ① 배포가 **Nixpacks + Base Directory `apps/api`** 다
//      (dev-server-coolify.md §5.2). `packages/` 는 빌드 컨텍스트 **밖**
//      이라, 상대경로 별칭이든 `file:` 의존이든 빌드가 깨진다. 프런트가
//      Dockerfile + 루트 컨텍스트로 옮겨 간 이유가 바로 이것이다(§5.3).
//   ② `@easymindmap/emm-parser` 는 **아직 레지스트리에 없다**
//      (npmjs.org 404 — test-catalog.md e2e172). 그래서 npm 으로도 못 끌어온다.
//
// 그래서 **소스를 복사해 커밋한다.** 복사본은 두 벌이 되는 순간 어긋나므로,
// CI 가 `--check` 로 **원본과 한 글자라도 다르면 실패**시킨다
// (.github/workflows/ci.yml). 즉 두 벌이지만 갈라질 수 없다.
//
// ① 이 풀리면(= API 도 루트 컨텍스트 Dockerfile 로 옮기면) 이 스크립트와
// src/emm/ 을 지우고 별칭 하나로 되돌린다.
//
//   사용:  node scripts/sync-emm-parser.mjs           # 복사
//          node scripts/sync-emm-parser.mjs --check   # 어긋나면 exit 1

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', '..', 'packages', 'emm-parser', 'src');
const DEST = join(here, '..', 'src', 'emm');

// 의존 닫힘 — parseMarkdownToMap: parse.ts → { model, frontMatter, setext }
// (1단계 create_map), serializeEmm: serialize.ts → { meta → note-images }
// (2단계 get_map). 이 일곱 말고는 아무것도 필요 없다(런타임 의존도 없다).
const FILES = ['model.ts', 'frontMatter.ts', 'setext.ts', 'parse.ts', 'note-images.ts', 'meta.ts', 'serialize.ts'];

const BANNER = (name) =>
  `// ⚠️ 자동 복사본 — 직접 고치지 마세요.\n` +
  `// 원본: packages/emm-parser/src/${name}\n` +
  `// 갱신: cd apps/api && npm run sync:emm  (CI 가 어긋남을 검사한다)\n` +
  `// 왜 복사하는지는 apps/api/scripts/sync-emm-parser.mjs 머리말 참조.\n\n`;

const check = process.argv.includes('--check');

if (!existsSync(SRC)) {
  // 배포 컨텍스트(apps/api 만 있는 곳)에서는 원본이 없다 — 정상이다.
  // 복사본은 커밋돼 있으므로 빌드는 그대로 된다.
  console.log('원본(packages/emm-parser)이 없습니다 — 건너뜁니다. (배포 컨텍스트에서는 정상)');
  process.exit(0);
}
mkdirSync(DEST, { recursive: true });

let drift = 0;
for (const name of FILES) {
  const want = BANNER(name) + readFileSync(join(SRC, name), 'utf8');
  const path = join(DEST, name);
  const have = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (have === want) continue;
  if (check) {
    console.error(`✗ ${name} 이 원본과 다릅니다.`);
    drift++;
  } else {
    writeFileSync(path, want);
    console.log(`↻ ${name}`);
  }
}

if (check && drift) {
  console.error(
    `\napps/api/src/emm/ 이 packages/emm-parser/src/ 와 어긋났습니다 (${drift}개).\n` +
    `  고치는 법:  cd apps/api && npm run sync:emm   → 결과를 커밋\n` +
    `  ⚠️ src/emm/ 을 직접 고치지 마세요 — 원본은 packages/emm-parser 입니다.`,
  );
  process.exit(1);
}
console.log(check ? '✓ 복사본이 원본과 같습니다.' : '완료.');
