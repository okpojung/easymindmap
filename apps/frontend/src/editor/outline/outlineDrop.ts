// 아웃라인 행 사이 드롭 — 순수 규칙 (UI·스토어 없음).
// 규칙(결정적): 놓은 틈 **바로 위 행**이 언제나 새 부모다. 틈이 2단계와 3단계 사이여도
// 마찬가지이며, 포인터의 가로 위치로 들여쓰기를 추측하지 않는다.
//   · 위 행이 펼쳐진 자식을 가지면 → 그 첫 자식 앞(= 새 부모의 맨 앞 자식)
//   · 아니면(잎·접힘) → 새 부모의 맨 뒤 자식
// 스토어 호출: beforeId 있으면 moveNodeRelative(id, beforeId, 'before'), 없으면 (id, parentId, 'child').

export interface OutlineFlatRow {
  id: string;
  depth: number; // 0 = 중심 주제(루트)
  expanded: boolean;
  childIds: string[]; // 문서상의 모든 자식 id (접혀 있어도)
}

export type OutlineDropReason =
  | 'ok' | 'locked' | 'stale' | 'no-drag' | 'root' | 'no-row-above' | 'self' | 'descendant' | 'noop' | 'bad-gap';

export interface OutlineDropPlan {
  ok: boolean;
  reason: OutlineDropReason;
  parentId: string | null;
  /** 있으면 이 형제 앞에 (moveNodeRelative 'before'), 없으면 부모의 맨 뒤 자식 ('child') */
  beforeId: string | null;
}

export interface OutlineDropEnv {
  locked: boolean; // isViewerLocked() 또는 읽기 전용
  startEpoch: number;
  currentEpoch: number;
}

const no = (reason: OutlineDropReason): OutlineDropPlan => ({ ok: false, reason, parentId: null, beforeId: null });

/** 행 i 의 부모 행 인덱스 (깊이가 더 얕은 가장 가까운 윗 행), 없으면 -1 */
function parentIndexOf(rows: OutlineFlatRow[], i: number): number {
  for (let k = i - 1; k >= 0; k--) if (rows[k].depth < rows[i].depth) return k;
  return -1;
}

/** 끌 수 있는 행인가 — 중심 주제(depth 0)는 끌 수 없다 */
export function canDragOutlineRow(rows: OutlineFlatRow[], id: string): boolean {
  const r = rows.find((x) => x.id === id);
  return !!r && r.depth > 0;
}

/**
 * gap = 0..rows.length. gap g 는 rows[g-1] 아래, rows[g] 위의 틈.
 * 0 은 첫 행 위(윗 행 없음 → 거부), rows.length 는 마지막 행 아래.
 */
export function planOutlineDrop(
  rows: OutlineFlatRow[], dragId: string | null, gap: number, env: OutlineDropEnv,
): OutlineDropPlan {
  if (env.locked) return no('locked');
  if (env.startEpoch !== env.currentEpoch) return no('stale');
  if (!dragId) return no('no-drag');
  const di = rows.findIndex((r) => r.id === dragId);
  if (di < 0) return no('no-drag');
  if (rows[di].depth === 0) return no('root');
  if (!Number.isInteger(gap) || gap < 0 || gap > rows.length) return no('bad-gap');
  if (gap === 0) return no('no-row-above');
  const ri = gap - 1;
  const above = rows[ri];
  if (ri === di) return no('self');
  // 끄는 행의 (보이는) 하위: di 바로 뒤 연속된 더 깊은 행
  let end = di;
  while (end + 1 < rows.length && rows[end + 1].depth > rows[di].depth) end++;
  if (ri > di && ri <= end) return no('descendant');

  const visibleKids = above.expanded && above.childIds.length > 0;
  const beforeId = visibleKids ? above.childIds[0] : null;
  // 이미 그 자리면 아무것도 안 한다
  if (visibleKids && above.childIds[0] === dragId) return no('noop');
  if (!visibleKids && above.childIds[above.childIds.length - 1] === dragId) return no('noop');
  if (beforeId === dragId) return no('noop');
  return { ok: true, reason: 'ok', parentId: above.id, beforeId };
}

/** 포인터 y(콘텐츠 좌표) → 가장 가까운 틈. tops 길이 = rows+1 (마지막은 끝 경계). 빈 목록은 -1 */
export function nearestGap(tops: ArrayLike<number>, rowCount: number, y: number): number {
  if (rowCount <= 0) return -1;
  let best = 0, bd = Infinity;
  for (let g = 0; g <= rowCount; g++) {
    const d = Math.abs(tops[g] - y);
    if (d < bd) { bd = d; best = g; } else if (tops[g] > y) break;
  }
  return best;
}

/** 부모 행 인덱스 헬퍼 (테스트·표시용) */
export function outlineParentId(rows: OutlineFlatRow[], id: string): string | null {
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const p = parentIndexOf(rows, i);
  return p < 0 ? null : rows[p].id;
}
