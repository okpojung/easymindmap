// 미니맵 — 캔버스 우하단의 축소 전체 보기 (2026-09-21 사용자 요청).
// 하단 상태바의 미니맵 버튼 또는 Alt+M / Alt+H 로 켜고 끈다.
//   · 노드는 자리·색만 작은 사각형으로 (연결선·글자는 그리지 않는다)
//   · 지금 보이는 영역이 사각형으로 — 크기 = 캔버스 창 px ÷ 배율, 최소 60×45
//   · 사각형을 끌면 화면이 따라 움직이고, 빈 곳을 누르면 그 자리가 중앙
//   · 패널은 항상 같은 크기. 맵이 크면 화면 주변만 보이는 창이 된다
//     (2026-09-21 "창과 표시창이 너무 작다" 보고 뒤) — 창은 사각형이
//     가장자리에 닿을 때만 옮겨 가고, 끄는 동안은 고정이다.
// 좌표 계산은 minimapMath.ts (단위 테스트), 사양은 10-canvas.md §6.8.

import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';
import { resolveNodeColors } from '@/editor/node-renderer/resolveNodeColors';
import { useViewportStore } from '@/stores/viewportStore';
import {
  minimapGeometry, minimapPanelSize, miniToWorld, panForCenter, viewportWorldRect, worldBounds, worldToMini,
} from './minimapMath';

interface Props {
  t: ThemeTokens;
  nodes: LaidOutNode[];
  W: number;
  H: number;
  CX: number;
  CY: number;
  onClose: () => void;
}

export function Minimap({ t, nodes, W, H, CX, CY, onClose }: Props) {
  const zoom = useViewportStore((s) => s.zoom);
  const panX = useViewportStore((s) => s.panX);
  const panY = useViewportStore((s) => s.panY);
  const setPan = useViewportStore((s) => s.setPan);

  const svgRef = useRef<SVGSVGElement | null>(null);
  // 끄는 중 — 포인터와 화면 사각형 중심의 간격(mini px)을 유지한다
  const dragRef = useRef<{ pointerId: number; dx: number; dy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const nodeBounds = useMemo(() => worldBounds(nodes), [nodes]);
  const viewWorld = viewportWorldRect(W, H, CX, CY, panX, panY, zoom);
  // 직전 영역 — 창 모드에서 사각형이 가장자리에 닿기 전까지는 그대로 둔다
  const originRef = useRef<{ x: number; y: number; scale: number } | null>(null);
  const { panelW, panelH } = minimapPanelSize(W, H);
  const geom = minimapGeometry(nodeBounds, viewWorld, panelW, panelH, originRef.current, dragging);
  originRef.current = { x: geom.bounds.x, y: geom.bounds.y, scale: geom.scale };
  const view = worldToMini(geom, viewWorld);

  const miniPoint = (e: ReactPointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const centerAt = (mx: number, my: number) => {
    const w = miniToWorld(geom, mx, my);
    const p = panForCenter(w.x, w.y, CX, CY, zoom);
    setPan(p.panX, p.panY);
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const m = miniPoint(e);
    const inside = m.x >= view.x && m.x <= view.x + view.w && m.y >= view.y && m.y <= view.y + view.h;
    // 사각형 안에서 시작 = 그 간격을 유지하며 끌기 · 밖 = 그 자리가 중앙이 되고 이어서 끌기
    const dx = inside ? m.x - (view.x + view.w / 2) : 0;
    const dy = inside ? m.y - (view.y + view.h / 2) : 0;
    if (!inside) centerAt(m.x, m.y);
    dragRef.current = { pointerId: e.pointerId, dx, dy };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const m = miniPoint(e);
    centerAt(m.x - d.dx, m.y - d.dy);
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div
      data-testid="minimap"
      className="mm-overlay-controls"
      style={{
        position: 'absolute', right: 14, bottom: 14, zIndex: 6,
        background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8,
        boxShadow: t.shadowSm, padding: 4, userSelect: 'none',
      }}
    >
      <button
        data-testid="minimap-close"
        onClick={onClose}
        title="미니맵 닫기 (Alt+M)"
        style={{
          position: 'absolute', top: 2, right: 4, zIndex: 1,
          width: 18, height: 18, border: 'none', borderRadius: 4,
          background: 'transparent', color: t.textMuted, cursor: 'pointer',
          fontSize: 13, lineHeight: 1, padding: 0,
        }}
      >×</button>
      <svg
        ref={svgRef}
        width={geom.panelW}
        height={geom.panelH}
        data-minimap-scale={geom.scale}
        data-minimap-origin={`${geom.bounds.x},${geom.bounds.y}`}
        data-minimap-fits={geom.fits ? '1' : '0'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'block', cursor: dragging ? 'grabbing' : 'grab', overflow: 'hidden', borderRadius: 5, background: t.canvas }}
      >
        {nodes.map((n) => {
          const c = resolveNodeColors(n, t);
          const r = worldToMini(geom, { x: n.x - n.w / 2, y: n.y - n.h / 2, w: n.w, h: n.h });
          return (
            <rect
              key={n.id}
              x={r.x} y={r.y} width={Math.max(2, r.w)} height={Math.max(1.5, r.h)} rx={1}
              fill={n.style?.fillColor ?? c.fill}
              stroke={n.style?.borderColor ?? c.border}
              strokeWidth={0.6}
            />
          );
        })}
        <rect
          data-testid="minimap-viewport"
          x={view.x} y={view.y} width={view.w} height={view.h}
          fill={`${t.primary}22`}
          stroke={t.primary}
          strokeWidth={1.5}
          rx={2}
        />
      </svg>
    </div>
  );
}
