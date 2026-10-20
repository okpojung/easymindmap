import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMemo, fitLabel, PRESETS } from '../src/redesign/demo.ts';

test('empty input is safe', () => assert.deepEqual(parseMemo('  '), { root: '나의 생각 지도', groups: [], skipped: 0 }));
test('four presets yield three branches', () => { assert.equal(Object.keys(PRESETS).length, 4); for (const text of Object.values(PRESETS)) { const map = parseMemo(text); assert.equal(map.groups.length, 3); assert.equal(map.skipped, 0); }});
test('CRLF headings and lists', () => { const map = parseMemo('# 주제\r\n## 질문\r\n- 이유?\r\n* 근거?'); assert.equal(map.root, '주제'); assert.deepEqual(map.groups[0], { title: '질문', items: ['이유?', '근거?'] }); });
test('plain memo remains visible', () => assert.deepEqual(parseMemo('첫 생각\n다음 생각').groups[0].items, ['첫 생각', '다음 생각']));
test('display cap counts every omitted item', () => { const map = parseMemo('# T\n## A\n- 1\n- 2\n- 3\n## B\n## C\n## D\n- 4\n- 5\n- 6'); assert.equal(map.groups.length, 3); assert.equal(map.skipped, 5); });
test('markup-like input is text data', () => { const map = parseMemo('# <script>alert(1)</script>\n## <img src=x>\n- <b>content</b>'); assert.equal(map.root, '<script>alert(1)</script>'); assert.equal(map.groups[0].items[0], '<b>content</b>'); });
test('labels fit without splitting code points', () => { assert.equal(fitLabel('abc', 200, 12), 'abc'); assert.ok(fitLabel('아주 긴 제목을 적어도 안전하게 줄입니다', 100, 12).endsWith('…')); });
