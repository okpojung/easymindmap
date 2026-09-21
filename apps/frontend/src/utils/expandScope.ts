/**
 * [모두 펼치기] · [모두 접기] 가 **어디에 걸리나** (2026-09-21 사용자 결정).
 *
 * > *"아무 노드를 선택하지 않은 상태에서 모두 펼치기는 말 그대로 모두
 * >  펼치기로 동작하고, 노드를 선택한 상태에서 모두 펼치기를 선택하면
 * >  선택한 노드의 하위 노드들 모두 펼치기로."*
 *
 * ★ 왜 한 자리에 모으나 — 같은 단추가 **맵 툴바와 아웃라인 머리말** 두
 *   곳에 있다. 판정을 각각 쓰면 언젠가 한쪽만 고쳐져 **같은 기호가 다른
 *   일을 한다**(`coding-conventions` §5-1-6 위반). 화면 코드가 아니라
 *   셈이므로 여기서 한 번 정하고 양쪽이 그대로 쓴다.
 *
 * ★ 중심(root)을 고른 것은 **아무것도 안 고른 것과 같다.** 사용자가 그렇게
 *   정했고, 셈으로도 같다 — 중심의 하위 = 맵 전체다.
 */

/** `'all'` = 맵 전체, 배열 = 그 노드들의 하위만 */
export type ExpandScope = 'all' | string[];

/**
 * @param selectedId       지금 고른 노드 (없으면 null)
 * @param multiSelectedIds 러버밴드·Ctrl 로 여러 개 고른 경우
 * @param rootIds          중심 노드의 id 들 — 첫 중심은 `'root'`, 둘째부터는
 *                         저마다 고유 id 다(여러 중심주제, 2026-09-15).
 *                         **중심을 고른 것은 전체와 같다.**
 */
export function expandScope(
  selectedId: string | null,
  multiSelectedIds: string[],
  rootIds: readonly string[] = ['root'],
): ExpandScope {
  const roots = new Set(rootIds);
  // 여러 개를 골랐으면 그 전부 — 그중 중심이 섞여 있으면 전체다
  // (중심 하나만으로도 맵 전체가 걸리므로 나머지를 따질 필요가 없다).
  if (multiSelectedIds.length > 1) {
    return multiSelectedIds.some((id) => roots.has(id)) ? 'all' : [...multiSelectedIds];
  }
  const one = multiSelectedIds.length === 1 ? multiSelectedIds[0] : selectedId;
  if (!one || roots.has(one)) return 'all';
  return [one];
}
