// 연결선 기하 (2026-09-22).   npx tsx src/editor/canvas/connectorGeometry.test.ts
import { arrowHead, connectorMid, connectorPath, connectorPoints, labelBox, loopTrunkX, LOOP_OUT, resolveSide, dedupePoints } from './connectorGeometry';
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
// ⑥ 고리 줄기는 사이 높이의 다른 상자를 관통하지 않는다 (2026-09-22)
{
  const a = { x: 100, y: 100, w: 100, h: 40 }, b = { x: 100, y: 400, w: 100, h: 40 };
  const kid = { x: 200, y: 200, w: 80, h: 40 }; // a 의 오른쪽 아래, 두 노드 사이 높이 (오른쪽 240)
  const far = { x: 260, y: 700, w: 120, h: 40 }; // 사이 높이 밖 — 무시
  check('⑥ 장애물 없으면 max right + 40', loopTrunkX(a, b), 190);
  check('⑥ 사이 높이의 상자는 넘어간다 (240 + 40)', loopTrunkX(a, b, [a, b, kid, far]), 280);
  const kid2 = { x: 290, y: 300, w: 40, h: 40 }; // 밀린 줄기(280)가 다시 걸리는 상자 (270~310)
  check('⑥ 밀린 자리에 또 걸리면 한 번 더 민다 (310 + 40, 한도 160 안)', loopTrunkX(a, b, [kid, kid2]), 350);
  const kid3 = { x: 360, y: 300, w: 40, h: 40 }; // 또 걸려 390 까지 밀면 한도(160)를 넘는다 → 원래 190
  check('⑥ 한도를 넘게 밀어야 하면 원래 자리', loopTrunkX(a, b, [kid, kid2, kid3]), 190);
  const pts = connectorPoints(a, b, [kid]);
  check('⑥ connectorPoints 도 같은 줄기 x', [pts[1].x, pts[2].x], [280, 280]);
}

// ⑦ 면을 정한 길 (2026-09-23) — 시작 면·끝 면
{
  const L = { x: 100, y: 100, w: 100, h: 40 }, R = { x: 500, y: 400, w: 100, h: 40 };
  check('⑦ auto 해석 — 오른쪽 아래의 상대는 더 먼 축(x) 으로 right', resolveSide(L, R, 'auto'), 'right');
  check('⑦ auto 해석 — 상대가 바로 아래면 bottom', resolveSide({ x: 100, y: 100, w: 100, h: 40 }, { x: 120, y: 400, w: 100, h: 40 }, 'auto'), 'bottom');
  check('⑦ 둘 다 auto 면 예전 규칙 그대로', connectorPoints(L, R, undefined, 'auto', 'auto'), connectorPoints(L, R));
  // 아래 → 아래 (사용자 요청의 두 번째 연결선): 아래 바깥 줄기로 도는 고리
  check('⑦ 아래→아래 = 둘 아래 바깥(max bottom + 40) 고리', connectorPoints(L, R, undefined, 'bottom', 'bottom'),
    [{ x: 100, y: 120 }, { x: 100, y: 460 }, { x: 500, y: 460 }, { x: 500, y: 420 }]);
  const mid = { x: 300, y: 450, w: 100, h: 40 }; // 두 노드 x 사이에서 줄기(460)에 걸리는 상자
  check('⑦ 아래→아래 줄기는 사이의 상자를 넘어간다 (470 + 40)', connectorPoints(L, R, [L, R, mid], 'bottom', 'bottom')[1].y, 510);
  check('⑦ 위→위 = 둘 위 바깥(min top − 40)', connectorPoints(L, R, undefined, 'top', 'top')[1].y, 40);
  check('⑦ 왼쪽→왼쪽 = 둘 왼쪽 바깥(min left − 40)', connectorPoints(L, R, undefined, 'left', 'left')[1].x, 10);
  // 마주 보는 면
  check('⑦ 오른쪽→왼쪽 (서로 향함) = 가운데서 ㄷ', connectorPoints(L, R, undefined, 'right', 'left'),
    [{ x: 150, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 400 }, { x: 450, y: 400 }]);
  const back = connectorPoints(R, L, undefined, 'right', 'left'); // R 의 오른쪽에서 L 의 왼쪽으로 — 등진 방향
  check('⑦ 오른쪽→왼쪽 (등짐) = STUB 나와 두 상자 사이 높이로 돌아감', [back.length, back[1].x, back[2].y, back[4].x], [6, 574, 250, 26]);
  check('⑦ 아래→위 (서로 향함) = 가운데 높이에서 ㄷ', connectorPoints(L, R, undefined, 'bottom', 'top'),
    [{ x: 100, y: 120 }, { x: 100, y: 250 }, { x: 500, y: 250 }, { x: 500, y: 380 }]);
  // 직각
  check('⑦ 아래→왼쪽 = 모서리 한 점(ㄱ)', connectorPoints(L, R, undefined, 'bottom', 'left'),
    [{ x: 100, y: 120 }, { x: 100, y: 400 }, { x: 450, y: 400 }]);
  const z = connectorPoints(R, L, undefined, 'bottom', 'left'); // 모서리(500,100)가 R 의 아래 앞이 아니다
  check('⑦ 모서리가 면 앞에 없으면 STUB 로 ㄹ 자 (5점)', [z.length, z[1].y, z[2].x], [5, 444, 26]);
  check('⑦ 오른쪽→위 = 모서리 (R.x, L.y)', connectorPoints(L, R, undefined, 'right', 'top'),
    [{ x: 150, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 380 }]);
  check('⑦ 한쪽만 정하면 다른 쪽은 auto 로 상대를 향한다 (bottom + auto→left)', connectorPoints(L, R, undefined, 'bottom', 'auto'),
    connectorPoints(L, R, undefined, 'bottom', 'left'));
  check('⑦ 붙은 같은 점은 없앤다', dedupePoints([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }]).length, 2);
  // 한도 — 세로로 빽빽한 열: 줄기를 160 넘게 밀어야 하면 원래 자리(둘 아래 + 40)로
  const column = Array.from({ length: 8 }, (_, i) => ({ x: 300, y: 480 + i * 60, w: 120, h: 40 }));
  check('⑦ 장애물이 끝없이 이어지면 밀지 않는다 (max bottom + 40 그대로)', connectorPoints(L, R, [L, R, ...column], 'bottom', 'bottom')[1].y, 460);
}

console.log('\n모두 통과');
