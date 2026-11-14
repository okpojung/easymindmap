import type { SampleMap, MindNode } from '@/editor/__samples__/types';
import { mapCenters } from '@/editor/__samples__/types';
import { mediaKindsOf } from '@/editor/node-renderer/mediaContent';

/** Count nodes, not occurrences, including legacy tags and every map center. */
export function collectMapTags(map: SampleMap, options: { includeAuto?: boolean } = {}): [string, number][] {
  const counts = new Map<string, number>();
  const walk = (node: Pick<MindNode, 'tag' | 'tags' | 'children' | 'text' | 'image' | 'images'>) => {
    const tags = new Set([...(node.tags ?? []), ...(node.tag ? [node.tag] : [])]);
    // Match applyMediaView's case-insensitive suppression, but keep folded nodes discoverable.
    if (options.includeAuto) for (const kind of mediaKindsOf(node) ?? []) {
      if (!(node.tags ?? []).some((tag) => tag.toLowerCase() === kind.toLowerCase())) tags.add(kind);
    }
    for (const tag of tags) if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    node.children?.forEach(walk);
  };
  for (const center of mapCenters(map)) {
    walk(center.root);
    center.branches.forEach(walk);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
