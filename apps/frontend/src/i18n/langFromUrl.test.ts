// npx tsx src/i18n/langFromUrl.test.ts — 주소의 ?lang= 읽기 (2026-10-28, 홈페이지 'EMM 로그인' 연결)
import { langFromSearch } from './index';
let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — 받음 ${JSON.stringify(got)}, 기대 ${JSON.stringify(want)}`}`);
};
check('en', langFromSearch('?lang=en'), 'en');
check('ja (다른 값과 함께)', langFromSearch('?from=www&lang=ja'), 'ja');
check('zh 대문자', langFromSearch('?lang=ZH'), 'zh');
check('ko', langFromSearch('?lang=ko'), 'ko');
check('지원하지 않는 값', langFromSearch('?lang=fr'), null);
check('값 없음', [langFromSearch(''), langFromSearch('?from=www'), langFromSearch(undefined)], [null, null, null]);
if (failed) { console.log(`\n${failed}개 실패`); process.exit(1); }
console.log('\nlangFromUrl: 모두 통과');
