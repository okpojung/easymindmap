// exportMarkdown — 맵을 Markdown(EMM) 파일로 내보낸다 ('내보내기 (MD)').
//
// 본문·메타데이터 직렬화는 EMM 레퍼런스 파서(@easymindmap/emm-parser,
// serialize.ts)가 단일 원본이다. 이 파일은 브라우저 전용 작업만 담당한다:
//   · 첨부파일 fetch(≤2MB 메타 인라인) · ZIP 패키징 · Blob 다운로드
// 변환 규칙: docs/04-extensions/markdown-export.md · 스펙: emm-spec.md

import type { LayoutType, MindNode, NodeAttachment, SampleMap } from '@/editor/__samples__/types';
import type { LayoutSpacing } from '@/layout/LayoutEngine';
import { buildZip, type ZipEntry } from './zip';
import {
  buildMapMeta,
  bytesToDataUrl,
  withInlinedAttachments,
  INLINE_ATTACHMENT_LIMIT,
} from './mapMeta';
import {
  buildEmmBody,
  buildMetaComment,
  safeFileName,
  type EmmImageFile,
} from '@emm/serialize';

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
  map: SampleMap,
  mapLayoutType?: LayoutType,
  spacing?: LayoutSpacing,
): Promise<MdExportPackage> {
  const title = safeFileName(map.title, 'mindmap');
  const images: EmmImageFile[] = [];
  const body = buildEmmBody(map, images);

  // 첨부파일 — HTML 내보내기와 동일하게 가져와 files/에 패키징
  // (루트 노드의 첨부 포함 — HTML 내보내기와 같은 2026-08-02 수정)
  const attachments: NodeAttachment[] = [];
  if (map.root.attachments) attachments.push(...map.root.attachments);
  collectAttachments(map.branches, attachments);
  const files: ZipEntry[] = images.map((im) => ({ path: im.path, data: im.data }));
  const usedNames = new Set(files.map((f) => f.path));
  // ≤2MB 첨부는 메타데이터에 data URL로 인라인 (단일 .md만으로 복원)
  const inlineById = new Map<string, string>();
  const attLines: string[] = [];
  let externalCount = 0;
  for (const att of attachments) {
    if (!att.url) continue;
    try {
      const res = await fetch(att.url);
      if (!res.ok) throw new Error(String(res.status));
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length <= INLINE_ATTACHMENT_LIMIT) {
        inlineById.set(att.id, bytesToDataUrl(bytes, att.name));
      }
      let name = `files/${safeFileName(att.name, att.id)}`;
      let i = 2;
      while (usedNames.has(name)) name = `files/${safeFileName(att.name, att.id)}-${i++}`;
      usedNames.add(name);
      files.push({ path: name, data: bytes });
      attLines.push(`📎 ${att.name}: ${name}`);
    } catch {
      // blob: 원본은 이 세션에서만 유효 — 죽은 URL 대신 "원본 없음" 표기
      attLines.push(att.url.startsWith('blob:')
        ? `📎 ${att.name}: (원본 없음 — 에디터에서 다시 첨부해 주세요)`
        : `📎 ${att.name}: ${att.url} (외부 링크)`);
      externalCount += 1;
    }
  }

  const meta = buildMapMeta(
    withInlinedAttachments(map, (id) => inlineById.get(id)),
    mapLayoutType, spacing);
  const metaComment = buildMetaComment(meta, {
    exportedLocal: new Date().toLocaleString('ko-KR'),
  });
  const md = [
    body,
    attLines.length ? `\n---\n\n${attLines.join('\n')}\n` : '',
    metaComment,
  ].join('');

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
