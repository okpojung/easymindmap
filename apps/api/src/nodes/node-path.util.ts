/**
 * ltree path 규칙 (schema.sql / node-hierarchy-storage-strategy.md 기준)
 *   루트 노드 : 'root'
 *   하위 노드 : parent.path || 'n_' || uuid앞8자리(하이픈 제거)
 *   예: root.n_a1b2c3d4.n_e5f6a7b8
 *   depth = nlevel(path) - 1  (루트=0)
 * ltree 레이블은 [A-Za-z0-9_] 만 허용 → 하이픈 불가라 'n_' 접두사 사용.
 */
export const ROOT_PATH = 'root';

export function uuidToLabel(id: string): string {
  return 'n_' + id.replace(/-/g, '').slice(0, 8);
}

export function childPath(parentPath: string, childId: string): string {
  return `${parentPath}.${uuidToLabel(childId)}`;
}
