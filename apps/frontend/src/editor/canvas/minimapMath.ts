// 미니맵 좌표 계산 — 순수 함수 (2026-09-21 사용자 요청: 우하단 미니맵).
//
// 좌표계 셋:
//   · world   — 배치(LayoutEngine)가 준 노드 좌표. 노드 (x, y) 는 **중심**, w/h 는 크기.
//   · viewBox — 캔버스 <svg> 의 0..W × 0..H (컨테이너 px 와 같다).
//               viewBox = (world − C) × s + C + pan   (s = zoom/100, C = (CX, CY))
//   · mini    — 미니맵 패널 px. mini = (world − bounds.x) × scale
//
// ★ 2026-09-21 사용자 보고 "미니맵 창과 표시창 크기가 너무 작다" 뒤의 규칙:
//   · 패널은 **항상 같은 큰 크기**(창의 24%×36%, 200~360 × 150~320). 맵
//     비율대로 줄이면 세로로 긴 맵(2,808 노드 진행트리)에서 폭 30px 띠가 됐다.
//   · 표시창(지금 보이는 영역)은 **최소 60×45 px 를 보장**한다. 그 배율로
//     맵 전체가 패널에 안 들어가면 미니맵은 **화면 주변만** 보여 주는 창이
//     된다(`fits = false`) — 창은 표시창이 가장자리에 닿을 때만 따라 움직인다.
// 사양: docs/03-editor-core/canvas/10-canvas.md §6.8.

export interface Rect { x: number; y: number; w: number; h: number } // 왼쪽 위 기준

export interface MinimapGeom {
  /** 미니맵이 덮는 world 영역 (= 패널 크기 ÷ scale). 맵이 다 들어가면 맵을 가운데 둔 영역 */
  bounds: Rect;
  /** world → mini 배율 */
  scale: number;
  panelW: number;
  panelH: number;
  /** 맵 전체가 패널에 들어가는가. false = 화면 주변만 보이는 창 모드 */
  fits: boolean;
}

/** 표시창(보이는 영역 사각형)의 최소 크기 (px) */
export const MINIMAP_MIN_VIEW = { w: 60, h: 45 };

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

/** 노드 경계 + 여백(각 변 12%, 최소 80 world). 노드가 없으면 400×300 상자 */
export function paddedBounds(nodeBounds: Rect | null): Rect {
  const nb = nodeBounds ?? { x: 0, y: 0, w: 400, h: 300 };
  const padX = Math.max(80, nb.w * 0.12);
  const padY = Math.max(80, nb.h * 0.12);
  return { x: nb.x - padX, y: nb.y - padY, w: nb.w + padX * 2, h: nb.h + padY * 2 };
}

/** 패널 크기 — 캔버스 창의 24% × 36%, 200~360 × 150~320 px. 맵 모양과 무관하게 **항상 이 크기** */
export function minimapPanelSize(W: number, H: number): { panelW: number; panelH: number } {
  return {
    panelW: Math.round(Math.min(360, Math.max(200, W * 0.24))),
    panelH: Math.round(Math.min(320, Math.max(150, H * 0.36))),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 창(영역) 원점을 어떻게 정하나 — Minimap 컴포넌트의 상태에서 온다 */
export type MinimapOriginMode =
  /** 가만히 있을 때: 표시창이 가장자리(6%) 안에 있으면 직전 창 유지, 아니면 표시창 중심으로 */
  | 'auto'
  /** 끄는 중: 직전 창을 두되 표시창이 밖으로 나가면 **그만큼만** 따라온다(가장자리에 붙는다) —
   *  이렇게 하면 사각형을 가장자리로 밀고 있는 동안 맵이 계속 흐른다 (2026-09-21 "끝으로
   *  옮기면 전체 맵이 빨리 안 보인다" 보고) */
  | 'follow'
  /** 휠로 창을 옮긴 뒤: 표시창과 무관하게 직전 창 그대로 (다음 클릭·끌기 전까지) */
  | 'hold';

/**
 * 미니맵 기하.
 *   · scale = max(맵 전체가 들어가는 배율, 표시창이 60×45 가 되는 배율)
 *   · 영역(bounds) = 패널 ÷ scale. 축마다: 맵이 그 안에 들어가면 **맵을 가운데**,
 *     안 들어가면 mode 대로 (`MinimapOriginMode`) — 어느 경우든 맵 경계 밖으로는 안 나간다.
 *   · 배율이 바뀌면 직전 창은 버린다.
 */
export function minimapGeometry(
  nodeBounds: Rect | null,
  view: Rect,
  panelW: number,
  panelH: number,
  prev?: { x: number; y: number; scale: number } | null,
  mode: MinimapOriginMode = 'auto',
): MinimapGeom {
  const pb = paddedBounds(nodeBounds);
  const fitScale = Math.min(panelW / pb.w, panelH / pb.h);
  const minScale = Math.max(MINIMAP_MIN_VIEW.w / Math.max(1, view.w), MINIMAP_MIN_VIEW.h / Math.max(1, view.h));
  const scale = Math.max(fitScale, minScale);
  const fits = fitScale >= minScale;
  const winW = panelW / scale, winH = panelH / scale;

  const axis = (mapLo: number, mapLen: number, viewLo: number, viewLen: number, winLen: number, prevLo: number | undefined) => {
    if (mapLen <= winLen) return mapLo + mapLen / 2 - winLen / 2; // 맵이 들어간다 → 가운데
    const lo = mapLo, hi = mapLo + mapLen - winLen;
    if (prevLo !== undefined) {
      if (mode === 'hold') return clamp(prevLo, lo, hi);
      if (mode === 'follow') {
        // 표시창이 창 밖으로 나간 만큼만 민다 — 사각형은 가장자리에 붙고 창이 흐른다
        let next = prevLo;
        if (viewLo < next) next = viewLo;
        else if (viewLo + viewLen > next + winLen) next = viewLo + viewLen - winLen;
        return clamp(next, lo, hi);
      }
      const m = winLen * 0.06;
      const inside = viewLo >= prevLo + m && viewLo + viewLen <= prevLo + winLen - m;
      if (inside) return prevLo;
    }
    return clamp(viewLo + viewLen / 2 - winLen / 2, lo, hi);
  };
  const usePrev = prev && prev.scale === scale ? prev : null;
  const x = axis(pb.x, pb.w, view.x, view.w, winW, usePrev?.x);
  const y = axis(pb.y, pb.h, view.y, view.h, winH, usePrev?.y);
  return { bounds: { x, y, w: winW, h: winH }, scale, panelW, panelH, fits };
}

/** 휠로 창을 옮긴다 — mini px 만큼, 맵 경계 안에서. 맵이 창에 들어가는 축은 움직이지 않는다 */
export function shiftOrigin(
  g: MinimapGeom, nodeBounds: Rect | null, dxMini: number, dyMini: number,
): { x: number; y: number } {
  const pb = paddedBounds(nodeBounds);
  const one = (mapLo: number, mapLen: number, winLen: number, cur: number, d: number) =>
    mapLen <= winLen ? cur : clamp(cur + d / g.scale, mapLo, mapLo + mapLen - winLen);
  return {
    x: one(pb.x, pb.w, g.bounds.w, g.bounds.x, dxMini),
    y: one(pb.y, pb.h, g.bounds.h, g.bounds.y, dyMini),
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
