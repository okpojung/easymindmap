// sanitizeRichHtml — 클립보드의 text/html(웹 기사 등)을 안전한 HTML로
// 정리한다. 노트 문단 블록에 사진+텍스트를 서식째 붙여넣을 때 사용.
//
// 화이트리스트 방식: 허용 태그·속성만 남기고 script/style/iframe/이벤트
// 핸들러/javascript: URL 등은 모두 제거한다. 허용되지 않은 태그는 태그만
// 벗기고 내용(텍스트·자식)은 살린다. 이미지는 http(s)·data:image URL만.

const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'SPAN', 'BR', 'HR',
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'MARK', 'SUB', 'SUP',
  'A', 'IMG', 'FIGURE', 'FIGCAPTION',
  'UL', 'OL', 'LI',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'CODE',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION',
]);

// 내용까지 통째로 버리는 태그 (실행·표시성 위험 요소)
const DROP_WITH_CONTENT = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE',
  'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'NOSCRIPT', 'TEMPLATE',
  'AUDIO', 'VIDEO', 'SOURCE', 'CANVAS', 'SVG', 'MATH',
]);

function safeHttpUrl(url: string): string | null {
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : null;
}

function safeImgSrc(url: string): string | null {
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^data:image\/(png|jpe?g|gif|webp|avif|bmp);base64,/i.test(u)) return u;
  return null;
}

// 지연 로딩(lazy-load) 이미지의 실제 주소 해석 — 뉴스 사이트 등은 본문
// 위치의 <img>가 1×1 자리표시자(src)이고 실제 주소를 data-src·srcset에
// 둔다. 자리표시자를 그대로 살리거나 버리면 "사진이 원문 위치에서
// 사라지고 다른 곳의 이미지만 남아" 순서가 달라 보인다 — 실제 주소로
// 바꿔 원래 위치에 복원한다.
export function resolveLazyImgSrc(elIn: Element): string | null {
  const rawSrc = elIn.getAttribute('src') ?? '';
  let src = safeImgSrc(rawSrc);
  // 극소 data:gif(투명 1px 자리표시자)는 유효 src로 치지 않는다
  const isPlaceholder =
    !src || (/^data:image\/gif/i.test(rawSrc) && rawSrc.length < 400);
  if (isPlaceholder) {
    const lazyAttrs = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-url'];
    for (const a of lazyAttrs) {
      const v = elIn.getAttribute(a);
      const ok = v && safeImgSrc(v);
      if (ok) return ok;
    }
    const ss = elIn.getAttribute('srcset') ?? elIn.getAttribute('data-srcset');
    if (ss) {
      const first = ss.split(',')[0].trim().split(/\s+/)[0];
      const ok = first && safeImgSrc(first);
      if (ok) return ok;
    }
    return src; // 폴백 없음 — 자리표시자(또는 null) 그대로
  }
  return src;
}

function sanitizeNode(node: Node, out: Node, doc: Document): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.appendChild(doc.createTextNode(child.textContent ?? ''));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue; // 주석 등 제거

    const elIn = child as Element;
    const tag = elIn.tagName.toUpperCase();

    if (DROP_WITH_CONTENT.has(tag)) continue;

    if (!ALLOWED_TAGS.has(tag)) {
      // 허용 외 태그 — 태그는 벗기고 내용만 이어붙인다
      sanitizeNode(elIn, out, doc);
      continue;
    }

    if (tag === 'IMG') {
      // 지연 로딩 자리표시자면 data-src·srcset의 실제 주소로 복원
      const src = resolveLazyImgSrc(elIn);
      if (!src) continue;
      const img = doc.createElement('img');
      img.setAttribute('src', src);
      const alt = elIn.getAttribute('alt');
      if (alt) img.setAttribute('alt', alt);
      img.setAttribute('loading', 'lazy');
      img.setAttribute('referrerpolicy', 'no-referrer');
      out.appendChild(img);
      continue;
    }

    const elOut = doc.createElement(tag.toLowerCase());
    if (tag === 'A') {
      const href = safeHttpUrl(elIn.getAttribute('href') ?? '');
      if (href) {
        elOut.setAttribute('href', href);
        elOut.setAttribute('target', '_blank');
        elOut.setAttribute('rel', 'noopener noreferrer');
      }
    }
    if ((tag === 'TD' || tag === 'TH')) {
      const cs = elIn.getAttribute('colspan');
      const rs = elIn.getAttribute('rowspan');
      if (cs && /^\d+$/.test(cs)) elOut.setAttribute('colspan', cs);
      if (rs && /^\d+$/.test(rs)) elOut.setAttribute('rowspan', rs);
    }
    // 그 외 속성(style/class/on* 등)은 전부 버린다

    sanitizeNode(elIn, elOut, doc);
    out.appendChild(elOut);
  }
}

export interface SanitizedRich {
  html: string; // 정리된 안전한 HTML ('' 이면 서식 콘텐츠 없음)
  text: string; // 같은 내용의 일반 텍스트 (검색·하위호환용)
}

export function sanitizeRichHtml(rawHtml: string): SanitizedRich {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  const container = doc.createElement('div');
  sanitizeNode(doc.body, container, doc);

  // 빈 래퍼만 남았으면(텍스트도 이미지도 없음) 서식 없음으로 처리
  const text = (container.textContent ?? '').replace(/\u00A0/g, ' ').trim();
  const hasImg = container.querySelector('img') != null;
  if (!text && !hasImg) return { html: '', text: '' };

  return { html: container.innerHTML, text };
}
