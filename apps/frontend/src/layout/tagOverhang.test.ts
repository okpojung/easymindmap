// 태그 여러 줄 배치 (2026-10-23).   npx tsx src/layout/tagOverhang.test.ts
import assert from 'node:assert/strict';
import { layoutTagRows, tagChipWidth, tagOverhang, tagRowCount, TAG_INSET } from './tagOverhang';

const tags = ['날짜', '2026/12/31-2027/01/12', '정제영', '진행 50%'];
const w = 200;
const rows = layoutTagRows(tags, w);
// 어느 칩도(혼자 놓인 넓은 칩 제외) 노드 오른쪽 경계를 넘지 않는다
rows.forEach((r, i) => {
  const alone = r.x === TAG_INSET;
  assert.ok(alone || r.x + r.w <= w - 4, `chip ${i} stays inside`);
});
// 순서는 그대로, 줄은 늘어나기만 한다
for (let i = 1; i < rows.length; i++) assert.ok(rows[i].row >= rows[i - 1].row, 'rows are monotonic');
assert.ok(tagRowCount(tags, w) >= 2, 'four tags need more than one row at 200px');
assert.equal(tagRowCount(['a'], w), 1);
assert.equal(tagRowCount([], w), 0);
// 넓은 노드는 한 줄
assert.equal(tagRowCount(tags, 2000), 1);
// 아래 자리도 줄 수만큼 늘어난다
assert.ok(tagOverhang({ tags }, w) > tagOverhang({ tags: ['a'] }, w));
assert.equal(tagOverhang({}, w), 0);
assert.ok(tagChipWidth('가나다') > tagChipWidth('a'));
console.log('tagOverhang.test: PASS');
