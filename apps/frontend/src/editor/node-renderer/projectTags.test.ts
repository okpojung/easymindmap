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
// 시간까지 (2026-11-26)
assert.equal(formatDateRange('2026-11-03', '2026-11-14', 2026, '09:00', '18:00'), '11-03 09:00~11-14 18:00');
assert.equal(formatDateRange('2026-11-03', undefined, 2026, '14:05'), '11-03 14:05');
assert.equal(formatDateRange('2026-11-03', '2026-11-03', 2026, '09:00', '11:00'), '11-03 09:00~11:00');
assert.equal(formatDateRange(undefined, '2026-11-14', 2026, '09:00', '18:00'), '~11-14 18:00');
assert.deepEqual(projectChips({ dateOn: true, start: '2026-11-03', end: '2026-11-14', timeOn: true, startTime: '09:00', endTime: '18:00' }, 2026).map((c) => c.label), ['📅11-03 09:00~11-14 18:00']);
assert.deepEqual(projectChips({ dateOn: true, start: '2026-11-03', end: '2026-11-14', timeOn: false, startTime: '09:00', endTime: '18:00' }, 2026).map((c) => c.label), ['📅11-03~11-14'], 'time box off: dates only, times kept');
assert.deepEqual(cleanProject({ dateOn: true, start: '2026-11-03', timeOn: true, startTime: '09:00', endTime: '18:00' }), { start: '2026-11-03', startTime: '09:00', timeOn: true, dateOn: true }, 'a time without its date is dropped');
assert.equal(cleanProject({ start: '2026-11-03', startTime: '25:00' })?.startTime, undefined);
console.log('projectTags time PASS');
// 간트에서 끝일을 끌어 만들면 끝 시각도 붙는다 (2026-11-26 사용자 보고)
{ const g = cleanProject({ dateOn: true, timeOn: true, start: '2022-03-22', startTime: '12:00', end: '2022-03-24' }); assert.equal(g?.startTime, '12:00'); assert.equal(g?.endTime, '18:00'); assert.equal(g?.end, '2022-03-24'); }
assert.equal(cleanProject({ timeOn: true, start: '2022-03-22', end: '2022-03-24' })?.startTime, '09:00', 'start without time gets 09:00');
assert.equal(cleanProject({ timeOn: false, start: '2022-03-22', end: '2022-03-24' })?.endTime, undefined, 'time box off: no default times');
assert.equal(cleanProject({ timeOn: true, start: '2022-03-22', startTime: '19:00', end: '2022-03-22' })?.endTime, '19:00', 'same day: default end never before start');
assert.deepEqual(projectChips({ dateOn: true, timeOn: true, start: '2022-03-22', startTime: '12:00', end: '2022-03-24' }, 2022).map((c) => c.label), ['📅03-22 12:00~03-24 18:00'], 'already-saved node without end time shows the default');
console.log('projectTags gantt end-time PASS');
