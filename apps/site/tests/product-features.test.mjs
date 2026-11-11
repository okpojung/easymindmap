import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const added = ['variables', 'markdown', 'encrypted'];
const all = ['ai','edit','view','attach','io','share',...added];
function groups(lang) {
 const source = ts.createSourceFile('pages.' + lang + '.tsx', read('src/i18n/pages.' + lang + '.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
 let found;
 function visit(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'groups' && ts.isObjectLiteralExpression(node.initializer)) found = node.initializer;
  ts.forEachChild(node, visit);
 }
 visit(source); assert.ok(found);
 return Object.fromEntries(found.properties.map(p => [p.name.getText(source), Object.fromEntries(p.initializer.properties.map(v => [v.name.getText(source), ts.isArrayLiteralExpression(v.initializer) ? v.initializer.elements.map(e => e.text) : v.initializer.text]))]));
}
for (const lang of ['ko','en','ja','zh']) {
 test(lang + ': all nine feature groups and honest added-feature details', () => {
  const g = groups(lang); assert.deepEqual(Object.keys(g).sort(), [...all].sort());
  for (const id of added) { assert.ok(g[id].title); assert.ok(g[id].lead); assert.ok(g[id].guide); assert.ok(g[id].items.length >= 4); }
  assert.ok(g.variables.items.some(x => x.includes('[&')));
  assert.ok(g.markdown.items.some(x => x.includes('.md')));
  assert.ok(g.encrypted.items.some(x => x.includes('ZIP')));
  assert.ok(g.encrypted.items.some(x => x.includes('8')));
  assert.doesNotMatch(g.encrypted.items.join(' '), /20MiB|40MiB|100%|unbreakable|unlimited|완벽|무제한/);
 });
 test(lang + ': home features have stable deep links, no fake interactive app tools', () => {
  const f = 'src/redesign/template' + (lang === 'ko' ? '' : '.' + lang) + '.html';
  const html = read(f), section = html.match(/<section class="section product-updates"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section); assert.equal((section.match(/<article class="product-update-card">/g) || []).length, 3);
  assert.match(section, /aria-labelledby="new-features-title"/);
  assert.match(section, /id="new-features-title"/);
  for (const id of added) assert.equal((section.match(new RegExp('href="/function#' + id + '"', 'g')) || []).length, 1);
  assert.doesNotMatch(section, /<button|<input|<form|<iframe|<script/);
  assert.match(html, /data-hero-youtube/);
 });
}
test('all language versions explicitly warn that lost passwords cannot recover encrypted files', () => {
 const needles = {ko:'암호 분실 시 복구 불가',en:'A lost password cannot be recovered',ja:'パスワード紛失時は復元不可',zh:'密码丢失无法恢复'};
 for (const [lang, needle] of Object.entries(needles)) assert.ok(groups(lang).encrypted.items.some(x => x.includes(needle)), lang);
});
test('group IDs are stable data, not translated titles, with safe initial deep-link handling', () => {
 const definitions = read('src/content/functions.ts'), page = read('src/pages/Function.tsx');
 for (const id of all) assert.match(definitions, new RegExp("id: '" + id + "'"));
 assert.match(definitions, /id: FunctionGroupId/); assert.match(page, /<article id=\{g.id\} key=\{g.id\}>/);
 assert.match(page, /FUNCTIONS.some\(g => g.id === id\)/); assert.match(page, /scrollIntoView/);
 assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
});
test('new home cards collapse to one column and keep usable links', () => {
 const css = read('src/redesign/redesign.css');
 assert.match(css, /product-update-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css, /@media\(max-width:900px\)\{\.emm-home \.product-update-grid\{grid-template-columns:1fr\}/);
 assert.match(css, /product-update-card a\{[^}]*min-height:44px/); assert.match(css, /product-update-card a:focus-visible/);
 assert.match(css, /\.func article\[id\]\{scroll-margin-top:110px\}/);
});

test('all four locales distinguish embedded-map persistence from server attachment saving', () => {
 const needles = {ko:['맵의 저장도 필요','서버 첨부는 서버에 저장'],en:['normal map saving','server attachments save to the server'],ja:['マップの保存も必要','サーバー添付はサーバーに保存'],zh:['仍需正常保存导图','服务器附件则保存到服务器']};
 for (const [lang, parts] of Object.entries(needles)) for (const part of parts) assert.ok(groups(lang).markdown.items.some(x => x.includes(part)), lang + ': ' + part);
});
