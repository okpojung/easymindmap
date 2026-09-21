import { API_URL } from './config';

/** 진열대 목록 한 줄 — 서버의 `GET /v1/published` 와 같은 모양 */
export interface ListedMap {
  publishId: string;
  title: string;
  publishedAt: string;
  hasPreview: boolean;
  nodeCount: number | null;
  /**
   * 검색 중일 때만 온다 — 맵 **내용**에서 맞은 건수.
   * 유료 맵에서는 **2단계까지만** 센다 (27b §5.3) — 건수 자체가 잘라 낸
   * 부분을 일러 주는 신호가 되기 때문이다.
   */
  matchCount?: number;
  /** **값** — `null` 이면 무료 (2026-09-21, 27b §3.1) */
  priceKrw?: number | null;
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
export async function fetchListed(
  cursor?: string | null,
  limit = 24,
  term?: string,
): Promise<ListedPage> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (cursor) q.set('cursor', cursor);
  // ★ 검색도 **서버가 한다** (2026-09-17). 받아 둔 목록에서 훑지 않는
  //   이유는 문서함과 같다: 목록은 한 페이지로 잘려 있어 그 바깥의 맵은
  //   이름조차 못 찾는다. 게다가 **맵 내용**은 애초에 여기 오지 않는다.
  if (term) q.set('q', term);
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
