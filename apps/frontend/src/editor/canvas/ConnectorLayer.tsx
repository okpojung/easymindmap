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
import { arrowHead, connectorMid, connectorPath, connectorPoints, labelBox, type CBox, type CPoint } from './connectorGeometry';

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
const HIT_WIDTH = 14;

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

function resolve(connectors: Connector[] | undefined, nodesById: Map<string, LaidOutNode>): Resolved[] {
  const out: Resolved[] = [];
  if (!connectors?.length) return out;
  // 고리 줄기가 피해 갈 상자들 — 화면의 모든 노드 (끝 노드 둘은 안에서 뺀다)
  const boxes = new Map<string, CBox>();
  for (const n of nodesById.values()) boxes.set(n.id, { x: n.x, y: n.y, w: n.w, h: n.h });
  const obstacles = [...boxes.values()];
  for (const c of connectors) {
    const a = boxes.get(c.from), b = boxes.get(c.to);
    if (!a || !b || a === b) continue;
    out.push({
      c,
      pts: connectorPoints(a, b, obstacles),
      color: connectorColorOf(c),
      width: connectorWidthOf(c),
      shape: connectorShapeOf(c),
      dash: connectorDashOf(c),
      arrows: connectorArrowsOf(c),
    });
  }
  return out;
}

export function ConnectorLayer({ part, connectors, nodesById, t, selectedId, onSelect }: Props) {
  const list = resolve(connectors, nodesById);
  if (!list.length) return null;

  if (part === 'lines') {
    return (
      <g data-testid="connector-lines">
        {list.map(({ c, pts, color, width, shape, dash, arrows }) => {
          const d = connectorPath(pts, shape);
          const size = connectorArrowSize(width);
          const selected = c.id === selectedId;
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
                  <circle cx={pts[0].x} cy={pts[0].y} r={4} fill={t.surface} stroke={t.primary} strokeWidth={1.5} />
                  <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={4} fill={t.surface} stroke={t.primary} strokeWidth={1.5} />
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
        const selected = c.id === selectedId;
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
    </g>
  );
}
