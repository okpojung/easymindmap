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
  const attachments: NodeAttachment[] = [];
  collectAttachments(map.branches, attachments);
  const files: ZipEntry[] = images.map((im) => ({ path: im.path, data: im.data }));
  const usedNames = new Set(files.map((f) => f.path));
  // ≤2MB 첨부는 메타데이터에 data URL로 인라인 (단일 .md만으로 복원)
  const inlineById = new Map<string, string>();
  const attLines: string[] = [];
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
      attLines.push(`📎 ${att.name}: ${att.url} (외부 링크)`);
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
  };
}

export async function downloadMapAsMarkdown(
  map: SampleMap,
  mapLayoutType?: LayoutType,
  spacing?: LayoutSpacing,
): Promise<void> {
  const pkg = await buildMarkdownExportPackage(map, mapLayoutType, spacing);
  const url = URL.createObjectURL(pkg.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pkg.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
