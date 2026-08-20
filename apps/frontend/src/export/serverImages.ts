// serverImages — 내보내기 직전에 **우리 저장소에 있는 사진을 되받아
// data URL 로 되돌린다** (2026-08-16, B16 ② 슬라이스 1).
//
// 사진이 서버 저장소로 옮겨가면 `image.src` 가 `{API}/v1/attachments/<id>`
// 가 된다(첨부와 같은 규약). 직렬화는 `http(s)` src 를 **URL 그대로**
// 내보내므로, 그대로 두면 내보낸 ZIP·HTML 이 **서버가 살아 있고 로그인도
// 되어 있어야 열리는 파일**이 된다 — 이 제품이 약속한 "파일 하나로
// 온전히"가 깨진다 (docs/04-extensions/content-permanence.md §7.1).
//
// **읽는 쪽(여기)을 쓰는 쪽보다 먼저 깐다.** 순서를 바꾸면 사진을 옮기기
// 시작한 그 순간부터 내보내기가 깨진 파일을 만들어 낸다.

import type { MindNode, SampleMap } from '@/editor/__samples__/types';
import { collectNoteHtmlImageSrcs } from '@emm/note-images';
import { attachmentFetchUrl, serverAttachmentId } from '@/services/cloud/apiClient';

/**
 * 직렬화가 **ZIP 에 담을 수 있는** 사진 형식 (serialize.ts 의
 * `dataUrlToBytes` 가 인식하는 것과 같아야 한다).
 *
 * 여기 없는 형식을 data URL 로 바꿔 놓으면, 직렬화가 그것을 **알아보지
 * 못하고 http URL 도 아니라서 사진을 통째로 빠뜨린다** — 조용한 유실이다.
 * 그래서 못 담는 형식은 손대지 않고 원래 URL 로 남긴다.
 */
const PACKABLE = /^image\/(png|jpe?g|gif|webp)$/i;

function toDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

export interface ServerImageResult {
  /** src → data URL. 못 받아 온 것은 담기지 않는다(원래 src 가 유지된다) */
  bySrc: Map<string, string>;
  /** 되받아 담은 사진 수 */
  inlined: number;
  /** 우리 저장소 사진인데 **받지 못한** 수 — 호출부가 사용자에게 알린다 */
  failed: number;
}

function collectSrcs(n: MindNode | undefined, out: Set<string>): void {
  if (!n) return;
  const push = (src: string | undefined) => {
    // **우리 저장소 사진만** 손댄다. 남의 사이트 URL(외부 링크 폴백)은
    // 그대로 둔다 — 그건 원래부터 인터넷이 있어야 보이는 것이다.
    if (src && serverAttachmentId(src)) out.add(src);
  };
  push(n.image?.src);
  for (const im of n.images ?? []) push(im.src);
  // **리치 노트 HTML 속 `<img>` 도 센다** (2026-08-20, 노트 HTML 슬라이스).
  // 여길 빠뜨리면 노트 사진만 서버 주소로 내보내져, 내보낸 파일이
  // **그 사진에서만** 깨진다 — 파일은 정상 생성되므로 눈으로만 알 수 있다.
  for (const nt of n.notes ?? []) {
    for (const src of collectNoteHtmlImageSrcs(nt.html)) push(src);
  }
  for (const c of n.children ?? []) collectSrcs(c, out);
}

/**
 * 맵 안의 **우리 저장소 사진**을 모두 받아 data URL 로 바꿔 돌려준다.
 *
 * 같은 사진이 여러 노드에 있으면 **한 번만 받는다**(src 로 모은다) —
 * 큰 사진이 여러 번 흐르면 내보내기가 그만큼 느려진다.
 */
export async function fetchServerImageDataUrls(map: SampleMap): Promise<ServerImageResult> {
  const srcs = new Set<string>();
  collectSrcs(map.root, srcs);
  for (const b of map.branches) collectSrcs(b, srcs);

  const bySrc = new Map<string, string>();
  let failed = 0;
  for (const src of srcs) {
    try {
      const res = await fetch(await attachmentFetchUrl(src));
      if (!res.ok) throw new Error(String(res.status));
      const bytes = new Uint8Array(await res.arrayBuffer());
      const mime = (res.headers.get('content-type') || 'image/png').split(';')[0].trim();
      if (!PACKABLE.test(mime)) { failed += 1; continue; }
      bySrc.set(src, toDataUrl(bytes, mime.toLowerCase()));
    } catch {
      // **못 받아도 사진을 지우지 않는다.** 원래 src 가 그대로 남아
      // 온라인에서는 보인다. 대신 몇 장이 그렇게 됐는지 알린다 —
      // 조용히 넘어가면 사용자는 반쪽 파일을 온전한 줄 안다.
      failed += 1;
    }
  }
  return { bySrc, inlined: bySrc.size, failed };
}
