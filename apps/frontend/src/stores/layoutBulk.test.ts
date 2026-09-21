// updateNodesLayoutType — 러버밴드로 고른 여러 노드의 하위 레이아웃을 한 번에 (2026-09-21).
//   npx tsx src/stores/layoutBulk.test.ts

import { findNodeInMap, useDocumentStore } from './documentStore';
import type { MindNode, SampleMap } from '@emm/emm-parser';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${JSON.stringify(got)}\n      기대 ${JSON.stringify(want)}`}`);
}
const N = (id: string, children: MindNode[] = [], extra: Partial<MindNode> = {}): MindNode => ({ id, text: id, children, ...extra });
const sample = (): SampleMap => ({
  title: 't', root: { id: 'root', text: 'R', colorKey: 'root', layoutType: 'process-tree-right' },
  branches: [
    { ...N('A', [N('A1', [N('A1a')], { layoutType: 'radial-right' }), N('A2')]), colorKey: 'l1A', side: 'right' },
    { ...N('B', [N('B1')]), colorKey: 'l1B', side: 'right' },
    { ...N('C', [N('C1')]), colorKey: 'l1C', side: 'right' },
  ],
});
const st = () => useDocumentStore.getState();
const g = (id: string) => findNodeInMap(st().map, id)!;
st().loadMap(sample(), { resetHistory: true });
const past0 = st().past.length;

// ① 세 가지에 한 번에 — 각 노드의 layoutType, 하위 오버라이드는 지운다 (단일 경로와 같은 규칙)
st().updateNodesLayoutType(['A', 'B', 'C'], 'tree-right');
check('① A·B·C 전부 tree-right', ['A', 'B', 'C'].map((id) => g(id).layoutType), ['tree-right', 'tree-right', 'tree-right']);
check('① edgeType 도 함께', g('A').edgeType !== undefined, true);
check('① A1 의 기존 오버라이드(radial-right)는 지워진다', g('A1').layoutType, undefined);
check('① 맵(root) 레이아웃은 그대로', st().map.root.layoutType, 'process-tree-right');
check('① undo 한 단계', st().past.length - past0, 1);
st().undo();
check('① undo 로 셋 다 돌아온다 + A1 오버라이드 복구', [g('A').layoutType, g('B').layoutType, g('A1').layoutType], [undefined, undefined, 'radial-right']);

// ② root 는 건너뛴다 (맵 전체 레이아웃은 단일 선택 경로만) · 빈 목록은 아무것도 안 한다
const past1 = st().past.length;
st().updateNodesLayoutType(['root', 'B'], 'tree-down');
check('② root 는 건너뛰고 B 만', [st().map.root.layoutType, g('B').layoutType], ['process-tree-right', 'tree-down']);
st().updateNodesLayoutType([], 'tree-down');
st().updateNodesLayoutType(['root'], 'tree-down');
check('② 빈 목록·root 만 → undo 안 쌓임', st().past.length - past1, 1);

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
if (failed) process.exit(1);
