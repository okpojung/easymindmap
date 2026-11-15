// 문서함 도움말·머리 문구 — 4개 언어가 같은 구조로 채워져 있는지 확인한다.
// 실행: tsx src/components/help/docsHelpCopy.test.ts
import assert from 'node:assert/strict';
import help from './docsHelpCopy.json';
import hdr from '../cloud/docsHeaderCopy.json';

const langs = ['ko', 'en', 'zh', 'ja'] as const;
const h = help as Record<string, any>;
const d = hdr as Record<string, any>;
for (const l of langs) {
  assert.ok(h[l], 'help copy ' + l);
  for (const k of ['eyebrow', 'title', 'close', 'intro', 'toc', 'back', 'closeLabel']) {
    assert.ok(typeof h[l][k] === 'string' && h[l][k].length > 0, l + '.' + k);
  }
  assert.equal(h[l].sections.length, h.ko.sections.length, l + ' section count');
  h[l].sections.forEach((s: any, i: number) => {
    assert.ok(s.t, l + ' title ' + i);
    assert.equal(!!s.p, !!h.ko.sections[i].p, l + ' shape p ' + i);
    assert.equal(!!s.o, !!h.ko.sections[i].o, l + ' shape o ' + i);
    assert.equal((s.p ?? s.o).length, (h.ko.sections[i].p ?? h.ko.sections[i].o).length, l + ' items ' + i);
  });
  assert.ok(d[l].search && d[l].help, 'header copy ' + l);
}
console.log('docsHelpCopy.test OK');
