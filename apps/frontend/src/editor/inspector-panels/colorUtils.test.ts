// 색 고르기 창 계산 검사 — HEX 정규화 · WCAG 대비 · 최근 색 목록
//   npx tsx src/editor/inspector-panels/colorUtils.test.ts
import assert from 'node:assert/strict';
import {
  COLOR_PALETTE, contrastLevel, contrastRatio, normalizeHex, pushRecentColor, readRecentColors,
} from './colorUtils';

// ① HEX 정규화
assert.equal(normalizeHex('#fef3c7'), '#FEF3C7');
assert.equal(normalizeHex('FEF3C7'), '#FEF3C7');
assert.equal(normalizeHex('  #abc '), '#AABBCC');
assert.equal(normalizeHex('abc'), '#AABBCC');
assert.equal(normalizeHex('#abcd'), null);
assert.equal(normalizeHex('rgb(1,2,3)'), null);
assert.equal(normalizeHex('#GGGGGG'), null);
assert.equal(normalizeHex(''), null);

// ② WCAG 대비 — 알려진 값
assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
assert.equal(contrastRatio('#FFFFFF', '#FFFFFF'), 1);
assert.equal(contrastRatio('#FFFFFF', '#000'), 21); // 순서·짧은 형식 무관
assert.equal(contrastRatio('#777777', '#FFFFFF'), 4.5);
assert.equal(contrastRatio('nope', '#FFFFFF'), null);
// 기본 노드 색 (채움 #FEF3C7 · 글자 #78350F) 은 읽기 좋아야 한다
const def = contrastRatio('#FEF3C7', '#78350F')!;
assert.ok(def >= 4.5, `기본 노드 대비 ${def}`);
assert.equal(contrastLevel(def), 'good');
// 다크 테마에서 생겼던 '밝은 바탕 + 밝은 글자' 는 'bad'
assert.equal(contrastLevel(contrastRatio('#FEF3C7', '#F1F5F9')!), 'bad');
assert.equal(contrastLevel(3.2), 'large');

// ③ 팔레트 — 16색, 모두 정규화된 HEX, 중복 없음
assert.equal(COLOR_PALETTE.length, 16);
for (const c of COLOR_PALETTE) assert.equal(normalizeHex(c), c);
assert.equal(new Set(COLOR_PALETTE).size, 16);

// ④ 최근 색 — 맨 앞에 넣고 중복 제거, 8개까지, 깨진 값은 버림
const mem = new Map<string, string>();
const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
assert.deepEqual(readRecentColors(st), []);
pushRecentColor('#111111', st);
pushRecentColor('#222', st);
assert.deepEqual(readRecentColors(st), ['#222222', '#111111']);
pushRecentColor('#111111', st);
assert.deepEqual(readRecentColors(st), ['#111111', '#222222']);
for (let i = 0; i < 12; i++) pushRecentColor('#' + String(i).padStart(2, '0').repeat(3), st);
assert.equal(readRecentColors(st).length, 8);
assert.equal(readRecentColors(st)[0], '#111111'); // 마지막(i=11)
assert.deepEqual(pushRecentColor('not-a-color', st), readRecentColors(st));
mem.set('emm.color.recent', '{broken');
assert.deepEqual(readRecentColors(st), []);
mem.set('emm.color.recent', JSON.stringify(['#abc', 5, 'zz', '#123456']));
assert.deepEqual(readRecentColors(st), ['#AABBCC', '#123456']);

console.log('colorUtils: ok');
