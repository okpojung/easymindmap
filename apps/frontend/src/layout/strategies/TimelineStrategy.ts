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
  manualStarts?: number[];
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
    manualStarts: size.manualStarts,
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
  role: 'axis' | 'stack',
  parentColorKey?: string,
) {
  out.push({
    ...m.node,
    x,
    y,
    w: m.w,
    h: m.h,
    _lines: m.lines,
    _manualStarts: m.manualStarts,
    _fontSize: m.fontSize,
    _fontWeight: m.fontWeight,
    _lineHeight: m.lineHeight,
    depth,
    parent,
    side,
    _timelineRole: role,
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
  /** 이 호출의 노드가 축 위인가 — 첫 단계만 'axis', 그 아래는 전부 'stack' */
  role: 'axis' | 'stack' = 'axis',
) {
  const sign = dir === 'down' ? 1 : -1;
  const over = nodeOverhang(m.node);
  // 노드 자신은 블록의 축쪽 끝에 놓인다. 태그 칩은 항상 노드 "아래"에
  // 그려지므로, 위 방향(up)일 때는 칩 공간을 노드 아래(축쪽)에 예약해
  // 아래 요소와 겹치지 않게 한다.
  const nodeCenterY =
    dir === 'down' ? edgeY + m.h / 2 : edgeY - over - m.h / 2;
  pushNode(out, m, left + m.w / 2, nodeCenterY, depth, parent, dir, role, parentColorKey);

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
      'stack',   // 축 아래로는 전부 세로 스택이다
    );
    cursor += sign * (child.blockH + CHILD_GAP);
  }
}

/**
 * `anchor` — 축의 시작점이 되는 노드. 맵 전체에 적용할 때는 중심 주제이고,
 * **서브트리에 적용할 때는 그 노드**다 (2026-08-07 — 시간배치를 하위
 * 노드에서도 고를 수 있게 하면서 필요해졌다). `depth`/`parentId` 는
 * 그 아래로 이어지는 값이라 함께 받는다.
 */
export interface TimelineAnchor {
  x: number;
  y: number;
  w: number;
  /** anchor 의 depth — 자식은 depth+1 로 놓인다 */
  depth: number;
  /** 자식의 parent 로 기록할 id */
  id: string;
  colorKey?: string;
}

export function layoutTimeline(
  branches: SampleBranch[],
  CX: number,
  CY: number,
  rootW: number,
  out: LaidOutNode[],
  anchor?: TimelineAnchor,
): void {
  const depth = (anchor?.depth ?? 0) + 1;
  const parentId = anchor?.id ?? 'root';
  const measured = branches.map((b) => measureNode(b, depth));
  let x = CX + rootW / 2 + AXIS_GAP;

  measured.forEach((m, i) => {
    const dir: 'up' | 'down' = i % 2 === 0 ? 'up' : 'down';
    const edgeY = dir === 'up' ? CY - BRANCH_GAP : CY + BRANCH_GAP;
    placeSubtree(m, x, edgeY, dir, depth, parentId, out, anchor?.colorKey);
    x += m.blockW + STEP_GAP;
  });
}

/**
 * 시간배치(중앙노드) — **노드가 시간축 위에 얹힌다** (2026-08-07 사용자
 * 정의: "새 맵(중심 주제)가 축 위의 제일 왼쪽에 있고 오른쪽 방향으로
 * 2레벨 노드들이 축 위에 배치되는 레이아웃").
 *
 * `timeline` 과의 차이는 **주제가 축에 놓이는 방식** 하나다.
 *   · `timeline`        — 주제가 축에서 위/아래로 **떨어져 매달린다**
 *                         (축과 노드 사이에 BRANCH_GAP 만큼 연결선)
 *   · `timeline-center` — 주제의 **한가운데를 축이 지난다**. 중심 주제도
 *                         같은 높이(축 위)에 서고, 축은 왼쪽 끝에서
 *                         시작해 오른쪽으로 흐른다.
 *
 * 하위(3레벨+)는 두 레이아웃 모두 위/아래 번갈아 뻗는다. 그래서 축 한
 * 줄만 눈으로 훑으면 "무엇이 언제"가 바로 읽히고, 세부는 위아래로 빠진다.
 */
export function layoutTimelineCenter(
  branches: SampleBranch[],
  CX: number,
  CY: number,
  rootW: number,
  out: LaidOutNode[],
  anchor?: TimelineAnchor,
): void {
  const depth = (anchor?.depth ?? 0) + 1;
  const parentId = anchor?.id ?? 'root';
  const measured = branches.map((b) => measureNode(b, depth));
  let x = CX + rootW / 2 + AXIS_GAP;

  measured.forEach((m, i) => {
    const dir: 'up' | 'down' = i % 2 === 0 ? 'up' : 'down';
    // placeSubtree 는 edgeY 를 "블록의 축쪽 가장자리"로 본다. 주제 노드의
    // **중심**이 축(CY)에 오도록 노드 높이 절반만큼 밀어 준다.
    //   dir 'down' → nodeCenterY = edgeY + h/2
    //   dir 'up'   → nodeCenterY = edgeY - over - h/2   (over = 태그 칩 자리)
    const over = nodeOverhang(m.node);
    const edgeY = dir === 'down' ? CY - m.h / 2 : CY + m.h / 2 + over;
    placeSubtree(m, x, edgeY, dir, depth, parentId, out, anchor?.colorKey);
    x += m.blockW + STEP_GAP;
  });
}
