/**
 * 퍼블리싱한 맵의 **`<head>` 조각** — 링크 카드·검색이 읽는 것 (2026-09-06).
 *
 * ★ 왜 서버가 만드나
 *   `/p/{id}` 는 SPA 라 **내용을 브라우저가 그린다.** 크롤러는 대부분
 *   자바스크립트를 실행하지 않으므로, 지금은 어느 맵을 붙여넣어도
 *   `EasyMindMap · Editor` 라는 같은 제목만 읽어 간다(실측 2026-09-06:
 *   `curl https://pro-dev.mindmap.ai.kr/` → 그 제목 하나).
 *
 * ★ 왜 조각(fragment)인가 — 페이지 전체가 아니라
 *   nginx 가 `index.html` 을 그대로 내보내면서 **SSI 로 이 조각만 끼워
 *   넣는다.** 그래야 번들 파일 이름(해시)을 서버가 알 필요가 없다.
 *   페이지를 통째로 서버가 만들면 배포마다 그 이름을 맞춰야 한다.
 *
 * ★ 새는 것이 없어야 한다
 *   **무료공개 중일 때만** 조각을 준다. 보관(비공개)·등록 취소·휴지통은
 *   404 이고, 그러면 nginx 가 조용히 넘어가 지금과 똑같은 화면이 된다
 *   (`ssi_silent_errors`).
 */

/** HTML 속성 안에 넣을 수 있게 막는다 — 맵 이름은 사용자가 쓴 글이다 */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 문서 스냅샷에서 **소개 문장**을 만든다 — 중심 주제와 첫 가지들 */
export function describe(doc: unknown, fallback: string): string {
  const map = (doc as { map?: { root?: { text?: string }; branches?: { text?: string }[] } })?.map;
  const root = (map?.root?.text ?? '').trim();
  const heads = (map?.branches ?? [])
    .map((b) => (b?.text ?? '').trim())
    .filter(Boolean)
    .slice(0, 6);
  const parts: string[] = [];
  if (root && root !== fallback) parts.push(root);
  if (heads.length) parts.push(heads.join(' · '));
  const body = parts.join(' — ');
  // 카카오·슬랙은 대략 200자 안쪽만 보여 준다. 자를 때는 말줄임을 남긴다.
  const text = body || 'EasyMindMap 으로 만든 마인드맵입니다.';
  return text.length > 180 ? `${text.slice(0, 179)}…` : text;
}

export interface OgInput {
  publishId: string;
  title: string;
  doc: unknown;
  hasPreview: boolean;
  /** 브라우저가 여는 주소의 출처 (`https://app.example.com`) */
  appOrigin: string;
  /** 미리보기 그림을 주는 곳 (`https://api.example.com`) */
  apiOrigin: string;
}

/**
 * ★ **검색에는 넣지 않는다 — 아직은** (2026-09-06 결정).
 *
 * 링크 카드(카카오·슬랙·페이스북)는 `robots` 와 상관없이 뜬다. 검색 노출만
 * 다른 문제다: 지금은 저자가 "진열대에 올린다" 를 고를 자리가 없어서,
 * **링크로만 나누려던 맵이 검색 결과에 뜨는 사고**를 막을 방법이 없다.
 * 그래서 기본을 `noindex` 로 둔다 — 진열대(`listed` 칸)가 생기면 그때
 * 고른 맵만 `index` 로 바꾼다 (`27a-paid-publish.md` §0.4 ⑶).
 */
export const ROBOTS = 'noindex, nofollow';

export function buildOgFragment(i: OgInput): string {
  const title = i.title?.trim() || '제목 없는 맵';
  const desc = describe(i.doc, title);
  const url = `${i.appOrigin}/p/${i.publishId}`;
  const image = i.hasPreview ? `${i.apiOrigin}/v1/published/${i.publishId}/preview.png` : '';
  const t = esc(`${title} · EasyMindMap`);
  const d = esc(desc);
  const lines = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta name="robots" content="${ROBOTS}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="EasyMindMap" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
  ];
  if (image) {
    // 카드에 그림이 없으면 링크가 글자만 남는다. 실루엣은 **글자를 한 자도
    // 그리지 않은** 그림이라(27a §2.1) 내용이 새지 않는다.
    lines.push(
      `<meta property="og:image" content="${esc(image)}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:image" content="${esc(image)}" />`,
    );
  } else {
    lines.push(`<meta name="twitter:card" content="summary" />`);
  }
  lines.push(
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
  );
  return `${lines.join('\n')}\n`;
}
