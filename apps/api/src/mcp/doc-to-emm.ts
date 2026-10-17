/**
 * **문서 스냅샷 → EMM 마크다운** (MCP 2단계 `get_map`, 2026-09-05).
 *
 * `emm-to-doc.ts` 의 반대 방향이다. 저장된 스냅샷(`{v, map, editor}`)에서
 * 맵을 꺼내 **emm-Basic 본문**(순수 GFM)으로 돌려준다 — 메타데이터 주석
 * (`<!-- easymindmap:v1:BASE64 -->`)은 싣지 않는다. 그 주석은 앱이 되읽을
 * 때 스타일·좌표를 살리는 용도라 AI 에게는 **읽을 수 없는 base64 덩어리**
 * 일 뿐이고, 큰 맵이면 본문보다 길어 대화 토큰만 잡아먹는다.
 *
 * 직렬화 규칙은 **EMM 레퍼런스 직렬화기**(`src/emm/serialize.ts` —
 * packages/emm-parser 의 복사본)가 단일 원본이다. 여기서 마크다운을 다시
 * 만들지 않는다 — 앱의 [내보내기 ▸ Markdown] 과 **같은 본문**이 나와야
 * AI 가 그것을 고쳐 `create_map` 으로 되돌려도 어긋나지 않는다.
 */
import { buildEmmBody, type EmmImageFile } from '../emm/serialize';
import { mapCenters, type SampleMap } from '../emm/model';

export class DocShapeError extends Error {}

/**
 * 스냅샷에서 맵을 꺼낸다 — **앱과 같은 규칙**이다(mapSession.ts `openCloudMap`:
 * `doc.map` 이 없으면 "문서 형식을 인식할 수 없습니다"). 여기서 더 너그럽게
 * 받지 않는다 — 앱이 못 여는 문서를 AI 에게만 보여 주면 사용자는 "대화에선
 * 있는데 앱에선 안 열린다" 로 겪는다.
 */
export function mapFromDoc(doc: unknown): SampleMap {
  const map = (doc as { map?: unknown } | null)?.map as SampleMap | undefined;
  if (!map || typeof map !== 'object' || !map.root || !Array.isArray(map.branches)) {
    throw new DocShapeError('저장된 문서의 형식을 인식할 수 없습니다 — 앱에서 이 맵을 한 번 열어 저장해 주세요.');
  }
  return map;
}

/**
 * EMM 본문. 사진은 data URL 이면 `files/img-N.png` 상대 경로로, 외부 URL 이면
 * 그대로 남는다(직렬화기 규칙). 바이트는 돌려주지 않는다 — AI 는 사진을
 * 읽지 않고, 그 크기가 그대로 대화에 실리면 안 된다.
 */
export function docToEmm(doc: unknown, opts: { origin?: string } = {}): { markdown: string; nodeCount: number; imageCount: number; storedImageCount: number } {
  const raw = mapFromDoc(doc);
  // 저장소로 옮긴 사진·첨부(`/v1/attachments/<id>` 상대 경로)는 직렬화기가 건너뛴다 — 서버 주소를 붙여 보이게 한다 (2026-10-17)
  const { map, stored } = opts.origin ? absolutizeStored(raw, opts.origin) : { map: raw, stored: 0 };
  const images: EmmImageFile[] = [];
  const out = { markdown: buildEmmBody(map, images), images };
  return {
    markdown: out.markdown.replace(/\s+$/, '') + '\n',
    nodeCount: countNodes(map),
    imageCount: out.images.length,
    storedImageCount: stored,
  };
}

/** 이 서버의 첨부 상대 경로 */
const STORED_RE = /^\/v1\/attachments\/[^/?#\s]+/;

/**
 * 문서를 건드리지 않고 사본에서 `/v1/attachments/<id>` 사진(`image.src`·`images[].src`)과 첨부(`attachments[].url`)에
 * 서버 주소(`origin`)를 붙인다. 저장할 때 서버가 data URL 사진을 저장소로 옮기며 **상대 경로**를 넣으므로
 * (maps.service `extractDocImages`), 그대로면 직렬화기(http(s)·data URL 만 앎)가 그 사진을 빠뜨렸다.
 * 앱은 절대 주소도 우리 첨부로 알아본다(`serverAttachmentId`) — AI 가 이 본문을 create_map 으로 되돌려도 같은 사진이다.
 */
export function absolutizeStored(map: SampleMap, origin: string): { map: SampleMap; stored: number } {
  const base = origin.replace(/\/+$/, '');
  const fix = (u: unknown) => (typeof u === 'string' && STORED_RE.test(u) ? base + u : u);
  let stored = 0;
  const seen = new Set<string>();
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const o = { ...(v as Record<string, unknown>) };
    // 직렬화기와 같은 선택 — images 가 있으면 그것만, 없으면 옛 단일 image 를 내보낸다. 내보내는 것만 센다 (#652 Codex)
    const emitsImages = Array.isArray(o.images) && o.images.length > 0;
    const img = (count: boolean) => (x: unknown) => {
      if (!x || typeof x !== 'object') return x;
      const src = (x as { src?: unknown }).src;
      const fixed = fix(src);
      if (count && fixed !== src && typeof src === 'string' && !seen.has(src)) { seen.add(src); stored++; }
      return fixed === src ? x : { ...(x as object), src: fixed };
    };
    if (o.image) o.image = img(!emitsImages)(o.image);
    if (Array.isArray(o.images)) o.images = o.images.map(img(true));
    if (Array.isArray(o.attachments)) {
      o.attachments = o.attachments.map((a) => (a && typeof a === 'object' && 'url' in a ? { ...(a as object), url: fix((a as { url?: unknown }).url) } : a));
    }
    for (const k of ['root', 'branches', 'children', 'centers']) if (k in o) o[k] = walk(o[k]);
    return o;
  };
  return { map: walk(map) as SampleMap, stored };
}

function countNodes(map: SampleMap): number {
  const walk = (nodes: { children?: unknown[] }[]): number =>
    nodes.reduce((n, node) => n + 1 + walk((node.children ?? []) as { children?: unknown[] }[]), 0);
  // 중심주제마다 루트 1 + 가지 (2026-09-15 — 두 번째 `#` 부터 `map.centers`)
  return mapCenters(map).reduce(
    (n, c) => n + 1 + walk(c.branches as unknown as { children?: unknown[] }[]), 0,
  );
}
