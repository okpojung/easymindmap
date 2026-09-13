// outageNoticeFor 단위 테스트 — 어떤 실패에 "배포 중" 배너를 띄우나 (2026-09-13, B20 ⑧ⓑ).
//
//   npx tsx src/utils/outageNotice.test.ts

import { outageNoticeFor } from './outageNotice';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${JSON.stringify(got)}\n      기대 ${JSON.stringify(want)}`}`);
}
const kind = (err: unknown) => outageNoticeFor(err)?.kind ?? null;

check('① MAINTENANCE 코드(NPM 점검 응답 503) → maintenance', kind({ status: 503, code: 'MAINTENANCE' }), 'maintenance');
check('② status 0(fetch 실패) → unreachable', kind({ status: 0 }), 'unreachable');
check('③ 502 → unreachable', kind({ status: 502 }), 'unreachable');
check('④ 503(코드 없음) → unreachable', kind({ status: 503 }), 'unreachable');
check('⑤ 504 → unreachable', kind({ status: 504 }), 'unreachable');
check('⑥ 500 은 서버가 대답한 것 → null', kind({ status: 500 }), null);
check('⑦ 401·409 STALE 은 null', [kind({ status: 401 }), kind({ status: 409, code: 'STALE' })], [null, null]);
check('⑧ CloudError 가 아닌 것(문자열·undefined) → null', [kind('x'), kind(undefined)], [null, null]);
check('⑨ 문구 — maintenance 는 배포라고 말한다', outageNoticeFor({ code: 'MAINTENANCE' })?.title, '버전 업그레이드 배포 중입니다');
check('⑩ 문구 — unreachable 은 "배포 중일 수 있다"까지만', outageNoticeFor({ status: 502 })?.title, '서버에 연결되지 않습니다 — 배포 중일 수 있습니다');
check('⑪ 설명은 둘 다 같다(편집 보관·자동 저장)', outageNoticeFor({ status: 0 })?.detail === outageNoticeFor({ code: 'MAINTENANCE' })?.detail, true);

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
