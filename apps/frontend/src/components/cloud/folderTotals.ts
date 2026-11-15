/** O(folders), iterative and cycle safe. mapCount is the server's direct count,
 * not the possibly truncated/filtered map listing. Duplicate IDs count once.
 * For a malformed cycle each member includes every reachable folder once. */
export function folderTotals(folders: ReadonlyArray<{ folderId: string; parentId: string | null; mapCount: number }>) {
  const nodes = new Map(folders.map(f => [f.folderId, f]));
  const totals = new Map<string, { maps: number; folders: number }>();
  const pending = new Map<string, number>();
  for (const f of nodes.values()) {
    totals.set(f.folderId, { maps: Number.isFinite(f.mapCount) ? Math.max(0, f.mapCount) : 0, folders: 0 });
    pending.set(f.folderId, 0);
  }
  for (const f of nodes.values()) if (f.parentId && nodes.has(f.parentId)) {
    pending.set(f.parentId, pending.get(f.parentId)! + 1);
  }
  const queue = [...pending].filter(([, n]) => n === 0).map(([id]) => id);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i], parent = nodes.get(id)!.parentId;
    if (!parent || !nodes.has(parent)) continue;
    const own = totals.get(id)!, dest = totals.get(parent)!;
    dest.maps += own.maps; dest.folders += own.folders + 1;
    pending.set(parent, pending.get(parent)! - 1);
    if (pending.get(parent) === 0) queue.push(parent);
  }
  const visited = new Set<string>();
  for (const [id, count] of pending) {
    if (!count || visited.has(id)) continue;
    const cycle: string[] = [];
    let cur = id;
    while (!visited.has(cur)) {
      visited.add(cur); cycle.push(cur); cur = nodes.get(cur)!.parentId!;
    }
    const maps = cycle.reduce((n, key) => n + totals.get(key)!.maps, 0);
    const size = cycle.reduce((n, key) => n + totals.get(key)!.folders + 1, 0);
    for (const key of cycle) totals.set(key, { maps, folders: size - 1 });
  }
  return totals;
}
