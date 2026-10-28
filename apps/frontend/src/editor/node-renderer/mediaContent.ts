// 그림만 담은 노드 — 내용이 **사진 · Mermaid · HTML** 뿐인 노드 (2026-10-28 사용자 요청).
//
//   · 도형 없음이어도 밑줄을 긋지 않고, 연결선이 도형 있는 노드처럼 **가운데**에 닿는다
//     (그림 아래 밑줄은 어색하고, 큰 그림의 아래 끝에 선이 붙으면 맵이 흐트러진다)
//   · 자동 태그 Image · Mermaid · HTML 을 보인다 (문서에는 저장하지 않는 표시용)
//   · 내용을 접을 수 있다 — 접으면 "Image, Mermaid" 처럼 종류 이름만 보이고 태그는 숨긴다
//     (노드의 `contentFolded` — 문서에 저장된다)
// HTML 뷰어(exportHtml.ts)는 같은 판정을 손으로 옮겨 두었다 — 같이 고친다.

import { splitNodeParts } from './nodeBlocks';
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

/** 접었을 때 보일 글 — "Image, Mermaid" */
export function mediaLabel(kinds: MediaKind[]): string {
  return kinds.join(', ');
}
