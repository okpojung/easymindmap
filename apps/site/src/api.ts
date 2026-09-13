import { API_URL } from './config';

/** 진열대 목록 한 줄 — 서버의 `GET /v1/published` 와 같은 모양 */
export interface ListedMap {
  publishId: string;
  title: string;
  publishedAt: string;
  hasPreview: boolean;
  nodeCount: number | null;
}

export interface ListedPage {
  items: ListedMap[];
  nextCursor: string | null;
}

/**
 * 진열대 목록을 읽는다 — **비인증**이다.
 *
 * 서버가 거르는 것은 넷(진열 안 함·비공개·등록 취소·휴지통). 홈페이지는
 * 그 판정을 **한 벌 더 갖지 않는다** — 두 곳에서 판정하면 언젠가 다른
 * 말을 하고, 그 차이가 곧 "보이면 안 되는 맵이 보이는" 사고다.
 */
export async function fetchListed(cursor?: string | null, limit = 24): Promise<ListedPage> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (cursor) q.set('cursor', cursor);
  const res = await fetch(`${API_URL}/v1/published?${q}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`목록을 불러오지 못했습니다 (HTTP ${res.status})`);
  return (await res.json()) as ListedPage;
}

/** 미리보기 실루엣 — 없으면 빈 칸을 그린다 */
export const previewUrl = (publishId: string) =>
  `${API_URL}/v1/published/${publishId}/preview.png`;

/**
 * 맵을 여는 주소 — **같은 도메인**이다 (B안).
 * nginx 가 `/p/` 만 앱으로 넘기므로 손님은 도메인을 넘나들지 않는다.
 */
export const mapUrl = (publishId: string) => `/p/${publishId}`;
