// 간트 줄 만들기 시험 (2026-11-07) — node --import tsx src/editor/gantt/ganttModel.test.ts
import assert from 'node:assert/strict';
import { buildGanttRows, dayNum, dayStr } from './ganttModel';

const map = {
  title: 'P',
  root: { id: 'root', text: '프로젝트' },
  branches: [
    { id: 'a', text: '설계', children: [
      { id: 'a1', text: '**화면** 설계', project: { start: '2026-11-03', end: '2026-11-07', progress: 50, assignee: { name: '가' }, assignees: [{ name: '가' }, { name: '나' }] } },
      { id: 'a2', text: '검토', project: { end: '2026-11-10' } },
      { id: 'a3', text: '일정 없음' },
    ] },
    { id: 'b', text: '개발', project: { start: '2026-11-12' }, children: [{ id: 'b1', text: '빈 가지' }] },
    { id: 'c', text: '일정 없는 가지', children: [{ id: 'c1', text: '역시 없음' }] },
  ],
} as never;

const g = buildGanttRows(map);
assert.deepEqual(g.rows.map((r) => r.id), ['root', 'a', 'a1', 'a2', 'b']);
const byId = Object.fromEntries(g.rows.map((r) => [r.id, r]));
assert.equal(byId.a.summary, true);
assert.equal(byId.a.barStart, '2026-11-03');
assert.equal(byId.a.barEnd, '2026-11-10');
assert.equal(byId.a1.text, '화면 설계');
assert.deepEqual(byId.a1.assignees, ['가', '나']);
assert.equal(byId.a1.progress, 50);
assert.equal(byId.a2.barStart, '2026-11-10');
assert.equal(byId.b.barEnd, '2026-11-12');
assert.equal(byId.b.hasChildren, false);
assert.equal(byId.root.summary, true);
assert.equal(byId.root.barEnd, '2026-11-12');
assert.equal(g.min, '2026-11-03');
assert.equal(g.max, '2026-11-12');
assert.equal(dayStr(dayNum('2026-12-31') + 1), '2027-01-01');
assert.deepEqual(buildGanttRows({ title: '', root: { id: 'root', text: 'x' }, branches: [] } as never).rows, []);
console.log('ganttModel.test: PASS');
