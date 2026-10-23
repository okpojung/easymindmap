// '도형 없음' 노드의 연결선 (2026-10-23).   npx tsx src/editor/edge-renderer/edgePaths.test.ts
// markmap·ThinkWise 처럼 도형이 없는 노드는 아래 밑줄에 선이 붙어야 한다.
import { treeEdgePath, sideLinkY } from './edgePaths';
import { collapseAnchor } from '../canvas/collapseAnchor';
import { setLevelShapeConfig, sizeNodeForText, NO_SHAPE_PAD_X, NO_SHAPE_PAD_Y } from '../node-renderer/sizeNodeForText';
import { isNoShapeNode } from '../node-renderer/noShapeNode';
import type { LaidOutNode } from '@/layout/types';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got), w = JSON.stringify(want); const ok = g === w; if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
const node = (o: Partial<LaidOutNode>): LaidOutNode =>
  ({ id: 'n', text: '', x: 0, y: 0, w: 100, h: 40, depth: 1, parent: null, ...o }) as LaidOutNode;

const P = node({ id: 'p', x: 0, y: 0, depth: 0 });                   // 루트(둥근)
const C = node({ id: 'c', x: 200, y: 100, depth: 1, side: 'right' }); // 자식(둥근)
const Pn = node({ id: 'p', x: 0, y: 0, depth: 1, style: { shapeType: 'none' } });
const Cn = node({ id: 'c', x: 200, y: 100, depth: 2, side: 'right', style: { shapeType: 'none' } });

// ① 도형이 있으면 예전과 같다 — 노드 가운데 높이
check('① 방사형: 도형 있음 = 가운데', treeEdgePath(P, C, 'radial'), 'M 50 0 C 100 0, 100 100, 150 100');
// ② 도형 없음 — 부모 밑줄 끝(오른쪽 아래) → 자식 밑줄 시작(왼쪽 아래)
check('② 방사형: 도형 없음 = 밑줄 끝 → 밑줄 시작', treeEdgePath(Pn, Cn, 'radial'), 'M 50 20 C 100 20, 100 120, 150 120');
// ③ 루트에 도형이 있고 자식만 도형 없음 — 루트 가운데 → 자식 밑줄
check('③ 방사형: 루트 둥근 → 자식 밑줄', treeEdgePath(P, Cn, 'radial'), 'M 50 0 C 100 0, 100 120, 150 120');
// ④ 계층형도 같은 규칙
check('④ 계층형: 밑줄 높이로 꺾인다', treeEdgePath(Pn, Cn, 'hierarchy-right'), 'M 50 20 H 100 V 120 H 150');
// ⑤ 아웃라인(트리·오른쪽): 자식 밑줄로 들어간다
check('⑤ 아웃라인: 자식 밑줄 높이', treeEdgePath(Pn, Cn, 'tree-right'), 'M -38 20 V 120 H 150');
check('⑤ 아웃라인: 도형 있음은 가운데', treeEdgePath(P, C, 'tree-right'), 'M -38 20 V 100 H 150');
// ⑥ 왼쪽 가지도 거울상
const CnL = node({ id: 'c', x: -200, y: 100, depth: 2, side: 'left', style: { shapeType: 'none' } });
check('⑥ 방사형 왼쪽: 밑줄 끝(왼쪽 아래) → 자식 밑줄(오른쪽 아래)', treeEdgePath(Pn, CnL, 'radial'), 'M -50 20 C -100 20, -100 120, -150 120');
// ⑦ 레벨 기본 도형(맵 설정)이 '도형 없음'이어도 같다
setLevelShapeConfig(['none', 'none']);
const Cl = node({ id: 'c', x: 200, y: 100, depth: 1, side: 'right' });
check('⑦ 레벨 기본 도형 없음 인식', [isNoShapeNode(Cl), sideLinkY(Cl)], [true, 120]);
setLevelShapeConfig([]);
check('⑦ 설정 해제 후 둥근', isNoShapeNode(Cl), false);
// ⑧ 접기 칩도 선이 나가는 높이(밑줄)에 놓인다
check('⑧ 접기 칩: 도형 없음 = 아래 변 높이', collapseAnchor(Pn, 'radial-right', 'right', 8.5, true), { x: 59.5, y: 20 });
check('⑧ 접기 칩: 도형 있음 = 가운데', collapseAnchor(Pn, 'radial-right', 'right', 8.5, false), { x: 59.5, y: 0 });

// ⑨ 도형 없음 박스는 글자에 딱 맞는다 — 최소 폭 없음, 여백 1/3 (markmap 처럼 촘촘하게)
const boxed = sizeNodeForText('Links', 2, { minW: 130, maxW: 320 });
const bare = sizeNodeForText('Links', 2, { minW: 130, maxW: 320, shape: 'none' });
check('⑨ 도형 있음은 최소 폭 130 유지', boxed.w, 130);
check('⑨ 도형 없음은 최소 폭을 무시하고 글자 폭 + 여백', bare.w < 60 && bare.w > 24, true);
check('⑨ 도형 없음 높이 = 줄 높이 + 위아래 3', bare.h, bare.lineHeight + NO_SHAPE_PAD_Y * 2);
check('⑨ 도형 없음 여백 값', [bare.padX, bare.padY], [NO_SHAPE_PAD_X, NO_SHAPE_PAD_Y]);
check('⑨ 도형 있음 높이는 예전 그대로(위아래 9)', boxed.h, boxed.lineHeight + 18);

if (failed) { console.log(`\n${failed}개 실패`); process.exit(1); }
console.log('\n모두 통과');
