// updateNodesLayoutType — 러버밴드로 고른 여러 노드의 하위 레이아웃을 한 번에 (2026-09-21).
//   npx tsx src/stores/layoutBulk.test.ts

import { findNodeInMap, useDocumentStore } from './documentStore';
import type { MindNode, SampleMap } from '@emm/emm-parser';
import { useEditorUiStore } from './editorUiStore';
import { computeLayout } from '@/layout/LayoutEngine';

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
st().updateNodesLayoutType(['A', 'B', 'C'], 'tree-right', true);
check('① A·B·C 전부 tree-right', ['A', 'B', 'C'].map((id) => g(id).layoutType), ['tree-right', 'tree-right', 'tree-right']);
check('① edgeType 도 함께', g('A').edgeType !== undefined, true);
check('① A1 의 기존 오버라이드(radial-right)는 지워진다', g('A1').layoutType, undefined);
check('① 맵(root) 레이아웃은 그대로', st().map.root.layoutType, 'process-tree-right');
check('① undo 한 단계', st().past.length - past0, 1);
st().undo();
check('① undo 로 셋 다 돌아온다 + A1 오버라이드 복구', [g('A').layoutType, g('B').layoutType, g('A1').layoutType], [undefined, undefined, 'radial-right']);

// ② First root participates in a supported bulk hierarchy change.
st().updateNodesLayoutType(['root', 'B'], 'tree-right');
check('② first root and ordinary B both update', [st().map.root.layoutType, g('B').layoutType], ['tree-right', 'tree-right']);
const afterBulk = st().past.length;
st().updateNodesLayoutType([], 'tree-right');
st().updateNodesLayoutType(['missing'], 'tree-right');
check('② empty/unknown selections do not add history', st().past.length, afterBulk);

const multiCenter = (): SampleMap => ({
  ...sample(),
  centers: [
    { root: { id: 'c2', text: 'C2', colorKey: 'root' }, branches: [{ ...N('X', [N('X1', [], { layoutType: 'timeline' })], { layoutType: 'tree-right' }), colorKey: 'l1A', side: 'right' }] },
    { root: { id: 'c3', text: 'C3', colorKey: 'root', layoutType: 'timeline' }, branches: [] },
  ],
});
useEditorUiStore.getState().setLayoutType('process-tree-right');
st().loadMap(multiCenter(), { resetHistory: true });
st().updateNodeLayoutType('root', 'radial-right');
check('③ first selected only preserves unselected inherited center hierarchy', st().map.centers![0].root.layoutType, 'process-tree-right');
check('③ explicit other center hierarchy remains intact', st().map.centers![1].root.layoutType, 'timeline');
check('③ descendants preserved by default', [g('A1').layoutType, g('X').layoutType, g('X1').layoutType], ['radial-right', 'tree-right', 'timeline']);
st().undo();
check('③ undo restores first layout and inherited extra center', [useEditorUiStore.getState().layoutType, st().map.centers![0].root.layoutType], ['process-tree-right', undefined]);

// Reverse ancestor order deliberately: every explicitly selected node must win.
const mixedPast = st().past.length;
st().updateNodesLayoutType(['A1', 'c2', 'root', 'A'], 'hierarchy-right');
check('④ mixed roots and ordinary nodes all update', ['root', 'c2', 'A', 'A1'].map((id) => g(id).layoutType), Array(4).fill('hierarchy-right'));
check('④ selected-only preserves unselected descendants/centers', [g('X').layoutType, g('X1').layoutType, g('c3').layoutType], ['tree-right', 'timeline', 'timeline']);
check('④ mixed change is one history entry', st().past.length - mixedPast, 1);
check('④ first selection changes global render hierarchy', useEditorUiStore.getState().layoutType, 'hierarchy-right');
st().undo();
check('④ one undo restores every selected node', [g('root').layoutType, g('c2').layoutType, g('A').layoutType, g('A1').layoutType], ['process-tree-right', undefined, undefined, 'radial-right']);
const optInPast = st().past.length;
st().updateNodesLayoutType(['A1', 'c2', 'root', 'A'], 'radial-left', true);
check('⑤ opt-in retains all explicit selected overrides', ['root', 'c2', 'A', 'A1'].map((id) => g(id).layoutType), Array(4).fill('radial-left'));
check('⑤ opt-in clears unselected descendants within selected centers', [g('X').layoutType, g('X1').layoutType], [undefined, undefined]);
check('⑤ opt-in leaves other centers unchanged and remains atomic', [g('c3').layoutType, st().past.length - optInPast], ['timeline', 1]);

// Entering/leaving Kanban must never pin a board layout on an extra center.
useEditorUiStore.getState().setLayoutType('process-tree-right');
st().loadMap(multiCenter(), { resetHistory: true });
st().updateNodeLayoutType('root', 'kanban');
check('⑥ entering Kanban keeps prior valid extra hierarchy', g('c2').layoutType, 'process-tree-right');
st().updateNodeLayoutType('root', 'tree-right');
check('⑥ leaving Kanban first-only keeps both centers visible', ['root', 'c2', 'c3'].map((id) => computeLayout(st().map, useEditorUiStore.getState().layoutType, 800, 500).some((n) => n.id === id)), [true, true, true]);
const importedBoard = multiCenter();
importedBoard.root.layoutType = 'kanban';
importedBoard.centers![1].root.layoutType = 'kanban';
useEditorUiStore.getState().setLayoutType('kanban');
st().loadMap(importedBoard, { resetHistory: true });
st().updateNodeLayoutType('root', 'radial-right');
check('⑥ imported missing/invalid extra hierarchy uses safe fallback', st().map.centers!.map((c) => c.root.layoutType), ['radial-right', 'radial-right']);
check('⑥ imported centers remain visible after leaving Kanban', ['c2', 'c3'].map((id) => computeLayout(st().map, 'radial-right', 800, 500).some((n) => n.id === id)), [true, true]);
const guarded = st().map, guardedPast = st().past.length;
st().updateNodesLayoutType(['root', 'c2'], 'kanban');
st().updateNodeLayoutType('c2', 'kanban');
st().updateNodesLayoutType(['root', 'A'], 'tree-down');
check('⑦ unsupported per-center/ordinary root-only edits rejected atomically', [st().map === guarded, st().past.length === guardedPast], [true, true]);

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
if (failed) process.exit(1);
