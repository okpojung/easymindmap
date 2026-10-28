// '도형 없음' 노드의 밑줄 규칙 (2026-10-23 사용자 보고).
//
// 도형 없음으로 두면 글자가 캔버스에 둥둥 떠 있고, 연결선이 글자 높이의
// **한가운데**로 들어가 맵이 흐트러져 보였다. markmap·ThinkWise 는 도형이
// 없는 노드 아래에 **밑줄**을 긋고, 연결선을 그 밑줄 끝에 붙인다 — 선이
// 노드 내용 아래까지 이어져 안정적으로 보인다. 같은 규칙을 쓴다:
//
//   · 노드 박스 아래 변(y + h/2)에 노드 폭만큼 밑줄을 긋는다 (NodeRenderer)
//   · 들어오는 연결선은 밑줄의 **시작점**(부모 쪽 끝)에 닿는다
//   · 나가는 연결선은 밑줄의 **끝점**(자식 쪽 끝)에서 출발한다
//
// 밑줄 굵기·색은 들어오는 연결선과 같게 해서 선이 끊김 없이 이어진다.
// HTML 뷰어(exportHtml.ts)는 같은 규칙을 손으로 옮겨 두었다 — 같이 고친다.

import { levelShape } from './sizeNodeForText';

export interface ShapeProbeNode {
  depth: number;
  style?: { shapeType?: string };
}

/** NodeRenderer 와 같은 우선순위(노드별 → 레벨 기본 → 둥근)로 본 '도형 없음' 여부 */
export function isNoShapeNode(n: ShapeProbeNode): boolean {
  return (n.style?.shapeType ?? levelShape(n.depth) ?? 'rounded') === 'none';
}

/** 밑줄 굵기 — 이 노드로 들어오는 연결선 굵기와 같다 (루트에서 나가는 선 2.3, 그 밖 1.6) */
export function noShapeUnderlineWidth(depth: number): number {
  return depth <= 1 ? 2.3 : 1.6;
}

/**
 * 밑줄을 긋고 선을 밑줄에 붙이나 — 도형 없음이면서 **그림만 담은 노드가 아닐 때** (2026-10-28).
 * 사진·Mermaid·HTML 만 있는 노드는 도형 있는 노드처럼 가운데로 잇는다 (mediaView `_media`).
 */
export function hasUnderline(n: ShapeProbeNode & { _media?: unknown }): boolean {
  return isNoShapeNode(n) && !n._media;
}
