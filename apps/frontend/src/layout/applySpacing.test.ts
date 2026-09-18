// 간격 배율 × 윗변 정렬 행 — 단위 테스트 (2026-09-18).
//
// 진행트리·트리아래는 자식 행을 윗변 기준으로 나란히 놓는다. 세로 간격
// 배율이 노드의 **중심점**을 늘리면 높이가 다른 형제의 윗변이 제각각
// 벌어져, 부모에서 내려오는 가로 줄기가 높이 종류만큼 여러 줄로 갈라졌다
// (사용자 보고: 세로 115% 진행트리에서 중심의 연결선이 6줄). 형제를 세로로
// 쌓는 배치(트리·오른쪽 등)는 예전처럼 중심점을 늘린다.
//
//   npx tsx src/layout/applySpacing.test.ts

import { computeLayout } from './LayoutEngine';
import type { LayoutType, MindNode, SampleMap } from '@/editor/__samples__/types';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

const LONG = Array.from({ length: 12 }, (_, i) => `줄 ${i + 1} 긴 본문 글자`).join('\n');
const N = (id: string, text: string, children: MindNode[] = [], layoutType?: LayoutType): MindNode =>
  ({ id, text, children, ...(layoutType ? { layoutType } : {}) });

// 높이가 서로 다른 1레벨 가지 넷 (짧은 것 · 두 줄 · 긴 것) — 둘째는 자식 있음
function sample(l1Layout?: LayoutType): SampleMap {
  return {
    title: 't',
    root: { id: 'root', text: '중심', colorKey: 'root', side: 'center' },
    branches: [
      { ...N('A', '짧은 가지', [], l1Layout), colorKey: 'l1A', side: 'right' },
      { ...N('B', '두 줄로 되는 조금 더 긴 제목의 가지 제목', [N('B1', '자식 하나'), N('B2', LONG)], l1Layout), colorKey: 'l1B', side: 'right' },
      { ...N('C', LONG, [], l1Layout), colorKey: 'l1C', side: 'right' },
      { ...N('D', '짧은 가지 둘', [], l1Layout), colorKey: 'l1D', side: 'right' },
    ],
  };
}

const uniq = (xs: number[]) => [...new Set(xs.map((v) => Math.round(v * 100) / 100))];

function l1(out: ReturnType<typeof computeLayout>) {
  return out.filter((n) => n.parent === 'root');
}

console.log('── 진행트리: 세로 배율을 걸어도 1레벨 윗변은 하나');
for (const y of [1, 1.15, 2, 0.9]) {
  const out = computeLayout(sample(), 'process-tree-right', 1000, 500, { x: 1.1, y });
  const tops = uniq(l1(out).map((n) => n.y - n.h / 2));
  check(`세로 ${Math.round(y * 100)}% — 1레벨 윗변 종류 1 (높이 종류 ${uniq(l1(out).map((n) => n.h)).length}개)`, tops.length, 1);
  const root = out.find((n) => n.id === 'root')!;
  const mids = uniq(l1(out).map((n) => (root.y + root.h / 2 + n.y - n.h / 2) / 2));
  check(`세로 ${Math.round(y * 100)}% — 중심→1레벨 줄기 높이 종류 1`, mids.length, 1);
}
{
  // 배율이 커지면 행이 실제로 내려간다 (배율이 무시되는 것이 아니다)
  const a = l1(computeLayout(sample(), 'process-tree-right', 1000, 500, { x: 1, y: 1 }))[0];
  const b = l1(computeLayout(sample(), 'process-tree-right', 1000, 500, { x: 1, y: 1.5 }))[0];
  check('세로 150% 는 100% 보다 행이 아래', b.y - b.h / 2 > a.y - a.h / 2, true);
  // 루트는 원점 — 움직이지 않는다
  const r1 = computeLayout(sample(), 'process-tree-right', 1000, 500, { x: 1, y: 1 }).find((n) => n.id === 'root')!;
  const r2 = computeLayout(sample(), 'process-tree-right', 1000, 500, { x: 1.3, y: 1.5 }).find((n) => n.id === 'root')!;
  check('루트 좌표는 배율과 무관', [r2.x, r2.y], [r1.x, r1.y]);
}
{
  // 2레벨 행(B 의 자식 B1·B2 — 높이 다름)도 진행트리라면 윗변이 하나
  const out = computeLayout(sample(), 'process-tree-right', 1000, 500, { x: 1, y: 1.4 });
  const kids = out.filter((n) => n.parent === 'B');
  check('2레벨 행 윗변 종류 1', uniq(kids.map((n) => n.y - n.h / 2)).length, 1);
}

console.log('── 1레벨 오버라이드가 트리·오른쪽이어도 1레벨 행은 부모(진행트리) 기준');
{
  const out = computeLayout(sample('tree-right'), 'process-tree-right', 1000, 500, { x: 1.1, y: 1.15 });
  check('1레벨 윗변 종류 1', uniq(l1(out).map((n) => n.y - n.h / 2)).length, 1);
  // 그 아래(트리·오른쪽으로 세로로 쌓인 B1·B2)는 중심점 기준 — 순서·간격 유지
  const kids = out.filter((n) => n.parent === 'B').sort((a, b) => a.y - b.y);
  check('트리·오른쪽 자식은 세로로 쌓인 채', kids.map((n) => n.id), ['B1', 'B2']);
}

console.log('── 트리·아래: 1레벨 행 윗변 하나');
{
  const out = computeLayout(sample(), 'tree-down', 1000, 500, { x: 1, y: 1.3 });
  check('1레벨 윗변 종류 1', uniq(l1(out).map((n) => n.y - n.h / 2)).length, 1);
}

console.log('── 트리·오른쪽(세로 쌓기): 예전 그대로 중심점 배율 — 형제 간격이 배율만큼 늘어난다');
{
  const a = l1(computeLayout(sample(), 'tree-right', 1000, 500, { x: 1, y: 1 })).sort((p, q) => p.y - q.y);
  const b = l1(computeLayout(sample(), 'tree-right', 1000, 500, { x: 1, y: 1.5 })).sort((p, q) => p.y - q.y);
  // 루트는 배율의 원점 — 실제 루트 y 를 쓴다 (전략이 루트를 옮길 수 있다)
  const ra = computeLayout(sample(), 'tree-right', 1000, 500, { x: 1, y: 1 }).find((n) => n.id === 'root')!;
  const rb = computeLayout(sample(), 'tree-right', 1000, 500, { x: 1, y: 1.5 }).find((n) => n.id === 'root')!;
  const ratio = (b[3].y - rb.y) / (a[3].y - ra.y);
  check('마지막 형제의 중심 거리 비 = 1.5', Math.round(ratio * 100) / 100, 1.5);
  check('세로 순서 유지', b.map((n) => n.id), a.map((n) => n.id));
}

console.log('── 둘째 중심(루트 id 가 root 가 아님)의 1레벨 행도 윗변 하나 (#513 Codex)');
{
  const base = sample();
  const map: SampleMap = {
    ...base,
    centers: [{
      root: { id: 'c2', text: '둘째 중심', colorKey: 'root', side: 'center' },
      branches: base.branches.map((b) => ({ ...b, id: `c2-${b.id}`, children: [] })),
    }],
  };
  const out = computeLayout(map, 'process-tree-right', 1000, 500, { x: 1.1, y: 1.15 });
  const second = out.filter((n) => n.parent === 'c2');
  check('둘째 중심 가지 넷의 부모가 c2', second.length, 4);
  check('둘째 중심 1레벨 윗변 종류 1 (높이 종류 3개)', [uniq(second.map((n) => n.y - n.h / 2)).length, uniq(second.map((n) => n.h)).length], [1, 3]);
  const c2 = out.find((n) => n.id === 'c2')!;
  check('둘째 중심 줄기 높이 종류 1', uniq(second.map((n) => (c2.y + c2.h / 2 + n.y - n.h / 2) / 2)).length, 1);
}

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
