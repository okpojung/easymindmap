// 트리 규칙 — **한 벌만 둔다** (2026-08-18).
//
// 같은 판정이 세 군데에서 필요하다.
//   ① 정규화 경로 — `move_node_subtree` (SQL·ltree)
//   ② 협업 경로   — CRDT 로 들어온 이동을 반영할 때 (유료 모듈)
//   ③ 화면        — 드래그로 옮길 때 미리 막기
//
// 규칙이 두 벌이 되면 **어느 쪽이 맞는지 아무도 모르는 상태**가 된다.
// 그래서 순수 함수로 여기 둔다 — 이 패키지는 EMM 모델의 단일 원본이고,
// 트리의 모양 규칙은 포맷의 일부다(docs/04-extensions/open-core-boundary.md
// §3.1 ② — 포맷은 공개, 그 포맷으로 무엇을 하는가는 유료).

/** 부모를 알려 주는 함수 — 뿌리면 null, 모르는 노드면 undefined */
export type ParentOf = (nodeId: string) => string | null | undefined;

/**
 * `nodeId` 를 `newParentId` 밑으로 옮기면 **순환이 생기는가**.
 *
 * 순환이 생기면 그 가지는 뿌리에서 닿을 수 없게 되어 **화면에서 통째로
 * 사라진다.** CRDT 는 이런 이동을 막아 주지 않는다 — 양쪽이 서로를
 * 부모로 삼으면 **모두가 똑같이 이상한 상태**가 될 뿐이다
 * (docs/04-extensions/collaboration/27-sync-model.md §4).
 *
 * @param maxDepth 사슬을 훑는 상한. 이미 망가진 데이터(순환이 들어가 있는
 *   문서)를 만나도 **무한 반복에 빠지지 않게** 한다. 넘으면 `true`(막는다)
 *   — 판정할 수 없을 때는 **막는 쪽이 안전하다.**
 */
export function wouldCreateCycle(
  parentOf: ParentOf,
  nodeId: string,
  newParentId: string | null,
  maxDepth = 1000,
): boolean {
  if (!newParentId) return false;          // 뿌리로 올리는 것은 언제나 안전
  if (newParentId === nodeId) return true; // 자기 밑으로

  let cur: string | null | undefined = newParentId;
  for (let i = 0; i < maxDepth; i++) {
    if (cur == null) return false;   // 뿌리에 닿았다 — 순환 없음
    if (cur === nodeId) return true; // 내 자손 밑으로 들어가려 한다
    cur = parentOf(cur);
    if (cur === undefined) return false; // 모르는 노드에서 끊겼다
  }
  return true; // 너무 깊다 — 판정 불가라 막는다
}

/**
 * 부모가 사라진 노드들을 찾는다 — **지우지 말고 뿌리로 올리라**는 뜻이다.
 *
 * A 가 부모를 지우고 B 가 그 밑에 자식을 더하면 그 자식은 갈 곳이 없다.
 * **사용자가 방금 쓴 것을 우리가 지우면 안 된다**(§4 ②).
 *
 * 순환에 갇혀 뿌리에 닿지 못하는 노드도 함께 돌려준다 — 화면에서 사라지는
 * 것은 부모가 없는 것과 똑같기 때문이다.
 */
export function findOrphans(
  ids: Iterable<string>,
  parentOf: ParentOf,
  rootId: string,
  maxDepth = 1000,
): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (id === rootId) continue;
    let cur: string | null | undefined = parentOf(id);
    let ok = false;
    for (let i = 0; i < maxDepth; i++) {
      if (cur == null) break;           // 부모가 없다 → 고아
      if (cur === rootId) { ok = true; break; }
      if (cur === id) break;            // 순환 → 뿌리에 못 닿는다
      cur = parentOf(cur);
      if (cur === undefined) break;     // 사라진 부모를 가리킨다 → 고아
    }
    if (!ok) out.push(id);
  }
  return out;
}
