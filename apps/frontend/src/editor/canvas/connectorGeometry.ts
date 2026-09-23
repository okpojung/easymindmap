// connectorGeometry — 연결선(노드↔노드) 기하 (2026-09-22). 순수 함수라 캔버스
// (ConnectorLayer)·HTML 뷰어(exportHtml, JS 로 옮겨 적음)·단위 시험이 같은 값을 쓴다.
//
// 길 잡는 규칙 (사용자 그림: 두 Sub Topic 의 오른쪽에서 나가 오른쪽 세로 줄기로 이음):
//   · 두 상자의 x 범위가 겹치면(위아래로 놓임) → 둘 다 **오른쪽 변**에서 나가 오른쪽
//     바깥(max right + LOOP_OUT)의 세로 줄기로 잇는다 (고리 모양)
//   · a 가 b 의 왼쪽이면 → a 오른쪽 변 → 가운데 x 에서 꺾여 → b 왼쪽 변 (같은 높이면 직선)
//   · a 가 b 의 오른쪽이면 → 거울상
// 모양: 'elbow' 는 직각, 'rounded' 는 꺾이는 곳을 반지름 CORNER_R 로 둥글게 (Q 곡선).

export interface CBox { x: number; y: number; w: number; h: number } // 중심 좌표
export interface CPoint { x: number; y: number }
export type CShape = 'elbow' | 'rounded';
/** 선이 노드에 닿는 면 — auto 는 상대 노드 쪽을 보고 고른다 (2026-09-23) */
export type CSide = 'auto' | 'top' | 'bottom' | 'left' | 'right';
export type CDir = Exclude<CSide, 'auto'>;

export const LOOP_OUT = 40;   // 고리 줄기: 오른쪽 변 바깥 거리
export const CORNER_R = 12;   // 둥근 모서리 반지름
export const BRANCH_STUB = 40; // 곁가지 라벨의 짧은 줄기 길이
export const LABEL_GAP = 6;   // 선 위/아래 라벨과 선 사이
export const STUB = 24;       // 면에서 곧게 빠져나오는 최소 길이 (면을 정했을 때)
/** 고리 줄기를 장애물 너머로 미는 한도 — 이보다 멀어지면 차라리 노드 뒤로 지나간다 (2026-09-23) */
export const MAX_TRUNK_PUSH = LOOP_OUT * 4;

/**
 * 꺾이는 점들 (시작·끝 포함). 겹침·같은 높이 등 특수 경우는 점 2개.
 * `obstacles` — 화면의 다른 노드 상자들. 고리 모양일 때 세로 줄기가 **두 노드 사이
 * 높이에 있는 다른 노드를 관통하지 않도록** 그 오른쪽 너머로 민다 (하위 노드가
 * 오른쪽에 펼쳐진 트리에서 줄기가 자식들을 가로지르던 것, 2026-09-22 캡처로 확인).
 */
export function connectorPoints(a: CBox, b: CBox, obstacles?: CBox[], fromSide: CSide = 'auto', toSide: CSide = 'auto'): CPoint[] {
  // 면을 정했으면(한쪽이라도) 면 기반 길 (2026-09-23 사용자 요청). 둘 다 auto 면 예전 규칙.
  if (fromSide !== 'auto' || toSide !== 'auto') {
    return dedupePoints(routeBySides(a, resolveSide(a, b, fromSide), b, resolveSide(b, a, toSide), obstacles));
  }
  const aL = a.x - a.w / 2, aR = a.x + a.w / 2;
  const bL = b.x - b.w / 2, bR = b.x + b.w / 2;
  const xOverlap = aL < bR && bL < aR;
  if (xOverlap) {
    const X = loopTrunkX(a, b, obstacles);
    if (Math.abs(a.y - b.y) < 1) return [{ x: aR, y: a.y }, { x: X, y: a.y }, { x: X, y: b.y + 1 }, { x: bR, y: b.y + 1 }];
    return [{ x: aR, y: a.y }, { x: X, y: a.y }, { x: X, y: b.y }, { x: bR, y: b.y }];
  }
  if (aR <= bL) {
    const midX = (aR + bL) / 2;
    if (Math.abs(a.y - b.y) < 1) return [{ x: aR, y: a.y }, { x: bL, y: b.y }];
    return [{ x: aR, y: a.y }, { x: midX, y: a.y }, { x: midX, y: b.y }, { x: bL, y: b.y }];
  }
  const midX = (bR + aL) / 2;
  if (Math.abs(a.y - b.y) < 1) return [{ x: aL, y: a.y }, { x: bR, y: b.y }];
  return [{ x: aL, y: a.y }, { x: midX, y: a.y }, { x: midX, y: b.y }, { x: bR, y: b.y }];
}

/** 점들 → SVG path. rounded 면 꺾이는 점마다 반지름 r(인접 변 절반까지)로 둥글게 */
export function connectorPath(pts: CPoint[], shape: CShape, r = CORNER_R): string {
  if (pts.length < 2) return '';
  if (shape === 'elbow' || pts.length === 2) {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${fmt(p.x)} ${fmt(p.y)}`).join(' ');
  }
  let d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    const l1 = dist(p0, p1), l2 = dist(p1, p2);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    if (rr < 0.5) { d += ` L ${fmt(p1.x)} ${fmt(p1.y)}`; continue; }
    const inP = lerp(p1, p0, rr / l1);
    const outP = lerp(p1, p2, rr / l2);
    d += ` L ${fmt(inP.x)} ${fmt(inP.y)} Q ${fmt(p1.x)} ${fmt(p1.y)} ${fmt(outP.x)} ${fmt(outP.y)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${fmt(last.x)} ${fmt(last.y)}`;
}

/** 선 길이의 한가운데 점과 그 자리 변의 방향 ('h' 가로 / 'v' 세로) */
export function connectorMid(pts: CPoint[]): { x: number; y: number; dir: 'h' | 'v'; seg: number } {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    if (acc + l >= total / 2 || i === pts.length - 1) {
      const t = l === 0 ? 0 : (total / 2 - acc) / l;
      const p = lerp(pts[i - 1], pts[i], Math.max(0, Math.min(1, t)));
      const dir: 'h' | 'v' = Math.abs(pts[i].x - pts[i - 1].x) >= Math.abs(pts[i].y - pts[i - 1].y) ? 'h' : 'v';
      return { x: p.x, y: p.y, dir, seg: i - 1 };
    }
    acc += l;
  }
  return { x: pts[0].x, y: pts[0].y, dir: 'h', seg: 0 };
}

/** 화살촉 삼각형 — tip 이 선 끝, 방향은 (from → tip) */
export function arrowHead(tip: CPoint, from: CPoint, size: number): string {
  const dx = tip.x - from.x, dy = tip.y - from.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  const bx = tip.x - ux * size, by = tip.y - uy * size;
  const wx = -uy * size * 0.5, wy = ux * size * 0.5;
  return `M ${fmt(tip.x)} ${fmt(tip.y)} L ${fmt(bx + wx)} ${fmt(by + wy)} L ${fmt(bx - wx)} ${fmt(by - wy)} Z`;
}

export interface LabelBox { x: number; y: number; w: number; h: number; stub?: { x1: number; y1: number; x2: number; y2: number } }
/**
 * 라벨 상자 자리 — center: 선 가운데 위에 · above/below: 가로 변이면 위/아래,
 * 세로 변이면 왼쪽/오른쪽 · branch: 짧은 줄기로 매단 곁가지 (세로 변이면 오른쪽,
 * 가로 변이면 아래)
 */
export function labelBox(mid: ReturnType<typeof connectorMid>, w: number, h: number, place: 'center' | 'above' | 'below' | 'branch'): LabelBox {
  if (place === 'center') return { x: mid.x, y: mid.y, w, h };
  if (place === 'branch') {
    if (mid.dir === 'v') return { x: mid.x + BRANCH_STUB + w / 2, y: mid.y, w, h, stub: { x1: mid.x, y1: mid.y, x2: mid.x + BRANCH_STUB, y2: mid.y } };
    return { x: mid.x, y: mid.y + BRANCH_STUB + h / 2, w, h, stub: { x1: mid.x, y1: mid.y, x2: mid.x, y2: mid.y + BRANCH_STUB } };
  }
  const sign = place === 'above' ? -1 : 1;
  if (mid.dir === 'h') return { x: mid.x, y: mid.y + sign * (h / 2 + LABEL_GAP), w, h };
  return { x: mid.x + sign * (w / 2 + LABEL_GAP), y: mid.y, w, h };
}

/** 고리 줄기 x — 두 노드 오른쪽 변 + LOOP_OUT 에서 시작해, 두 노드 사이 높이의 다른
 * 상자를 지나게 되면 그 상자 오른쪽 + LOOP_OUT 으로 (새로 걸리는 게 없을 때까지) */
export function loopTrunkX(a: CBox, b: CBox, obstacles?: CBox[]): number {
  return loopTrunk(a, b, 'right', obstacles);
}

/**
 * 같은 면끼리 이을 때의 고리 줄기 자리 — 그 면 바깥 LOOP_OUT. 두 노드 사이(줄기와
 * 나란한 구간)에 있는 다른 상자를 지나게 되면 그 상자 너머 + LOOP_OUT 으로 민다.
 * right/left 는 x 값, bottom/top 은 y 값을 돌려준다.
 */
export function loopTrunk(a: CBox, b: CBox, side: CDir, obstacles?: CBox[]): number {
  const horiz = side === 'right' || side === 'left';
  const sign = side === 'right' || side === 'bottom' ? 1 : -1;
  const edge = (o: CBox) => (horiz ? o.x + sign * o.w / 2 : o.y + sign * o.h / 2);
  const T0 = (sign > 0 ? Math.max(edge(a), edge(b)) : Math.min(edge(a), edge(b))) + sign * LOOP_OUT;
  let T = T0;
  if (!obstacles?.length) return T;
  // 줄기와 나란한 구간 — 가로 줄기(bottom/top)는 두 노드의 x 사이, 세로 줄기는 y 사이
  const lo = horiz ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
  const hi = horiz ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
  const band = obstacles.filter((o) => o !== a && o !== b && (horiz
    ? o.y + o.h / 2 > lo && o.y - o.h / 2 < hi
    : o.x + o.w / 2 > lo && o.x - o.w / 2 < hi));
  for (let guard = 0; guard < 50; guard++) {
    let moved = false;
    for (const o of band) {
      const near = horiz ? o.x - o.w / 2 : o.y - o.h / 2;
      const far = horiz ? o.x + o.w / 2 : o.y + o.h / 2;
      if (near - LOOP_OUT / 2 <= T && T <= far + LOOP_OUT / 2) { T = (sign > 0 ? far : near) + sign * LOOP_OUT; moved = true; }
    }
    if (!moved) break;
  }
  // 빽빽한 곳에서는 끝없이 밀려 맵 전체를 도는 고리가 된다 (2026-09-23 캡처) — 한도를
  // 넘으면 원래 자리로 (선은 노드 뒤 층이라 가려질 뿐, 멀리 돌지는 않는다)
  return Math.abs(T - T0) > MAX_TRUNK_PUSH ? T0 : T;
}

/** auto → 상대 노드 중심이 어느 쪽에 있나 (더 먼 축) */
export function resolveSide(box: CBox, other: CBox, side: CSide): CDir {
  if (side !== 'auto') return side;
  const dx = other.x - box.x, dy = other.y - box.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/** 면 위의 닿는 점 (면 한가운데) */
export function sideAnchor(box: CBox, side: CDir): CPoint {
  if (side === 'right') return { x: box.x + box.w / 2, y: box.y };
  if (side === 'left') return { x: box.x - box.w / 2, y: box.y };
  if (side === 'bottom') return { x: box.x, y: box.y + box.h / 2 };
  return { x: box.x, y: box.y - box.h / 2 };
}

const normalOf = (side: CDir): CPoint => (
  side === 'right' ? { x: 1, y: 0 } : side === 'left' ? { x: -1, y: 0 } : side === 'bottom' ? { x: 0, y: 1 } : { x: 0, y: -1 });
const isHoriz = (side: CDir) => side === 'right' || side === 'left';

/**
 * 면을 정한 길 (2026-09-23) — 두 면 조합에 따라:
 *   · 같은 면          → 그 면 바깥의 줄기(loopTrunk)로 도는 고리
 *   · 마주 보는 면     → 서로를 향해 나오면 가운데서 한 번 꺾음(ㄷ), 등지고 있으면
 *                        STUB 만큼 나와 두 상자 사이(겹치면 아래쪽 바깥)로 돌아감
 *   · 직각인 면        → 모서리 한 점에서 꺾는 ㄱ 자 (모서리가 두 면 앞에 있을 때),
 *                        아니면 STUB 만큼 나와 ㄹ 자
 */
export function routeBySides(a: CBox, sA: CDir, b: CBox, sB: CDir, obstacles?: CBox[]): CPoint[] {
  const pA = sideAnchor(a, sA), pB = sideAnchor(b, sB);
  const nA = normalOf(sA), nB = normalOf(sB);
  const p1 = { x: pA.x + nA.x * STUB, y: pA.y + nA.y * STUB };
  const p4 = { x: pB.x + nB.x * STUB, y: pB.y + nB.y * STUB };
  if (sA === sB) {
    const T = loopTrunk(a, b, sA, obstacles);
    return isHoriz(sA)
      ? [pA, { x: T, y: pA.y }, { x: T, y: pB.y }, pB]
      : [pA, { x: pA.x, y: T }, { x: pB.x, y: T }, pB];
  }
  if (isHoriz(sA) && isHoriz(sB)) {
    // 마주 보는 좌우 면
    const gap = (pB.x - pA.x) * nA.x; // 양수면 서로를 향해 나온다
    if (gap >= STUB * 2) {
      const midX = (pA.x + pB.x) / 2;
      return [pA, { x: midX, y: pA.y }, { x: midX, y: pB.y }, pB];
    }
    const midY = betweenY(a, b);
    return [pA, p1, { x: p1.x, y: midY }, { x: p4.x, y: midY }, p4, pB];
  }
  if (!isHoriz(sA) && !isHoriz(sB)) {
    const gap = (pB.y - pA.y) * nA.y;
    if (gap >= STUB * 2) {
      const midY = (pA.y + pB.y) / 2;
      return [pA, { x: pA.x, y: midY }, { x: pB.x, y: midY }, pB];
    }
    const midX = betweenX(a, b);
    return [pA, p1, { x: midX, y: p1.y }, { x: midX, y: p4.y }, p4, pB];
  }
  // 직각 — A 세로면·B 가로면이면 모서리는 (A.x, B.y), 반대면 (B.x, A.y)
  const corner = isHoriz(sA) ? { x: pB.x, y: pA.y } : { x: pA.x, y: pB.y };
  const frontA = (corner.x - pA.x) * nA.x + (corner.y - pA.y) * nA.y;
  const frontB = (corner.x - pB.x) * nB.x + (corner.y - pB.y) * nB.y;
  if (frontA >= STUB && frontB >= STUB) return [pA, corner, pB];
  return isHoriz(sA)
    ? [pA, p1, { x: p1.x, y: p4.y }, p4, pB]
    : [pA, p1, { x: p4.x, y: p1.y }, p4, pB];
}

/** 두 상자 사이의 빈 세로 자리 — 위아래로 떨어져 있으면 그 틈의 가운데, 겹치면 둘 아래 바깥 */
function betweenY(a: CBox, b: CBox): number {
  const aT = a.y - a.h / 2, aB = a.y + a.h / 2, bT = b.y - b.h / 2, bB = b.y + b.h / 2;
  if (aB <= bT) return (aB + bT) / 2;
  if (bB <= aT) return (bB + aT) / 2;
  return Math.max(aB, bB) + LOOP_OUT;
}
/** 두 상자 사이의 빈 가로 자리 — 좌우로 떨어져 있으면 그 틈의 가운데, 겹치면 둘 오른쪽 바깥 */
function betweenX(a: CBox, b: CBox): number {
  const aL = a.x - a.w / 2, aR = a.x + a.w / 2, bL = b.x - b.w / 2, bR = b.x + b.w / 2;
  if (aR <= bL) return (aR + bL) / 2;
  if (bR <= aL) return (bR + aL) / 2;
  return Math.max(aR, bR) + LOOP_OUT;
}

/** 붙어 있는 같은 점을 없앤다 (화살촉 방향이 0 벡터가 되지 않게) */
export function dedupePoints(pts: CPoint[]): CPoint[] {
  const out: CPoint[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) out.push(p);
  }
  return out;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
const dist = (a: CPoint, b: CPoint) => Math.hypot(b.x - a.x, b.y - a.y);
const lerp = (a: CPoint, b: CPoint, t: number): CPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
