// 프로젝트 태그 (2026-10-23).   npx tsx src/editor/node-renderer/projectTags.test.ts
import assert from 'node:assert/strict';
import { cleanProject, formatDateRange, isValidDate, normalizeProgress, projectChips } from './projectTags';

assert.equal(isValidDate('2026-11-03'), true);
assert.equal(isValidDate('2026-02-30'), false);
assert.equal(isValidDate('2026-1-3'), false);

assert.equal(formatDateRange('2026-11-03', '2026-11-14', 2026), '11-03~11-14');
assert.equal(formatDateRange('2026-11-03', '2026-11-03', 2026), '11-03');
assert.equal(formatDateRange('2026-11-03', undefined, 2026), '11-03');
assert.equal(formatDateRange(undefined, '2026-11-14', 2026), '~11-14');
assert.equal(formatDateRange('2026-12-31', '2027-01-12', 2026), '2026-12-31~2027-01-12');
assert.equal(formatDateRange('2027-03-01', '2027-03-05', 2026), '2027-03-01~2027-03-05');

assert.equal(normalizeProgress('35'), 35);
assert.equal(normalizeProgress(49.6), 50);
assert.equal(normalizeProgress(101), null);
assert.equal(normalizeProgress(''), null);

const p = { dateOn: true, start: '2026-11-03', end: '2026-11-14', assigneeOn: true, assignee: { name: ' 정제영 ' }, progressOn: true, progress: 50 };
assert.deepEqual(projectChips(p, 2026).map((c) => c.label), ['📅11-03~11-14', '@정제영', '%50']);
// 체크를 끄면 태그만 빠진다(값은 남는다)
assert.deepEqual(projectChips({ ...p, assigneeOn: false }, 2026).map((c) => c.kind), ['date', 'progress']);
assert.equal(cleanProject({ ...p, assigneeOn: false })?.assignee?.name, '정제영');
// 체크했어도 값이 없으면 태그 없음
assert.deepEqual(projectChips({ dateOn: true, progressOn: true }, 2026), []);
// 정리: 끝이 시작보다 앞이면 끝을 버린다, 빈 것은 undefined
assert.equal(cleanProject({ start: '2026-11-10', end: '2026-11-01' })?.end, undefined);
assert.equal(cleanProject({ progress: 300 }), undefined);
console.log('projectTags.test: PASS');
