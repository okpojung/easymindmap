// Uses Vite for exportHtml's SVG ?raw import. No DOM, network or user-file access.
// node scripts/run-vite-test.mjs src/export/exportHtmlBorders.test.ts
import { buildStandaloneHtml } from './exportHtml';
import type { SampleMap } from '@emm/emm-parser';

const assert = (ok: unknown, label: string) => { if (!ok) throw new Error(label); };
const shapes = ['rounded', 'rectangle', 'pill', 'ellipse', 'diamond', 'hexagon',
  'parallelogram', 'arrow-left', 'arrow-right', 'cylinder', 'star', 'offpage', 'document', 'pentagon'] as const;
const map: SampleMap = {
  title: 'Synthetic border regression', canvasMode: 'freeform',
  root: { id: 'root', text: 'Root', colorKey: 'root',
    style: { borderColor: '#123456', borderWidth: 3, borderStyle: 'dashed', shapeType: 'diamond' } },
  branches: [{ id: 'child', text: 'Child', colorKey: 'l1A', side: 'right',
    style: { borderColor: '#654321', borderWidth: 0, borderStyle: 'solid', shapeType: 'ellipse' } }],
  centers: [{ root: { id: 'extra', text: 'Extra', colorKey: 'root',
    style: { borderColor: '#abcdef', borderWidth: 4, borderStyle: 'double', shapeType: 'hexagon' } }, branches: [] }],
};
const html = buildStandaloneHtml(map, 'radial-right');
const json = html.match(/window\.__MINDMAP__ = ([^\n]+);<\/script>/)?.[1];
assert(json, 'standalone document data exists');
const data = JSON.parse(json!);
assert(data.root.style.borderColor === '#123456', 'first center custom border color is serialized');
assert(data.root.style.borderWidth === 3 && data.root.style.borderStyle === 'dashed', 'first center width and dash survive export');
assert(data.root.children[0].style.borderWidth === 0, 'explicit zero border width is retained');
assert(data.centers[0].style.borderColor === '#abcdef' && data.centers[0].style.borderWidth === 4 && data.centers[0].style.borderStyle === 'double', 'extra center double border survives export');

const attrSource = html.match(/  function nodeBorderAttributes\([\s\S]*?\n  \}/)?.[0];
const shapeSource = html.match(/  function drawNodeShape\([\s\S]*?\n  \}/)?.[0];
assert(attrSource && shapeSource, 'actual generated viewer helpers exist');
const border = new Function('return (' + attrSource + ');')() as
  (style: Record<string, unknown>, root: boolean, selected: boolean, hit: boolean) => Record<string, unknown>;
type Shape = { tag: string; attrs: Record<string, unknown> };
const output: Shape[] = [];
const el = (tag: string, attrs: Record<string, unknown>) => { output.push({ tag, attrs: { ...attrs } }); return {}; };
const draw = new Function('el', 'return (' + shapeSource + ');')(el) as
  (g: object, shape: string, x: number, y: number, w: number, h: number, root: boolean, attrs: object) => void;

assert(border({}, true, false, false)['stroke-width'] === 2, 'default center border is visible, matching editor');
assert(border({}, false, false, false)['stroke-width'] === 1, 'default child border matches editor');
assert(border({}, false, true, false)['stroke-width'] === 1.5, 'selected child border matches editor');
assert(border({ borderWidth: 0 }, true, false, false)['stroke-width'] === 0, 'intentional zero width retained');
assert(border({ borderWidth: NaN }, true, false, false)['stroke-width'] === 2, 'invalid width cannot hide default border');
assert(border({ borderWidth: 4, borderStyle: 'dashed' }, true, false, false)['stroke-dasharray'] === '12 8', 'dashed pattern matches editor');
assert(border({ borderWidth: 3, borderStyle: 'dotted' }, false, false, false)['stroke-dasharray'] === '3 6', 'dotted pattern matches editor');
assert(border({ borderWidth: 7 }, true, false, true)['stroke-width'] === 2.6, 'search highlight overrides custom width');
assert(!('stroke-dasharray' in border({ borderStyle: 'solid' }, true, false, false)), 'solid has no dash attribute');
for (const root of [true, false]) for (const shape of shapes) {
  output.length = 0;
  const attrs = { ...border({ borderWidth: 3, borderStyle: 'dashed' }, root, false, false), fill: '#ffffff', stroke: '#123456' };
  draw({}, shape, 10, 20, 160, 80, root, attrs);
  assert(output.length === (shape === 'cylinder' ? 2 : 1), shape + ': correct shape parts');
  assert(output.every(e => e.attrs.stroke === '#123456' && e.attrs['stroke-width'] === 3 && e.attrs['stroke-dasharray'] === '9 6'), shape + ': every body/cap keeps custom border');
  output.length = 0;
  draw({}, shape, 14.5, 24.5, 151, 71, root, { fill: 'none', stroke: '#abcdef', 'stroke-width': 2.55 });
  assert(output.every(e => e.attrs.fill === 'none' && e.attrs.stroke === '#abcdef' && e.attrs['stroke-width'] === 2.55), shape + ': inset double-border body/cap keep color');
}
// Integration checks connect tested helpers with the generated node render path.
assert(html.includes('com.stroke = nodeStroke2;'), 'center uses resolved border, never root fill');
assert(!html.includes("'stroke-width': isRoot ? 0 : 1.4"), 'invisible root stroke removed');
assert(html.includes("if (stPre.borderStyle === 'double')") && html.includes("'class': 'mm-box mm-box-inner'"), 'double renders inset outline');
assert(html.includes('if (!noShape) {\n      var com = nodeBorderAttributes'), 'shape-none suppresses all outlines');
console.log('PASS generated HTML center/child border color, width, dash and double-shape parity');

// Only CI may emit this newly generated synthetic file for the headless UI test.
// Exclusive creation prevents replacing an existing file. No user HTML is read.
if (process.env.CI === 'true' && process.env.CI_HTML_FIXTURE) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname, isAbsolute } = await import('node:path');
  const target = process.env.CI_HTML_FIXTURE;
  if (!isAbsolute(target)) throw new Error('CI_HTML_FIXTURE must be an absolute CI-owned path');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, '<!-- EMM_CI_SYNTHETIC_BORDER_FIXTURE_V1 -->\n' + html, { encoding: 'utf8', flag: 'wx' });
  console.log('WROTE newly generated CI synthetic HTML border fixture');
}
