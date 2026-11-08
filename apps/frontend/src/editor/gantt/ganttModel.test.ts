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
assert.deepEqual(g.rows.map((r) => r.id), ['root', 'a', 'a1', 'a2', 'a3', 'b', 'b1', 'c', 'c1']);
assert.deepEqual(g.rows.filter((r) => r.dated).map((r) => r.id), ['a1', 'a2', 'b']);
const byId = Object.fromEntries(g.rows.map((r) => [r.id, r]));
assert.equal(byId.a.summary, true);
assert.equal(byId.a.barStart, '2026-11-03');
assert.equal(byId.a.barEnd, '2026-11-10');
assert.equal(byId.a1.text, '화면 설계');
assert.deepEqual(byId.a1.assignees, ['가', '나']);
assert.equal(byId.a1.progress, 50);
assert.equal(byId.a2.barStart, '2026-11-10');
assert.equal(byId.b.barEnd, '2026-11-12');
assert.equal(byId.b.hasChildren, true);
assert.equal(byId.a3.barStart, undefined);
assert.equal(byId.c.summary, false);
assert.equal(byId.b.branch, 1);
assert.equal(byId.a2.branch, 0);
assert.equal(byId.root.summary, true);
assert.equal(byId.root.barEnd, '2026-11-12');
assert.equal(g.min, '2026-11-03');
assert.equal(g.max, '2026-11-12');
assert.equal(dayStr(dayNum('2026-12-31') + 1), '2027-01-01');
assert.deepEqual(buildGanttRows({ title: '', root: { id: 'root', text: 'x' }, branches: [] } as never).rows.filter((r) => r.dated), []);
// 끌기
import { draggedDates, taskStatus, isMine } from './ganttModel';
assert.deepEqual(draggedDates(byId.a1, 'move', 2), { start: '2026-11-05', end: '2026-11-09' });
assert.deepEqual(draggedDates(byId.a2, 'move', -1), { end: '2026-11-09' }); // 끝만 있던 노드는 끝만
assert.deepEqual(draggedDates(byId.b, 'move', 3), { start: '2026-11-15' });  // 시작만 있던 노드는 시작만
assert.deepEqual(draggedDates(byId.a1, 'start', 10), { start: '2026-11-07' }); // 끝을 넘지 않는다
assert.deepEqual(draggedDates(byId.a1, 'end', -10), { end: '2026-11-03' });   // 시작보다 앞으로 못 간다
assert.deepEqual(draggedDates(byId.b, 'end', 4), { end: '2026-11-16' });
assert.deepEqual(draggedDates(byId.a2, 'start', -2), { start: '2026-11-08' }); // 끝만 있던 노드에 시작이 생긴다(끝은 그대로)
// 작업 목록
assert.deepEqual(g.tasks.map((t) => t.id), ['a1', 'a2', 'b']);
assert.equal(g.tasks[0].path, '프로젝트 › 설계');
assert.equal(taskStatus({ start: '2026-11-03', end: '2026-11-07', progress: 100 }, '2026-12-01'), 'done');
assert.equal(taskStatus({ start: '2026-11-03', end: '2026-11-07' }, '2026-11-08'), 'late');
assert.equal(taskStatus({ start: '2026-11-03', end: '2026-11-07' }, '2026-11-05'), 'doing');
assert.equal(taskStatus({ start: '2026-11-03' }, '2026-11-01'), 'todo');
assert.equal(taskStatus({}, '2026-11-01'), 'nodate');
assert.equal(isMine(g.tasks[0], { name: '나' }), true);
assert.equal(isMine({ assignees: [{ name: 'x', email: 'A@B.kr' }] }, { email: 'a@b.kr' }), true);
assert.equal(isMine(g.tasks[0], null), false);
console.log('ganttModel.test: PASS');
