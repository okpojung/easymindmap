/**
 * **문서 스냅샷 → EMM 마크다운** (MCP 2단계 `get_map`, 2026-09-05).
 *
 * `emm-to-doc.ts` 의 반대 방향이다. 저장된 스냅샷(`{v, map, editor}`)에서
 * 맵을 꺼내 **EMM-Basic 본문**(순수 GFM)으로 돌려준다 — 메타데이터 주석
 * (`<!-- easymindmap:v1:BASE64 -->`)은 싣지 않는다. 그 주석은 앱이 되읽을
 * 때 스타일·좌표를 살리는 용도라 AI 에게는 **읽을 수 없는 base64 덩어리**
 * 일 뿐이고, 큰 맵이면 본문보다 길어 대화 토큰만 잡아먹는다.
 *
 * 직렬화 규칙은 **EMM 레퍼런스 직렬화기**(`src/emm/serialize.ts` —
 * packages/emm-parser 의 복사본)가 단일 원본이다. 여기서 마크다운을 다시
 * 만들지 않는다 — 앱의 [내보내기 ▸ Markdown] 과 **같은 본문**이 나와야
 * AI 가 그것을 고쳐 `create_map` 으로 되돌려도 어긋나지 않는다.
 */
import { serializeEmm } from '../emm/serialize';
import type { SampleMap } from '../emm/model';

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
export function docToEmm(doc: unknown): { markdown: string; nodeCount: number; imageCount: number } {
  const map = mapFromDoc(doc);
  const out = serializeEmm(map, { includeMeta: false });
  return {
    markdown: out.markdown.replace(/\s+$/, '') + '\n',
    nodeCount: countNodes(map),
    imageCount: out.images.length,
  };
}

function countNodes(map: SampleMap): number {
  const walk = (nodes: { children?: unknown[] }[]): number =>
    nodes.reduce((n, node) => n + 1 + walk((node.children ?? []) as { children?: unknown[] }[]), 0);
  return 1 + walk(map.branches as unknown as { children?: unknown[] }[]);
}
