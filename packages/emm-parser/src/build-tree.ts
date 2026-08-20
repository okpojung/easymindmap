// 평평한 노드 목록 → 중첩 트리 (2026-08-20).
//
// ★ **왜 여기(공개 코어)인가**
//   협업 CRDT 는 노드를 `{ id, parentId, order }` 로 **평평하게** 들고 있고
//   (27-sync-model.md §3), 정본 `map_documents.doc` 는 **중첩 children**
//   트리다(§6). 물질화는 단순 저장이 아니라 **평평한 것을 중첩으로 다시
//   짜는 변환**이고, 고아는 **정확히 그 변환 지점에서** 생긴다 —
//   A 가 부모를 지우고 B 가 그 밑에 자식을 더하면 그 자식은 갈 곳이 없다.
//
//   물질화 구현은 유료 모듈이지만 **트리 모양 규칙은 공개 코어에 한 벌만
//   둔다**(§9). 그래서 이 함수가 그 경계다.
//
// ★ **아무것도 버리지 않는다**
//   고아를 지우면 **사용자가 방금 쓴 것을 우리가 지우는 것**이다(§4 ②).
//   뿌리로 올리고, 올렸다고 말한다. 입력 노드 수 == 출력 노드 수다.
//
// ★ **재귀로 짜지 않는다**
//   망가진 입력(순환 포함)이 들어올 수 있다. 재귀로 짜면 스택이 터진다.

import type { MindNode, NodeColorKey, SampleBranch, SampleMap, SampleRoot } from './model';
import { findOrphans } from './tree-rules';

const ROOT_ID = 'root';

/** 브랜치 색이 비어 있을 때 자리별로 돌려 쓰는 기본값 */
const BRANCH_COLORS: NodeColorKey[] = ['l1A', 'l1B', 'l1C', 'l1D', 'l1E'];

export interface FlatNode {
  id: string;
  /** null = 뿌리 직속 */
  parentId: string | null;
  /** 형제 간 정렬 키 */
  order: number;
  node: Omit<MindNode, 'children'>;
}

export interface BuildTreeResult {
  map: SampleMap;
  /**
   * 뿌리로 올린 고아 id. **자손은 담기지 않는다** — 자손은 부모를 따라
   * 함께 올라갔을 뿐, 그 자체가 갈 곳을 잃은 것이 아니다.
   *
   * 호출부는 이것을 **조용히 버리면 안 된다.** "왜 이 가지가 갑자기
   * 최상위에 있지" 를 사용자가 알 수 있어야 한다(28-sync-prework-plan.md §5).
   */
  raisedToRoot: string[];
}

/**
 * 평평한 목록을 중첩 트리로 짠다.
 *
 * 뿌리에 닿지 못하는 노드(부모가 사라졌거나 순환에 갇힌 것)는 **뿌리 직속
 * 으로 올린다.** 지우지 않는다.
 */
export function buildTreeFromFlat(
  flat: FlatNode[],
  title: string,
  rootNode: Omit<MindNode, 'children'>,
): BuildTreeResult {
  const byId = new Map<string, FlatNode>();
  for (const f of flat) {
    if (f.id === ROOT_ID) continue; // 뿌리는 목록이 아니라 인자로 온다
    byId.set(f.id, f);
  }

  // ★ **`parentId: null` 은 '뿌리 직속' 이지 '부모 없음' 이 아니다.**
  //   `findOrphans` 는 `null` 을 "부모가 없다 → 고아" 로 읽으므로, 그대로
  //   넘기면 **뿌리 직속 노드가 전부 고아**가 된다. 'root' 로 바꿔 넘긴다
  //   (documentStore 의 `buildParentIndex` 와 같은 규약).
  const parentOf = (id: string): string | null | undefined => {
    if (id === ROOT_ID) return null;
    const f = byId.get(id);
    return f ? (f.parentId ?? ROOT_ID) : undefined;
  };

  // 뿌리에 닿지 못하는 것들 — 사라진 부모를 가리키는 것과 순환에 갇힌 것
  // ★ **상한을 노드 수로 준다.** `findOrphans` 의 기본 상한은 1000 인데,
  //   그건 "망가진 데이터에서 무한 반복에 빠지지 않게" 하는 값이다. 정상
  //   문서라도 사슬이 그보다 길면 **뿌리에 닿기 전에 포기**해서 멀쩡한
  //   노드를 고아로 본다(2만 단계 사슬 테스트에서 실제로 걸렸다).
  //   한 노드는 사슬에 한 번만 나오므로 **노드 수가 곧 상한**이다.
  const stranded = new Set(
    findOrphans(byId.keys(), parentOf, ROOT_ID, byId.size + 1),
  );

  // ── 어느 노드를 실제로 올릴 것인가 ────────────────────────────────
  //   `findOrphans` 는 **자손까지 함께** 돌려준다(자손도 뿌리에 못 닿으니까).
  //   그런데 자손까지 따로 올리면 **가지가 산산조각 난다** — 사용자가 만든
  //   구조가 흩어진다. 끊긴 사슬의 **맨 위 하나**만 올리고 나머지는 그대로
  //   딸려 오게 한다.
  const raise = new Set<string>();
  for (const id of byId.keys()) {
    if (!stranded.has(id)) continue;
    let cur = id;
    const seen = new Set<string>([cur]);
    for (;;) {
      const p = byId.get(cur)?.parentId ?? ROOT_ID;
      if (p === ROOT_ID || !byId.has(p)) { raise.add(cur); break; } // 사라진 부모 → 여기가 맨 위
      if (seen.has(p)) {
        // 순환이다. 끊을 자리를 **정해진 규칙으로** 고른다(id 가 가장 작은
        // 것) — 그래야 같은 입력이 항상 같은 결과를 낸다. 한 고리만 끊으면
        // 나머지는 그 아래로 자연히 이어진다.
        let rep = cur;
        for (const m of seen) if (m < rep) rep = m;
        raise.add(rep);
        break;
      }
      seen.add(p);
      cur = p;
    }
  }

  // ── 자식 목록 모으기 ─────────────────────────────────────────────
  const kids = new Map<string, FlatNode[]>();
  for (const f of byId.values()) {
    const parent = raise.has(f.id) ? ROOT_ID : (f.parentId ?? ROOT_ID);
    const list = kids.get(parent);
    if (list) list.push(f);
    else kids.set(parent, [f]);
  }
  for (const list of kids.values()) {
    // order 오름차순. 같으면 id 로 — **정해진 순서**여야 두 사람의 화면이 같다.
    list.sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  // ── 반복문으로 짠다 (재귀 금지 — 망가진 입력에 스택이 터진다) ─────
  const made = new Map<string, MindNode>();
  const branches: SampleBranch[] = [];
  const queue: { id: string; into: MindNode[] }[] = [];

  for (const [i, f] of (kids.get(ROOT_ID) ?? []).entries()) {
    const b: SampleBranch = {
      ...(f.node as MindNode),
      // 최상위는 SampleBranch 라 색·방향이 필요하다 — 없으면 자리로 정한다
      colorKey: (f.node.colorKey ?? BRANCH_COLORS[i % BRANCH_COLORS.length]) as NodeColorKey,
      side: (f.node.side === 'left' || f.node.side === 'right')
        ? f.node.side
        : (i % 2 === 0 ? 'right' : 'left'),
      children: [],
    };
    made.set(f.id, b);
    branches.push(b);
    queue.push({ id: f.id, into: b.children as MindNode[] });
  }

  // 같은 노드를 두 번 짜지 않는다 — 이미 만든 것을 만나면 건너뛴다.
  // (자식 목록은 위에서 한 번만 만들었으므로 정상 입력에서는 안 걸린다.
  //  망가진 입력에서 **무한히 도는 것을 막는 그물망**이다.)
  while (queue.length) {
    const cur = queue.shift() as { id: string; into: MindNode[] };
    for (const f of kids.get(cur.id) ?? []) {
      if (made.has(f.id)) continue;
      const n: MindNode = { ...(f.node as MindNode), children: [] };
      made.set(f.id, n);
      cur.into.push(n);
      queue.push({ id: f.id, into: n.children as MindNode[] });
    }
  }

  const root: SampleRoot = {
    ...(rootNode as SampleRoot),
    id: ROOT_ID,
    colorKey: 'root',
    text: rootNode.text ?? '',
  };

  return {
    map: { title, root, branches },
    // 정해진 순서로 돌려준다 — 화면에 그대로 보여 줄 수 있어야 한다
    raisedToRoot: [...raise].sort(),
  };
}
