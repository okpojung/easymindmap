// NodeIndicators — "+" buttons around the selected node.
// 방향 의미는 레이아웃(자식이 자라는 방향 = node.side)에 맞춰 정해진다
// (spec docs/03-editor-core/node/03-node-indicator.md §"방향 매핑"):
//
//   side='right' (오른쪽으로 자람): ➡ 자식 · ⬅ 부모 · ⬆ 형제(앞) · ⬇ 형제(뒤)
//   side='left'  (왼쪽으로 자람):   ⬅ 자식 · ➡ 부모 · ⬆ 형제(앞) · ⬇ 형제(뒤)
//   side='down'  (아래로 자람):     ⬇ 자식 · ⬆ 부모 · ⬅ 형제(앞) · ➡ 형제(뒤)
//   side='up'    (위로 자람 — 시간배치): ⬆ 자식 · ⬇ 부모 · ⬅/➡ 형제
//
// Root: 자식 추가만 — 자식이 자라는 방향에 표시. 방사형·양쪽 레이아웃이면
// 좌·우 양쪽에 표시되고, 누른 쪽으로 새 브랜치가 배치된다.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';

type ActionKey = 'child' | 'child-left' | 'parent' | 'before' | 'after';

interface Props {
  node: LaidOutNode;
  t: ThemeTokens;
  // 루트에서 자식이 자라는 방향(들) — 레이아웃에서 결정 (양쪽이면 2개)
  rootChildSides?: ('left' | 'right' | 'down')[];
  onAddChild: (side?: 'left' | 'right') => void;
  onAddParent: () => void;
  onAddSiblingBefore: () => void;
  onAddSiblingAfter: () => void;
}

const LABELS: Record<ActionKey, string> = {
  parent: '상위 노드 추가',
  child: '하위 노드 추가',
  'child-left': '하위 노드 추가 (왼쪽)',
  before: '형제 노드 앞에 추가',
  after: '형제 노드 뒤에 추가',
};

type Dir = 'up' | 'down' | 'left' | 'right';

export function NodeIndicators({
  node, t, rootChildSides, onAddChild, onAddParent, onAddSiblingBefore, onAddSiblingAfter,
}: Props) {
  const isRoot = node.depth === 0;
  const GAP = 26;

  const handlers: Record<ActionKey, () => void> = {
    child: () => onAddChild(isRoot ? 'right' : undefined),
    'child-left': () => onAddChild('left'),
    parent: onAddParent,
    before: onAddSiblingBefore,
    after: onAddSiblingAfter,
  };

  const pos: Record<Dir, { x: number; y: number }> = {
    up:    { x: node.x,                    y: node.y - node.h / 2 - GAP },
    down:  { x: node.x,                    y: node.y + node.h / 2 + GAP },
    left:  { x: node.x - node.w / 2 - GAP, y: node.y },
    right: { x: node.x + node.w / 2 + GAP, y: node.y },
  };

  // 레이아웃 방향(side) → 방향별 동작 매핑
  let mapping: { dir: Dir; action: ActionKey }[];
  if (isRoot) {
    // 루트는 자식 추가만 — 자식이 자라는 방향(들)에 + 표시
    const sides = rootChildSides ?? ['right'];
    mapping = sides.map((s) => ({
      dir: s as Dir,
      action: s === 'left' ? ('child-left' as const) : ('child' as const),
    }));
  } else if (node.side === 'left') {
    mapping = [
      { dir: 'left', action: 'child' },
      { dir: 'right', action: 'parent' },
      { dir: 'up', action: 'before' },
      { dir: 'down', action: 'after' },
    ];
  } else if (node.side === 'down') {
    mapping = [
      { dir: 'down', action: 'child' },
      { dir: 'up', action: 'parent' },
      { dir: 'left', action: 'before' },
      { dir: 'right', action: 'after' },
    ];
  } else if (node.side === 'up') {
    mapping = [
      { dir: 'up', action: 'child' },
      { dir: 'down', action: 'parent' },
      { dir: 'left', action: 'before' },
      { dir: 'right', action: 'after' },
    ];
  } else {
    // right (기본)
    mapping = [
      { dir: 'right', action: 'child' },
      { dir: 'left', action: 'parent' },
      { dir: 'up', action: 'before' },
      { dir: 'down', action: 'after' },
    ];
  }

  return (
    <g>
      {mapping.map(({ dir, action }) => {
        const s = pos[dir];
        return (
          <g
            key={dir}
            data-add-indicator={action}
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); handlers[action](); }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <title>{LABELS[action]}</title>
            <line
              x1={dir === 'left' ? node.x - node.w / 2 : dir === 'right' ? node.x + node.w / 2 : node.x}
              y1={dir === 'up' ? node.y - node.h / 2 : dir === 'down' ? node.y + node.h / 2 : node.y}
              x2={s.x} y2={s.y}
              stroke={t.primary} strokeWidth="1.3" strokeDasharray="2 3"
            />
            <circle cx={s.x} cy={s.y} r="14" fill="transparent" />
            <circle cx={s.x} cy={s.y} r="11" fill={t.surface} stroke={t.primary} strokeWidth="1.8" />
            <line x1={s.x - 5} y1={s.y} x2={s.x + 5} y2={s.y} stroke={t.primary} strokeWidth="1.8" strokeLinecap="round" />
            <line x1={s.x} y1={s.y - 5} x2={s.x} y2={s.y + 5} stroke={t.primary} strokeWidth="1.8" strokeLinecap="round" />
          </g>
        );
      })}
    </g>
  );
}
