// 코드블럭 언어 목록 규칙 (2026-10-28, admin/code-languages.ts)
//   npm run build && node test/code-languages.test.mjs
import { parseCodeLanguages, DEFAULT_CODE_LANGUAGES, storedCodeLanguages } from '../dist/admin/code-languages.js';
let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${JSON.stringify(got)}\n      기대 ${JSON.stringify(want)}`}`);
};
check('다듬기 — 공백·대문자 표기', parseCodeLanguages([{ name: '  Java   Script ', code: ' JavaScript ' }]), { ok: true, items: [{ name: 'Java Script', code: 'javascript' }] });
check('표기 형식', parseCodeLanguages([{ name: 'X', code: 'a b' }]).ok, false);
check('중복 표기', parseCodeLanguages([{ name: 'A', code: 'a' }, { name: 'B', code: 'A' }]).ok, false);
check('이름 없음', parseCodeLanguages([{ name: '', code: 'a' }]).ok, false);
check('배열 아님', parseCodeLanguages('x').ok, false);
check('C# · C++ 표기 허용', parseCodeLanguages([{ name: 'C#', code: 'c#' }, { name: 'C++', code: 'c++' }]).ok, true);
check('기본 목록 자체가 규칙을 지킨다', parseCodeLanguages(DEFAULT_CODE_LANGUAGES).ok, true);
check('깨진 저장값은 null', storedCodeLanguages({ a: 1 }), null);
if (failed) { console.log(`\n${failed}개 실패`); process.exit(1); }
console.log('\ncode-languages: 모두 통과');
