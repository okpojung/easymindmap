// Uses Vite for exportHtml's SVG ?raw import:
// node scripts/run-vite-test.mjs src/export/exportCenterAnchors.test.ts
import { buildStandaloneHtml } from './exportHtml';
import type { SampleMap } from '@emm/emm-parser';

const assert = (ok: unknown, label: string) => { if (!ok) throw new Error(label); };
const sample = (): SampleMap => ({
  title: 'anchor regression',
  root: { id: 'root', text: 'First', colorKey: 'root' },
  branches: [{ id: 'a', text: 'Initially collapsed', colorKey: 'l1A', side: 'right', collapsed: true,
    children: [{ id: 'a1', text: 'A wide expanded child that needs more room' }] }],
  centers: [{ root: { id: 'c2', text: 'Second', colorKey: 'root' }, branches: [] }],
});
interface BakedCenter {
  keepCenterAnchor: boolean;
  pos: { x: number; y: number };
}
function exported(map: SampleMap) {
  const html = buildStandaloneHtml(map, 'radial-right');
  const json = html.match(/window\.__MINDMAP__ = ([^\n]+);<\/script>/)?.[1];
  assert(json, 'viewer DATA is embedded');
  const data = JSON.parse(json!) as { root: BakedCenter; centers: BakedCenter[] };
  const source = html.match(/function preserveCenterAnchor\(c\) \{[\s\S]*?\n  \}/)?.[0];
  assert(source, 'generated viewer anchor function exists');
  // Exercise the actual generated function without requiring a DOM/viewer.
  const preserve = new Function('return (' + source + ');')() as (c: unknown) => void;
  return { data, preserve };
}

const ordinary = exported(sample());
assert(!!ordinary.data.root.pos && !!ordinary.data.centers[0].pos, 'ordinary auto centers also receive baked coordinates');
assert(!ordinary.data.root.keepCenterAnchor && !ordinary.data.centers[0].keepCenterAnchor, 'ordinary unpositioned centers retain automatic reflow');
const auto = { ...ordinary.data.centers[0], _cx: 1600, _cy: 90, children: [{ _cx: 1800, _cy: 100 }] };
ordinary.preserve(auto);
assert(auto._cx === 1600 && auto.children[0]._cx === 1800, 'expanded auto-placement is not translated back to the old baked anchor');

const manualMap = sample();
manualMap.rootPos = { dx: 10.25, dy: -20.5 };
manualMap.centers![0].pos = { dx: 700.75, dy: 90.125 };
const manual = exported(manualMap);
assert(manual.data.root.keepCenterAnchor && manual.data.centers[0].keepCenterAnchor, 'explicit first/extra manual positions retain anchors');
const positioned = { ...manual.data.centers[0], _cx: 1600, _cy: 90, children: [{ _cx: 1800, _cy: 100 }] };
manual.preserve(positioned);
assert(positioned._cx === positioned.pos.x && positioned._cy === positioned.pos.y, 'manual center returns to its baked anchor');
assert(positioned.children[0]._cx - positioned._cx === 200 && positioned.children[0]._cy - positioned._cy === 10, 'manual translation retains subtree-relative geometry');

const diagram = sample();
diagram.canvasMode = 'freeform';
const freeform = exported(diagram);
assert(freeform.data.root.keepCenterAnchor && freeform.data.centers[0].keepCenterAnchor, 'freeform retains all center anchors, even without explicit positions');
console.log('PASS exported center anchor compatibility');
