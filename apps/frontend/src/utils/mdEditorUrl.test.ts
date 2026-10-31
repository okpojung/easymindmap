// 마크다운 첨부 → 웹 편집기 주소 (2026-10-31, e2e — test-catalog 「MD 첨부 편집기」).
//   npx tsx src/utils/mdEditorUrl.test.ts
import { isMarkdownName, mdEditorUrl } from './mdEditorUrl';

let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — 받음 ${JSON.stringify(got)}`}`);
};

check('① .md', isMarkdownName('회의록.md'), true);
check('① .markdown 대문자', isMarkdownName('README.MARKDOWN'), true);
check('① .pdf 는 아니다', isMarkdownName('a.pdf'), false);
check('① .mdx 는 아니다', isMarkdownName('a.mdx'), false);
check('① 이름 없음', isMarkdownName(undefined), false);

const TOKEN = 'eyJhbGciOi.abc+/=.sig';
const url = mdEditorUrl({
  att: 'f3b1c2d4-0000-4000-8000-000000000001',
  api: 'https://api-dev.mindmap.ai.kr/',
  name: '회의록 #1 & 정리.md',
  token: TOKEN,
});
const u = new URL(url, 'https://pro-dev.mindmap.ai.kr');
check('② 경로', u.pathname, '/md-editor/');
check('② att', u.searchParams.get('att'), 'f3b1c2d4-0000-4000-8000-000000000001');
check('② api (끝 / 제거)', u.searchParams.get('api'), 'https://api-dev.mindmap.ai.kr');
check('② name (#·& 가 쿼리를 깨지 않는다)', u.searchParams.get('name'), '회의록 #1 & 정리.md');
check('② 쿼리 키는 셋뿐', [...u.searchParams.keys()], ['att', 'api', 'name']);
check('③ 토큰이 쿼리 어디에도 없다', decodeURIComponent(u.search).includes(TOKEN), false);
check('③ 쿼리에 t 키가 없다', u.searchParams.has('t'), false);
check('③ 토큰은 해시에만', new URLSearchParams(u.hash.slice(1)).get('t'), TOKEN);
check('③ access_token 쿼리를 쓰지 않는다', url.includes('access_token'), false);

const noTok = mdEditorUrl({ att: 'x', api: 'http://localhost:3000', name: 'a.md', token: null });
check('④ 토큰 없으면(dev 인증) 해시도 없다', noTok.includes('#'), false);

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
