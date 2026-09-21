// 미니맵 좌표 계산 — 순수 함수 (2026-09-21 사용자 요청: 우하단 미니맵).
//
// 좌표계 셋:
//   · world   — 배치(LayoutEngine)가 준 노드 좌표. 노드 (x, y) 는 **중심**, w/h 는 크기.
//   · viewBox — 캔버스 <svg> 의 0..W × 0..H (컨테이너 px 와 같다).
//               viewBox = (world − C) × s + C + pan   (s = zoom/100, C = (CX, CY))
//   · mini    — 미니맵 패널 px. mini = (world − bounds.x) × scale
//
// 사양: docs/03-editor-core/canvas/10-canvas.md §6.8.

export interface Rect { x: number; y: number; w: number; h: number } // 왼쪽 위 기준

export interface MinimapGeom {
  /** 미니맵이 덮는 world 영역 (노드 경계 + 여백) */
  bounds: Rect;
  /** world → mini 배율 */
  scale: number;
  panelW: number;
  panelH: number;
}

/** 노드(중심 좌표) 전체의 world 경계. 노드가 없으면 null */
export function worldBounds(nodes: { x: number; y: number; w: number; h: number }[]): Rect | null {
  if (!nodes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.w / 2);
    maxX = Math.max(maxX, n.x + n.w / 2);
    minY = Math.min(minY, n.y - n.h / 2);
    maxY = Math.max(maxY, n.y + n.h / 2);
  }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

/**
 * 지금 화면에 보이는 world 영역 — **캔버스 창의 픽셀 크기(W×H)를 배율로
 * 나눈 것**이라, 창을 키우거나 배율을 바꾸면 그대로 따라 커지고 작아진다
 * (사용자 요청: "표시 창의 크기는 현재 에디트 창의 해상도로").
 */
export function viewportWorldRect(
  W: number, H: number, CX: number, CY: number, panX: number, panY: number, zoom: number,
): Rect {
  const s = (zoom || 100) / 100;
  return {
    x: (0 - CX - panX) / s + CX,
    y: (0 - CY - panY) / s + CY,
    w: W / s,
    h: H / s,
  };
}

/**
 * 미니맵 기하 — 노드 경계에 여백(각 변 12%, 최소 80 world)을 두고 패널
 * 최대 크기(maxW×maxH)에 **비율을 지키며** 맞춘다. 화면 영역은 경계에
 * 넣지 않는다: 넣으면 화면을 옮길 때마다 배율이 흔들려 노드가 춤춘다.
 * 밖으로 나간 화면 사각형은 패널이 잘라 보인다.
 */
export function minimapGeometry(
  nodeBounds: Rect | null, maxW: number, maxH: number,
): MinimapGeom {
  const nb = nodeBounds ?? { x: 0, y: 0, w: 400, h: 300 };
  const padX = Math.max(80, nb.w * 0.12);
  const padY = Math.max(80, nb.h * 0.12);
  const bounds = { x: nb.x - padX, y: nb.y - padY, w: nb.w + padX * 2, h: nb.h + padY * 2 };
  const scale = Math.min(maxW / bounds.w, maxH / bounds.h);
  return { bounds, scale, panelW: Math.round(bounds.w * scale), panelH: Math.round(bounds.h * scale) };
}

/** 패널 최대 크기 — 캔버스 창의 22% × 28%, 160~300 × 110~220 px */
export function minimapPanelMax(W: number, H: number): { maxW: number; maxH: number } {
  return {
    maxW: Math.round(Math.min(300, Math.max(160, W * 0.22))),
    maxH: Math.round(Math.min(220, Math.max(110, H * 0.28))),
  };
}

export function worldToMini(g: MinimapGeom, r: Rect): Rect {
  return { x: (r.x - g.bounds.x) * g.scale, y: (r.y - g.bounds.y) * g.scale, w: r.w * g.scale, h: r.h * g.scale };
}

export function miniToWorld(g: MinimapGeom, mx: number, my: number): { x: number; y: number } {
  return { x: mx / g.scale + g.bounds.x, y: my / g.scale + g.bounds.y };
}

/** world 점 (wx, wy) 가 화면 중앙에 오는 pan — fitToNodes 와 같은 식 */
export function panForCenter(
  wx: number, wy: number, CX: number, CY: number, zoom: number,
): { panX: number; panY: number } {
  const s = (zoom || 100) / 100;
  return { panX: -(wx - CX) * s, panY: -(wy - CY) * s };
}
