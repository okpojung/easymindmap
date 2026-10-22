// ConnectorLayer — 노드와 노드를 잇는 **연결선** (2026-09-22 사용자 요청).
//
// 트리 엣지(부모→자식, EdgeRenderer)와 다르다 — 트리와 무관하게 두 노드를 잇는
// 선이고 문서의 `map.connectors` 에 산다. 두 층으로 그린다:
//   · part="lines"  — 트리 엣지 뒤·노드 앞: 선 + 화살촉 + 넓은 투명 클릭 영역
//   · part="labels" — 노드 위: 라벨(글 + 도형) 과 곁가지 줄기
// 기하는 전부 `connectorGeometry.ts` (뷰어 exportHtml 도 같은 식을 JS 로 쓴다).
// 한쪽 끝 노드가 접혀서 안 보이면 선도 그리지 않는다 (nodesById 에 없다).
// 규칙: docs/03-editor-core/canvas/10-canvas.md §31.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Connector, ConnectorArrows, ConnectorDash, ConnectorLabelPlace, ConnectorLabelShape, ConnectorShape } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';
import { measureTextPx } from '@/editor/node-renderer/textMeasure';
import { useEffect, useRef, useState } from 'react';
import { useTr } from '@/i18n';
import { isViewerLocked, setHistoryPaused, useDocumentStore } from '@/stores/documentStore';
import { arrowHead, connectorJumps, jumpRadius, connectorMid, connectorPath, connectorPoints, connectorSideAtPoint, sideAnchor, labelBox, trunkSegment, type CBox, type CPoint, type CDir } from './connectorGeometry';
import { isCoarseNow } from '@/hooks/useViewport';

/** 기본값 — 사용자 결정(2026-09-22): 기본 선 색은 **파란색** */
export const CONNECTOR_DEFAULTS: Required<Pick<Connector, 'shape' | 'width' | 'color' | 'dash' | 'arrows'>> = {
  shape: 'rounded',
  width: 1.6,
  color: '#2563EB',
  dash: 'solid',
  arrows: 'end',
};
export const CONNECTOR_WIDTH_MAX = 8;
export const CONNECTOR_LABEL_FONT = 13;
const LABEL_PAD_X = 8;
const LABEL_PAD_Y = 5;
const LABEL_LINE_H = 17;
// 손가락이면 선을 잡는 폭을 넓게 (모바일 웹, 2026-10-05) — 장치는 도중에 바뀌지 않으니 한 번만 본다
const HIT_WIDTH = isCoarseNow() ? 24 : 14;

export function connectorShapeOf(c: Connector): ConnectorShape { return c.shape ?? CONNECTOR_DEFAULTS.shape; }
export function connectorWidthOf(c: Connector): number {
  const w = Number(c.width);
  return Number.isFinite(w) && w > 0 ? Math.min(CONNECTOR_WIDTH_MAX, w) : CONNECTOR_DEFAULTS.width;
}
export function connectorColorOf(c: Connector): string { return c.color || CONNECTOR_DEFAULTS.color; }
export function connectorDashOf(c: Connector): ConnectorDash { return c.dash ?? CONNECTOR_DEFAULTS.dash; }
export function connectorArrowsOf(c: Connector): ConnectorArrows { return c.arrows ?? CONNECTOR_DEFAULTS.arrows; }

/** stroke-dasharray — 굵기에 비례해 간격을 잡는다 (뷰어와 같은 식) */
export function connectorDashArray(dash: ConnectorDash, width: number): string | undefined {
  if (dash === 'dashed') return `${round(width * 4)} ${round(width * 3)}`;
  if (dash === 'dotted') return `${round(Math.max(0.1, width * 0.1))} ${round(width * 2.4)}`;
  return undefined;
}
/** 화살촉 크기 — 굵기에 비례 (뷰어와 같은 식) */
export function connectorArrowSize(width: number): number { return 7 + width * 2.2; }

/** 라벨 상자 크기 (글 줄 수·폭 + 여백). 도형이 타원이면 좀 더 넓힌다 */
export function connectorLabelSize(text: string, shape: ConnectorLabelShape): { w: number; h: number; lines: string[] } {
  const lines = String(text ?? '').split('\n');
  const textW = Math.max(12, ...lines.map((l) => measureTextPx(l, CONNECTOR_LABEL_FONT, { weight: 500 })));
  let w = textW + LABEL_PAD_X * 2;
  let h = lines.length * LABEL_LINE_H + LABEL_PAD_Y * 2;
  if (shape === 'ellipse') { w = w * 1.25 + 4; h = h * 1.3; }
  return { w, h, lines };
}

const round = (n: number) => Math.round(n * 100) / 100;

interface Props {
  part: 'lines' | 'labels';
  connectors: Connector[] | undefined;
  /** 지금 화면에 그려진(접히지 않은) 노드 — 없는 끝은 선을 감춘다 */
  nodesById: Map<string, LaidOutNode>;
  t: ThemeTokens;
  selectedId: string | null;
  onSelect: (id: string) => void;
  editable?: boolean;
}

interface Resolved {
  c: Connector;
  pts: CPoint[];
  color: string;
  width: number;
  shape: ConnectorShape;
  dash: ConnectorDash;
  arrows: ConnectorArrows;
}

/** 라벨이 없는 선에 붙을 때의 상자 — 선 한가운데의 아주 작은 점(합류점) */
const JUNCTION = 2;

/**
 * 연결선이 **다른 연결선에 닿는 자리** (2026-10-23 사용자 요청: "선연결선이 노드의 4면뿐만
 * 아니라 선의 라벨과도 연결") — 라벨이 있으면 그 라벨 상자, 없으면 선 한가운데의 점.
 * 순서도에서 되돌아오는 선이 다른 선에 합류하는 모양을 만든다.
 */
export function connectorTargetBox(c: Connector, pts: CPoint[]): CBox {
  const mid = connectorMid(pts);
  const text = c.label?.text?.trim() ? c.label.text : '';
  if (!text) return { x: mid.x, y: mid.y, w: JUNCTION, h: JUNCTION };
  const { w, h } = connectorLabelSize(text, c.label?.shape ?? 'rounded');
  const b = labelBox(mid, w, h, c.label?.place ?? 'center');
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

/**
 * 끝(from/to)은 노드 id 이거나 다른 연결선 id 다. 노드에 닿는 선부터 길을 구하고, 그 선들의
 * 라벨 상자를 더해 가며 남은 선을 푼다. 끝이 사라졌거나 서로를 가리키는(고리) 선은 그리지 않는다.
 * 돌려주는 boxes = 노드 상자 + 길을 구한 연결선의 라벨 상자 (끝점 끌기가 쓴다).
 */
function resolveAll(connectors: Connector[] | undefined, nodesById: Map<string, LaidOutNode>): { list: Resolved[]; boxes: Map<string, CBox> } {
  // 고리 줄기가 피해 갈 상자들 — 화면의 모든 노드 (끝 노드 둘은 안에서 뺀다)
  const boxes = new Map<string, CBox>();
  for (const n of nodesById.values()) boxes.set(n.id, { x: n.x, y: n.y, w: n.w, h: n.h });
  if (!connectors?.length) return { list: [], boxes };
  const obstacles = [...boxes.values()];
  const done = new Map<string, Resolved>();
  let pending = connectors;
  while (pending.length) {
    const next: Connector[] = [];
    for (const c of pending) {
      const a = boxes.get(c.from), b = boxes.get(c.to);
      if (!a || !b) { next.push(c); continue; }
      if (a === b) continue;
      const pts = connectorPoints(a, b, obstacles, c.fromSide ?? 'auto', c.toSide ?? 'auto', c.offset ?? 0);
      done.set(c.id, {
        c, pts,
        color: connectorColorOf(c),
        width: connectorWidthOf(c),
        shape: connectorShapeOf(c),
        dash: connectorDashOf(c),
        arrows: connectorArrowsOf(c),
      });
      if (!boxes.has(c.id)) boxes.set(c.id, connectorTargetBox(c, pts));
    }
    if (next.length === pending.length) break;
    pending = next;
  }
  return { list: connectors.flatMap((c) => (done.has(c.id) ? [done.get(c.id)!] : [])), boxes };
}

/**
 * 줄기 끌기 (2026-09-29 사용자 제안: "연결선을 선택하여 좌우로 드래그해 높이를
 * 조절") — 고른 연결선의 가운데 줄기를 **선 자체로도, 손잡이로도** 끌 수 있다.
 * 세로 줄기는 좌우·가로 줄기는 상하로 끌면 `offset` 이 바뀐다. 첫 움직임만 undo 에
 * 남기고 끄는 동안은 히스토리를 잠근다(색 피커와 같은 규칙) — 한 번 끌기 = undo 한 단계.
 */
function useTrunkDrag(id: string, offset: number, dir: 'h' | 'v') {
  const updateConnector = useDocumentStore((s) => s.updateConnector);
  const drag = useRef<{ start: number; base: number; moved: boolean } | null>(null);
  // 화면 px → world 좌표: 이 요소의 CTM 은 조상 <g transform>(pan·zoom)까지 담는다
  const toWorld = (e: React.PointerEvent<SVGElement>) => {
    const ctm = (e.currentTarget as SVGGraphicsElement).getScreenCTM();
    if (!ctm) return dir === 'v' ? e.clientX : e.clientY;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return dir === 'v' ? pt.x : pt.y;
  };
  return {
    style: { cursor: dir === 'v' ? 'ew-resize' : 'ns-resize' } as React.CSSProperties,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onPointerDown: (e: React.PointerEvent<SVGElement>) => {
      e.stopPropagation();
      (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
      drag.current = { start: toWorld(e), base: offset, moved: false };
    },
    onPointerMove: (e: React.PointerEvent<SVGElement>) => {
      const d = drag.current;
      if (!d) return;
      const next = Math.round(d.base + (toWorld(e) - d.start));
      if (next === offset) return;
      if (!d.moved) { d.moved = true; updateConnector(id, { offset: next || undefined }); setHistoryPaused(true); return; }
      updateConnector(id, { offset: next || undefined });
    },
    onPointerUp: (e: React.PointerEvent<SVGElement>) => {
      const d = drag.current;
      drag.current = null;
      if (d?.moved) setHistoryPaused(false);
      try { (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId); } catch { /* 이미 풀림 */ }
    },
    onPointerCancel: () => { if (drag.current?.moved) setHistoryPaused(false); drag.current = null; },
  };
}

/** 줄기 선 위의 넓은 투명 획 — 줄기 어디를 잡아도 끌린다 (선 층, 고른 선에만) */
function TrunkGrip({ id, pts, offset, dir }: { id: string; pts: CPoint[]; offset: number; dir: 'h' | 'v' }) {
  const h = useTrunkDrag(id, offset, dir);
  const tr = useTr();
  const seg = trunkSegment(pts)!;
  const p = pts[seg.i], q = pts[seg.i + 1];
  return (
    <path d={`M ${p.x} ${p.y} L ${q.x} ${q.y}`} fill="none" stroke="transparent" strokeWidth={HIT_WIDTH + 2} strokeLinecap="round" data-connector-trunk={id} {...h}>
      <title>{dir === 'v' ? tr('editor.connector.dragTrunkH') : tr('editor.connector.dragTrunkV')}</title>
    </path>
  );
}

/**
 * 줄기 손잡이 — **맨 위 층**(라벨 뒤에 그린다). 라벨이 줄기 한가운데에 앉으면
 * (사용자 캡처 "기사") 손잡이가 그 밑에 깔려 잡히지 않았다 — 라벨 상자와 겹치면
 * 줄기 방향으로 라벨 바깥까지 비켜 놓는다.
 */
function TrunkHandle({ id, pts, offset, dir, avoid, t }: { id: string; pts: CPoint[]; offset: number; dir: 'h' | 'v'; avoid?: { x: number; y: number; w: number; h: number }; t: ThemeTokens }) {
  const h = useTrunkDrag(id, offset, dir);
  const tr = useTr();
  const seg = trunkSegment(pts)!;
  const p = pts[seg.i], q = pts[seg.i + 1];
  let cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2;
  if (avoid) {
    const PAD = 6, GAP = 14;
    const inside = Math.abs(cx - avoid.x) <= avoid.w / 2 + PAD && Math.abs(cy - avoid.y) <= avoid.h / 2 + PAD;
    if (inside) {
      if (dir === 'v') {
        const lo = Math.min(p.y, q.y), hi = Math.max(p.y, q.y);
        const below = avoid.y + avoid.h / 2 + GAP, above = avoid.y - avoid.h / 2 - GAP;
        cy = below <= hi ? below : above >= lo ? above : cy;
      } else {
        const lo = Math.min(p.x, q.x), hi = Math.max(p.x, q.x);
        const right = avoid.x + avoid.w / 2 + GAP, left = avoid.x - avoid.w / 2 - GAP;
        cx = right <= hi ? right : left >= lo ? left : cx;
      }
    }
  }
  return (
    <g data-connector-handle={id} {...h}>
      <title>{dir === 'v' ? tr('editor.connector.dragTrunkH') : tr('editor.connector.dragTrunkV')}</title>
      <rect x={cx - (dir === 'v' ? 6 : 10)} y={cy - (dir === 'v' ? 10 : 6)} width={dir === 'v' ? 12 : 20} height={dir === 'v' ? 20 : 12} rx={3} fill={t.surface} stroke={t.primary} strokeWidth={1.5} />
      {dir === 'v'
        ? <path d={`M ${cx - 2} ${cy - 4} V ${cy + 4} M ${cx + 2} ${cy - 4} V ${cy + 4}`} stroke={t.primary} strokeWidth={1.2} />
        : <path d={`M ${cx - 4} ${cy - 2} H ${cx + 4} M ${cx - 4} ${cy + 2} H ${cx + 4}`} stroke={t.primary} strokeWidth={1.2} />}
    </g>
  );
}

/**
 * Preview is local only. Drop commits one history entry; Escape/cancel commits none.
 * 끝점을 끌어 **같은 노드의 다른 면**으로 옮기거나, **다른 노드·다른 연결선의 라벨**(라벨이
 * 없으면 선 한가운데) 위에 놓아 끝을 옮긴다 (2026-10-23). 자기 자신·반대쪽 끝과 같은 대상·
 * 이 선에 매달린 선(고리가 된다)에는 붙지 않는다.
 */
function EndpointGrip({ c, end, pts, boxes, nodeBoxes, connectors, t }: {
  c: Connector; end: 'from' | 'to'; pts: CPoint[]; boxes: Map<string, CBox>; nodeBoxes: Map<string, CBox>; connectors: Connector[]; t: ThemeTokens;
}) {
  const tr = useTr();
  const [preview, setPreview] = useState<{ target: string; side: CDir } | null>(null);
  const drag = useRef<{ pointerId: number; el: SVGGElement; x: number; y: number; moved: boolean; initial: CDir } | null>(null);
  const currentId = end === 'from' ? c.from : c.to;
  const otherId = end === 'from' ? c.to : c.from;
  const a = boxes.get(c.from)!, b = boxes.get(c.to)!;
  const box = end === 'from' ? a : b;
  const otherBox = end === 'from' ? b : a;
  const otherPoint = end === 'from' ? pts[pts.length - 1] : pts[0];
  const otherSide = (end === 'from' ? c.toSide : c.fromSide) ?? 'auto';
  const fixedOther = otherSide === 'auto' ? connectorSideAtPoint(otherBox, otherPoint) : otherSide;
  const original = end === 'from' ? pts[0] : pts[pts.length - 1];
  const previewBox = preview ? boxes.get(preview.target) ?? box : box;
  const point = preview ? sideAnchor(previewBox, preview.side) : original;
  const title = tr(end === 'from' ? 'editor.connector.dragStart' : 'editor.connector.dragEnd');
  const byId = new Map(connectors.map((v) => [v.id, v] as const));
  /** id 의 선이 (사슬을 따라) 이 선 c 에 매달려 있는가 — 거기 붙으면 고리가 된다 */
  const dependsOnMe = (id: string): boolean => {
    const seen = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = byId.get(stack.pop()!);
      if (!cur || seen.has(cur.id)) continue;
      seen.add(cur.id);
      for (const e of [cur.from, cur.to]) { if (e === c.id) return true; if (byId.has(e)) stack.push(e); }
    }
    return false;
  };
  const inside = (q: CBox, p: CPoint, pad: number) => Math.abs(p.x - q.x) <= q.w / 2 + pad && Math.abs(p.y - q.y) <= q.h / 2 + pad;
  /** 놓을 자리 — 라벨(위에 그려진다)을 먼저, 그다음 노드. 없으면 지금 끝 */
  const targetAt = (p: CPoint): string => {
    for (const [id, q] of boxes) {
      if (nodeBoxes.has(id) || id === c.id || id === otherId || !byId.has(id) || dependsOnMe(id)) continue;
      if (inside(q, p, q.w <= JUNCTION ? 10 : 4)) return id;
    }
    for (const [id, q] of nodeBoxes) if (id !== otherId && inside(q, p, 0)) return id;
    return currentId;
  };
  const cancel = () => {
    const d = drag.current; drag.current = null; setPreview(null);
    if (d) { try { d.el.releasePointerCapture(d.pointerId); } catch { /* already released */ } }
  };
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drag.current) { e.preventDefault(); e.stopPropagation(); cancel(); }
    };
    window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('keydown', escape, true); const d = drag.current; drag.current = null;
      if (d) { try { d.el.releasePointerCapture(d.pointerId); } catch { /* detached */ } }
    };
  }, []);
  const world = (e: React.PointerEvent<SVGGElement>): CPoint | null => {
    try {
      const m = e.currentTarget.getScreenCTM(); if (!m) return null;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      return Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
    } catch { return null; }
  };
  const commit = (side: CDir, target: string = currentId) => {
    if (isViewerLocked()) return;
    const live = useDocumentStore.getState().map.connectors?.find(v => v.id === c.id);
    if (!live || live.from !== c.from || live.to !== c.to) return;
    const opposite = end === 'from' ? live.toSide : live.fromSide;
    const pinOther = !opposite || opposite === 'auto';
    if (target !== currentId) {
      useDocumentStore.getState().updateConnector(c.id, end === 'from'
        ? { from: target, fromSide: side, ...(pinOther ? { toSide: fixedOther } : {}) }
        : { to: target, toSide: side, ...(pinOther ? { fromSide: fixedOther } : {}) });
      return;
    }
    const current = end === 'from' ? live.fromSide : live.toSide;
    if (current === side || ((!current || current === 'auto') && connectorSideAtPoint(box, original) === side)) return;
    useDocumentStore.getState().updateConnector(c.id, end === 'from'
      ? { fromSide: side, ...(pinOther ? { toSide: fixedOther } : {}) }
      : { toSide: side, ...(pinOther ? { fromSide: fixedOther } : {}) });
  };
  const ghost = preview
    ? (() => {
      const from = end === 'from' ? previewBox : a, to = end === 'to' ? previewBox : b;
      return connectorPoints(from, to, [...nodeBoxes.values()], end === 'from' ? preview.side : fixedOther, end === 'to' ? preview.side : fixedOther, c.offset ?? 0);
    })()
    : null;
  return <g data-connector-endpoint={`${c.id}:${end}`} role="button" aria-label={title} tabIndex={0}
    style={{ cursor: preview ? 'grabbing' : 'grab', touchAction: 'none' }}
    onClick={e => e.stopPropagation()}
    onKeyDown={e => {
      if (drag.current) return;
      const side = ({ ArrowUp: 'top', ArrowRight: 'right', ArrowDown: 'bottom', ArrowLeft: 'left' } as const)[e.key as 'ArrowUp'];
      if (side) { e.preventDefault(); e.stopPropagation(); commit(side); }
    }}
    onPointerDown={e => {
      e.preventDefault(); e.stopPropagation();
      if (e.button !== 0 || drag.current || isViewerLocked() || !world(e)) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { pointerId: e.pointerId, el: e.currentTarget, x: e.clientX, y: e.clientY, moved: false, initial: connectorSideAtPoint(box, original) };
    }}
    onPointerMove={e => {
      const d = drag.current; if (!d || d.pointerId !== e.pointerId) return;
      e.stopPropagation(); const p = world(e); if (!p) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 3 && !d.moved) return;
      d.moved = true;
      const target = targetAt(p);
      setPreview({ target, side: connectorSideAtPoint(boxes.get(target) ?? box, p) });
    }}
    onPointerUp={e => {
      const d = drag.current; if (!d || d.pointerId !== e.pointerId) return;
      e.stopPropagation(); const p = world(e);
      const target = p ? targetAt(p) : currentId;
      const side = p ? connectorSideAtPoint(boxes.get(target) ?? box, p) : null;
      cancel();
      if (d.moved && side && (target !== currentId || side !== d.initial)) commit(side, target);
    }}
    onPointerCancel={cancel} onLostPointerCapture={cancel}>
    <title>{title}</title>
    {ghost && <path d={connectorPath(ghost, connectorShapeOf(c))} fill="none" stroke={t.primary} strokeWidth={2} strokeDasharray="5 4" pointerEvents="none" />}
    {preview && previewBox.w > JUNCTION && (['top', 'right', 'bottom', 'left'] as CDir[]).map(side => {
      const p = sideAnchor(previewBox, side); return <circle key={side} cx={p.x} cy={p.y} r={4} fill={t.surface} stroke={t.primary} pointerEvents="none" />;
    })}
    {preview && preview.target !== currentId && (
      <rect x={previewBox.x - previewBox.w / 2 - 4} y={previewBox.y - previewBox.h / 2 - 4} width={previewBox.w + 8} height={previewBox.h + 8}
        rx={6} fill="none" stroke={t.primary} strokeWidth={1.5} strokeDasharray="4 3" pointerEvents="none" />
    )}
    <circle cx={point.x} cy={point.y} r={isCoarseNow() ? 14 : 10} fill="transparent" />
    <circle cx={point.x} cy={point.y} r={5} fill={t.surface} stroke={t.primary} strokeWidth={2} pointerEvents="none" />
  </g>;
}

export function ConnectorLayer({ part, connectors, nodesById, t, selectedId, onSelect, editable = true }: Props) {
  const { list, boxes: targetBoxes } = resolveAll(connectors, nodesById);
  if (!list.length) return null;

  if (part === 'lines') {
    // 선 건너뛰기 — 가로 변이 다른 연결선을 지나는 자리에 반원 (connectorGeometry.connectorJumps)
    const jumps = connectorJumps(list.map((l) => ({ pts: l.pts, r: jumpRadius(l.width) })));
    return (
      <g data-testid="connector-lines">
        {list.map(({ c, pts, color, width, shape, dash, arrows }, k) => {
          const d = connectorPath(pts, shape, undefined, { xs: jumps[k], r: jumpRadius(width) });
          const size = connectorArrowSize(width);
          const selected = editable && c.id === selectedId;
          const stop = (e: React.SyntheticEvent) => e.stopPropagation();
          return (
            <g
              key={c.id}
              data-connector-id={c.id}
              data-selected={selected ? '1' : undefined}
              style={{ cursor: 'pointer' }}
              onPointerDown={stop}
              onClick={(e) => { e.stopPropagation(); onSelect(c.id); }}
            >
              {selected && (
                <path d={d} fill="none" stroke={t.primary} strokeWidth={width + 7} strokeOpacity={0.22} strokeLinecap="round" strokeLinejoin="round" />
              )}
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={width}
                strokeDasharray={connectorDashArray(dash, width)}
                strokeLinecap="round"
                strokeLinejoin="round"
                data-connector-path="1"
              />
              {(arrows === 'end' || arrows === 'both') && pts.length >= 2 && (
                <path d={arrowHead(pts[pts.length - 1], pts[pts.length - 2], size)} fill={color} stroke="none" data-connector-arrow="end" />
              )}
              {(arrows === 'start' || arrows === 'both') && pts.length >= 2 && (
                <path d={arrowHead(pts[0], pts[1], size)} fill={color} stroke="none" data-connector-arrow="start" />
              )}
              {/* 클릭 영역 — 가는 선도 쉽게 잡히게 넓은 투명 획 */}
              <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(HIT_WIDTH, width + 8)} strokeLinecap="round" strokeLinejoin="round" data-connector-hit="1" />
              {selected && pts.length >= 2 && (
                <>
                  {trunkSegment(pts) && (
                    <TrunkGrip id={c.id} pts={pts} offset={c.offset ?? 0} dir={trunkSegment(pts)!.dir} />
                  )}
                </>
              )}
            </g>
          );
        })}
      </g>
    );
  }

  return (
    <g data-testid="connector-labels">
      {list.map(({ c, pts, color, width, dash }) => {
        const text = c.label?.text?.trim() ? c.label.text : '';
        if (!text) return null;
        const place: ConnectorLabelPlace = c.label?.place ?? 'center';
        const shape: ConnectorLabelShape = c.label?.shape ?? 'rounded';
        const { w, h, lines } = connectorLabelSize(text, shape);
        const mid = connectorMid(pts);
        const box = labelBox(mid, w, h, place);
        const selected = editable && c.id === selectedId;
        const x0 = box.x - box.w / 2, y0 = box.y - box.h / 2;
        const stroke = selected ? t.primary : color;
        const firstBase = box.y - ((lines.length - 1) * LABEL_LINE_H) / 2;
        return (
          <g
            key={c.id}
            data-connector-label={c.id}
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onSelect(c.id); }}
          >
            {box.stub && (
              <line x1={box.stub.x1} y1={box.stub.y1} x2={box.stub.x2} y2={box.stub.y2} stroke={color} strokeWidth={width} strokeDasharray={connectorDashArray(dash, width)} strokeLinecap="round" />
            )}
            {shape === 'ellipse' ? (
              <ellipse cx={box.x} cy={box.y} rx={box.w / 2} ry={box.h / 2} fill={t.surface} stroke={stroke} strokeWidth={selected ? 1.8 : 1.2} />
            ) : shape !== 'none' ? (
              <rect x={x0} y={y0} width={box.w} height={box.h} rx={shape === 'pill' ? box.h / 2 : shape === 'rectangle' ? 2 : 8} fill={t.surface} stroke={stroke} strokeWidth={selected ? 1.8 : 1.2} />
            ) : selected ? (
              <rect x={x0 - 2} y={y0 - 2} width={box.w + 4} height={box.h + 4} rx={6} fill="none" stroke={t.primary} strokeWidth={1.2} strokeDasharray="3 3" />
            ) : null}
            <text
              x={box.x}
              textAnchor="middle"
              fontSize={CONNECTOR_LABEL_FONT}
              fontWeight={500}
              fill={t.text}
              // 도형 없음 — 글자 뒤를 바탕색으로 살짝 지워 선 위에서도 읽힌다
              stroke={shape === 'none' ? t.surface : undefined}
              strokeWidth={shape === 'none' ? 4 : undefined}
              strokeLinejoin="round"
              style={{ paintOrder: 'stroke', userSelect: 'none' }}
            >
              {lines.map((ln, i) => (
                <tspan key={i} x={box.x} y={firstBase + i * LABEL_LINE_H + CONNECTOR_LABEL_FONT * 0.35}>{ln || ' '}</tspan>
              ))}
            </text>
          </g>
        );
      })}
      {/* Ports are above nodes so the complete grip remains clickable. */}
      {list.filter(({ c }) => editable && c.id === selectedId).map(({ c, pts }) => {
        const nodeBoxes = new Map<string, CBox>();
        for (const n of nodesById.values()) nodeBoxes.set(n.id, { x: n.x, y: n.y, w: n.w, h: n.h });
        return <g key={`ports-${c.id}`}>
          <EndpointGrip c={c} end="from" pts={pts} boxes={targetBoxes} nodeBoxes={nodeBoxes} connectors={connectors ?? []} t={t} />
          <EndpointGrip c={c} end="to" pts={pts} boxes={targetBoxes} nodeBoxes={nodeBoxes} connectors={connectors ?? []} t={t} />
        </g>;
      })}
      {/* 줄기 손잡이 — 라벨보다 위에 (고른 선에만) */}
      {list.map(({ c, pts }) => {
        if (!editable || c.id !== selectedId) return null;
        const seg = trunkSegment(pts);
        if (!seg) return null;
        let avoid: { x: number; y: number; w: number; h: number } | undefined;
        const text = c.label?.text?.trim() ? c.label.text : '';
        if (text) {
          const shape: ConnectorLabelShape = c.label?.shape ?? 'rounded';
          const { w, h } = connectorLabelSize(text, shape);
          avoid = labelBox(connectorMid(pts), w, h, c.label?.place ?? 'center');
        }
        return <TrunkHandle key={`h-${c.id}`} id={c.id} pts={pts} offset={c.offset ?? 0} dir={seg.dir} avoid={avoid} t={t} />;
      })}
    </g>
  );
}
