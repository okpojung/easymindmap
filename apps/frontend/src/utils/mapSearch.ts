import type { MindNode, SampleMap } from '@/editor/__samples__/types';
import { mapCenters } from '@/editor/__samples__/types';
import { flattenNodeText } from '@/editor/node-renderer/RichTextHtml';
export interface SearchHit { id: string; title: string; path: string; kinds: string[] }
function matchKinds(n: MindNode, q: string): string[] {
  return [
    (n.text || '').toLowerCase().includes(q) ? '노드' : '',
    [...(n.tags ?? []), ...(n.tag ? [n.tag] : [])].some(t => t.toLowerCase().includes(q)) ? '태그' : '',
    (n.notes ?? []).some(b => (b.text || '').toLowerCase().includes(q)) ? '노트' : '',
    (n.links ?? []).some(l => (l.label ?? '').toLowerCase().includes(q) || l.url.toLowerCase().includes(q)) ? '링크' : '',
  ].filter(Boolean);
}
export function collectSearchHits(map: SampleMap, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SearchHit[] = [];
  const walk = (nodes: MindNode[], path: string[]) => {
    for (const n of nodes) {
      const kinds = matchKinds(n, q);
      if (kinds.length) out.push({ id: n.id, title: n.text, path: path.join(' › '), kinds });
      walk(n.children ?? [], [...path, flattenNodeText(n.text)]);
    }
  };
  for (const c of mapCenters(map)) {
    const kinds = matchKinds(c.root as MindNode, q);
    if (kinds.length) out.push({ id: c.root.id, title: c.root.text, path: '', kinds });
    walk(c.branches, [flattenNodeText(c.root.text)]);
  }
  return out.slice(0, 50);
}
