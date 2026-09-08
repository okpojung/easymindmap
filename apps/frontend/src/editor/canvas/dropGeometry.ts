// dropGeometry — 드래그 이동 드롭존의 **네 방향을 기하로 정한다** (2026-09-08).
//
// 사용자 보고: 트리·오른쪽(개요형) 안에 진행트리 줄이 섞인 맵에서 노드의
// 왼쪽에 놓았더니 형제가 아니라 하위로 붙었고, 하위/상위 존은 아예 보이지
// 않았다. 예전 판정은 "실효 레이아웃 이름 → 자식 축" 표 하나로 네 존을
// 정했는데, 그 표가 개요형(자식이 **아래**로 들여쓰기)을 "오른쪽"으로
// 적고 있었고, 형제 축도 부모의 표에서 가져와 실제 배치와 어긋났다.
//
// 이제 **실제로 놓인 자리**를 본다.
//   · 형제 축   = 형제가 실제로 늘어선 축(가장 가까운 형제와의 dx·dy 비교).
//                 형제가 없으면 부모의 레이아웃 관례(convSibAxis).
//   · 자식 방향 = 자식이 실제로 놓인 쪽(자식 무게중심). 자식이 없으면
//                 그 노드의 레이아웃 관례(convChildDir — 개요형은 아래).
//   · 부모 방향 = 자식의 반대. **단, 자식 축이 형제 축과 겹치면**(개요형:
//                 자식도 아래, 형제도 아래) 형제 축이 이기고 부모/자식은
//                 수직 축으로 간다 — 부모 쪽(들여쓰기의 반대, 왼쪽)이 상위,
//                 그 반대(오른쪽)가 하위. 개요 편집기의 관례와 같다.
//   · 이전/다음  = 형제 축에서 **앞 형제가 있는 쪽**이 이전.
// 존 판정은 "박스 밖으로 가장 많이 벗어난 변" 하나로 한다 — 네 변이
// 서로 다른 뜻을 가지므로 어느 변이든 반드시 한 존에 닿는다.

export type Dir = 'left' | 'right' | 'up' | 'down';
export type Axis = 'h' | 'v';
export type DropPosition = 'child' | 'parent' | 'before' | 'after';

export interface GeoNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  parent: string | null;
  depth: number;
  side?: string;
}

export interface ZoneAxes {
  childDir: Dir;
  parentDir: Dir;
  beforeDir: Dir;
  afterDir: Dir;
  sibAxis: Axis;
}

export const axisOf = (d: Dir): Axis => (d === 'left' || d === 'right' ? 'h' : 'v');
export const opposite = (d: Dir): Dir =>
  d === 'left' ? 'right' : d === 'right' ? 'left' : d === 'up' ? 'down' : 'up';

/** 레이아웃 관례 — 자식이 자라는 방향 (자식이 없을 때만 쓴다) */
export function convChildDir(eff: string, side: string | undefined): Dir {
  if (eff.startsWith('process-tree') || eff === 'tree-down') return 'down';
  if (eff === 'tree-up') return 'up';
  // 개요형(트리 오른쪽/왼쪽) — 자식은 **아래**에 들여써 놓인다
  if (eff === 'tree-right' || eff === 'tree-left') return 'down';
  if (eff === 'timeline' || eff === 'timeline-center') return side === 'up' ? 'up' : 'down';
  if (eff === 'hierarchy-left') return 'left';
  if (eff.startsWith('hierarchy')) return 'right';
  return side === 'left' ? 'left' : 'right';
}

/** 레이아웃 관례 — 부모(eff) 아래에서 형제가 늘어서는 축 (형제가 없을 때만) */
export function convSibAxis(parentEff: string, targetDepth: number): Axis {
  if (parentEff.startsWith('process-tree') || parentEff === 'tree-down' || parentEff === 'tree-up') return 'h';
  if (parentEff === 'timeline' || parentEff === 'timeline-center') return targetDepth <= 1 ? 'h' : 'v';
  return 'v';
}

/** 개요형처럼 자식 축이 형제 축과 겹칠 때, 부모가 있는 쪽을 정하지 못하면 이 관례 */
function convIndentParentDir(eff: string): Dir {
  if (eff === 'tree-left' || eff === 'hierarchy-left') return 'right';
  return 'left';
}

function dirOf(dx: number, dy: number): Dir {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/**
 * 대상 노드의 네 존 방향.
 * @param effOf 노드 id → 실효 레이아웃 이름 (자식 배치에 쓰이는 것)
 */
export function zoneAxesFor(
  target: GeoNode,
  nodes: readonly GeoNode[],
  effOf: (id: string) => string,
): ZoneAxes {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parent = target.parent ? byId.get(target.parent) : undefined;
  const eff = effOf(target.id);

  // ── 형제 축 ──
  // **같은 쪽(side)의 형제만** 본다 — 방사형·양쪽은 형제가 루트 좌우로
  // 갈리고, 시간배치는 축 위/아래로 갈린다. 반대쪽 형제와 견주면 축이
  // 가로로 잘못 잡힌다.
  const sameSide = (n: GeoNode) => !target.side || target.side === 'center' || !n.side || n.side === target.side;
  const siblings = parent
    ? nodes.filter((n) => n.parent === parent.id && n.id !== target.id && sameSide(n))
    : [];
  let sibAxis: Axis;
  if (siblings.length) {
    let best = siblings[0];
    let bestD = Infinity;
    for (const s of siblings) {
      const d = Math.abs(s.x - target.x) + Math.abs(s.y - target.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    sibAxis = Math.abs(best.x - target.x) >= Math.abs(best.y - target.y) ? 'h' : 'v';
  } else {
    sibAxis = convSibAxis(parent ? effOf(parent.id) : eff, target.depth);
  }

  // ── 자식 방향 ──
  const kids = nodes.filter((n) => n.parent === target.id);
  let childDir: Dir;
  if (kids.length) {
    const cx = kids.reduce((s, k) => s + k.x, 0) / kids.length;
    const cy = kids.reduce((s, k) => s + k.y, 0) / kids.length;
    childDir = dirOf(cx - target.x, cy - target.y);
  } else {
    childDir = convChildDir(eff, target.side);
  }

  // ── 부모 방향 — 자식 축이 형제 축과 겹치면 수직 축으로 ──
  let parentDir: Dir;
  if (axisOf(childDir) === sibAxis) {
    const perp: Axis = sibAxis === 'h' ? 'v' : 'h';
    const diff = parent ? (perp === 'h' ? parent.x - target.x : parent.y - target.y) : 0;
    if (Math.abs(diff) >= 1) {
      parentDir = perp === 'h' ? (diff < 0 ? 'left' : 'right') : (diff < 0 ? 'up' : 'down');
    } else {
      parentDir = perp === 'h' ? convIndentParentDir(eff) : 'up';
    }
    childDir = opposite(parentDir);
  } else {
    parentDir = opposite(childDir);
  }

  // ── 이전/다음 — 앞 형제가 있는 쪽이 이전 ──
  let beforeDir: Dir | null = null;
  if (parent && siblings.length) {
    const order = nodes.filter((n) => n.parent === parent.id && sameSide(n));
    const idx = order.findIndex((n) => n.id === target.id);
    const prev = idx > 0 ? order[idx - 1] : undefined;
    const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : undefined;
    const toward = (s: GeoNode): Dir =>
      sibAxis === 'h' ? (s.x < target.x ? 'left' : 'right') : (s.y < target.y ? 'up' : 'down');
    if (prev) beforeDir = toward(prev);
    else if (next) beforeDir = opposite(toward(next));
  }
  if (!beforeDir) {
    // 관례: 위/왼쪽이 이전. 시간배치의 위 스택은 아래(축 쪽)가 이전
    beforeDir = sibAxis === 'h' ? 'left' : (target.side === 'up' && eff.startsWith('timeline') ? 'down' : 'up');
  }
  return { childDir, parentDir, beforeDir, afterDir: opposite(beforeDir), sibAxis };
}

/**
 * 커서가 대상 노드의 어느 존에 있나.
 *   · 박스 안 = 항상 하위(2026-08-05 규칙 그대로)
 *   · 박스 밖 = 가장 많이 벗어난 변의 뜻
 *   · 루트는 부모·형제가 없으니 어디든 하위
 */
export function zoneAt(target: GeoNode, axes: ZoneAxes, wx: number, wy: number): DropPosition {
  const dx = wx - target.x;
  const dy = wy - target.y;
  if (target.depth === 0) return 'child';
  const over: Record<Dir, number> = {
    right: dx - target.w / 2,
    left: -dx - target.w / 2,
    down: dy - target.h / 2,
    up: -dy - target.h / 2,
  };
  let best: Dir = 'right';
  for (const d of ['right', 'left', 'down', 'up'] as Dir[]) if (over[d] > over[best]) best = d;
  if (over[best] <= 0) return 'child';
  if (best === axes.childDir) return 'child';
  if (best === axes.parentDir) return 'parent';
  if (best === axes.beforeDir) return 'before';
  return 'after';
}
