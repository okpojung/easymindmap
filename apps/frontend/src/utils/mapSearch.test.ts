import assert from 'node:assert/strict';
import { collectSearchHits } from './mapSearch';
import { useMapSearchStore } from '@/stores/mapSearchStore';
import type { SampleMap } from '@/editor/__samples__/types';
let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('PASS ' + name); };
const map = {
  title: 'QA search', root: { id: 'root', text: 'Search root' },
  branches: [
    { id: 'parent', text: '부모\n노드', collapsed: true, children: [
      { id: 'child', text: '차기 사업자', tags: ['검토'], notes: [{ text: '공유 노트' }], links: [{ label: '안내', url: 'https://example.invalid/guide' }] },
    ] },
    { id: 'other', text: '다른 노드' },
  ],
} as unknown as SampleMap;
test('trim and case-insensitive root match', () => assert.equal(collectSearchHits(map, ' SEARCH ')[0].id, 'root'));
test('collapsed descendants remain searchable', () => assert.equal(collectSearchHits(map, '차기')[0].id, 'child'));
test('parent path uses the existing single-line node summary', () => assert.equal(collectSearchHits(map, '차기')[0].path, 'Search root › 부모 노드'));
test('tags retain kind badge', () => assert.deepEqual(collectSearchHits(map, '검토')[0].kinds, ['태그']));
test('notes are searchable', () => assert.deepEqual(collectSearchHits(map, '공유')[0].kinds, ['노트']));
test('link URLs are searchable', () => assert.deepEqual(collectSearchHits(map, 'guide')[0].kinds, ['링크']));
test('empty/whitespace produces no results', () => assert.deepEqual(collectSearchHits(map, '  '), []));
test('missing match produces no results', () => assert.deepEqual(collectSearchHits(map, '없는검색어'), []));
test('result limit remains 50', () => {
  const large = { ...map, branches: Array.from({ length: 60 }, (_, i) => ({ id: 'n' + i, text: 'target' })) } as unknown as SampleMap;
  assert.equal(collectSearchHits(large, 'target').length, 50);
});
const state = () => useMapSearchStore.getState();
test('document scope starts with empty query', () => { state().setScope(11); assert.equal(state().query, ''); });
test('query and scroll survive reopening same scope', () => { state().setQuery(11, '차기'); state().setScrollTop(11, 80); state().setScope(11); assert.equal(state().query, '차기'); assert.equal(state().scrollTop, 80); });
test('changing query resets result scroll', () => { state().setQuery(11, '새 검색'); assert.equal(state().scrollTop, 0); });
test('explicit clear empties query', () => { state().setQuery(11, ''); assert.equal(state().query, ''); });
test('new document epoch clears previous query and scroll', () => { state().setQuery(11, '차기'); state().setScrollTop(11, 80); state().setScope(12); assert.equal(state().query, ''); assert.equal(state().scrollTop, 0); });
test('stale document scroll cannot change current state', () => { state().setScrollTop(11, 120); assert.equal(state().docEpoch, 12); assert.equal(state().scrollTop, 0); });
test('stale document query cannot replace current query', () => { state().setQuery(12, '현재'); state().setQuery(11, '이전'); assert.equal(state().query, '현재'); assert.equal(state().docEpoch, 12); });
test('stale scope effect cannot reset current search', () => { state().setScope(11); assert.equal(state().query, '현재'); assert.equal(state().docEpoch, 12); });
console.log(`PASS map search: ${passed} checks`);
