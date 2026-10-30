// Standalone assertions, matching the canvas geometry tests.
//   npx tsx src/editor/canvas/centerAlignmentGuides.test.ts

import {
  computeCenterAlignmentGuides,
  type AlignmentBounds, type AlignmentGuide, type AlignmentRect,
} from './centerAlignmentGuides';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
}
const rect = (id: string, left: number, top: number, width = 100, height = 100): AlignmentRect =>
  ({ id, left, top, width, height });
const viewport: AlignmentBounds = { left: -1000, top: -1000, width: 2000, height: 2000 };
const moving = rect('moving', 100, 100);
type Input = Parameters<typeof computeCenterAlignmentGuides>[0];
function run(targets: readonly AlignmentRect[], options: Partial<Input> = {}): AlignmentGuide[] {
  return computeCenterAlignmentGuides({
    moving, targets, viewport, worldPerScreenPixel: { x: 1, y: 1 }, ...options,
  });
}
const axisGuide = (guides: AlignmentGuide[], axis: 'x' | 'y') => guides.find(g => g.axis === axis);
const anchorNames = ['start', 'center', 'end'] as const;

// Every one of the nine anchor pairs, independently on both axes. Unequal
// dimensions avoid accidental second exact matches; tolerance 0 isolates each.
for (const axis of ['x', 'y'] as const) {
  for (let m = 0; m < 3; m++) {
    for (let t = 0; t < 3; t++) {
      const coordinate = 100 + m * 50;
      const start = coordinate - t * 30;
      const target = axis === 'x'
        ? rect('target', start, 300, 60, 40)
        : rect('target', 300, start, 40, 60);
      check(`${axis} ${anchorNames[m]} -> ${anchorNames[t]}, world dimensions and segment`,
        run([target], { tolerancePx: 0 }), [{
          axis, coordinate, from: 92, to: 348, targetId: 'target',
          movingAnchor: anchorNames[m], targetAnchor: anchorNames[t],
        }]);
    }
  }
}

// Default and explicit tolerances, inclusive endpoints, screen/world conversion.
const origin = rect('moving', 0, 0);
check('default tolerance accepts exactly 6 screen pixels',
  axisGuide(run([rect('t', 6, 200)], { moving: origin }), 'x')?.coordinate, 56);
check('default tolerance rejects more than 6 screen pixels',
  run([rect('t', 6.01, 200)], { moving: origin }), []);
check('explicit zero tolerance does not fall back to 6',
  run([rect('t', 1, 200)], { moving: origin, tolerancePx: 0 }), []);
check('explicit tolerance accepts its boundary',
  axisGuide(run([rect('t', 3, 200)], { moving: origin, tolerancePx: 3 }), 'x')?.coordinate, 53);
check('explicit tolerance rejects outside its boundary',
  run([rect('t', 3.01, 200)], { moving: origin, tolerancePx: 3 }), []);
check('zoom out: 12 world units = 6 screen pixels',
  axisGuide(run([rect('t', 12, 200)], {
    moving: origin, worldPerScreenPixel: { x: 2, y: 2 },
  }), 'x')?.coordinate, 62);
check('zoom in: 3.01 world units exceed 6 screen pixels',
  run([rect('t', 3.01, 200)], { moving: origin, worldPerScreenPixel: { x: 0.5, y: 0.5 } }), []);
check('anisotropic scales use their own axis for tolerance',
  run([rect('t', 12, 4)], { moving: origin, worldPerScreenPixel: { x: 2, y: 0.5 } })
    .map(g => g.axis), ['x']);
check('anisotropic scales use perpendicular axis for padding',
  axisGuide(run([rect('t', 100, 300, 100, 40)], {
    worldPerScreenPixel: { x: 2, y: 3 }, tolerancePx: 0,
  }), 'x'), {
    axis: 'x', coordinate: 150, from: 76, to: 364, targetId: 't',
    movingAnchor: 'center', targetAnchor: 'center',
  });
check('horizontal padding uses x scale, not y scale',
  axisGuide(run([rect('t', 300, 100, 40, 100)], {
    worldPerScreenPixel: { x: 2, y: 3 }, tolerancePx: 0,
  }), 'y'), {
    axis: 'y', coordinate: 150, from: 84, to: 356, targetId: 't',
    movingAnchor: 'center', targetAnchor: 'center',
  });

// Axis order and independent winners; no more than two guides.
check('one closest guide per axis, x then y, different targets',
  run([rect('x', 100, 300), rect('y', 300, 100)]).map(g => [g.axis, g.targetId]),
  [['x', 'x'], ['y', 'y']]);
check('empty targets', run([]), []);
check('self ID excluded even with different geometry', run([rect('moving', 100, 300)]), []);
const excludedIds = new Set(['child', 'grandchild']);
check('caller-supplied descendant IDs are excluded',
  run([rect('child', 100, 300), rect('grandchild', 300, 100)], { excludedIds }), []);
check('excluded best target does not hide a permitted candidate',
  axisGuide(run([rect('child', 100, 300), rect('sibling', 101, 300)], { excludedIds }), 'x')?.targetId,
  'sibling');

// Actual viewport area, not merely the caller's focus/collapse visibility.
const smallView = { left: 0, top: 0, width: 200, height: 200 };
check('offscreen moving box', run([rect('t', 100, 300)], {
  moving: rect('moving', 200, 0), viewport: smallView,
}), []);
check('edge-only moving contact is not visible', run([rect('t', 0, 0)], {
  moving: rect('moving', -100, 0), viewport: smallView,
}), []);
check('offscreen or edge-only target is excluded', run([
  rect('off', 100, 250), rect('edge', 100, 200),
], { viewport: smallView }), []);
check('partially visible boxes are eligible, segments clip to viewport',
  axisGuide(run([rect('t', 20, 180, 100, 100)], {
    moving: rect('moving', 20, -40), viewport: smallView,
  }), 'x'), {
    axis: 'x', coordinate: 70, from: 0, to: 200, targetId: 't',
    movingAnchor: 'center', targetAnchor: 'center',
  });
check('offscreen anchors are not clamped into invented alignment',
  run([rect('t', -100, 150, 120, 20)], {
    moving: rect('moving', -100, 0, 101, 20), viewport: smallView, tolerancePx: 0,
  }), []);
check('horizontal segments clip to viewport too',
  axisGuide(run([rect('t', 180, 20)], {
    moving: rect('moving', -40, 20), viewport: smallView,
  }), 'y'), {
    axis: 'y', coordinate: 70, from: 0, to: 200, targetId: 't',
    movingAnchor: 'center', targetAnchor: 'center',
  });
check('default nearby cutoff includes bbox gap exactly 320px',
  axisGuide(run([rect('t', 0, 420)], { moving: origin }), 'x')?.targetId, 't');
check('default nearby cutoff rejects bbox gap over 320px',
  run([rect('t', 0, 420.01)], { moving: origin }), []);
check('nearby is bbox gap, not distance between centers',
  axisGuide(run([rect('t', 100, 0)], { moving: origin, nearbyPx: 0 }), 'x')?.targetId, 't');
const diagonal = rect('t', 106, 112);
check('nearby uses anisotropic Euclidean bbox gap: hypot(6/2,12/3)=5',
  run([diagonal], { moving: origin, nearbyPx: 5, worldPerScreenPixel: { x: 2, y: 3 } })
    .map(g => g.axis), ['x', 'y']);
check('diagonal just outside nearby radius is rejected',
  run([diagonal], { moving: origin, nearbyPx: 4.99, worldPerScreenPixel: { x: 2, y: 3 } }), []);

// Tie hierarchy and permutation invariance.
check('smaller delta beats like-to-like preference',
  axisGuide(run([rect('like', 101, 300), rect('cross', 200, 300, 60, 40)]), 'x')?.targetId,
  'cross');
check('like-to-like beats cross-anchor at equal delta',
  axisGuide(run([rect('a-cross', 150, 300, 60, 40), rect('z-like', 100, 300)]), 'x')?.targetId,
  'z-like');
check('center-center wins among equal like-to-like anchors',
  axisGuide(run([rect('t', 100, 300)]), 'x')?.movingAnchor, 'center');
check('cross-anchor involving center wins over edge-edge tie',
  axisGuide(run([rect('a-edge', 200, 300, 60, 40), rect('z-center', 150, 300, 60, 40)]), 'x')?.targetId,
  'z-center');
check('nearest target beats stable ID after anchor preferences',
  axisGuide(run([rect('a-far', 100, 500), rect('z-near', 100, 300)]), 'x')?.targetId,
  'z-near');
const ties = [rect('z', 100, -100), rect('a', 100, 300)];
check('stable ID resolves equal-distance targets', axisGuide(run(ties), 'x')?.targetId, 'a');
check('target order cannot change tie output', run(ties), run([...ties].reverse()));
const duplicateIds = [rect('same', 100, -100), rect('same', 100, 300)];
check('duplicate-ID target order is deterministic too', run(duplicateIds), run([...duplicateIds].reverse()));

// Bad geometry/options fail closed, without poisoning other valid targets.
for (const patch of [
  { left: NaN }, { top: Infinity }, { width: 0 }, { height: -1 },
  { width: Infinity }, { height: NaN }, { left: Number.MAX_VALUE, width: Number.MAX_VALUE },
]) {
  const label = Object.keys(patch).join(',');
  check(`invalid moving ${label}`, run([rect('t', 100, 300)], { moving: { ...moving, ...patch } }), []);
  check(`invalid viewport ${label}`, run([rect('t', 100, 300)], { viewport: { ...viewport, ...patch } }), []);
  check(`invalid target ${label} skipped`, run([{ ...rect('bad', 100, 300), ...patch }, rect('ok', 100, 300)]),
    run([rect('ok', 100, 300)]));
}
for (const bad of [0, -1, NaN, Infinity]) {
  check(`invalid x scale ${String(bad)}`, run([rect('t', 100, 300)], { worldPerScreenPixel: { x: bad, y: 1 } }), []);
  check(`invalid y scale ${String(bad)}`, run([rect('t', 100, 300)], { worldPerScreenPixel: { x: 1, y: bad } }), []);
}
for (const bad of [-1, NaN, Infinity]) {
  check(`invalid tolerance ${String(bad)}`, run([rect('t', 100, 300)], { tolerancePx: bad }), []);
  check(`invalid nearby ${String(bad)}`, run([rect('t', 100, 300)], { nearbyPx: bad }), []);
}
check('finite edges required even when sizes and starts are finite', run([{
  ...rect('t', 100, 300), top: Number.MAX_VALUE, height: Number.MAX_VALUE,
}]), []);
check('overflowing screen distance is rejected', run([rect('t', 100, 300)], {
  worldPerScreenPixel: { x: 1, y: Number.MIN_VALUE },
}), []);

// Frozen input makes any accidental rect/array writes fail; Set contents and all
// properties are also checked after the call. Output is detached on each call.
const frozenMoving = Object.freeze({ ...moving });
const frozenTargets = Object.freeze([Object.freeze(rect('t', 100, 300))]);
const frozenViewport = Object.freeze({ ...viewport });
const frozenScale = Object.freeze({ x: 1, y: 1 });
const frozenInput = Object.freeze({
  moving: frozenMoving, targets: frozenTargets, viewport: frozenViewport,
  worldPerScreenPixel: frozenScale, excludedIds,
});
const before = JSON.stringify(frozenInput);
const beforeIds = [...excludedIds];
const first = computeCenterAlignmentGuides(frozenInput);
check('frozen inputs produce guides', first.length, 1);
check('input geometry/options unchanged', JSON.stringify(frozenInput), before);
check('excluded Set contents unchanged', [...excludedIds], beforeIds);
check('moving coordinates never corrected', [frozenMoving.left, frozenMoving.top], [100, 100]);
first[0].coordinate = -999;
check('outputs share no mutable guide state',
  computeCenterAlignmentGuides(frozenInput)[0].coordinate, 150);
check('output contract has only visual guide fields',
  Object.keys(computeCenterAlignmentGuides(frozenInput)[0]).sort(),
  ['axis', 'coordinate', 'from', 'to', 'movingAnchor', 'targetAnchor', 'targetId'].sort());

console.log(failed ? `\n${failed} failed` : '\nAll passed');
if (failed) process.exit(1);
