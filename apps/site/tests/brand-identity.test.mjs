import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
function story(lang) {
 const file = lang === 'ko' ? 'src/redesign/brand.ts' : 'src/redesign/guides.' + lang + '.ts';
 const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
 let result;
 function visit(node) {
  if (lang === 'ko' && ts.isVariableDeclaration(node) && node.name.getText(source) === 'BRAND_STORY_HTML') result = node.initializer.getText(source);
  if (lang !== 'ko' && ts.isPropertyAssignment(node) && node.name.getText(source) === '"brand"') {
   const body = node.initializer.properties.find(p => p.name.getText(source) === '"body"');
   result = body.initializer.getText(source);
  }
  ts.forEachChild(node, visit);
 }
 visit(source); assert.ok(result, file); return result;
}
test('compact SVG preserves the approved balanced-A geometry and palette without raster content', () => {
 const svg = read('src/redesign/favicon.svg');
 for (const value of ['viewBox="0 0 192 192"', 'cx="96" cy="96" r="86"', 'x="116" y="74" width="76" height="20"', 'cx="98" cy="112" r="22"', 'cx="98" cy="112" r="18"', '#235A48', '#5A3825', '#F0C49C']) assert.ok(svg.includes(value), value);
 assert.equal(svg.match(/<path d="([^"]+)"/)?.[1], 'M 179.1384387633061 74 A 86 86 0 1 0 177.97560612767677 122 L 147.84592558726288 122 A 58 58 0 1 1 149.66563145999496 74 Z');
 assert.match(svg, /<clipPath id="outer-A"><circle cx="96" cy="96" r="86"\/><\/clipPath>/);
 assert.match(svg, /<g clip-path="url\(#outer-A\)">/);
 assert.doesNotMatch(svg, /<image|<script|<foreignObject|data:|base64|draft|시안|운영 미적용/i);
});
test('favicon is emitted as a cache-busted asset and shared with the footer', () => {
 const brand = read('src/redesign/brand.ts'), controller = read('src/redesign/controller.ts');
 assert.ok(brand.includes("import faviconUrl from './favicon.svg?no-inline'"));
 assert.ok(brand.includes('export const BRAND_FAVICON_URL = faviconUrl'));
 assert.match(brand, /icon\.href = BRAND_FAVICON_URL/);
 assert.ok(controller.includes("all<HTMLImageElement>('[data-brand-icon]').forEach(image => { image.src = BRAND_FAVICON_URL; })"));
});
for (const lang of ['ko','en','ja','zh']) {
 test(lang + ': brand story leads with a large accessible A symbol and preserves the full logo', () => {
  const body = story(lang);
  const first = body.match(/^`(<figure[\s\S]*?<\/figure>)/)?.[1];
  assert.ok(first); assert.match(first, /class="brand-story-visual brand-story-symbol"/);
  assert.ok(first.includes('src="${BRAND_FAVICON_URL}"'));
  assert.match(first, /width="192" height="192" alt="[^"]+" decoding="async"/);
  assert.match(first, /<figcaption>[^<]+<\/figcaption>/);
  assert.equal((body.match(/class="brand-story-visual brand-story-symbol"/g) || []).length, 1);
  assert.ok(body.includes('src="${BRAND_LOGO_URL}" width="670" height="410"'));
  assert.match(body, /brand-story-person/); assert.match(body, /brand-palette/);
  const sourceLine = body.match(/<p class="source-line">([\s\S]*?)<\/p>/)?.[1];
  assert.ok(sourceLine); assert.match(sourceLine, /정식 로고|full logo|正式なロゴ|完整标志/); assert.match(sourceLine, /SVG/);
  const compact = body.split('<div class="brand-icon-example">')[1]?.split('</div>')[0];
  assert.ok(compact); assert.doesNotMatch(compact, /순환 화살표|circular arrow|循環する矢印|循环箭头/);
  assert.match(compact, /원형|ring|円形|圆环/);
 });
 test(lang + ': homepage footer uses the same compact icon at its existing small size', () => {
  const html = read('src/redesign/template' + (lang === 'ko' ? '' : '.' + lang) + '.html');
  const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0];
  assert.ok(footer); assert.equal((footer.match(/data-brand-icon/g) || []).length, 1);
  assert.match(footer, /<img data-brand-icon width="28" height="28" alt="">/);
 });
}
test('large symbol stays square and shrinks inside narrow brand-story panels', () => {
 const css = read('src/redesign/redesign.css');
 assert.match(css, /brand-story-symbol img\{width:min\(100%,320px\);aspect-ratio:1\}/);
 assert.match(css, /brand-story-visual img\{[^}]*height:auto/);
 assert.match(css, /@media\(max-width:800px\)\{\.emm-home \.brand-story-visual\{padding:12px\}/);
});
test('touch icon is a correctly sized PNG from the same approved symbol', () => {
 const png = readFileSync(new URL('../src/redesign/favicon-touch.png', import.meta.url));
 assert.equal(png.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
 assert.equal(png.readUInt32BE(16),180); assert.equal(png.readUInt32BE(20),180);
});
test('brand regression checks run in both local tests and production CI build', () => {
 const pkg = JSON.parse(read('package.json'));
 for (const command of [pkg.scripts.test,pkg.scripts.build]) assert.ok(command.includes('tests/brand-identity.test.mjs'));
});
