// NodeIndicators — "+" buttons around the selected node.
// 방향 의미는 레이아웃(자식이 자라는 방향 = node.side)에 맞춰 정해진다
// (spec docs/03-editor-core/node/03-node-indicator.md §"방향 매핑"):
//
//   side='right' (오른쪽으로 자람): ➡ 자식 · ⬅ 부모 · ⬆ 형제(앞) · ⬇ 형제(뒤)
//   side='left'  (왼쪽으로 자람):   ⬅ 자식 · ➡ 부모 · ⬆ 형제(앞) · ⬇ 형제(뒤)
//   side='down'  (아래로 자람):     ⬇ 자식 · ⬆ 부모 · ⬅ 형제(앞) · ➡ 형제(뒤)
//   side='up'    (위로 자람 — 트리·아래 계열): ⬆ 자식 · ⬇ 부모 · ⬅/➡ 형제
//
// **시간배치는 예외다** (`timeline` 계열, 2026-08-07 보고 — "설명과 실제
// 생성 위치가 반대다"). 시간배치의 3레벨+ 는 아웃라인처럼 **세로로 쌓이고
// 자식만 오른쪽으로 들여쓴다** — 즉 자식과 형제가 같은 세로축에 있다.
// 그런데 위 규칙은 자식을 세로(⬆), 형제를 가로(⬅➡)에 두어, 실제로는
//   · [하위 노드 추가](⬆) 와 [형제 뒤에 추가](➡) 가 **같은 자리**에 노드를
//     만들고,
//   · 세로로 쌓이는 형제는 가로 버튼에서 나왔다
// 그래서 어느 버튼이 무엇인지 알 수 없었다. 시간배치에서는 **트리·오른쪽
// 과 같은 규칙**을 쓴다 — 자식 = 들여쓰기 방향(➡), 형제 = 쌓이는 축.
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
  /**
   * 이 노드에 실제로 적용된 레이아웃. 시간배치는 side 만으로는 구분되지
   * 않아(트리·아래도 side='down' 이다) 방향 규칙을 가를 수 없다.
   */
  effLayout?: string;
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
  node, t, rootChildSides, effLayout,
  onAddChild, onAddParent, onAddSiblingBefore, onAddSiblingAfter,
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
  } else if (node._timelineRole
      || effLayout === 'timeline' || effLayout === 'timeline-center') {
    // 시간배치 — 축에서 멀어지는 쪽이 '바깥'(outward), 축 쪽이 '안쪽'.
    //
    // **`side` 는 노드마다 다르다** — 축 위 노드는 첫째가 'up', 둘째가
    // 'down' 으로 번갈아 붙고 그 하위는 부모를 따라간다. 그래서 방향은
    // 그 노드의 side 로 **매번** 계산한다 (2026-08-07 보고 5번:
    // "1번째 2레벨은 하위가 위로, 2번째는 아래로 붙는데 ＋버튼은 고정").
    const outward: Dir = node.side === 'up' ? 'up' : 'down';
    const inward: Dir = node.side === 'up' ? 'down' : 'up';
    // 축 위 노드인지는 **배치가 남긴 역할**로 본다 — depth 로 보면
    // 서브트리에 걸었을 때 어긋난다(축 노드의 depth 가 1 이 아니다).
    if (node._timelineRole === 'axis') {
      // 축 위 노드 — 옆 노드(형제)는 **축을 따라 좌우**로 늘어선다.
      // 자식만 축 바깥으로 뻗는다.
      mapping = [
        { dir: outward, action: 'child' },
        { dir: inward, action: 'parent' },
        { dir: 'left', action: 'before' },
        { dir: 'right', action: 'after' },
      ];
    } else {
      // 축 아래 스택 — 아웃라인과 같은 모양이다. 자식은 **들여쓰기
      // (오른쪽)**, 형제는 축 바깥 방향으로 쌓인다(먼저 온 형제가 축에
      // 가깝다).
      mapping = [
        { dir: 'right', action: 'child' },
        { dir: 'left', action: 'parent' },
        { dir: inward, action: 'before' },
        { dir: outward, action: 'after' },
      ];
    }
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
