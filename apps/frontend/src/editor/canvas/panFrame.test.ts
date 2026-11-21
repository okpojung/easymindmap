import assert from 'node:assert/strict';
import { createLatestFrameQueue } from './panFrame';

function setup() {
  let nextId = 0;
  const cbs = new Map<number, () => void>();
  const cancelled: number[] = [];
  const applied: number[] = [];
  const requested: number[] = [];
  const ctx: { q?: ReturnType<typeof createLatestFrameQueue<number>>; onApply?: (v: number) => void } = {};
  const q = createLatestFrameQueue<number>({
    requestFrame: (cb) => { const id = nextId++; cbs.set(id, cb); requested.push(id); return id; },
    cancelFrame: (id) => { cancelled.push(id); cbs.delete(id); },
    apply: (v) => { applied.push(v); ctx.onApply?.(v); },
  });
  ctx.q = q;
  return { q, cbs, cancelled, applied, requested, ctx, run: (id: number) => cbs.get(id)!() };
}

// burst coalescing + latest value
{
  const s = setup();
  s.q.push(1); s.q.push(2); s.q.push(3);
  assert.equal(s.requested.length, 1);
  assert.deepEqual(s.applied, []);
  s.run(0);
  assert.deepEqual(s.applied, [3]);
}
// immediate flush applies last synchronously, no extra frame
{
  const s = setup();
  s.q.push(1); s.q.push(9);
  s.q.flush();
  assert.deepEqual(s.applied, [9]);
  assert.equal(s.requested.length, 1);
  assert.deepEqual(s.cancelled, [0]);
  s.q.flush(); // nothing pending
  assert.deepEqual(s.applied, [9]);
}
// cancel drops queued work
{
  const s = setup();
  s.q.push(1);
  s.q.cancel();
  assert.deepEqual(s.cancelled, [0]);
  s.q.flush();
  assert.deepEqual(s.applied, []);
}
// stale callback invoked after cancel / flush is ignored
{
  const s = setup();
  s.q.push(1);
  const stale = s.cbs.get(0)!;
  s.q.cancel();
  stale();
  assert.deepEqual(s.applied, []);
  s.q.push(2); // new frame id 1
  stale(); // still stale
  assert.deepEqual(s.applied, []);
  s.run(1);
  assert.deepEqual(s.applied, [2]);

  const t = setup();
  t.q.push(5);
  const st = t.cbs.get(0)!;
  t.q.flush();
  t.q.push(6);
  st();
  assert.deepEqual(t.applied, [5]);
  t.run(1);
  assert.deepEqual(t.applied, [5, 6]);
}
// reentrant push during apply schedules a new frame
{
  const s = setup();
  s.ctx.onApply = (v) => { if (v === 1) s.q.push(2); };
  s.q.push(1);
  s.run(0);
  assert.deepEqual(s.applied, [1]);
  assert.equal(s.requested.length, 2);
  s.run(1);
  assert.deepEqual(s.applied, [1, 2]);
}
// frame id 0 is a valid scheduled id
{
  const s = setup();
  s.q.push(1);
  assert.equal(s.requested[0], 0);
  s.q.push(2);
  assert.equal(s.requested.length, 1);
  s.q.cancel();
  assert.deepEqual(s.cancelled, [0]);
}
console.log('panFrame tests passed');
