// 지식창고 태그·작성자 이름 규칙 단위 테스트 (2026-10-26, `publish/publish-social.service.ts`).
//
//   npm run build && node test/publish-social.test.mjs

import { normalizeTag, normalizeTags, authorName } from '../dist/publish/publish-social.service.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

check('# 떼고 소문자', normalizeTag('#AI'), 'ai');
check('한글 그대로', normalizeTag('  회의록 '), '회의록');
check('안쪽 공백 하나로', normalizeTag('meeting   notes'), 'meeting notes');
check('기호는 공백으로', normalizeTag('<script>x</script>'), 'script x script');
check('빈 값', [normalizeTag(''), normalizeTag('###'), normalizeTag(null), normalizeTag(3)], [null, null, null, null]);
check('30자에서 자른다', normalizeTag('a'.repeat(40)).length, 30);
check('목록: 중복 제거·10개', normalizeTags(['A', 'a', '#a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
check('목록: 배열 아님', normalizeTags('ai'), null);
check('이름: 별명 우선', authorName('지식왕', '정제영'), '지식왕');
check('이름: 실명 가리기', [authorName(null, '정제영'), authorName('', '홍길'), authorName(null, '남궁민수'), authorName(null, null)], ['정*영', '홍*', '남**수', '회원']);

if (failed) { console.log(`\n${failed}개 실패`); process.exit(1); }
console.log('\npublish-social: 모두 통과');
