// 미니맵 좌표 계산 단위 테스트 (2026-09-21).   npx tsx src/editor/canvas/minimapMath.test.ts

import {
  minimapGeometry, minimapPanelMax, miniToWorld, panForCenter, viewportWorldRect, worldBounds, worldToMini,
} from './minimapMath';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${JSON.stringify(got)}\n      기대 ${JSON.stringify(want)}`}`);
}
const r2 = (v: number) => Math.round(v * 100) / 100;

// ① 노드 경계 — 중심 좌표 + 크기
const nodes = [
  { x: 100, y: 50, w: 40, h: 20 },   // 80..120 × 40..60
  { x: 300, y: 250, w: 60, h: 30 },  // 270..330 × 235..265
];
check('① 노드 경계 (왼쪽 위 + 크기)', worldBounds(nodes), { x: 80, y: 40, w: 250, h: 225 });
check('① 노드 없음 → null', worldBounds([]), null);

// ② 화면 영역 — 캔버스 창 px ÷ 배율
const W = 1200, H = 800, CX = 600, CY = 400;
check('② 100% · pan 0 = 창 그대로', viewportWorldRect(W, H, CX, CY, 0, 0, 100), { x: 0, y: 0, w: 1200, h: 800 });
const v200 = viewportWorldRect(W, H, CX, CY, 0, 0, 200);
check('② 200% 는 반 크기, 중심은 같다', [v200.w, v200.h, v200.x + v200.w / 2, v200.y + v200.h / 2], [600, 400, 600, 400]);
const v50 = viewportWorldRect(W, H, CX, CY, 100, -50, 50);
check('② 50% + pan (100, −50) → 두 배 크기, pan 만큼 반대로 밀린다', [v50.w, v50.h, v50.x, v50.y], [2400, 1600, -800, -300]);

// ③ panForCenter — 그 pan 을 쓰면 화면 중심이 정말 그 점이다
for (const z of [100, 50, 175]) {
  const p = panForCenter(1000, -300, CX, CY, z);
  const v = viewportWorldRect(W, H, CX, CY, p.panX, p.panY, z);
  check(`③ zoom ${z}: pan 뒤 화면 중심 = (1000, −300)`, [r2(v.x + v.w / 2), r2(v.y + v.h / 2)], [1000, -300]);
}

// ④ 기하 — 여백 12%(최소 80) · 비율 유지 · 패널 최대 안
const g = minimapGeometry({ x: 0, y: 0, w: 2000, h: 500 }, 260, 180);
check('④ 여백: 가로 240, 세로 80(최소)', g.bounds, { x: -240, y: -80, w: 2480, h: 660 });
check('④ 긴 쪽(가로)이 최대에 닿고 세로는 비율대로', [g.panelW, g.panelH], [260, Math.round(660 * (260 / 2480))]);
check('④ 배율 = 260/2480', r2(g.scale), r2(260 / 2480));
const gTall = minimapGeometry({ x: 0, y: 0, w: 300, h: 1200 }, 260, 180);
check('④ 세로가 긴 맵은 세로가 최대에 닿는다', gTall.panelH, 180);
check('④ 노드 없음 → 기본 400×300 상자', minimapGeometry(null, 260, 180).bounds.w, 400 + 80 * 2);

// ⑤ 왕복 — world ↔ mini
const wr = { x: 500, y: 100, w: 300, h: 200 };
const mr = worldToMini(g, wr);
const back = miniToWorld(g, mr.x, mr.y);
check('⑤ world → mini → world 왕복', [r2(back.x), r2(back.y)], [500, 100]);
check('⑤ 크기도 배율대로', [r2(mr.w), r2(mr.h)], [r2(300 * g.scale), r2(200 * g.scale)]);

// ⑥ 패널 최대 — 창의 22%×28%, 160~300 × 110~220
check('⑥ 1200×800 창', minimapPanelMax(1200, 800), { maxW: 264, maxH: 220 });
check('⑥ 작은 창은 최소값', minimapPanelMax(500, 300), { maxW: 160, maxH: 110 });
check('⑥ 큰 창은 최대값', minimapPanelMax(3000, 2000), { maxW: 300, maxH: 220 });

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
if (failed) process.exit(1);
