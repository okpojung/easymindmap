// 연결선 기하 (2026-09-22).   npx tsx src/editor/canvas/connectorGeometry.test.ts
import { arrowHead, connectorMid, connectorPath, connectorPoints, labelBox, LOOP_OUT } from './connectorGeometry';
let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got), w = JSON.stringify(want); const ok = g === w; if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
const A = { x: 100, y: 100, w: 120, h: 40 }, B = { x: 100, y: 200, w: 120, h: 40 };
// ① 위아래로 놓인 두 상자 → 둘 다 오른쪽 변에서 나가 오른쪽 세로 줄기 (고리)
const p1 = connectorPoints(A, B);
check('① 고리: 오른쪽 변 → 바깥 줄기 → 오른쪽 변', p1, [{ x: 160, y: 100 }, { x: 160 + LOOP_OUT, y: 100 }, { x: 160 + LOOP_OUT, y: 200 }, { x: 160, y: 200 }]);
check('① 각진 path', connectorPath(p1, 'elbow'), 'M 160 100 L 200 100 L 200 200 L 160 200');
check('① 둥근 path 는 꺾이는 곳마다 Q 두 번', (connectorPath(p1, 'rounded').match(/Q/g) ?? []).length, 2);
check('① 둥근 path 시작·끝은 같다', [connectorPath(p1, 'rounded').startsWith('M 160 100'), connectorPath(p1, 'rounded').endsWith('L 160 200')], [true, true]);
// ② 좌우로 떨어진 상자 → 오른쪽 변 → 가운데서 꺾여 → 왼쪽 변
const C = { x: 400, y: 160, w: 100, h: 40 };
check('② 좌→우', connectorPoints(A, C), [{ x: 160, y: 100 }, { x: 255, y: 100 }, { x: 255, y: 160 }, { x: 350, y: 160 }]);
check('② 우→좌 (거울상)', connectorPoints(C, A), [{ x: 350, y: 160 }, { x: 255, y: 160 }, { x: 255, y: 100 }, { x: 160, y: 100 }]);
check('② 같은 높이면 직선 2점', connectorPoints(A, { ...C, y: 100 }), [{ x: 160, y: 100 }, { x: 350, y: 100 }]);
// ③ 가운데 점 · 방향
check('③ 고리의 가운데는 세로 줄기 한가운데', connectorMid(p1), { x: 200, y: 150, dir: 'v', seg: 1 });
check('③ 직선의 가운데', connectorMid([{ x: 0, y: 0 }, { x: 100, y: 0 }]), { x: 50, y: 0, dir: 'h', seg: 0 });
// ④ 화살촉: 끝점이 tip, 밑변은 뒤쪽
check('④ 화살촉 (왼쪽으로 향함)', arrowHead({ x: 160, y: 200 }, { x: 200, y: 200 }, 10), 'M 160 200 L 170 195 L 170 205 Z');
// ⑤ 라벨 자리
const mid = connectorMid(p1);
check('⑤ center', labelBox(mid, 60, 24, 'center'), { x: 200, y: 150, w: 60, h: 24 });
check('⑤ 세로 변의 above = 왼쪽', labelBox(mid, 60, 24, 'above').x < 200, true);
check('⑤ 세로 변의 branch = 오른쪽 곁가지 + 줄기', labelBox(mid, 60, 24, 'branch'), { x: 270, y: 150, w: 60, h: 24, stub: { x1: 200, y1: 150, x2: 240, y2: 150 } });
const hmid = connectorMid([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
check('⑤ 가로 변의 above = 위', labelBox(hmid, 60, 24, 'above'), { x: 50, y: -18, w: 60, h: 24 });
check('⑤ 가로 변의 branch = 아래 곁가지', labelBox(hmid, 60, 24, 'branch').stub, { x1: 50, y1: 0, x2: 50, y2: 40 });
if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
