// 미니맵 좌표 계산 단위 테스트 (2026-09-21 · 고정 패널/창 모드 개정 포함).
//   npx tsx src/editor/canvas/minimapMath.test.ts

import {
  MINIMAP_MIN_VIEW, minimapGeometry, minimapPanelSize, miniToWorld, paddedBounds, panForCenter,
  viewportWorldRect, worldBounds, worldToMini,
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
check('① 여백: 12%(최소 80)', paddedBounds({ x: 0, y: 0, w: 2000, h: 500 }), { x: -240, y: -80, w: 2480, h: 660 });
check('① 노드 없음 → 400×300 상자 + 80', paddedBounds(null), { x: -80, y: -80, w: 560, h: 460 });

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

// ④ 패널 크기 — 창의 24%×36%, 200~360 × 150~320. 맵 모양과 무관
check('④ 1200×800 창', minimapPanelSize(1200, 800), { panelW: 288, panelH: 288 });
check('④ 작은 창은 최소값', minimapPanelSize(500, 300), { panelW: 200, panelH: 150 });
check('④ 큰 창은 최대값', minimapPanelSize(3000, 2000), { panelW: 360, panelH: 320 });

// ⑤ 맵이 들어가는 경우 — 배율은 맞춤, 맵을 가운데 (패널은 그대로 288×288)
const view = viewportWorldRect(W, H, CX, CY, 0, 0, 100); // 1200×800 world
const small = { x: 0, y: 0, w: 2000, h: 500 };            // 여백 → 2480×660
const gs = minimapGeometry(small, view, 288, 288);
check('⑤ 맵이 들어간다 (fits)', gs.fits, true);
check('⑤ 배율 = 288/2480 (가로가 먼저 닿는다)', r2(gs.scale), r2(288 / 2480));
check('⑤ 패널은 그대로', [gs.panelW, gs.panelH], [288, 288]);
check('⑤ 세로는 맵을 가운데 둔다', r2(gs.bounds.y + gs.bounds.h / 2), r2(-80 + 660 / 2));
check('⑤ 표시창은 창 px × 배율', [r2(view.w * gs.scale), r2(view.h * gs.scale)], [r2(1200 * 288 / 2480), r2(800 * 288 / 2480)]);

// ⑥ 세로로 아주 긴 맵 (2,808 노드 진행트리 같은) — 표시창 최소 60×45 보장 → 창 모드
const tall = { x: 0, y: 0, w: 1000, h: 60000 };
const gt = minimapGeometry(tall, view, 288, 288);
check('⑥ 맵이 안 들어간다 (창 모드)', gt.fits, false);
check('⑥ 배율은 표시창이 60×45 가 되는 값 (세로 45/800 가 더 크다)', r2(gt.scale), r2(45 / 800));
const vt = worldToMini(gt, view);
check('⑥ 표시창 크기 ≥ 최소', vt.w >= MINIMAP_MIN_VIEW.w - 0.01 && vt.h >= MINIMAP_MIN_VIEW.h - 0.01, true);
check('⑥ 창은 표시창 중심을 가운데 (세로) · 가로는 맵이 들어가니 맵 가운데',
  [r2(gt.bounds.y + gt.bounds.h / 2), r2(gt.bounds.x + gt.bounds.w / 2)], [r2(view.y + view.h / 2), r2(-120 + 1240 / 2)]);

// ⑦ 창은 표시창이 가장자리(6%)에 닿기 전까지 그대로 · 끄는 동안(freeze)은 무조건
const prev = { x: gt.bounds.x, y: gt.bounds.y, scale: gt.scale };
const moved = { ...view, y: view.y + 500 };               // 조금 내려간 화면 (아직 창 안)
const g2 = minimapGeometry(tall, moved, 288, 288, prev);
check('⑦ 창 안에서 움직이면 창은 그대로', g2.bounds.y, prev.y);
const far = { ...view, y: view.y + 6000 };                // 창 밖으로
const g3 = minimapGeometry(tall, far, 288, 288, prev);
check('⑦ 창 밖으로 나가면 창이 따라온다 (표시창 중심으로)', r2(g3.bounds.y + g3.bounds.h / 2), r2(far.y + far.h / 2));
const g4 = minimapGeometry(tall, far, 288, 288, prev, true);
check('⑦ 끄는 동안은 밖으로 나가도 창 고정', g4.bounds.y, prev.y);
const top = { ...view, y: -20000 };                       // 맵 위 끝(−7200) 너머
const g5 = minimapGeometry(tall, top, 288, 288);
check('⑦ 창은 맵 경계 밖으로 나가지 않는다 (위 끝에서 멈춤)', r2(g5.bounds.y), r2(paddedBounds(tall).y));
check('⑦ 배율이 바뀌면 직전 창은 버린다', minimapGeometry(tall, moved, 288, 288, { ...prev, scale: prev.scale * 2 }).bounds.y !== prev.y, true);

// ⑧ 왕복 — world ↔ mini
const wr = { x: 500, y: 100, w: 300, h: 200 };
const mr = worldToMini(gs, wr);
const back = miniToWorld(gs, mr.x, mr.y);
check('⑧ world → mini → world 왕복', [r2(back.x), r2(back.y)], [500, 100]);
check('⑧ 크기도 배율대로', [r2(mr.w), r2(mr.h)], [r2(300 * gs.scale), r2(200 * gs.scale)]);

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
if (failed) process.exit(1);
