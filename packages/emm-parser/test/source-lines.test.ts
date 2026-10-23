// sourceLines 옵션 (2026-10-23) — 노드마다 원문 줄 번호(_srcLine)를 남긴다.
//
// Obsidian 플러그인(설계 docs/04-extensions/integrations/30-obsidian-integration.md §6.5)이
// 맵에서 고친 것을 원문의 '바뀐 줄'에만 쓰려면 노드가 몇째 줄인지 알아야 한다.
// ① 옵션을 켜지 않으면 출력이 예전과 한 글자도 다르지 않다 (웹앱·MCP·API 그대로).
// ② 켜면 견출·목록 항목·두 번째 중심·목록만 있는 문서의 첫 항목에 줄 번호가 붙는다.
//    줄 번호는 머리말(front matter)을 걷어낸 본문 기준 0부터다.

import { parseEmm } from '../src/parse';
import type { MindNode, SampleMap } from '../src/model';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

type L = MindNode & { _srcLine?: number };
const walk = (m: SampleMap): [string, number | undefined][] => {
  const out: [string, number | undefined][] = [];
  const go = (n: L) => { out.push([n.text, n._srcLine]); (n.children ?? []).forEach((c) => go(c as L)); };
  const centers = [{ root: m.root, branches: m.branches }, ...(m.centers ?? [])];
  for (const c of centers) { out.push([c.root.text, (c.root as L)._srcLine]); c.branches.forEach((b) => go(b as L)); }
  return out;
};
// id 는 시각으로 만들어져 매번 달라진다 — 비교에서 뺀다
const strip = (m: SampleMap | null): string => JSON.stringify(m, (k, v) => (k === 'id' ? undefined : v));

const MD = '# 프로젝트\n\n## 1단계\n- 요구사항\n- 경쟁사\n  - 비교\n\n## 2단계\n- 화면\n';

// ── ① 옵션 없음 = 예전과 같다 ──────────────────────────────────────────
check('① 옵션 없음 — _srcLine 이 없다', strip(parseEmm(MD)).includes('_srcLine'), false);
check('① 옵션 없음과 false 는 같다', strip(parseEmm(MD, 'mindmap', { sourceLines: false })), strip(parseEmm(MD)));

// ── ② 켜면 줄 번호 ─────────────────────────────────────────────────────
check('② 견출·목록 줄 번호', walk(parseEmm(MD, 'mindmap', { sourceLines: true })!), [
  ['프로젝트', 0], ['1단계', 2], ['요구사항', 3], ['경쟁사', 4], ['비교', 5], ['2단계', 7], ['화면', 8],
]);
check('② 켜도 노드 글자·구조는 같다',
  walk(parseEmm(MD, 'mindmap', { sourceLines: true })!).map(([t]) => t),
  walk(parseEmm(MD)!).map(([t]) => t));

const FM = '---\ntags: [x]\n---\n\n# 루트\n- 가지\n';
check('② 머리말을 걷은 본문 기준', walk(parseEmm(FM, 'mindmap', { sourceLines: true })!), [['루트', 0], ['가지', 1]]);

const TWO = '# 첫 중심\n- a\n\n# 둘째 중심\n- b\n';
check('② 두 번째 중심', walk(parseEmm(TWO, 'mindmap', { sourceLines: true })!), [['첫 중심', 0], ['a', 1], ['둘째 중심', 3], ['b', 4]]);

const LIST = '- 사과\n  - 빨강\n- 바나나\n';
check('② 목록만 있는 문서', walk(parseEmm(LIST, 'mindmap', { sourceLines: true })!), [['사과', 0], ['빨강', 1], ['바나나', 2]]);

const NOTE = '# r\n\n## A\n본문 문단\n\n```js\nx\n```\n- 항목\n';
check('② 문단 노드는 문단이 시작한 줄, 코드 뒤 항목', walk(parseEmm(NOTE, 'mindmap', { sourceLines: true })!), [['r', 0], ['A', 2], ['본문 문단', 3], ['항목', 8]]);

if (failed) {
  console.log(`\n${failed} FAIL`);
  process.exit(1);
}
console.log('\nsource-lines: all PASS');
