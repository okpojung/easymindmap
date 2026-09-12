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
/**
 * 노드 글을 **카드에 실을 한 줄**로 다듬는다 (2026-09-11).
 *
 * 노드 내용은 사용자가 쓴 **마크다운**이고 줄바꿈도 들어 있다. 그대로
 * `og:description` 에 넣으면 두 가지가 나쁘다.
 *
 *   ⑴ **줄바꿈이 속성 안에 그대로 들어간다.** 규격상 틀린 것은 아니지만
 *      카드에 그대로 쓰기에 알맞지 않다 — 실제로 카카오톡 카드에서 소개가
 *      보이지 않았다(2026-09-11 사용자 확인).
 *   ⑵ **마크다운 기호가 새어 나온다.** `**굵게**` 의 별표, `#` 견출,
 *      불릿이 글자 그대로 카드에 실린다.
 *
 * 그래서 기호를 걷어내고 **모든 공백을 하나로** 접는다. 기울임(`*글자*`)은
 * 건드리지 않는다 — 곱셈 기호나 그냥 별표를 잘못 지울 수 있어서, 얻는 것에
 * 비해 위험이 크다.
 */
function oneLine(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ') // 코드블록은 통째로 버린다
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 사진
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 링크는 글자만 남긴다
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // 견출
    .replace(/^\s*[-*+]\s+/gm, '') // 불릿
    .replace(/^\s*>\s?/gm, '') // 인용
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // 굵게
    .replace(/`([^`]*)`/g, '$1') // 인라인 코드
    .replace(/\s+/g, ' ') // ★ 줄바꿈을 포함한 모든 공백을 하나로
    .trim();
}

/**
 * 중심 주제가 **맵 이름을 되풀이하는가** (2026-09-12).
 *
 * 예전에는 `root !== fallback` 으로 **정확히 같을 때만** 뺐다. 그런데
 * 사람들은 맵 이름에 `-01` 같은 꼬리를 붙인다 — 그러면 "다르다"고 판정돼
 * 카드에 **제목과 소개 첫머리가 똑같이** 실렸다(네이버 카드에서 실제로
 * 그랬다). 한쪽이 다른 쪽으로 **시작하면** 같은 말로 본다.
 */
function echoesTitle(root: string, title: string): boolean {
  const a = root.trim();
  const b = title.trim();
  if (!a || !b) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * 가지에서 **이름 한 줄**만 뽑는다 (2026-09-12).
 *
 * 가지 노드에는 본문이 길게 딸려 있을 수 있다. 그것까지 이어 붙이면
 * **첫 가지 하나가 180자를 다 먹는다** — 최상위 가지가 13개인 맵에서
 * 한 개도 제대로 안 보였다. 카드 소개에 필요한 것은 맵의 **목차**이지
 * 첫 장의 본문이 아니다.
 *
 * 코드블록을 **먼저** 걷어낸다 — 그러지 않으면 본문이 코드로 시작하는
 * 노드에서 여는 울타리 줄(```lang)이 이름으로 잡힌다. 걷어낸 뒤 내용이
 * 남는 첫 줄을 고른다(사진만 있는 줄은 비므로 자연히 건너뛴다).
 */
function headLine(raw: string): string {
  const noFence = String(raw ?? '').replace(/```[\s\S]*?```/g, '\n');
  return noFence.split('\n').map((l) => oneLine(l)).find(Boolean) ?? '';
}

export function describe(doc: unknown, fallback: string): string {
  const map = (doc as { map?: { root?: { text?: string }; branches?: { text?: string }[] } })?.map;
  const root = oneLine(map?.root?.text ?? '');
  const heads = (map?.branches ?? [])
    .map((b) => headLine(b?.text ?? ''))
    .filter(Boolean)
    .slice(0, 6);
  const parts: string[] = [];
  if (root && !echoesTitle(root, fallback)) parts.push(root);
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
  /**
   * 저자가 **진열대에 올렸는가** (2026-09-12). 켠 맵만 검색에 열린다.
   * 값이 없으면 닫힌 것으로 본다 — 모르면 좁게 여는 쪽이다.
   */
  listed?: boolean;
}

/**
 * ★ **검색 노출은 저자가 고른 맵만** (2026-09-12).
 *
 * 링크 카드(카카오·슬랙·페이스북)는 `robots` 와 상관없이 뜬다. 검색 노출만
 * 다른 문제였다: 2026-09-06 에는 저자가 "진열대에 올린다" 를 고를 자리가
 * 없어서 **전부 `noindex`** 로 두었다 — 링크로만 나누려던 맵이 검색에 뜨는
 * 사고를 막을 방법이 없었기 때문이다.
 *
 * 이제 `listed` 칸이 생겼으므로 **켠 맵만** 연다. 기본은 그대로 닫힘이다.
 */
export const ROBOTS = 'noindex, nofollow';
export const ROBOTS_LISTED = 'index, follow';

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
    `<meta name="robots" content="${i.listed ? ROBOTS_LISTED : ROBOTS}" />`,
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
