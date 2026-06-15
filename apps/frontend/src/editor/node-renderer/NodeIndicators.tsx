// NodeIndicators — 4-direction "+" buttons around the selected node.
// Each direction is a distinct, predictable action:
//   ← left  : 상위 노드 추가 (insert a parent above this node)
//   → right : 하위 노드 추가 (add a child)
//   ↑ up    : 형제 노드 앞에 추가 (sibling before)
//   ↓ down  : 형제 노드 뒤에 추가 (sibling after)
// The root node only allows "child".
// Spec: docs/03-editor-core/node/02-node-editing.md (NODE-IND-01~04)

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';

interface Props {
  node: LaidOutNode;
  t: ThemeTokens;
  onAddChild: () => void;
  onAddParent: () => void;
  onAddSiblingBefore: () => void;
  onAddSiblingAfter: () => void;
}

export function NodeIndicators({
  node, t, onAddChild, onAddParent, onAddSiblingBefore, onAddSiblingAfter,
}: Props) {
  const isRoot = node.depth === 0;
  const GAP = 26;

  const spots = [
    { dir: 'up'    as const, label: '형제 앞에 추가', x: node.x,                 y: node.y - node.h / 2 - GAP, disabled: isRoot, action: onAddSiblingBefore },
    { dir: 'down'  as const, label: '형제 뒤에 추가', x: node.x,                 y: node.y + node.h / 2 + GAP, disabled: isRoot, action: onAddSiblingAfter  },
    { dir: 'left'  as const, label: '상위 노드 추가', x: node.x - node.w / 2 - GAP, y: node.y,                 disabled: isRoot, action: onAddParent       },
    { dir: 'right' as const, label: '하위 노드 추가', x: node.x + node.w / 2 + GAP, y: node.y,                 disabled: false,  action: onAddChild        },
  ];

  return (
    <g>
      {spots.map((s) => (
        <g
          key={s.dir}
          opacity={s.disabled ? 0.2 : 1}
          style={{ cursor: s.disabled ? 'default' : 'pointer' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (!s.disabled) s.action();
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
          {/* transparent larger hit area */}
          <circle cx={s.x} cy={s.y} r="14" fill="transparent" />
          <circle cx={s.x} cy={s.y} r="11" fill={t.surface} stroke={t.primary} strokeWidth="1.8" />
          <line x1={s.x - 5} y1={s.y} x2={s.x + 5} y2={s.y} stroke={t.primary} strokeWidth="1.8" strokeLinecap="round" />
          <line x1={s.x} y1={s.y - 5} x2={s.x} y2={s.y + 5} stroke={t.primary} strokeWidth="1.8" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}
