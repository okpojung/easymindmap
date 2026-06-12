// File: src/editor/canvas/Canvas.tsx
// Version: MVP-Layout-Canvas-Fix-v1

import { useEffect, useMemo, type MouseEvent } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LayoutType, SampleMap, Collaborator } from '@/editor/__samples__/types';
import { computeLayout } from '@/layout/LayoutEngine';
import { NodeRenderer } from '@/editor/node-renderer/NodeRenderer';
import { NodeIndicators } from '@/editor/node-renderer/NodeIndicators';
import { EdgeRenderer } from '@/editor/edge-renderer/EdgeRenderer';
import { CollabCursor } from '@/editor/collaboration/CollabCursor';
import { useDocumentStore } from '@/stores/documentStore';
import { CanvasFloatingToolbar } from './CanvasFloatingToolbar';

const LAYOUT_LABEL: Record<string, string> = {
  tree: '트리 · 오른쪽 (직각선)',
  radial: '방사형 · 오른쪽 (곡선)',
  'both-radial': '방사형 · 양쪽 (곡선)',
  hierarchy: '계층형 (직각선)',
  'progress-tree': '진행트리 (직각선)',
  free: '자유배치',
  kanban: 'Kanban 보드',
  'radial-bidirectional': '방사형 · 양쪽 (곡선)',
  'radial-right': '방사형 · 오른쪽 (곡선)',
  'radial-left': '방사형 · 왼쪽 (곡선)',
  'tree-right': '트리 · 오른쪽 (직각선)',
  'tree-down': '트리 · 아래 (직각선)',
  'hierarchy-right': '계층형 (직각선)',
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
  t,
  sample,
  layoutType,
  selectedId,
  onSelect,
  collabs,
  zoom,
}: Props) {
  const W = 1400;
  const H = 760;
  const CX = W / 2;
  const CY = H / 2;

  const addChildNode = useDocumentStore((state) => state.addChildNode);
  const deleteNode = useDocumentStore((state) => state.deleteNode);

  const nodes = useMemo(
    () => computeLayout(sample, layoutType, CX, CY),
    [sample, layoutType, CX, CY],
  );

  const selectedNode = nodes.find((n) => n.id === selectedId);
  const scale = (zoom || 100) / 100;
  const editingCollab = collabs.find((c) => c.editing === 'b2-1');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;

      const isEditingText =
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'INPUT' ||
        target?.isContentEditable;

      if (isEditingText) return;

      if (e.code === 'Space') {
        e.preventDefault();

        const newNodeId = addChildNode(selectedId || 'root');
        onSelect(newNodeId);
        return;
      }

      if (e.key === 'Delete') {
        e.preventDefault();

        if (!selectedId || selectedId === 'root') return;

        deleteNode(selectedId);
        onSelect(null);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onSelect(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedId, addChildNode, deleteNode, onSelect]);

  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: `${t.canvas} radial-gradient(circle at center, ${t.border}aa 1px, transparent 1px) 0 0 / ${
          24 * scale
        }px ${24 * scale}px repeat`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          borderRadius: 20,
          background: t.surface,
          border: `1px solid ${t.border}`,
          boxShadow: t.shadowSm,
          fontSize: 11,
          color: t.textMuted,
          fontWeight: 500,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: t.primary,
          }}
        />
        {LAYOUT_LABEL[layoutType] || '마인드맵'} · 자동 배치 · {nodes.length} 노드 ·{' '}
        {zoom || 100}%
      </div>

      <CanvasFloatingToolbar t={t} hasSelection={!!selectedNode} />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: 'default',
        }}
        onClick={(e: MouseEvent<SVGSVGElement>) => {
          if ((e.target as Element).tagName === 'svg') onSelect(null);
        }}
      >
        <g transform={`translate(${CX} ${CY}) scale(${scale}) translate(${-CX} ${-CY})`}>
          <g>
            {nodes
              .filter((n) => n.parent)
              .map((n) => {
                const p = nodes.find((x) => x.id === n.parent);
                if (!p) return null;

                return (
                  <EdgeRenderer
                    key={n.id}
                    from={p}
                    to={n}
                    t={t}
                    layoutType={layoutType}
                  />
                );
              })}
          </g>

          <g>
            {nodes.map((n) => (
              <NodeRenderer
                key={n.id}
                n={n}
                t={t}
                selected={n.id === selectedId}
                onSelect={() => onSelect(n.id)}
                collabs={collabs}
              />
            ))}
          </g>

          {selectedNode && <NodeIndicators node={selectedNode} t={t} />}
        </g>
      </svg>

      <CollabCursor
        t={t}
        collab={editingCollab}
        W={W}
        H={H}
        nodes={nodes}
        scale={scale}
        CX={CX}
        CY={CY}
      />
    </div>
  );
}