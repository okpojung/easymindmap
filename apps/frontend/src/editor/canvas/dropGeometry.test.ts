// dropGeometry 단위 테스트 — 레이아웃마다 네 존이 실제 배치를 따르는가 (2026-09-08).
//
//   npx tsx src/editor/canvas/dropGeometry.test.ts

import { zoneAxesFor, zoneAt, type GeoNode } from './dropGeometry';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${JSON.stringify(got)}\n      기대 ${JSON.stringify(want)}`}`);
}
const N = (id: string, x: number, y: number, parent: string | null, depth: number, side?: string, w = 120, h = 36): GeoNode =>
  ({ id, x, y, w, h, parent, depth, side });
const four = (t: GeoNode, nodes: GeoNode[], effOf: (id: string) => string) => {
  const ax = zoneAxesFor(t, nodes, effOf);
  const at = (dx: number, dy: number) => zoneAt(t, ax, t.x + dx, t.y + dy);
  return { L: at(-80, 0), R: at(80, 0), U: at(0, -40), D: at(0, 40), inside: at(10, 5) };
};

// ── ① 방사형 오른쪽 가지 — 형제 세로, 자식 오른쪽, 부모 왼쪽 ──
{
  const nodes = [N('root', 0, 0, null, 0, 'center'), N('a', 200, -60, 'root', 1, 'right'), N('b', 200, 60, 'root', 1, 'right'), N('a1', 400, -60, 'a', 2, 'right')];
  const eff = () => 'radial-right';
  check('① 방사형 오른쪽: 왼=상위 오른=하위 위=이전 아래=다음', four(nodes[2], nodes, eff), { L: 'parent', R: 'child', U: 'before', D: 'after', inside: 'child' });
  check('① 자식 없는 잎도 같다', four(nodes[1], nodes, eff).R, 'child');
}
// ── ② 방사형 왼쪽 가지 — 자식 왼쪽, 부모 오른쪽 ──
{
  const nodes = [N('root', 0, 0, null, 0, 'center'), N('a', -200, -60, 'root', 1, 'left'), N('b', -200, 60, 'root', 1, 'left'), N('a1', -400, -60, 'a', 2, 'left')];
  const eff = () => 'radial-bidirectional';
  check('② 방사형 왼쪽: 오른=상위 왼=하위', four(nodes[1], nodes, eff), { L: 'child', R: 'parent', U: 'before', D: 'after', inside: 'child' });
}
// ── ③ 트리 아래 — 형제 가로, 자식 아래, 부모 위 ──
{
  const nodes = [N('root', 0, 0, null, 0, 'down'), N('a', -100, 100, 'root', 1), N('b', 100, 100, 'root', 1), N('b1', 100, 200, 'b', 2)];
  const eff = () => 'tree-down';
  check('③ 트리 아래: 위=상위 아래=하위 왼=이전 오른=다음', four(nodes[2], nodes, eff), { L: 'before', R: 'after', U: 'parent', D: 'child', inside: 'child' });
}
// ── ④ 진행트리 — 자식이 아래 줄에 가로로 ──
{
  const nodes = [N('root', 0, 0, null, 0, 'down'), N('a', 60, 100, 'root', 1), N('a1', 90, 200, 'a', 2), N('a2', 230, 200, 'a', 2)];
  const eff = () => 'process-tree-right';
  check('④ 진행트리 2단: 왼=이전 오른=다음 위=상위 아래=하위', four(nodes[2], nodes, eff), { L: 'before', R: 'after', U: 'parent', D: 'child', inside: 'child' });
}
// ── ⑤ 계층형 — 자식 오른쪽, 형제 세로 ──
{
  const nodes = [N('root', 0, 0, null, 0), N('a', 200, -40, 'root', 1), N('b', 200, 40, 'root', 1), N('a1', 400, -40, 'a', 2)];
  const eff = () => 'hierarchy-right';
  check('⑤ 계층형: 왼=상위 오른=하위 위=이전 아래=다음', four(nodes[1], nodes, eff), { L: 'parent', R: 'child', U: 'before', D: 'after', inside: 'child' });
}
// ── ⑥ 개요형(트리 오른쪽) — 자식도 아래(들여쓰기), 형제도 아래 → 부모/자식은 좌/우 ──
{
  const nodes = [N('root', 100, 0, null, 0), N('a', 130, 80, 'root', 1), N('a1', 160, 140, 'a', 2), N('a2', 160, 200, 'a', 2), N('a1x', 190, 260, 'a2', 3)];
  const eff = () => 'tree-right';
  check('⑥ 개요형 형제 있음: 위=이전 아래=다음 왼=상위 오른=하위', four(nodes[2], nodes, eff), { L: 'parent', R: 'child', U: 'before', D: 'after', inside: 'child' });
  check('⑥ 개요형 외동(1단): 형제 축 관례 세로 → 왼=상위 오른=하위', four(nodes[1], nodes, eff), { L: 'parent', R: 'child', U: 'before', D: 'after', inside: 'child' });
}
// ── ⑦ 사용자 맵: 트리 오른쪽 안에 진행트리 줄 — 2단 형제 가로, 그 아래 개요 ──
{
  const nodes = [
    N('root', 600, 270, null, 0), N('p', 640, 340, 'root', 1),
    N('m1', 640, 420, 'p', 2), N('m2', 795, 420, 'p', 2), N('m3', 1160, 420, 'p', 2),
    N('m3a', 1205, 480, 'm3', 3), N('m3b', 1205, 535, 'm3', 3), N('m3c', 1205, 590, 'm3', 3),
    N('m2a', 880, 490, 'm2', 3),
  ];
  const eff = (id: string) => (id === 'p' ? 'process-tree-right' : 'tree-right');
  check('⑦ 목차(정): 왼=이전 오른=다음 위=상위 아래=하위', four(nodes[4], nodes, eff), { L: 'before', R: 'after', U: 'parent', D: 'child', inside: 'child' });
  check('⑦ 목차(정)의 자식(개요): 위=이전 아래=다음 왼=상위 오른=하위', four(nodes[6], nodes, eff), { L: 'parent', R: 'child', U: 'before', D: 'after', inside: 'child' });
  check('⑦ 목차(김)의 외동 자식: 부모(위-왼쪽)로 부모 축은 왼쪽', four(nodes[8], nodes, eff), { L: 'parent', R: 'child', U: 'before', D: 'after', inside: 'child' });
}
// ── ⑧ 시간배치 — 축(1단) 가로, 위 스택은 위로 자란다 ──
{
  const nodes = [N('root', 0, 0, null, 0), N('a', -150, -60, 'root', 1, 'up'), N('b', 150, 60, 'root', 1, 'down'), N('a1', -140, -120, 'a', 2, 'up'), N('a2', -140, -170, 'a', 2, 'up')];
  const eff = () => 'timeline';
  check('⑧ 시간배치 위 스택: 자식 위, 부모 아래, 형제 가로', four(nodes[1], nodes, eff), { L: 'before', R: 'after', U: 'child', D: 'parent', inside: 'child' });
  check('⑧ 위 스택 항목: 형제 세로, 축 쪽(아래)이 이전', four(nodes[4], nodes, eff), { L: 'parent', R: 'child', U: 'after', D: 'before', inside: 'child' });
}
// ── ⑨ 루트는 어디든 하위 · 가장 많이 벗어난 변 하나만 ──
{
  const nodes = [N('root', 0, 0, null, 0, 'center', 200, 60), N('a', 250, 0, 'root', 1, 'right')];
  const ax = zoneAxesFor(nodes[0], nodes, () => 'radial-right');
  check('⑨ 루트', [zoneAt(nodes[0], ax, -150, 0), zoneAt(nodes[0], ax, 0, -60)], ['child', 'child']);
  const bx = zoneAxesFor(nodes[1], nodes, () => 'radial-right');
  check('⑨ 모서리 근처는 더 벗어난 변 하나', [zoneAt(nodes[1], bx, 250 + 61, 25), zoneAt(nodes[1], bx, 250 + 70, 10)], ['after', 'child']);
}
console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
