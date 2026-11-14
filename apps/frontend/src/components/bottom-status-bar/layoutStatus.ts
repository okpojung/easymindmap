import type { LayoutType, SampleMap } from '@/editor/__samples__/types';
import { effectiveLayoutInMap, findNodeInMap } from '@/stores/documentStore';
import { normalizeLayoutType } from '@/layout/normalizeLayoutType';

export const LAYOUT_STATUS_LABEL: Record<string, string> = {
  'radial-bidirectional': 'editor.layout.radialBoth',
  'radial-right': 'editor.layout.radialRight',
  'radial-left': 'editor.layout.radialLeft',
  'tree-right': 'editor.layout.treeRight',
  'tree-down': 'editor.layout.treeDown',
  'hierarchy-right': 'editor.layout.hierarchyRight',
  'process-tree-right': 'editor.layout.processTreeRight',
  freeform: 'editor.layout.free', kanban: 'editor.layout.kanban',
  timeline: 'editor.layout.timeline', 'timeline-center': 'editor.layout.timelineCenter',
};
/** Status uses the same ancestor inheritance as subtree layout changes.
 * Full-canvas freeform/Kanban modes take precedence over dormant subtree settings. */
export function layoutStatus(map: SampleMap, fallback: LayoutType, selectedId: string | null, multi: string[] = []) {
  const ids = [...new Set(multi.length > 1 ? multi : selectedId ? [selectedId] : [])].filter((id) => !!findNodeInMap(map, id));
  const global = map.canvasMode === 'freeform' ? 'freeform' : normalizeLayoutType(fallback);
  if (!ids.length || global === 'kanban' || global === 'freeform') return { count: ids.length, layout: global, mixed: false };
  const layouts = new Set(ids.map((id) => normalizeLayoutType(effectiveLayoutInMap(map, id, fallback))));
  return { count: ids.length, layout: [...layouts][0], mixed: layouts.size > 1 };
}
