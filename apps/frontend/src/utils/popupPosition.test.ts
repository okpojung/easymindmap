// 떠 있는 카드의 자리 계산 — `popupPosition.ts` (2026-09-18).
//
//   npm run test:unit
//
// 왜 시험하나: 문서함 상세 정보 카드가 **아래로 잘려** 보였다. 원인은
// 높이를 `250` 으로 추측한 것이었고, 내용이 길어지면(퍼블리싱 링크 줄 +
// 마지막 저장 자리) 그만큼 넘쳤다. 눈으로는 "내 맵에서는 멀쩡하던데" 로
// 넘어가기 쉬운 자리라 셈을 따로 시험한다.

import { clampTop, clampLeft, EDGE } from './popupPosition';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`);
}

const VIEW_H = 900;
const VIEW_W = 1400;

// ── ① 자리가 넉넉하면 그대로 붙는다 ──────────────────────
check('① 여유가 있으면 요청한 자리 그대로', clampTop(200, 300, VIEW_H) === 200);

// ── ② ★ 아래가 모자라면 위로 올린다 (잘림의 원인) ────────
{
  // 카드 330, 화면 900 → 최대 top 은 900-330-8 = 562
  const top = clampTop(700, 330, VIEW_H);
  check('② 아래로 넘치면 올려 붙인다', top === 562, String(top));
  check('② 올린 뒤에는 화면 안에 다 들어간다', top + 330 <= VIEW_H - EDGE,
    `${top} + 330 = ${top + 330}`);
}
{
  // 고치기 전의 상수(250)로는 이 경우가 잘렸다는 것을 보인다
  const bad = Math.min(700, VIEW_H - 250); // 옛 셈
  check('② 옛 셈(250 고정)이었다면 88px 잘렸다',
    bad + 330 > VIEW_H, `${bad} + 330 = ${bad + 330} > ${VIEW_H}`);
}

// ── ③ 카드 높이에 따라 답이 달라진다 ─────────────────────
check('③ 짧은 카드는 더 아래까지 갈 수 있다',
  clampTop(700, 200, VIEW_H) === 692 && clampTop(700, 400, VIEW_H) === 492,
  `${clampTop(700, 200, VIEW_H)} · ${clampTop(700, 400, VIEW_H)}`);

// ── ④ 아직 못 쟀을 때(첫 판)는 어림값을 쓴다 ─────────────
check('④ cardH=0 이면 fallback(300) 으로 접는다', clampTop(700, 0, VIEW_H) === 592);
check('④ fallback 을 바꿀 수 있다', clampTop(700, 0, VIEW_H, 500) === 392);

// ── ⑤ 위로도 넘치지 않는다 ───────────────────────────────
check('⑤ 음수가 되지 않는다', clampTop(-50, 300, VIEW_H) === EDGE);
check('⑤ 카드가 화면보다 크면 맨 위에 붙인다 (부르는 쪽이 굴린다)',
  clampTop(100, 2000, VIEW_H) === EDGE, String(clampTop(100, 2000, VIEW_H)));

// ── ⑥ 가로도 같은 규칙 ───────────────────────────────────
check('⑥ 오른쪽으로 넘치면 접는다', clampLeft(1350, 300, VIEW_W) === 1092);
check('⑥ 왼쪽도 가장자리를 지킨다', clampLeft(-20, 300, VIEW_W) === EDGE);
check('⑥ 여유가 있으면 그대로', clampLeft(400, 300, VIEW_W) === 400);

console.log(failed === 0 ? '\n전부 PASS' : `\n실패 ${failed}건`);
process.exit(failed ? 1 : 0);
