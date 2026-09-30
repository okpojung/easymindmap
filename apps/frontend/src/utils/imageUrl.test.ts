// 자리표시·깨진 사진 주소는 받으러 가지 않는다 (2026-09-30, e2e318).
//   npx tsx src/utils/imageUrl.test.ts
import { isFetchableImageUrl } from './imageUrl';

let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — 받음 ${JSON.stringify(got)}`}`);
};

check('① 보통 주소', isFetchableImageUrl('https://example.com/a.png'), true);
check('① 포트·쿼리', isFetchableImageUrl('http://localhost:3000/x.png?v=1'), true);
check('② 줄임표 호스트 `https://…png` (URL 파싱 실패)', isFetchableImageUrl('https://…png'), false);
check('② `https://…`', isFetchableImageUrl('https://…'), false);
check('② 점만 있는 호스트 `https://...`', isFetchableImageUrl('https://...'), false);
check('② `http URL` (공백)', isFetchableImageUrl('http URL'), false);
check('③ 상대 경로는 원격이 아니다', isFetchableImageUrl('files/img-1.png'), false);
check('③ data URL 도 아니다', isFetchableImageUrl('data:image/png;base64,AAAA'), false);
check('③ 빈 문자열', isFetchableImageUrl(''), false);

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
