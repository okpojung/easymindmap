// 대시보드맵 전환·잠금 규칙 단위 테스트 (2026-09-30, `maps/dashboard-rules.ts`).
//
//   npm run build && npm run test:dashboard
//
// 설계: docs/04-extensions/dashboard/22-dashboard.md §4.1 · §5 · §7
// 지키는 것: 되돌리기는 언제나 된다 · 협업·퍼블리싱과 서로 막는다 ·
// 겹친 노드 ID 는 입구에서 막는다 · 사람의 저장은 잠긴다.

import {
  dashboardSwitchBlock, dashboardLockBlock, duplicateNodeIds,
} from '../dist/maps/dashboard-rules.js';

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`);
}
const base = {
  current: 'edit', kind: 'solo', registered: false,
  featureEnabled: true, featureReason: null, duplicateIds: [],
};
const code = (x) => (x ? x.code : null);

// ── ① 일반맵 → 대시보드 ─────────────────────────────────────────
check('① 조건이 맞으면 통과', dashboardSwitchBlock({ ...base, next: 'dashboard' }) === null);
check('① 기능이 꺼져 있으면 FEATURE_OFF',
  code(dashboardSwitchBlock({ ...base, next: 'dashboard', featureEnabled: false })) === 'DASHBOARD_FEATURE_OFF');
{
  const b = dashboardSwitchBlock({
    ...base, next: 'dashboard', featureEnabled: false, featureReason: '이 라이선스에 포함되지 않은 기능입니다.',
  });
  check('① 꺼진 이유를 문장에 싣는다', !!b && b.message.includes('라이선스'), b && b.message);
}
check('① 퍼블리싱 등록(공개·보관)이면 PUBLISHED',
  code(dashboardSwitchBlock({ ...base, next: 'dashboard', registered: true })) === 'DASHBOARD_PUBLISHED');
check('① 협업맵이면 COLLAB',
  code(dashboardSwitchBlock({ ...base, next: 'dashboard', kind: 'collab' })) === 'DASHBOARD_COLLAB');
{
  const b = dashboardSwitchBlock({ ...base, next: 'dashboard', duplicateIds: ['node-a', 'node-b', 'node-c', 'node-d'] });
  check('① 겹친 ID 가 있으면 DUP_IDS', code(b) === 'DASHBOARD_DUP_IDS');
  check('① 겹친 ID 를 셋까지 보여 준다', !!b && b.message.includes('node-a') && b.message.includes('…'), b && b.message);
}

// ── ② 대시보드 → 일반맵 (되돌리기) ────────────────────────────────
const dash = { ...base, current: 'dashboard' };
check('② 되돌리기는 된다', dashboardSwitchBlock({ ...dash, next: 'edit' }) === null);
check('② 기능이 꺼져도 되돌리기는 된다',
  dashboardSwitchBlock({ ...dash, next: 'edit', featureEnabled: false }) === null);
check('② 퍼블리싱 등록돼 있어도 되돌리기는 된다',
  dashboardSwitchBlock({ ...dash, next: 'edit', registered: true }) === null);

// ── ③ 대시보드인 채로 다른 것을 바꿀 때 ───────────────────────────
check('③ 대시보드인 채 협업맵이 되려 하면 COLLAB',
  code(dashboardSwitchBlock({ ...dash, nextKind: 'collab' })) === 'DASHBOARD_COLLAB');
check('③ 대시보드를 풀면서 협업맵이 되는 것은 된다',
  dashboardSwitchBlock({ ...dash, next: 'edit', nextKind: 'collab' }) === null);
check('③ 이미 대시보드면 다시 대시보드로 보내도 기능 검사를 다시 하지 않는다',
  dashboardSwitchBlock({ ...dash, next: 'dashboard', featureEnabled: false }) === null);
check('③ 대시보드와 상관없는 변경(제목)은 통과',
  dashboardSwitchBlock({ ...base }) === null);

// ── ④ 사람의 저장 잠금 ─────────────────────────────────────────
check('④ 대시보드면 저장을 막는다', code(dashboardLockBlock('dashboard')) === 'DASHBOARD_LOCKED');
check('④ 일반맵은 막지 않는다', dashboardLockBlock('edit') === null);
check('④ 칸이 없는 옛 행(undefined)도 막지 않는다', dashboardLockBlock(undefined) === null);

// ── ⑤ 겹친 노드 ID 찾기 ─────────────────────────────────────────
const doc = {
  root: { id: 'root', text: '중심' },
  branches: [
    { id: 'node-1', text: 'a', children: [{ id: 'node-2', text: 'b' }, { id: 'node-3', text: 'c' }] },
    { id: 'node-4', text: 'd' },
  ],
};
check('⑤ 겹침이 없으면 빈 배열', duplicateNodeIds(doc).length === 0);
check('⑤ 깊은 자식끼리 겹치면 찾는다',
  JSON.stringify(duplicateNodeIds({ ...doc, branches: [...doc.branches, { id: 'x', children: [{ id: 'node-2' }] }] })) === '["node-2"]');
{
  const multi = {
    ...doc,
    centers: [{ root: { id: 'c2', text: '둘째' }, branches: [{ id: 'node-4', text: 'dup' }] }],
  };
  check('⑤ 둘째 중심의 노드도 함께 센다', JSON.stringify(duplicateNodeIds(multi)) === '["node-4"]', JSON.stringify(duplicateNodeIds(multi)));
}
check('⑤ 저장된 문서 모양 { map: … } 도 읽는다',
  JSON.stringify(duplicateNodeIds({ map: { ...doc, branches: [...doc.branches, { id: 'node-1' }] }, editor: {} })) === '["node-1"]');
check('⑤ 문서가 이상해도 던지지 않는다', Array.isArray(duplicateNodeIds(null)) && Array.isArray(duplicateNodeIds({ branches: 'x' })));

console.log(`\n${failed ? `❌ ${failed}건 실패` : '✅ 전부 통과'}`);
process.exit(failed ? 1 : 0);
