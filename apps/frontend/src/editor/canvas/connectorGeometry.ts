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

export const LOOP_OUT = 40;   // 고리 줄기: 오른쪽 변 바깥 거리
export const CORNER_R = 12;   // 둥근 모서리 반지름
export const BRANCH_STUB = 40; // 곁가지 라벨의 짧은 줄기 길이
export const LABEL_GAP = 6;   // 선 위/아래 라벨과 선 사이

/** 꺾이는 점들 (시작·끝 포함). 겹침·같은 높이 등 특수 경우는 점 2개. */
export function connectorPoints(a: CBox, b: CBox): CPoint[] {
  const aL = a.x - a.w / 2, aR = a.x + a.w / 2;
  const bL = b.x - b.w / 2, bR = b.x + b.w / 2;
  const xOverlap = aL < bR && bL < aR;
  if (xOverlap) {
    const X = Math.max(aR, bR) + LOOP_OUT;
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

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
const dist = (a: CPoint, b: CPoint) => Math.hypot(b.x - a.x, b.y - a.y);
const lerp = (a: CPoint, b: CPoint, t: number): CPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
