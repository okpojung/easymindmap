// 둘째 이후 중심의 자리(pos) — 루트 가운데가 정확히 (CX+dx, CY+dy) 에 온다
// (2026-10-02, e2e328 · Codex #609: 트리 계열은 루트를 원점에서 옮겨 놓아
// 클릭·드롭 지점과 어긋났다).
//   npx tsx src/layout/centerPos.test.ts
import { computeLayout } from '@/layout/LayoutEngine';
import type { SampleMap } from '@/editor/__samples__/types';

let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — 받음 ${JSON.stringify(got)}`}`);
};

const N = (id: string, children: { id: string; text: string; children: never[] }[] = []) =>
  ({ id, text: id, children } as never);
const mapWith = (pos: { dx: number; dy: number } | undefined, centerLayout?: string): SampleMap => ({
  title: 't',
  root: { id: 'root', text: 'R', colorKey: 'root' },
  branches: [
    { ...N('A', [N('A1'), N('A2')]), colorKey: 'l1A', side: 'right' },
    { ...N('B'), colorKey: 'l1B', side: 'left' },
  ],
  centers: [{
    root: { id: 'c2', text: 'C2', colorKey: 'root', side: 'center', ...(centerLayout ? { layoutType: centerLayout } : {}) },
    branches: [
      { ...N('X', [N('X1')]), colorKey: 'l1A', side: 'right' },
      { ...N('Y'), colorKey: 'l1B', side: 'left' },
    ],
    ...(pos ? { pos } : {}),
  }],
} as unknown as SampleMap);

const CX = 800, CY = 500;
const rootOf = (out: ReturnType<typeof computeLayout>, id: string) => {
  const n = out.find((x) => x.id === id);
  return n ? [Math.round(n.x), Math.round(n.y)] : null;
};

for (const lt of ['radial-bidirectional', 'tree-right', 'tree-down', 'hierarchy-right', 'process-tree-right']) {
  const out = computeLayout(mapWith({ dx: 250, dy: -120 }), lt as never, CX, CY);
  check(`① ${lt} — pos {250,-120} → 둘째 루트 가운데 = (CX+250, CY-120)`, rootOf(out, 'c2'), [CX + 250, CY - 120]);
}

// ② 중심마다 다른 레이아웃이어도 그 중심의 루트가 자리에
{
  const out = computeLayout(mapWith({ dx: -300, dy: 80 }, 'tree-right'), 'radial-bidirectional' as never, CX, CY);
  check('② 맵은 방사형·둘째 중심은 트리 — 둘째 루트 = (CX-300, CY+80)', rootOf(out, 'c2'), [CX - 300, CY + 80]);
}

// ③ pos 없으면 자동 배치 — 첫 중심 테두리 오른쪽, 루트 높이는 CY
{
  const out = computeLayout(mapWith(undefined), 'radial-bidirectional' as never, CX, CY);
  const first = out.filter((n) => !['c2', 'X', 'X1', 'Y'].includes(n.id));
  const maxRight = Math.max(...first.map((n) => n.x + n.w / 2));
  const second = out.filter((n) => ['c2', 'X', 'X1', 'Y'].includes(n.id));
  const minLeft = Math.min(...second.map((n) => n.x - n.w / 2));
  check('③ 자동 배치 — 둘째 중심 왼쪽 끝이 첫 중심 오른쪽 끝보다 오른쪽', minLeft > maxRight, true);
  check('③ 자동 배치 — 둘째 루트 높이 = CY', rootOf(out, 'c2')?.[1], CY);
}

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
