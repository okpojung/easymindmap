// 그림만 담은 노드 — 내용이 **사진 · Mermaid · HTML** 뿐인 노드 (2026-10-28 사용자 요청).
//
//   · 도형 없음이어도 밑줄을 긋지 않고, 연결선이 도형 있는 노드처럼 **가운데**에 닿는다
//     (그림 아래 밑줄은 어색하고, 큰 그림의 아래 끝에 선이 붙으면 맵이 흐트러진다)
//   · 자동 태그 Image · Mermaid · HTML 을 보인다 (문서에는 저장하지 않는 표시용)
//   · 내용을 접을 수 있다 — 접으면 "Image, Mermaid" 처럼 종류 이름만 보이고 태그는 숨긴다
//     (노드의 `contentFolded` — 문서에 저장된다)
// HTML 뷰어(exportHtml.ts)는 같은 판정을 손으로 옮겨 두었다 — 같이 고친다.

import { splitNodeParts } from './nodeBlocks';
import { parseCodeAt } from './mdCode';
import { renderLangOf } from './codeRender';

export type MediaKind = 'Image' | 'Mermaid' | 'HTML';
const ORDER: MediaKind[] = ['Image', 'Mermaid', 'HTML'];

export interface MediaProbe {
  text?: string;
  image?: unknown;
  images?: unknown[];
}

/** 그림만 담은 노드면 담긴 종류(Image·Mermaid·HTML 순서), 아니면 null */
export function mediaKindsOf(n: MediaProbe): MediaKind[] | null {
  const kinds = new Set<MediaKind>();
  if (n.image) kinds.add('Image');
  if (n.images && n.images.length) kinds.add('Image');
  const text = String(n.text ?? '');
  if (text.trim()) {
    for (const p of splitNodeParts(text)) {
      if (p.kind === 'text') { if (p.body.trim()) return null; continue; }
      if (p.kind !== 'code') return null; // 표는 그림이 아니다
      const k = renderLangOf(p.lang);
      if (!k) return null; // 다른 언어 코드는 글이다
      kinds.add(k === 'mermaid' ? 'Mermaid' : 'HTML');
    }
  }
  if (!kinds.size) return null;
  return ORDER.filter((k) => kinds.has(k));
}

/**
 * 글과 그림이 **섞인** 노드 (2026-11-14 사용자 요청: "HTML 코드블럭은 접히는데 Mermaid 는 안 접힌다").
 * 제목 글(예: '새 노드') 아래에 Mermaid·HTML 코드블럭이나 사진이 있으면 그림만 접을 수 있다.
 * 접으면 글은 그대로 두고 그림 자리에 "▸ Mermaid" 한 줄만 보인다.
 * 그림만 담은 노드(mediaKindsOf)는 여기서 null — 두 판정은 겹치지 않는다.
 */
export function mixedMediaOf(n: MediaProbe): { kinds: MediaKind[]; rest: string } | null {
  if (mediaKindsOf(n)) return null;
  const kinds = new Set<MediaKind>();
  if (n.image || (n.images && n.images.length)) kinds.add('Image');
  const text = String(n.text ?? '');
  for (const p of splitNodeParts(text)) {
    if (p.kind !== 'code') continue;
    const k = renderLangOf(p.lang);
    if (k) kinds.add(k === 'mermaid' ? 'Mermaid' : 'HTML');
  }
  if (!kinds.size) return null;
  return { kinds: ORDER.filter((k) => kinds.has(k)), rest: stripRenderBlocks(text) };
}

/** Mermaid·HTML 코드블럭만 뜯어 낸 글 (다른 언어 코드·표·글은 그대로) */
export function stripRenderBlocks(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (/^\s*```/.test(lines[i])) {
      const block = parseCodeAt(lines, i);
      let end = block?.end;
      if (end === undefined) {
        let j = i + 1;
        while (j < lines.length && !/^\s*```/.test(lines[j])) j++;
        end = Math.min(lines.length, j + 1);
      }
      if (!block || !renderLangOf(block.lang)) out.push(...lines.slice(i, end));
      i = end;
      continue;
    }
    out.push(lines[i++]);
  }
  return out.join('\n').trim();
}

/** 섞인 노드를 접었을 때 보일 글 — "새 노드\n▸ Mermaid" */
export function mixedFoldedText(rest: string, kinds: MediaKind[]): string {
  return `${rest ? rest + '\n' : ''}▸ ${mediaLabel(kinds)}`;
}

/** 접었을 때 보일 글 — "Image, Mermaid" */
export function mediaLabel(kinds: MediaKind[]): string {
  return kinds.join(', ');
}
