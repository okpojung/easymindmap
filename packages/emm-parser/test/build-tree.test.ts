// buildTreeFromFlat 단위 테스트 (2026-08-20).
//
// conformance/ 는 **EMM 파싱 코퍼스**다 — 여기 끼워 넣지 않는다.
// 이 테스트가 지키는 것은 **트리 모양 규칙**이고, 가장 중요한 한 줄은
// "아무것도 버리지 않는다" 이다.

import { buildTreeFromFlat, type FlatNode } from '../src/build-tree';
import type { MindNode } from '../src/model';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

const n = (id: string, parentId: string | null, order: number): FlatNode =>
  ({ id, parentId, order, node: { id, text: id } });

/** 트리를 훑어 id 를 모은다 — 개수 비교용 (반복문, 재귀 아님) */
function collect(map: { branches: MindNode[] }): string[] {
  const out: string[] = [];
  const q: MindNode[] = [...map.branches];
  while (q.length) {
    const x = q.shift() as MindNode;
    out.push(x.id);
    for (const c of x.children ?? []) q.push(c);
  }
  return out.sort();
}
const ids = (fs: FlatNode[]) => fs.map((f) => f.id).sort();

const ROOT = { id: 'root', text: '뿌리' } as Omit<MindNode, 'children'>;

// ── ① 정상 목록 → 중첩 트리, order 가 지켜진다 ──────────────────────
{
  const flat = [n('b', null, 2), n('a', null, 1), n('a2', 'a', 2), n('a1', 'a', 1)];
  const r = buildTreeFromFlat(flat, 'T', ROOT);
  check('① 최상위가 order 순', r.map.branches.map((x) => x.id), ['a', 'b']);
  check('① 자식도 order 순', (r.map.branches[0].children ?? []).map((x) => x.id), ['a1', 'a2']);
  check('① 올린 것 없음', r.raisedToRoot, []);
  check('① 노드 수 보존', collect(r.map), ids(flat));
}

// ── ② 부모가 목록에 없다 → 뿌리로 올라간다 ─────────────────────────
{
  const flat = [n('a', null, 1), n('x', '없는부모', 1)];
  const r = buildTreeFromFlat(flat, 'T', ROOT);
  check('② 뿌리로 올라감', r.map.branches.map((x) => x.id).sort(), ['a', 'x']);
  check('② raisedToRoot 에 담김', r.raisedToRoot, ['x']);
  check('② 노드 수 보존', collect(r.map), ids(flat));
}

// ── ③ 서로를 부모로 삼는다(A→B→A) → 둘 다 뿌리에 닿게, 무한루프 없음 ─
{
  const flat = [n('A', 'B', 1), n('B', 'A', 1)];
  const r = buildTreeFromFlat(flat, 'T', ROOT);
  check('③ 노드 수 보존(둘 다 살아 있다)', collect(r.map), ['A', 'B']);
  check('③ 끊는 자리는 정해진 규칙(작은 id)', r.raisedToRoot, ['A']);
  check('③ A 는 최상위', r.map.branches.map((x) => x.id), ['A']);
  check('③ B 는 A 아래', (r.map.branches[0].children ?? []).map((x) => x.id), ['B']);
}

// ── ④ 고아에게 자손이 있으면 딸려 올라간다 (자손은 raisedToRoot 에 없다) ─
{
  const flat = [n('p', '사라진것', 1), n('c', 'p', 1), n('g', 'c', 1)];
  const r = buildTreeFromFlat(flat, 'T', ROOT);
  check('④ 올린 것은 맨 위 하나뿐', r.raisedToRoot, ['p']);
  check('④ 최상위는 p 하나', r.map.branches.map((x) => x.id), ['p']);
  check('④ 가지가 그대로', (r.map.branches[0].children ?? []).map((x) => x.id), ['c']);
  check('④ 손자까지 그대로',
    ((r.map.branches[0].children ?? [])[0].children ?? []).map((x) => x.id), ['g']);
  check('④ 노드 수 보존', collect(r.map), ids(flat));
}

// ── ⑤ 뿌리 직속(parentId=null)을 고아로 오판하지 않는다 ────────────
{
  const flat = [n('a', null, 1), n('b', null, 2), n('c', null, 3)];
  const r = buildTreeFromFlat(flat, 'T', ROOT);
  check('⑤ 아무것도 올리지 않는다', r.raisedToRoot, []);
  check('⑤ 셋 다 최상위', r.map.branches.map((x) => x.id), ['a', 'b', 'c']);
}

// ── ⑥ 긴 사슬 — 재귀였다면 스택이 터진다 ───────────────────────────
{
  const flat: FlatNode[] = [];
  for (let i = 0; i < 20000; i++) flat.push(n(`d${i}`, i === 0 ? null : `d${i - 1}`, 1));
  const r = buildTreeFromFlat(flat, 'T', ROOT);
  check('⑥ 2만 단계 사슬도 짜진다(노드 수)', collect(r.map).length, flat.length);
  check('⑥ 올린 것 없음', r.raisedToRoot, []);
}

// ── ⑦ 뿌리 id 가 목록에 섞여 들어와도 무시한다 ─────────────────────
{
  const flat = [n('root', null, 0), n('a', null, 1)];
  const r = buildTreeFromFlat(flat, 'T', ROOT);
  check('⑦ 뿌리는 가지가 되지 않는다', r.map.branches.map((x) => x.id), ['a']);
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
