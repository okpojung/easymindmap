// Canvas — root SVG viewport that hosts the laid-out mindmap.
// - Computes layout via LayoutEngine
// - Renders edges, nodes, indicators
// - Applies zoom scale to the INNER <g> only (Viewport Store rule § 6.7)
// - Hosts the floating toolbar and corner hint badge
// - Surfaces collab cursor (V2 preview)
//
// Spec: docs/03-editor-core/canvas/10-canvas.md § 21–27

import { useMemo, type MouseEvent } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LayoutType, SampleMap, Collaborator } from '@/editor/__samples__/types';
import { computeLayout } from '@/layout/LayoutEngine';
import { NodeRenderer } from '@/editor/node-renderer/NodeRenderer';
import { NodeIndicators } from '@/editor/node-renderer/NodeIndicators';
import { EdgeRenderer } from '@/editor/edge-renderer/EdgeRenderer';
import { CollabCursor } from '@/editor/collaboration/CollabCursor';
import { CanvasFloatingToolbar } from './CanvasFloatingToolbar';

const LAYOUT_LABEL: Record<string, string> = {
  'radial-bidirectional': '방사형 · 양쪽 (곡선)',
  'radial-right':         '방사형 · 오른쪽 (곡선)',
  'radial-left':          '방사형 · 왼쪽 (곡선)',
  'tree-right':           '트리 · 오른쪽 (직각선)',
  'tree-down':            '트리 · 아래 (직각선)',
  'hierarchy-right':      '계층형 (들여쓰기)',
};

interface Props {
  t: ThemeTokens;
  sample: SampleMap;
  layoutType: LayoutType;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  collabs: Collaborator[];
  zoom: number;
}

export function Canvas({
  t, sample, layoutType, selectedId, onSelect, collabs, zoom,
}: Props) {
  // Fixed SVG viewBox; outer container fills the available flex space.
  const W = 1400, H = 760;
  const CX = W / 2, CY = H / 2;

  const nodes = useMemo(
    () => computeLayout(sample, layoutType, CX, CY),
    [sample, layoutType, CX, CY],
  );

  const selectedNode = nodes.find(n => n.id === selectedId);
  const scale = (zoom || 100) / 100;
  const editingCollab = collabs.find(c => c.editing === 'b2-1');

  return (
    <div style={{
      flex: 1, position: 'relative', overflow: 'hidden',
      background: `${t.canvas} radial-gradient(circle at center, ${t.border}aa 1px, transparent 1px) 0 0 / ${24 * scale}px ${24 * scale}px repeat`,
    }}>
      {/* Corner hint badge */}
      <div style={{
        position: 'absolute', top: 14, left: 14, zIndex: 5,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', borderRadius: 20,
        background: t.surface, border: `1px solid ${t.border}`,
        boxShadow: t.shadowSm,
        fontSize: 11, color: t.textMuted, fontWeight: 500,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.primary }} />
        {LAYOUT_LABEL[layoutType] || '마인드맵'} · 자동 배치 · {nodes.length} 노드 · {zoom || 100}%
      </div>

      <CanvasFloatingToolbar t={t} hasSelection={!!selectedNode} />

      {/* SVG viewport — zoom applies to the inner <g> only (§ 25) */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
           style={{ width: '100%', height: '100%', display: 'block', cursor: 'default' }}
           onClick={(e: MouseEvent<SVGSVGElement>) => {
             if ((e.target as Element).tagName === 'svg') onSelect(null);
           }}>
        <g transform={`translate(${CX} ${CY}) scale(${scale}) translate(${-CX} ${-CY})`}>
          {/* Edges */}
          <g>
            {nodes.filter(n => n.parent).map(n => {
              const p = nodes.find(x => x.id === n.parent);
              if (!p) return null;
              return <EdgeRenderer key={n.id} from={p} to={n} t={t} layoutType={layoutType} />;
            })}
          </g>
          {/* Nodes */}
          <g>
            {nodes.map(n => (
              <NodeRenderer
                key={n.id} n={n} t={t}
                selected={n.id === selectedId}
                onSelect={() => onSelect(n.id)}
                collabs={collabs} />
            ))}
          </g>
          {/* 4-direction add indicators on the selected node */}
          {selectedNode && <NodeIndicators node={selectedNode} t={t} />}
        </g>
      </svg>

      <CollabCursor t={t} collab={editingCollab}
                    W={W} H={H} nodes={nodes}
                    scale={scale} CX={CX} CY={CY} />
    </div>
  );
}
