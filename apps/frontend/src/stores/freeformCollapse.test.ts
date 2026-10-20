// Freeform center collapse: store, layout, view-only history and snapshot round trips.
// Run: npx tsx src/stores/freeformCollapse.test.ts
import assert from 'node:assert/strict';
import { useDocumentStore, normalizeMapForSnapshot } from './documentStore';
import { computeLayout } from '@/layout/LayoutEngine';
import type { SampleMap, LayoutType } from '@/editor/__samples__/types';

const fixture = (freeform = true): SampleMap => ({
  title: 'Center collapse', ...(freeform ? { canvasMode: 'freeform' as const } : {}),
  root: { id: 'root', text: 'First', colorKey: 'root' },
  rootPos: { dx: 45, dy: -30 },
  branches: [{ id: 'a', text: 'A', colorKey: 'l1A', side: 'right', children: [{ id: 'a1', text: 'A1' }] }],
  centers: [{ root: { id: 'c2', text: 'Second', colorKey: 'root', side: 'center', layoutType: 'hierarchy-right' },
    pos: { dx: 400, dy: 100 }, branches: [{ id: 'b', text: 'B', colorKey: 'l1B', side: 'right', children: [{ id: 'b1', text: 'B1' }] }] }],
  connectors: [{ id: 'edge', from: 'root', to: 'c2', fromSide: 'bottom', toSide: 'left' }],
});
const st = () => useDocumentStore.getState();
const load = (freeform = true) => st().loadMap(fixture(freeform), { resetHistory: true });
const layout = (type: LayoutType = 'radial-right') => computeLayout(st().map, type, 800, 500);
const ids = () => layout().map(n => n.id);

load();
st().toggleCollapse('root');
assert.equal(st().map.root.collapsed, true);
assert.deepEqual(ids(), ['root', 'c2', 'b', 'b1']);
assert.equal(layout().find(n => n.id === 'root')?._childCount, 1);
assert.deepEqual([layout().find(n => n.id === 'root')?.x, layout().find(n => n.id === 'root')?.y], [845, 470]);
st().toggleCollapse('c2');
assert.equal(st().map.centers?.[0].root.collapsed, true);
assert.deepEqual(ids(), ['root', 'c2']);
assert.equal(layout().find(n => n.id === 'c2')?._childCount, 1);
assert.deepEqual([layout().find(n => n.id === 'c2')?.x, layout().find(n => n.id === 'c2')?.y], [1200, 600]);
assert.equal(st().past.length, 0, 'fold/unfold stays view-only, like existing node folding');

const saved = JSON.parse(JSON.stringify(normalizeMapForSnapshot(st().map))) as SampleMap;
st().loadMap(saved, { resetHistory: true });
assert.deepEqual(ids(), ['root', 'c2'], 'server/HTML JSON snapshot preserves center collapsed fields');
assert.equal(st().map.connectors?.[0].from, 'root');
assert.deepEqual(st().map.rootPos, { dx: 45, dy: -30 });
assert.deepEqual(st().map.centers?.[0].pos, { dx: 400, dy: 100 });
st().updateNodeText('a', 'edited while hidden');
st().undo();
assert.equal(st().map.branches[0].text, 'A');
assert.equal(st().map.root.collapsed, true, 'content undo restores the pre-edit folded document');
st().redo();
assert.equal(st().map.branches[0].text, 'edited while hidden');
assert.equal(st().map.root.collapsed, true);
st().expandAll();
assert.deepEqual(ids(), ['root', 'a', 'a1', 'c2', 'b', 'b1']);
assert.equal(st().map.root.collapsed, undefined);
assert.equal(st().map.centers?.[0].root.collapsed, undefined);

load(); st().collapseSubtree(['root']);
assert.deepEqual(ids(), ['root', 'c2', 'b', 'b1']);
assert.equal(st().map.branches[0].collapsed, true);
assert.equal(st().map.centers?.[0].root.collapsed, undefined);
st().expandSubtree(['root']);
assert.deepEqual(ids(), ['root', 'a', 'a1', 'c2', 'b', 'b1']);
st().collapseSubtree(['c2']);
assert.deepEqual(ids(), ['root', 'a', 'a1', 'c2']);
st().expandAncestors('b1');
assert.deepEqual(ids(), ['root', 'a', 'a1', 'c2', 'b', 'b1']);
st().collapseAll();
assert.deepEqual(ids(), ['root', 'c2']);
st().expandSubtree(['root', 'c2']);
assert.deepEqual(ids(), ['root', 'a', 'a1', 'c2', 'b', 'b1']);

for (const rootId of ['root', 'c2']) {
  load(); st().setCollapsed(rootId, true);
  const added = st().addChildNode(rootId);
  assert.ok(ids().includes(added), 'new child automatically unfolds its freeform center');
  load(); st().setCollapsed(rootId, true); st().addChildNodesBulk(rootId, ['bulk']);
  const center = rootId === 'root' ? st().map : st().map.centers![0];
  assert.equal(center.root.collapsed, undefined);
  load(); st().setCollapsed(rootId, true); st().appendChildren(rootId, [{ id: 'new-outline', text: 'Outline' }]);
  assert.ok(ids().includes('new-outline'));
}

for (const type of ['radial-right', 'radial-left', 'radial-bidirectional', 'tree-right', 'tree-down', 'hierarchy-right', 'process-tree-right', 'timeline', 'timeline-center'] as LayoutType[]) {
  load(); st().setCollapsed('root', true); st().setCollapsed('c2', true);
  assert.deepEqual(layout(type).map(n => n.id), ['root', 'c2'], `folded freeform centers with ${type}`);
  load(false); st().toggleCollapse('root'); st().setCollapsed('c2', true);
  assert.equal(st().map.root.collapsed, undefined);
  assert.equal(st().map.centers?.[0].root.collapsed, undefined);
  assert.equal(layout(type).length, 6, `ordinary map root policy with ${type} remains unchanged`);
  const normal = fixture(false); normal.root.collapsed = true; normal.centers![0].root.collapsed = true;
  assert.equal(computeLayout(normal, type, 800, 500).length, 6, 'ordinary maps ignore imported center collapsed flags');
}
console.log('PASS freeform center folding, snapshot, history, search, additions and ordinary-map policy');
