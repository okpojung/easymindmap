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

const fence = String.fromCharCode(96).repeat(3);
const mediaMap = { title: 'Media tags', root: { id: 'mr', text: 'Root' }, branches: [
  { id: 'mer', text: fence + 'mermaid\ngraph TD; A-->B;\n' + fence, contentFolded: true },
  { id: 'img', text: '', image: { src: 'image.png' } },
  { id: 'html', text: fence + 'html\n<b>Hi</b>\n' + fence },
  { id: 'own', text: '', image: { src: 'image2.png' }, tags: ['image', 'manual', 'manual'] },
  { id: 'mixed', text: 'Title\n' + fence + 'mermaid\ngraph TD; A-->B;\n' + fence },
  { id: 'project', text: 'Task', project: { dateOn: true, start: '2026-11-14' } },
] } as unknown as SampleMap;
const mediaBefore = JSON.stringify(mediaMap);
assert.deepEqual(collectMapTags(mediaMap), [['image', 1], ['manual', 1]]);
const visibility = new Map(collectMapTags(mediaMap, { includeAuto: true }));
assert.equal(visibility.get('Mermaid'), 1, 'folded pure media remains selectable; mixed nodes have no automatic tag');
assert.equal(visibility.get('Image'), 1, 'manual image suppresses duplicate automatic Image, matching mediaView');
assert.equal(visibility.get('image'), 1);
assert.equal(visibility.get('HTML'), 1);
assert.equal(visibility.get('manual'), 1, 'count nodes, not duplicate occurrences');
assert.equal(visibility.size, 5, 'project fields are not ordinary tag filters');
assert.equal(JSON.stringify(mediaMap), mediaBefore, 'visibility collection must never mutate document data');
console.log('PASS automatic tag visibility: image/html/mermaid, folded media, mixed-node exclusion, case suppression, nonmutation');
