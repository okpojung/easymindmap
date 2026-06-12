// CollabCursor — V2 preview. Renders a single other-user cursor as a floating
// DOM arrow + name pill, positioned relative to a target node and the SVG zoom transform.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Collaborator } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';

interface Props {
  t: ThemeTokens;
  collab: Collaborator | undefined;
  W: number;
  H: number;
  nodes: LaidOutNode[];
  scale?: number;
  CX: number;
  CY: number;
  panX?: number;
  panY?: number;
}

export function CollabCursor({ t, collab, W, H, nodes, scale = 1, CX, CY, panX = 0, panY = 0 }: Props) {
  if (!collab) return null;
  const targetNode = nodes.find(n => n.id === collab.editing);
  if (!targetNode) return null;

  // Offset the cursor slightly outside the node's top-right corner.
  const rawX = targetNode.x + targetNode.w/2 - 10;
  const rawY = targetNode.y - targetNode.h/2 - 16;
  // Apply the same pan + scale transform used inside the SVG <g>
  const cx = CX + panX + (rawX - CX) * scale;
  const cy = CY + panY + (rawY - CY) * scale;
  const leftPct = (cx / W) * 100;
  const topPct  = (cy / H) * 100;
  const color = (t as any)[collab.colorKey] as string;

  return (
    <div style={{
      position: 'absolute',
      left: `${leftPct}%`, top: `${topPct}%`,
      pointerEvents: 'none',
      zIndex: 8,
      transform: 'translate(-50%, -50%)',
    }}>
      <svg width="16" height="16" viewBox="0 0 16 16">
        <path d="M1 1 L1 12 L4 9 L6 14 L8 13 L6 8 L10 8 Z"
              fill={color} stroke="#fff" strokeWidth="1" />
      </svg>
      <div style={{
        marginTop: -2, marginLeft: 12,
        background: color, color: '#fff',
        fontSize: 10.5, fontWeight: 600,
        padding: '2px 7px', borderRadius: 5,
        borderTopLeftRadius: 0,
        whiteSpace: 'nowrap',
      }}>{collab.name}</div>
    </div>
  );
}
