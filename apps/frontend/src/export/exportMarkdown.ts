// exportMarkdown — 맵을 Markdown(EMM) 파일로 내보낸다 ('내보내기 (MD)').
//
// 본문 직렬화는 EMM 레퍼런스 파서(@easymindmap/emm-parser, serialize.ts)가
// 단일 원본이다. 이 파일은 브라우저 전용 작업만 담당한다:
//   · 첨부파일 fetch · ZIP 패키징 · Blob 다운로드
// MD 는 본문(순수 GFM) + 제목 아래 ```emm 선언(맵 ID · 레벨별 레이아웃·도형·
// 글자 크기)뿐이다 — 파일 끝 메타데이터 주석은 2026-09-15 폐기했다. 노드별
// 스타일·아이콘 같은 충실도는 HTML 내보내기와 서버가 맡는다.
// 변환 규칙: docs/04-extensions/markdown-export.md · 스펙: emm-spec.md

import type { LayoutType, MindNode, NodeAttachment, SampleMap } from '@/editor/__samples__/types';
import type { LayoutSpacing } from '@/layout/LayoutEngine';
import { buildZip, type ZipEntry } from './zip';
import { attachmentFetchUrl } from '@/services/cloud/apiClient';
import { withInlinedImages } from './mapMeta';
import { fetchServerImageDataUrls } from './serverImages';
import { buildEmmBody, safeFileName, type EmmImageFile } from '@emm/serialize';
import { declareFromMap } from '@/utils/emmDeclaration';
import { useCloudStore } from '@/stores/cloudStore';

export interface MdExportPackage {
  fileName: string;
  blob: Blob;
  packaged: number; // files/에 담긴 파일 수 (0 = 단일 .md)
  // 원본을 가져오지 못해 제외/외부 링크로만 남은 첨부 수 — 호출부가
  // 안내 메시지를 띄우는 데 쓴다 (예: 저장 후 다시 연 맵의 blob: 첨부)
  external: number;
}

function collectAttachments(nodes: MindNode[], out: NodeAttachment[]): void {
  for (const n of nodes) {
    for (const a of n.attachments ?? []) out.push(a);
    collectAttachments(n.children ?? [], out);
  }
}

export async function buildMarkdownExportPackage(
  map0: SampleMap,
  mapLayoutType?: LayoutType,
  _spacing?: LayoutSpacing,
): Promise<MdExportPackage> {
  // 우리 저장소에 있는 사진을 **먼저** 되받아 data URL 로 되돌린다
  // (B16 ② 슬라이스 1). 그러지 않으면 직렬화가 서버 URL 을 그대로
  // 내보내 **서버가 살아 있어야 열리는 파일**이 된다.
  const srvImg = await fetchServerImageDataUrls(map0);
  const map = srvImg.inlined ? withInlinedImages(map0, (s) => srvImg.bySrc.get(s)) : map0;

  const title = safeFileName(map.title, 'mindmap');

  // 첨부파일 — 먼저 가져와 files/ 경로를 정한다. 본문이 그 노드 아래에
  // `📎 [이름](files/이름)` 줄로 쓰고, 불러오기가 ZIP 의 files/ 에서 잇는다.
  // (루트 노드의 첨부 포함 — HTML 내보내기와 같은 2026-08-02 수정)
  const attachments: NodeAttachment[] = [];
  if (map.root.attachments) attachments.push(...map.root.attachments);
  collectAttachments(map.branches, attachments);
  const files: ZipEntry[] = [];
  const usedNames = new Set<string>();
  const attachmentPaths = new Map<string, string>();
  // 사진을 못 받아 온 것도 '외부로 남은 것'에 함께 센다
  let externalCount = srvImg.failed;
  for (const att of attachments) {
    if (!att.url) continue;
    try {
      // 서버 첨부(B9)는 인증 토큰을 붙여 받아온다 — 그 외 URL 은 그대로
      const res = await fetch(await attachmentFetchUrl(att.url));
      if (!res.ok) throw new Error(String(res.status));
      const bytes = new Uint8Array(await res.arrayBuffer());
      let name = `files/${safeFileName(att.name, att.id)}`;
      let i = 2;
      while (usedNames.has(name)) name = `files/${safeFileName(att.name, att.id)}-${i++}`;
      usedNames.add(name);
      files.push({ path: name, data: bytes });
      attachmentPaths.set(att.id, name);
    } catch {
      // blob: 원본은 이 세션에서만 유효 — 본문에는 http(s) 링크만 남고
      // (buildEmmBody 규칙) 나머지는 빠진다. 호출부가 안내한다.
      externalCount += 1;
    }
  }

  const images: EmmImageFile[] = [];
  // 사진 파일 이름은 files/img-N 이라 첨부 이름과 겹치지 않는다
  const declaration = declareFromMap(map, mapLayoutType, useCloudStore.getState().cloudMapId);
  const md = buildEmmBody(map, images, { declaration, attachmentPaths });
  files.push(...images.map((im) => ({ path: im.path, data: im.data })));

  if (files.length === 0) {
    return {
      fileName: `${title}.md`,
      blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }),
      packaged: 0,
      external: externalCount,
    };
  }

  const entries: ZipEntry[] = [
    { path: `${title}.md`, data: new TextEncoder().encode(md) },
    ...files,
  ];
  return {
    fileName: `${title}.zip`,
    blob: new Blob([buildZip(entries) as BlobPart], { type: 'application/zip' }),
    packaged: files.length,
    external: externalCount,
  };
}

export async function downloadMapAsMarkdown(
  map: SampleMap,
  mapLayoutType?: LayoutType,
  spacing?: LayoutSpacing,
): Promise<MdExportPackage> {
  const pkg = await buildMarkdownExportPackage(map, mapLayoutType, spacing);
  const url = URL.createObjectURL(pkg.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pkg.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  // packaged/external 카운트 — 호출부(툴바)가 "원본 없는 첨부" 안내에 쓴다
  return pkg;
}
