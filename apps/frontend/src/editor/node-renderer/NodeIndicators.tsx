// NodeIndicators — "+" buttons around the selected node.
// Direction meaning is FIXED for every layout (spec docs/03-editor-core/node/
// 03-node-indicator.md §"방향 매핑 고정 원칙"):
//   ⬆ up    = 상위(부모) 추가
//   ⬇ down  = 하위(자식) 추가
//   ⬅ left  = 형제(이전) 추가
//   ➡ right = 형제(다음) 추가
// Root node: only "child" is allowed; the other directions are hidden.

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
  parent: '상위 노드 추가',
  child: '하위 노드 추가',
  before: '형제 노드 앞에 추가',
  after: '형제 노드 뒤에 추가',
};

export function NodeIndicators({
  node, t, onAddChild, onAddParent, onAddSiblingBefore, onAddSiblingAfter,
}: Props) {
  const isRoot = node.depth === 0;
  const GAP = 26;

  const handlers: Record<ActionKey, () => void> = {
    child: onAddChild,
    parent: onAddParent,
    before: onAddSiblingBefore,
    after: onAddSiblingAfter,
  };

  // Fixed physical direction → action.
  const spots: { dir: string; x: number; y: number; action: ActionKey }[] = [
    { dir: 'up',    x: node.x,                    y: node.y - node.h / 2 - GAP, action: 'parent' },
    { dir: 'down',  x: node.x,                    y: node.y + node.h / 2 + GAP, action: 'child' },
    { dir: 'left',  x: node.x - node.w / 2 - GAP, y: node.y,                    action: 'before' },
    { dir: 'right', x: node.x + node.w / 2 + GAP, y: node.y,                    action: 'after' },
  ];

  // Root: show only the child (down) indicator.
  const visible = isRoot ? spots.filter((s) => s.action === 'child') : spots;

  return (
    <g>
      {visible.map((s) => (
        <g
          key={s.dir}
          style={{ cursor: 'pointer' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); handlers[s.action](); }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <title>{LABELS[s.action]}</title>
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
