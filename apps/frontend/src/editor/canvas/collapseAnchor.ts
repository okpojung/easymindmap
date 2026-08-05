// collapseAnchor — 접기/펼치기 아이콘을 **연결선이 노드를 떠나는 지점**에
// 놓는다 (2026-08-05 사용자 요청 — ThinkWise 와 같은 위치).
//
// 예전에는 "자식이 있는 쪽 변의 한가운데"에 놓았다. 그런데 트리·진행트리
// 계열은 연결선이 변의 **한가운데가 아니라 왼쪽 안쪽(스파인)** 에서
// 시작하기 때문에, 아이콘과 실제 연결선이 서로 다른 곳에 있었다.
//
// 여기 좌표는 EdgeRenderer 의 각 경로 시작점과 **한 쌍**이다. 연결선
// 모양을 바꾸면 이 파일도 같이 고쳐야 한다.
//
//   레이아웃            연결선 시작점 (부모 쪽)
//   ─────────────────  ─────────────────────────────────
//   tree/tree-right     아래 변, 왼쪽에서 12px  (createOutlinePath)
//   process-tree*       아래 변, 왼쪽에서 14px  (createProcessPath)
//   tree-down           아래 변 한가운데        (createTreeDownPath)
//   hierarchy-*         좌/우 변 한가운데       (createHierarchyPath)
//   radial 계열         좌/우 변 한가운데       (createRadialPath)
//   timeline            루트=오른쪽 변 / 그 아래=왼쪽 12px 스파인

// 아이콘이 노드 테두리에 **겹치지 않게** 연결선 방향으로 밀어낸다.
// 밀어내는 거리는 칩 반지름에 따라 달라진다 — 접힘 +N 칩은 숫자
// 자릿수만큼 커지므로(8.5~13) 고정값이면 큰 칩이 노드를 파고든다.
const outward = (r: number) => r + 1;
/** 아웃라인(트리·오른쪽) 스파인 안쪽 여백 — createOutlinePath 와 같은 값 */
const OUTLINE_INSET = 12;
/** 진행트리 스파인 안쪽 여백 — createProcessPath(PROCESS_SPINE_INSET) 와 같은 값 */
const PROCESS_INSET = 14;

export interface AnchorNode {
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  side?: string;
}

/** 자식이 없어 방향을 못 정할 때 쓰는 폴백 방향 */
export type FallbackDir = 'left' | 'right' | 'up' | 'down';

/**
 * @param n    부모 노드(레이아웃 결과 좌표)
 * @param eff  이 노드의 **실효 레이아웃**(자식 배치 방식)
 * @param dir  eff 로 방향이 정해지지 않을 때 쓸 방향 (자식 좌표 평균 등)
 */
export function collapseAnchor(
  n: AnchorNode,
  eff: string,
  dir: FallbackDir = 'right',
  /** 칩 반지름 — 접힘 +N 칩은 자릿수만큼 커진다 (기본 = '−' 토글) */
  chipR = 8.5,
): { x: number; y: number } {
  const OUTWARD = outward(chipR);
  const left = n.x - n.w / 2;
  const right = n.x + n.w / 2;
  const top = n.y - n.h / 2;
  const bottom = n.y + n.h / 2;

  // 진행트리 — 왼쪽 스파인에서 아래로
  if (eff.startsWith('process-tree')) {
    return { x: left + PROCESS_INSET, y: bottom + OUTWARD };
  }
  // 트리·오른쪽(아웃라인) — 왼쪽 스파인에서 아래로
  if (eff === 'tree' || eff === 'tree-right') {
    return { x: left + OUTLINE_INSET, y: bottom + OUTWARD };
  }
  // 트리·아래 — 아래 변 한가운데
  if (eff === 'tree-down') {
    return { x: n.x, y: bottom + OUTWARD };
  }
  // 시간배치 — 루트만 오른쪽, 그 아래는 왼쪽 스파인(자식 방향으로)
  if (eff === 'timeline') {
    if (n.depth === 0) return { x: right + OUTWARD, y: n.y };
    return n.side === 'up'
      ? { x: left + OUTLINE_INSET, y: top - OUTWARD }
      : { x: left + OUTLINE_INSET, y: bottom + OUTWARD };
  }
  // 계층형·방사형 — 좌/우 변 한가운데
  if (eff === 'hierarchy-right' || eff === 'radial-right' || eff === 'freeform'
      || eff === 'free') {
    return { x: right + OUTWARD, y: n.y };
  }
  if (eff === 'hierarchy-left' || eff === 'radial-left') {
    return { x: left - OUTWARD, y: n.y };
  }
  // 양쪽 방사형 등 — 노드가 놓인 쪽을 따른다
  if (eff === 'radial' || eff === 'both-radial' || eff === 'radial-bidirectional') {
    return n.side === 'left'
      ? { x: left - OUTWARD, y: n.y }
      : { x: right + OUTWARD, y: n.y };
  }

  // 알 수 없는 레이아웃 — 자식 좌표로 정한 방향을 쓴다
  switch (dir) {
    case 'left':  return { x: left - OUTWARD, y: n.y };
    case 'up':    return { x: n.x, y: top - OUTWARD };
    case 'down':  return { x: n.x, y: bottom + OUTWARD };
    default:      return { x: right + OUTWARD, y: n.y };
  }
}
