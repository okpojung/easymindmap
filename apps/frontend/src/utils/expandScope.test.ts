// [모두 펼치기]·[모두 접기] 가 걸리는 범위 — `expandScope.ts` (2026-09-21).
//
//   npm run test:unit
//
// 왜 시험하나: 이 판정 하나가 **두 화면**(맵 툴바 · 아웃라인 머리말)의
// 같은 단추를 움직인다. 눈으로 확인하려면 큰 맵을 띄워 놓고 골랐다 풀었다
// 해야 하는데, 틀리기 쉬운 자리는 **중심을 골랐을 때**와 **여러 개를
// 골랐을 때**라 화면으로는 잘 드러나지 않는다.

import { expandScope } from './expandScope';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`);
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── ① 아무것도 안 골랐으면 전체 ──────────────────────────
check('① 선택이 없으면 전체', expandScope(null, []) === 'all');
check('① 빈 문자열도 선택이 아니다', expandScope('', []) === 'all');

// ── ② 노드를 고르면 그 하위만 ───────────────────────────
check('② 고른 노드 하나', eq(expandScope('n1', []), ['n1']),
  JSON.stringify(expandScope('n1', [])));
check('② 다중 선택이 하나뿐이어도 그 하나', eq(expandScope(null, ['n2']), ['n2']));
check('② ★ 다중 선택이 선택보다 우선한다', eq(expandScope('n1', ['n2']), ['n2']),
  JSON.stringify(expandScope('n1', ['n2'])));

// ── ③ ★ 중심을 고른 것은 전체와 같다 (사용자 결정) ───────
check('③ ★ 중심(root)을 고르면 전체', expandScope('root', []) === 'all');
check('③ ★ 둘째 중심을 고르면 전체',
  expandScope('c2', [], ['root', 'c2']) === 'all');
check('③ 중심 목록에 없는 id 는 보통 노드다',
  eq(expandScope('c2', [], ['root']), ['c2']));

// ── ④ 여러 개를 고르면 그 전부 ──────────────────────────
check('④ 여럿은 그대로', eq(expandScope(null, ['a', 'b', 'c']), ['a', 'b', 'c']));
check('④ ★ 여럿 중에 중심이 섞이면 전체다',
  expandScope(null, ['a', 'root', 'b']) === 'all',
  String(expandScope(null, ['a', 'root', 'b'])));
check('④ ★ 원본 배열을 건드리지 않는다', (() => {
  const src = ['a', 'b'];
  const out = expandScope(null, src) as string[];
  out.push('c');
  return src.length === 2;
})());

// ── ⑤ 중심이 여럿인 맵 ──────────────────────────────────
check('⑤ 중심 셋 중 하나만 골라도 전체',
  expandScope('c3', [], ['root', 'c2', 'c3']) === 'all');
check('⑤ 그 맵의 보통 노드는 그대로',
  eq(expandScope('n9', [], ['root', 'c2', 'c3']), ['n9']));

console.log(failed === 0 ? '\n전부 PASS' : `\n실패 ${failed}건`);
process.exit(failed ? 1 : 0);
