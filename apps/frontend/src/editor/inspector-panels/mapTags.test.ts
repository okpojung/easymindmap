import assert from 'node:assert/strict';
import { collectMapTags } from './mapTags';
import type { SampleMap } from '@/editor/__samples__/types';

const map = {
  title: 'Tags',
  root: { id: 'root', text: 'Root', tags: ['shared', 'shared'], tag: 'legacy' },
  branches: [{ id: 'a', text: 'A', collapsed: true, tags: ['shared'], tag: 'shared', children: [
    { id: 'a1', text: 'A1', tags: [], tag: 'legacy' },
  ] }],
  centers: [{ root: { id: 'b', text: 'B', tags: ['second'] }, branches: [
    { id: 'b1', text: 'B1', tags: ['shared', 'second'] },
  ] }],
} as unknown as SampleMap;
const before = JSON.stringify(map);
assert.deepEqual(collectMapTags(map), [['shared', 3], ['legacy', 2], ['second', 2]]);
assert.equal(JSON.stringify(map), before);
assert.deepEqual(collectMapTags({ title: 'Empty', root: { id: 'root', text: '' }, branches: [] } as SampleMap), []);
console.log('PASS map tags: distinct nodes, mixed legacy/new tags, collapsed descendants, all centers, count sorting, empty map, no mutations');
