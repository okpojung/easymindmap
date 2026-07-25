/** nodes 테이블 row → API NodeObject(camelCase) */
export interface NodeRow {
  id: string;
  map_id: string;
  parent_id: string | null;
  text: string;
  depth: number;
  order_index: number;
  path: string;
  layout_type: string;
  collapsed: boolean;
  shape_type: string;
  style_json: Record<string, unknown>;
  node_type: string;
  manual_position: { x: number; y: number } | null;
  created_at: Date;
  updated_at: Date;
}

export function serializeNode(r: NodeRow) {
  return {
    id: r.id,
    mapId: r.map_id,
    parentId: r.parent_id,
    text: r.text,
    depth: r.depth,
    orderIndex: r.order_index,
    path: r.path,
    layoutType: r.layout_type,
    collapsed: r.collapsed,
    shapeType: r.shape_type,
    style: r.style_json ?? {},
    nodeType: r.node_type,
    manualPosition: r.manual_position,
    updatedAt: r.updated_at,
  };
}

/**
 * SELECT 컬럼 목록(직렬화와 일치). 조인 시 모호성 방지를 위해 별칭 지정 가능.
 *   nodeColumns()      → "id, map_id, ..."
 *   nodeColumns('n')   → "n.id, n.map_id, ..., n.path::text AS path, ..."
 */
export function nodeColumns(alias = ''): string {
  const p = alias ? `${alias}.` : '';
  return `${p}id, ${p}map_id, ${p}parent_id, ${p}text, ${p}depth, ${p}order_index,
  ${p}path::text AS path, ${p}layout_type, ${p}collapsed, ${p}shape_type,
  ${p}style_json, ${p}node_type, ${p}manual_position, ${p}created_at, ${p}updated_at`;
}

export const NODE_COLUMNS = nodeColumns();
