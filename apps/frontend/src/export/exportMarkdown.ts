// exportMarkdown — 맵을 Markdown 파일로 내보낸다 ('내보내기 (MD)').
//
// 본문은 일반 에디터에서 보고 고칠 수 있는 표준 Markdown이다:
//   # 중심 주제 → ## 2레벨 → ### 3레벨 … ###### 6레벨, 7레벨+는 리스트
//   (importMarkdown.ts의 파서와 정확히 왕복되는 형식)
// 노드의 사진은 ![ ](files/…) 줄, 링크·노트는 파서가 무시하는 일반
// 문단으로 함께 적어 사람이 읽기 좋게 한다.
//
// 파일 끝에 맵 메타데이터 주석(<!-- easymindmap:v1:BASE64 -->)을 실어
// EasyMindMap이 만든 파일임을 표시하고 원본 맵 전체를 담는다 — 다시
// 불러오면 본문(구조·텍스트 수정 반영) + 메타데이터(스타일·노트·사진·
// 설정 복원)로 합쳐진다 (importMapFile.ts).
//
// 사진(data URL)이나 패키징 가능한 첨부가 있으면 HTML 내보내기와
// 마찬가지로 "제목.md + files/…"를 담은 ZIP으로 내려준다.

import type { LayoutType, MindNode, NodeAttachment, SampleMap } from '@/editor/__samples__/types';
import type { LayoutSpacing } from '@/layout/LayoutEngine';
import { buildZip, type ZipEntry } from './zip';
import {
  buildMapMeta,
  bytesToDataUrl,
  countMapNodes,
  encodeMetaBase64,
  withInlinedAttachments,
  INLINE_ATTACHMENT_LIMIT,
} from './mapMeta';

interface MdImage {
  path: string; // files/img-1.png
  data: Uint8Array;
}

function safeName(s: string, fallback: string): string {
  const cleaned = String(s || '').trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60);
  return cleaned || fallback;
}

function dataUrlToBytes(src: string): { bytes: Uint8Array; ext: string } | null {
  const m = src.match(/^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i);
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, ext: m[1].toLowerCase().replace('jpeg', 'jpg') };
  } catch {
    return null;
  }
}

// 노드 한 줄 텍스트 — 본문 견출/리스트는 한 줄이어야 하므로 줄바꿈은
// 공백으로 합친다 (원본 여러 줄 텍스트는 메타데이터가 보존).
function oneLine(text: string): string {
  return String(text || '').replace(/\s*\n+\s*/g, ' ').trim();
}

// 표 노트("셀 | 셀" 줄들) → Markdown 파이프 표 (헤더 다음 구분선 포함)
function pushTableNote(lines: string[], text: string): void {
  const rows = String(text).split('\n').filter((r) => r.trim());
  rows.forEach((row, i) => {
    const cells = row.split('|').map((c) => c.trim());
    lines.push(`| ${cells.join(' | ')} |`);
    if (i === 0) lines.push(`|${cells.map(() => '---').join('|')}|`);
  });
}

function buildBody(
  map: SampleMap,
  images: MdImage[],
): string {
  const lines: string[] = [];
  lines.push(`# ${oneLine(map.root.text) || map.title}`);
  lines.push('');
  // 루트의 노트 → 제목 바로 아래 (문단=인용문, 표=파이프 표, 코드=펜스 —
  // 불러오기 시 다시 루트 노트로)
  for (const n of map.root.notes ?? []) {
    if (n.type === 'paragraph' && n.text.trim()) {
      for (const ln of n.text.split('\n')) lines.push(`> ${ln}`);
      lines.push('');
    } else if (n.type === 'table' && n.text.trim()) {
      pushTableNote(lines, n.text);
      lines.push('');
    } else if (n.type === 'code_block' && n.text.trim()) {
      lines.push('```' + (n.lang ?? ''));
      lines.push(n.text);
      lines.push('```');
      lines.push('');
    }
  }

  const walk = (node: MindNode, depth: number) => {
    // depth 1(2레벨)=## … depth 5(6레벨)=###### / 그 아래는 리스트 들여쓰기
    if (depth <= 5) {
      lines.push(`${'#'.repeat(depth + 1)} ${oneLine(node.text)}`);
    } else {
      lines.push(`${'  '.repeat(depth - 6)}- ${oneLine(node.text)}`);
    }

    // 사진 — files/로 패키징된 경우 상대 경로, 아니면 원본 URL.
    // 인라인 사진(images — 텍스트 중간)이 있으면 원문 순서대로 모두 내보낸다
    // (MD에서 노드는 한 줄이라 "텍스트 중간" 위치는 표현하지 못하고, 제목
    // 아래에 순서대로 나열된다 — markdown-export.md §노드 사진 참조).
    const nodeImgs = node.images?.length
      ? node.images
      : node.image?.src
        ? [node.image]
        : [];
    for (const im of nodeImgs) {
      const packed = dataUrlToBytes(im.src);
      if (packed) {
        const path = `files/img-${images.length + 1}.${packed.ext}`;
        images.push({ path, data: packed.bytes });
        lines.push('');
        lines.push(`![${oneLine(node.text).slice(0, 20)}](${path})`);
      } else if (/^https?:\/\//i.test(im.src)) {
        lines.push('');
        lines.push(`![${oneLine(node.text).slice(0, 20)}](${im.src})`);
      }
    }
    // 링크 — Markdown 링크 문법으로 (불러오기 시 다시 노드 링크로 추출)
    for (const l of node.links ?? []) {
      lines.push('');
      lines.push(`🔗 [${oneLine(l.label ?? '') || l.url}](${l.url})`);
    }
    // 문단 노트 → 인용문(>) · 코드 노트 → 펜스 · 표 노트 → 파이프 표
    // (불러오기 시 다시 노트로)
    for (const n of node.notes ?? []) {
      if (n.type === 'paragraph' && n.text.trim()) {
        lines.push('');
        for (const ln of n.text.split('\n')) lines.push(`> ${ln}`);
      } else if (n.type === 'code_block' && n.text.trim()) {
        lines.push('');
        lines.push('```' + (n.lang ?? ''));
        lines.push(n.text);
        lines.push('```');
      } else if (n.type === 'table' && n.text.trim()) {
        lines.push('');
        pushTableNote(lines, n.text);
      }
    }
    lines.push('');
    for (const c of node.children ?? []) walk(c, depth + 1);
  };

  for (const b of map.branches) walk(b, 1);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

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
  const title = safeName(map.title, 'mindmap');
  const images: MdImage[] = [];
  const body = buildBody(map, images);

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
      let name = `files/${safeName(att.name, att.id)}`;
      let i = 2;
      while (usedNames.has(name)) name = `files/${safeName(att.name, att.id)}-${i++}`;
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
  // 메타데이터 주석 — 일반 에디터에서 한눈에 알아볼 수 있게 머리말 +
  // 100자 줄바꿈 base64 (파서는 easymindmap:v1: 토큰만 찾으므로 형식 자유)
  const b64 = encodeMetaBase64(meta).replace(/(.{100})/g, '$1\n');
  const exportedLocal = new Date().toLocaleString('ko-KR');
  const metaComment = [
    '',
    '<!--',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'EasyMindMap 맵 파일 메타데이터',
    `제목: ${map.title}`,
    `노드 수: ${countMapNodes(map)}`,
    `내보낸 시각: ${exportedLocal} (${meta.exportedAt})`,
    `형식: ${meta.format} v${meta.version} · 생성기: ${meta.generator}`,
    '',
    '이 주석은 EasyMindMap이 다시 불러올 때 스타일·노트·사진·태그·맵',
    '설정을 복원하는 데 씁니다 — 지우면 구조·텍스트만 불러와집니다.',
    '위 본문(견출·리스트)은 자유롭게 수정해도 됩니다.',
    '',
    'easymindmap:v1:',
    b64,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '-->',
    '',
  ].join('\n');
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
