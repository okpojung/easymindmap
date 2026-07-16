// TimelineStrategy — 시간배치(타임라인) 레이아웃.
//
// 중심 주제(루트)에서 오른쪽으로 수평 시간축이 뻗고, 2레벨 주제들이
// 축 위/아래에 번갈아 배치된다. 각 주제의 하위 노드들은 축에서 멀어지는
// 방향(위쪽 주제는 위로, 아래쪽 주제는 아래로)으로 세로로 쌓인다
// (들여쓰기 + 왼쪽 스파인 연결 — 트리·오른쪽의 세로 아웃라인과 동일한
// 감각, 방향만 위/아래).
//
// 중심 주제 전용(rootOnly) — 트리·아래와 같은 제약 (LayoutTab).
// side: 위쪽 서브트리 = 'up', 아래쪽 = 'down' (NodeIndicators·드롭존이
// 이 방향에 맞춰 동작한다).

import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import { nodeSizingOpts } from '@/editor/node-renderer/nodeContent';
import type { MindNode, SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';
import { nodeOverhang } from '../tagOverhang';

const AXIS_GAP = 40;      // 루트 오른쪽 → 첫 주제 블록
const STEP_GAP = 42;      // 주제 블록 사이 가로 간격
const BRANCH_GAP = 34;    // 시간축 → 주제 노드
const CHILD_INDENT = 26;  // 하위 노드 들여쓰기 (왼쪽 스파인 자리)
const CHILD_TOP = 16;     // 부모 → 첫 하위 세로 간격
const CHILD_GAP = 9;      // 하위 사이 세로 간격

interface MeasuredNode {
  node: MindNode;
  w: number;
  h: number;
  lines: string[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  blockW: number; // 서브트리 전체 가로 폭 (들여쓰기 포함)
  blockH: number; // 서브트리 전체 세로 높이 (태그 오버행 포함)
  children: MeasuredNode[];
}

function measureNode(node: MindNode, depth: number): MeasuredNode {
  const size = sizeNodeForText(node.text, depth, {
    ...nodeSizingOpts(node),
    minW: depth <= 1 ? 140 : 120,
    maxW: depth <= 1 ? 230 : 260,
  });
  const children = (node.children ?? []).map((c) => measureNode(c, depth + 1));
  const childrenH =
    children.length === 0
      ? 0
      : CHILD_TOP +
        children.reduce((s, c) => s + c.blockH, 0) +
        (children.length - 1) * CHILD_GAP;
  const childrenW = children.length
    ? CHILD_INDENT + Math.max(...children.map((c) => c.blockW))
    : 0;
  return {
    node,
    w: size.w,
    h: size.h,
    lines: size.lines,
    fontSize: size.fontSize,
    fontWeight: size.fontWeight,
    lineHeight: size.lineHeight,
    blockW: Math.max(size.w, childrenW),
    blockH: size.h + nodeOverhang(node) + childrenH,
    children,
  };
}

function pushNode(
  out: LaidOutNode[],
  m: MeasuredNode,
  x: number,
  y: number,
  depth: number,
  parent: string | null,
  side: 'up' | 'down',
  parentColorKey?: string,
) {
  out.push({
    ...m.node,
    x,
    y,
    w: m.w,
    h: m.h,
    _lines: m.lines,
    _fontSize: m.fontSize,
    _fontWeight: m.fontWeight,
    _lineHeight: m.lineHeight,
    depth,
    parent,
    side,
    parentColorKey: parentColorKey as any,
  });
}

// 서브트리 배치 — left: 블록 왼쪽 x, edgeY: 축쪽 가장자리 y
// (dir 'down'이면 블록의 위쪽 y, 'up'이면 블록의 아래쪽 y)
function placeSubtree(
  m: MeasuredNode,
  left: number,
  edgeY: number,
  dir: 'up' | 'down',
  depth: number,
  parent: string | null,
  out: LaidOutNode[],
  parentColorKey?: string,
) {
  const sign = dir === 'down' ? 1 : -1;
  const over = nodeOverhang(m.node);
  // 노드 자신은 블록의 축쪽 끝에 놓인다. 태그 칩은 항상 노드 "아래"에
  // 그려지므로, 위 방향(up)일 때는 칩 공간을 노드 아래(축쪽)에 예약해
  // 아래 요소와 겹치지 않게 한다.
  const nodeCenterY =
    dir === 'down' ? edgeY + m.h / 2 : edgeY - over - m.h / 2;
  pushNode(out, m, left + m.w / 2, nodeCenterY, depth, parent, dir, parentColorKey);

  let cursor = edgeY + sign * (m.h + over + CHILD_TOP);
  for (const child of m.children) {
    placeSubtree(
      child,
      left + CHILD_INDENT,
      // 'up'은 자식 블록의 "아래쪽" 끝이 cursor
      cursor,
      dir,
      depth + 1,
      m.node.id,
      out,
      m.node.colorKey,
    );
    cursor += sign * (child.blockH + CHILD_GAP);
  }
}

export function layoutTimeline(
  branches: SampleBranch[],
  CX: number,
  CY: number,
  rootW: number,
  out: LaidOutNode[],
): void {
  const measured = branches.map((b) => measureNode(b, 1));
  let x = CX + rootW / 2 + AXIS_GAP;

  measured.forEach((m, i) => {
    const dir: 'up' | 'down' = i % 2 === 0 ? 'up' : 'down';
    const edgeY = dir === 'up' ? CY - BRANCH_GAP : CY + BRANCH_GAP;
    placeSubtree(m, x, edgeY, dir, 1, 'root', out);
    x += m.blockW + STEP_GAP;
  });
}
