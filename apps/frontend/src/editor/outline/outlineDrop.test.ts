// 아웃라인 드롭 규칙 회귀 — npx tsx src/editor/outline/outlineDrop.test.ts
import { planOutlineDrop, nearestGap, canDragOutlineRow, type OutlineFlatRow } from './outlineDrop';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n  got ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`}`);
}
const R = (id: string, depth: number, childIds: string[] = [], expanded = true): OutlineFlatRow => ({ id, depth, expanded, childIds });
// root(A(A1(A1a),A2), B(B1))  → 행: root A A1 A1a A2 B B1
const rows = [
  R('root', 0, ['A', 'B']), R('A', 1, ['A1', 'A2']), R('A1', 2, ['A1a']), R('A1a', 3), R('A2', 2),
  R('B', 1, ['B1']), R('B1', 2),
];
const env = { locked: false, startEpoch: 1, currentEpoch: 1 };
const p = (drag: string, gap: number, e = env) => planOutlineDrop(rows, drag, gap, e);
const brief = (x: ReturnType<typeof p>) => [x.ok, x.reason, x.parentId, x.beforeId];

check('B1 을 A1 과 A1a 사이(2·3단계 틈)에 → 위 행 A1 의 첫 자식 앞', brief(p('B1', 3)), [true, 'ok', 'A1', 'A1a']);
check('A2 를 A1a 아래(3→2 틈) → 부모는 A1a, 맨 뒤 자식', brief(p('A2', 4)), [true, 'ok', 'A1a', null]);
check('B 를 root 와 A 사이 → 부모 root, 첫 자식 A 앞', brief(p('B', 1)), [true, 'ok', 'root', 'A']);
check('접힌 A 아래에 B → A 의 맨 뒤 자식(접힌 채)', brief(planOutlineDrop(
  [R('root', 0, ['A', 'B']), R('A', 1, ['A1'], false), R('B', 1)], 'B', 2, env)), [true, 'ok', 'A', null]);
check('마지막 행 아래(afterlast) → 마지막 행의 자식', brief(p('A2', 7)), [true, 'ok', 'B1', null]);
check('첫 행 위(beforefirst) 거부', p('A', 0).reason, 'no-row-above');
check('자기 행 바로 아래 틈 = 자기 자식이 되려는 것 → 거부', p('A1', 3).reason, 'self');
check('자손 사이 틈 거부', p('A', 3).reason, 'descendant');
check('자손 마지막 아래 틈 거부', p('A', 4).reason, 'descendant');
check('자기 서브트리 끝 다음 틈은 그 마지막 자손이 위 행 → 거부', p('A1', 4).reason, 'descendant');
check('같은 부모 재정렬: A2 를 A 와 A1 사이 → A 의 첫 자식', brief(p('A2', 2)), [true, 'ok', 'A', 'A1']);
check('이미 첫 자식이면 noop', p('A1', 2).reason, 'noop');
check('루트는 끌 수 없다', [p('root', 2).reason, canDragOutlineRow(rows, 'root'), canDragOutlineRow(rows, 'A')], ['root', false, true]);
check('문서 바뀜(epoch) 거부', p('B1', 3, { ...env, currentEpoch: 2 }).reason, 'stale');
check('잠금/읽기 전용 거부', p('B1', 3, { ...env, locked: true }).reason, 'locked');
check('없는 행(문서가 바뀌어 사라짐) 거부', p('ZZ', 3).reason, 'no-drag');
check('틈 범위 밖', p('B1', 99).reason, 'bad-gap');
check('빈 목록', planOutlineDrop([], 'A', 0, env).reason, 'no-drag');
check('nearestGap', [nearestGap([8, 38, 68, 98], 3, 40), nearestGap([8, 38, 68, 98], 3, 500), nearestGap([8], 0, 5)], [1, 3, -1]);

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');

