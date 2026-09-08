// moveNodesRelative 단위 테스트 — 다중 선택 드래그 이동 (2026-09-08).
//
//   npx tsx src/stores/moveNodesRelative.test.ts

import { topLevelSelection, useDocumentStore } from './documentStore';
import type { MindNode, SampleMap } from '@emm/emm-parser';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

const N = (id: string, children: MindNode[] = []): MindNode => ({ id, text: id, children });
function sample(): SampleMap {
  return {
    title: 't',
    root: { id: 'root', text: 'root', colorKey: 'root' },
    branches: [
      { ...N('A', [N('A1'), N('A2', [N('A2a')])]), colorKey: 'l1A', side: 'right' },
      { ...N('B', [N('B1'), N('B2')]), colorKey: 'l1B', side: 'right' },
      { ...N('C', [N('C1')]), colorKey: 'l1C', side: 'left' },
    ],
  };
}
/** 계층을 'A(A1,A2(A2a))' 꼴 문자열로 */
const shape = (ns: MindNode[]): string =>
  ns.map((n) => (n.children?.length ? `${n.id}(${shape(n.children)})` : n.id)).join(',');
const kids = (id: string): string => {
  const find = (ns: MindNode[]): MindNode | null => {
    for (const n of ns) { if (n.id === id) return n; const c = find(n.children ?? []); if (c) return c; }
    return null;
  };
  return shape(find(useDocumentStore.getState().map.branches)?.children ?? []);
};
const load = () => useDocumentStore.getState().loadMap(sample(), { resetHistory: true });
const st = () => useDocumentStore.getState();

// ── ① topLevelSelection — 자손·루트·중복·없는 것 제거, 문서 순서 ───────
{
  const m = sample();
  check('① 자손은 뺀다 (A 를 골랐으면 A2a 는 따라간다)', topLevelSelection(m, ['A2a', 'A', 'B1']), ['A', 'B1']);
  check('① 문서 순서로 정렬', topLevelSelection(m, ['C', 'B', 'A1']), ['A1', 'B', 'C']);
  check('① 루트·중복·없는 id', topLevelSelection(m, ['root', 'B', 'B', 'zzz']), ['B']);
}

// ── ② 하위로 붙이기 — 전부, 순서 유지, undo 1단계 ─────────────────────
{
  load();
  const r = st().moveNodesRelative(['B1', 'A1', 'A2'], 'C', 'child');
  check('② 결과', r, { moved: 3, reason: 'ok' });
  check('② C 아래에 문서 순서로 셋', kids('C'), 'C1,A1,A2(A2a),B1');
  check('② A 는 비고 B 는 B2 만', kids('A') + ' / ' + kids('B'), ' / B2');
  check('② undo 1단계', st().past.length, 1);
  st().undo();
  check('② undo 뒤 원상', shape(st().map.branches), 'A(A1,A2(A2a)),B(B1,B2),C(C1)');
}

// ── ③ 형제 앞/뒤 — 순서 유지 ─────────────────────────────────────────────
{
  load();
  st().moveNodesRelative(['A1', 'A2'], 'B2', 'before');
  check('③ B2 앞에 A1,A2 순서대로', kids('B'), 'B1,A1,A2(A2a),B2');
  load();
  st().moveNodesRelative(['A1', 'A2'], 'B1', 'after');
  check('③ B1 뒤에 A1,A2 순서대로', kids('B'), 'B1,A1,A2(A2a),B2');
  load();
  const r = st().moveNodesRelative(['A1', 'B1'], 'C', 'after');
  check('③ 루트 직계 옆으로 — 새 브랜치 둘, 대상 side 상속', [r.moved, st().map.branches.map((b) => `${b.id}:${b.side}`)],
    [2, ['A:right', 'B:right', 'C:left', 'A1:left', 'B1:left']]);
}

// ── ④ 상위로 붙이기 — 한 개만 ───────────────────────────────────────────
{
  load();
  const r = st().moveNodesRelative(['A1', 'B1'], 'C1', 'parent');
  check('④ 여럿이면 parent-multi 거부, 맵 그대로', [r, shape(st().map.branches), st().past.length],
    [{ moved: 0, reason: 'parent-multi' }, 'A(A1,A2(A2a)),B(B1,B2),C(C1)', 0]);
  const r1 = st().moveNodesRelative(['A1'], 'C1', 'parent');
  check('④ 한 개면 된다 (A1 이 C1 의 부모)', [r1.reason, kids('C')], ['ok', 'A1(C1)']);
  const r2 = st().moveNodesRelative(['A2', 'A2a'], 'B1', 'parent');
  check('④ 부모+자손을 같이 골라도 최상위는 하나 → 허용 (기존대로 맨 뒤에 붙는다)', [r2, kids('B')], [{ moved: 1, reason: 'ok' }, 'B2,A2(A2a,B1)']);
}

// ── ⑤ 자기 안으로 · 실패 시 무변경 · 단일 이동 회귀 ─────────────────────
{
  load();
  const r = st().moveNodesRelative(['A', 'B'], 'A2a', 'child');
  check('⑤ 고른 노드의 자손이 대상이면 into-self', [r.reason, st().past.length], ['into-self', 0]);
  check('⑤ 빈 목록', st().moveNodesRelative([], 'C', 'child'), { moved: 0, reason: 'none' });
  check('⑤ 단일 moveNodeRelative 회귀 — child', [st().moveNodeRelative('A1', 'C', 'child'), kids('C')], [true, 'C1,A1']);
  check('⑤ 단일 moveNodeRelative 회귀 — 자기 자손 밑은 거부', st().moveNodeRelative('A', 'A2a', 'child'), false);
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
