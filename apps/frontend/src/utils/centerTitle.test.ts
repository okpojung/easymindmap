// npx tsx src/utils/centerTitle.test.ts
import { titleFromCenter } from './centerTitle';
let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — 받음 ${JSON.stringify(got)}, 기대 ${JSON.stringify(want)}`}`);
};
check('그대로', titleFromCenter('2026 제품 로드맵'), '2026 제품 로드맵');
check('첫 줄만', titleFromCenter('\n  회의록\n둘째 줄'), '회의록');
check('장식 벗기기', titleFromCenter('**AI** 활용 `가이드` [링크](https://x.y)'), 'AI 활용 가이드 링크');
check('머리 기호', titleFromCenter('## 주제'), '주제');
check('공백 하나로', titleFromCenter('a    b'), 'a b');
check('100자', titleFromCenter('가'.repeat(150))?.length, 100);
check('빈 값', [titleFromCenter(''), titleFromCenter('   '), titleFromCenter(null), titleFromCenter(undefined)], [null, null, null, null]);
if (failed) { console.log(`\n${failed}개 실패`); process.exit(1); }
console.log('\ncenterTitle: 모두 통과');
