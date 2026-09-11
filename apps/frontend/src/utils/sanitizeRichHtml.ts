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

function sanitizeNode(node: Node, out: Node, doc: Document, seenImg: Set<string>): void {
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
      sanitizeNode(elIn, out, doc, seenImg);
      continue;
    }

    if (tag === 'IMG') {
      // 지연 로딩 자리표시자면 data-src·srcset의 실제 주소로 복원
      const src = resolveLazyImgSrc(elIn);
      if (!src) continue;
      // 같은 주소의 이미지가 원문에 두 번 실리는 경우(숨겨진 자리표시자
      // + 로드된 본 이미지가 함께 복사되는 lazy-load 구현)는 첫 위치만
      // 살린다 — 뒤쪽 중복이 남으면 "사진이 마지막에 또 나오는" 것처럼
      // 보인다. 기사에서 같은 사진을 두 번 싣는 일은 없어 안전하다.
      if (seenImg.has(src)) continue;
      seenImg.add(src);
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

    sanitizeNode(elIn, elOut, doc, seenImg);
    out.appendChild(elOut);
  }
}

export interface SanitizedRich {
  html: string; // 정리된 안전한 HTML ('' 이면 서식 콘텐츠 없음)
  /**
   * 같은 내용의 일반 텍스트 — **문단·줄바꿈이 살아 있다** (2026-09-11).
   *
   * 전에는 `textContent` 한 덩어리였다. 그래서 기사 한 편이 문단 경계
   * 없이 **한 줄로 이어 붙어**(`…추세개발자 문서…`) 입력창에 보였고,
   * 사용자는 그 줄을 고치려 Enter 를 쳤다 — 그 순간 서식·사진이 함께
   * 버려졌다(실사용 보고). 블록 태그 경계와 `<br>` 을 줄바꿈으로 옮긴다.
   * 검색·복사·내보내기·`html` 없는 뷰어도 이 글을 쓴다.
   */
  text: string;
}

// 줄을 나누는 태그 — 앞뒤에 줄바꿈을 둔다 (표 셀은 탭으로 나눈다)
const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL',
  'BLOCKQUOTE', 'PRE', 'FIGURE', 'FIGCAPTION', 'HR',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'CAPTION',
]);

/**
 * 정리된 HTML(DOM)을 **줄바꿈이 있는 평문**으로.
 *
 * `onImg` 를 주면 사진마다 "앞에 완성된 줄 수"(앵커)를 알려 준다 —
 * 글을 고친 뒤 사진을 같은 자리에 다시 끼워 넣는 데 쓴다
 * (`richNoteEdit.ts`). 앵커 k 는 "k번째 줄 앞"(0 = 맨 앞)이다.
 */
export function richHtmlToText(
  root: Node,
  onImg?: (img: Element, anchor: number) => void,
): string {
  let out = '';
  const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; };
  const anchor = () => {
    if (!out) return 0;
    const lines = out.split('\n').length;
    return out.endsWith('\n') ? lines - 1 : lines;
  };
  const walk = (node: Node, pre: boolean): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const raw = (child.textContent ?? '').replace(/\u00A0/g, ' ');
        out += pre ? raw : raw.replace(/\s+/g, ' ');
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      const tag = el.tagName.toUpperCase();
      if (tag === 'IMG') { onImg?.(el, anchor()); continue; }
      if (tag === 'BR') { if (out) out += '\n'; continue; }
      const block = BLOCK_TAGS.has(tag);
      if (block) nl();
      walk(el, pre || tag === 'PRE');
      if (tag === 'TD' || tag === 'TH') out += '\t';
      if (block) nl();
    }
  };
  walk(root, false);
  return out
    .split('\n')
    .map((ln) => ln.replace(/^ +| +$|\t+$/g, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

export function sanitizeRichHtml(rawHtml: string): SanitizedRich {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  const container = doc.createElement('div');
  sanitizeNode(doc.body, container, doc, new Set<string>());

  // 빈 래퍼만 남았으면(텍스트도 이미지도 없음) 서식 없음으로 처리
  const text = richHtmlToText(container).trim();
  const hasImg = container.querySelector('img') != null;
  if (!text && !hasImg) return { html: '', text: '' };

  return { html: container.innerHTML, text };
}
