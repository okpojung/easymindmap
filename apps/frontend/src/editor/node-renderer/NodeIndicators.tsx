// NodeIndicators — 4-direction "+" buttons around the selected node.
// The four actions (parent / child / sibling-before / sibling-after) are mapped
// to physical directions based on the node's layout side, so they stay spatially
// intuitive (child always points toward where children grow, parent toward the
// parent, siblings perpendicular). Root only allows "child".
// Spec: docs/03-editor-core/node/02-node-editing.md (NODE-IND-01~04)

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';

type ActionKey = 'child' | 'parent' | 'before' | 'after';

interface Props {
  node: LaidOutNode;
  t: ThemeTokens;
  onAddChild: () => void;
  onAddParent: () => void;
  onAddSiblingBefore: () => void;
  onAddSiblingAfter: () => void;
}

const LABELS: Record<ActionKey, string> = {
  child: '하위 노드 추가',
  parent: '상위 노드 추가',
  before: '형제 앞에 추가',
  after: '형제 뒤에 추가',
};

// Which action each physical direction performs, given the node's side.
function dirActions(side: LaidOutNode['side']): Record<'up' | 'down' | 'left' | 'right', ActionKey> {
  if (side === 'left') return { up: 'before', down: 'after', left: 'child', right: 'parent' };
  if (side === 'down') return { up: 'parent', down: 'child', left: 'before', right: 'after' };
  // right / center / default
  return { up: 'before', down: 'after', left: 'parent', right: 'child' };
}

export function NodeIndicators({
  node, t, onAddChild, onAddParent, onAddSiblingBefore, onAddSiblingAfter,
}: Props) {
  const isRoot = node.depth === 0;
  const GAP = 26;
  const map = dirActions(node.side);

  const handlers: Record<ActionKey, () => void> = {
    child: onAddChild,
    parent: onAddParent,
    before: onAddSiblingBefore,
    after: onAddSiblingAfter,
  };

  const spots = [
    { dir: 'up' as const,    x: node.x,                    y: node.y - node.h / 2 - GAP, action: map.up },
    { dir: 'down' as const,  x: node.x,                    y: node.y + node.h / 2 + GAP, action: map.down },
    { dir: 'left' as const,  x: node.x - node.w / 2 - GAP, y: node.y,                    action: map.left },
    { dir: 'right' as const, x: node.x + node.w / 2 + GAP, y: node.y,                    action: map.right },
  ].map((s) => ({
    ...s,
    // Root can only gain children; everything else can do all four.
    disabled: isRoot && s.action !== 'child',
    label: LABELS[s.action],
  }));

  return (
    <g>
      {spots.map((s) => (
        <g
          key={s.dir}
          opacity={s.disabled ? 0.18 : 1}
          style={{ cursor: s.disabled ? 'default' : 'pointer' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (!s.disabled) handlers[s.action]();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <title>{s.label}</title>
          <line
            x1={s.dir === 'left' ? node.x - node.w / 2 : s.dir === 'right' ? node.x + node.w / 2 : node.x}
            y1={s.dir === 'up' ? node.y - node.h / 2 : s.dir === 'down' ? node.y + node.h / 2 : node.y}
            x2={s.x} y2={s.y}
            stroke={t.primary} strokeWidth="1.3" strokeDasharray="2 3"
          />
          <circle cx={s.x} cy={s.y} r="14" fill="transparent" />
          <circle cx={s.x} cy={s.y} r="11" fill={t.surface} stroke={t.primary} strokeWidth="1.8" />
          <line x1={s.x - 5} y1={s.y} x2={s.x + 5} y2={s.y} stroke={t.primary} strokeWidth="1.8" strokeLinecap="round" />
          <line x1={s.x} y1={s.y - 5} x2={s.x} y2={s.y + 5} stroke={t.primary} strokeWidth="1.8" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}
