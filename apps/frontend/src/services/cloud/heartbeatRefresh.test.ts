// heartbeatRefreshPlan 단위 테스트 — 협업 중에는 다시 읽지 않는다 (2026-09-08).
//
//   npx tsx src/services/cloud/heartbeatRefresh.test.ts

import { heartbeatRefreshPlan } from './heartbeatRefresh';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${JSON.stringify(got)}\n      기대 ${JSON.stringify(want)}`}`);
}

const T0 = '2026-09-08T10:00:00.000Z';
const T1 = '2026-09-08T10:00:05.000Z';

check('① 서버가 새롭고 협업 아님 → refresh', heartbeatRefreshPlan({ updatedAt: T1 }, T0, false), 'refresh');
check('② 서버가 새롭고 협업 중 → follow (다시 읽지 않는다)', heartbeatRefreshPlan({ updatedAt: T1 }, T0, true), 'follow');
check('③ 같은 시각 → none', heartbeatRefreshPlan({ updatedAt: T0 }, T0, false), 'none');
check('④ 서버가 더 오래됨 → none', heartbeatRefreshPlan({ updatedAt: T0 }, T1, false), 'none');
check('⑤ 편집권 상실(held=false)이면 새로워도 none', heartbeatRefreshPlan({ held: false, updatedAt: T1 }, T0, false), 'none');
check('⑥ 아는 시각이 없으면 none', heartbeatRefreshPlan({ updatedAt: T1 }, null, false), 'none');
check('⑦ 응답이 없으면 none', heartbeatRefreshPlan(null, T0, true), 'none');
check('⑧ updatedAt 없으면 none', heartbeatRefreshPlan({ held: true }, T0, true), 'none');
check('⑨ held=true 는 평소와 같다', heartbeatRefreshPlan({ held: true, updatedAt: T1 }, T0, false), 'refresh');

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
