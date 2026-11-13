import { mapCenters } from '@/editor/__samples__/types';
import type { MindNode, NoteBlock, SampleMap } from '@emm/model';
/** 모든 중심주제와 접힌 하위 노드까지 맵 순서대로 모은다. */
export function collectMapNotes(map: SampleMap): { nodeId: string; nodeText: string; block: NoteBlock }[] {
  const out: { nodeId: string; nodeText: string; block: NoteBlock }[] = [];
  const visit = (n: MindNode) => {
    for (const block of n.notes ?? []) out.push({ nodeId: n.id, nodeText: n.text || '—', block });
    (n.children ?? []).forEach(visit);
  };
  for (const c of mapCenters(map)) { visit(c.root as MindNode); c.branches.forEach((n) => visit(n as MindNode)); }
  return out;
}
