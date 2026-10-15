// 연결 맵의 노드 칸 나눔 (2026-10-14) — services/cloud/linkedMaps.ts · documentStore 가 함께 쓴다.
//
// 연결 노드는 **큰 맵 쪽의 칸**(id·색·좌우·접힘·레이아웃)과 **그 맵 중심주제의
// 내용 칸**(글·노트·스타일·아이콘·태그·링크·첨부·사진…)으로 나뉜다. 큰 맵에는
// 앞의 것과 이름만 저장되고, 뒤의 것은 연결된 맵의 중심주제로 저장된다.
export const LINK_PARENT_KEYS: ReadonlySet<string> = new Set([
  'id', 'colorKey', 'side', 'collapsed', 'children', 'linkMapId',
  'layoutType', 'edgeType', '_childCount', '_linkDup',
]);

/** 노드의 **내용 칸**만 (큰 맵이 제 것으로 가지는 칸을 뺀 것) */
export function linkContentOf(n: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n)) if (!LINK_PARENT_KEYS.has(k) && v !== undefined) out[k] = v;
  return out;
}
