// articleContent — 웹 기사(text/html)를 "노드에 직접" 붙여넣기 위해,
// sanitizeRichHtml을 통과한 HTML에서 텍스트와 사진을 **원문 순서대로**
// 함께 뽑는다. 사진은 "몇 번째 텍스트 줄 뒤인지"(afterLine)로 기록되어
// 노드 텍스트 중간의 원래 자리에 렌더링된다 (NodeInlineImage).
//
// 줄 규칙: 블록 요소(P/DIV/LI/H* 등)와 <br>이 줄을 끊는다. 빈 줄은
// 만들지 않는다 — 노드 안에서는 사진 밴드가 자체 여백을 가지므로 문단
// 사이 공백 줄이 필요 없다. afterLine은 "그 시점까지 쌓인 줄 수"라서
// 텍스트와 항상 일치한다 (text/plain과 줄을 맞추는 방식은 어긋나기 쉽다).

import { sanitizeRichHtml } from './sanitizeRichHtml';

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR',
  'FIGURE', 'FIGCAPTION', 'HR',
]);

export interface ArticleImageRef {
  src: string;
  afterLine: number; // 이 사진 앞에 있는 텍스트 줄 수 (0 = 맨 앞)
}

export interface ArticleContent {
  text: string; // 줄바꿈(\n)으로 이어붙인 본문 (빈 줄 없음)
  images: ArticleImageRef[];
}

export function extractArticleContent(rawHtml: string): ArticleContent {
  const clean = sanitizeRichHtml(rawHtml);
  if (!clean.html) return { text: '', images: [] };

  const doc = new DOMParser().parseFromString(clean.html, 'text/html');
  const lines: string[] = [];
  const images: ArticleImageRef[] = [];
  let cur = '';

  const endLine = () => {
    const t = cur.replace(/\s+/g, ' ').trim();
    cur = '';
    if (t) lines.push(t);
  };

  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        cur += child.textContent ?? '';
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      const tag = el.tagName.toUpperCase();
      if (tag === 'BR') {
        endLine();
        continue;
      }
      if (tag === 'IMG') {
        const src = el.getAttribute('src');
        if (src) {
          endLine(); // 진행 중이던 줄을 닫고 그 뒤 자리에 사진을 기록
          images.push({ src, afterLine: lines.length });
        }
        continue;
      }
      if (BLOCK_TAGS.has(tag)) {
        endLine();
        walk(el);
        endLine();
      } else {
        walk(el); // 인라인 요소 — 줄을 끊지 않는다
      }
    }
  };

  walk(doc.body);
  endLine();

  return { text: lines.join('\n'), images };
}

// 사진의 실제 픽셀 크기를 재서 done에 전달한다 — 로드 실패(핫링크 차단
// 등)해도 기본 크기(400×300)로 유지해 위치는 지킨다. 모든 probe가 끝나면
// 한 번 호출된다.
export function probeArticleImages(
  images: ArticleImageRef[],
  done: (resolved: { src: string; w: number; h: number; afterLine: number }[]) => void,
): { src: string; w: number; h: number; afterLine: number }[] {
  const initial = images.map((im) => ({ ...im, w: 400, h: 300 }));
  if (images.length === 0) return initial;
  const resolved = initial.map((im) => ({ ...im }));
  let pending = images.length;
  const finish = () => {
    pending -= 1;
    if (pending === 0) done(resolved);
  };
  images.forEach((im, i) => {
    const probe = new Image();
    probe.onload = () => {
      resolved[i].w = probe.naturalWidth || 400;
      resolved[i].h = probe.naturalHeight || 300;
      finish();
    };
    probe.onerror = finish;
    probe.src = im.src;
  });
  return initial;
}
