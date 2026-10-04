// i18n 사전 검사 — 키 접두사·빈 값·자리표시({n}) 일치. 타입이 못 잡는 것을 본다.
import assert from 'node:assert/strict';
import { DICT_SETS } from './dict';
import { detectLang, translate } from './index';

let checked = 0;
for (const [ns, set] of Object.entries(DICT_SETS)) {
  const ko = set.ko as Record<string, string>;
  for (const key of Object.keys(ko)) {
    assert.ok(key.startsWith(`${ns}.`), `'${key}' 는 '${ns}.' 으로 시작해야 한다`);
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const lang of ['ko', 'en', 'zh', 'ja'] as const) {
      const v = (set[lang] as Record<string, string>)[key];
      assert.equal(typeof v, 'string', `${lang} 에 '${key}' 가 없다`);
      assert.ok(v.trim().length > 0, `${lang} '${key}' 가 비었다`);
      assert.equal(holes(v), holes(ko[key]), `${lang} '${key}' 의 자리표시가 한국어와 다르다`);
      checked++;
    }
    for (const lang of ['en', 'zh', 'ja'] as const) {
      // 한국어가 그대로 남은 번역 — 고유명사 없이 한글이 있으면 빠뜨린 것이다
      const v = (set[lang] as Record<string, string>)[key];
      assert.ok(!/[가-힣]/.test(v) || key.endsWith('.native'), `${lang} '${key}' 에 한글이 남았다: ${v}`);
    }
  }
  for (const lang of ['en', 'zh', 'ja'] as const) {
    for (const key of Object.keys(set[lang])) assert.ok(key in ko, `${lang} 에만 있는 키 '${key}'`);
  }
}

assert.equal(detectLang(['ko-KR', 'en']), 'ko');
assert.equal(detectLang(['ja']), 'ja');
assert.equal(detectLang(['zh-TW']), 'zh');
assert.equal(detectLang(['fr-FR', 'en-US']), 'en');
assert.equal(detectLang(['fr-FR']), 'en');
assert.equal(translate('en', 'common.ok'), 'OK');
assert.equal(translate('ko', 'no.such.key'), 'no.such.key');

console.log(`i18n.test: ${checked} 항목 PASS`);
