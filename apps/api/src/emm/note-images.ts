// ⚠️ 자동 복사본 — 직접 고치지 마세요.
// 원본: packages/emm-parser/src/note-images.ts
// 갱신: cd apps/api && npm run sync:emm  (CI 가 어긋남을 검사한다)
// 왜 복사하는지는 apps/api/scripts/sync-emm-parser.mjs 머리말 참조.

// note-images — 리치 노트 HTML 속 `<img>` 의 주소를 **읽고 바꾼다**
// (2026-08-20, B16 ② 노트 HTML 슬라이스).
//
// 사진은 노드에 두 가지 방식으로 붙는다.
//   ① `image` · `images`  — 노드 사진. 값이 그냥 주소 문자열이다
//   ② **노트 HTML 속 `<img>`** — 주소가 **HTML 문자열 안에** 들어 있다
//
// ①만 다루는 코드가 오래 있었다(내보내기 되돌리기 · 화면 토큰 붙이기 ·
// 정리(GC)의 참조 세기). 그래서 노트 HTML 에는 서버 주소를 **넣을 수
// 없었고**, base64 가 그대로 남았다 (28번 §3.5 셋째 줄). 이 파일이 ②를
// ①과 같은 자리에서 다룰 수 있게 해 준다.
//
// ★ **DOMParser 를 쓰지 않는다.** 이 패키지는 브라우저 밖(Node·테스트)에서도
//   돌아야 한다. 게다가 파싱해서 다시 직렬화하면 우리가 건드리지 않은
//   속성까지 모양이 바뀐다 — `src` 만 정확히 바꾸는 편이 안전하다.
//
// 여기 들어오는 HTML 은 `sanitizeRichHtml()` 을 통과한 것뿐이라
// (DOM 이 만들어 `innerHTML` 로 뽑은 문자열) 속성은 큰따옴표로 감싸이고
// `&` 는 `&amp;` 로 이스케이프돼 있다. 그래도 홑따옴표·따옴표 없는 꼴까지
// 받아 둔다 — 손으로 만든 HTML 이 섞여 들어와도 조용히 놓치지 않게.

/** 속성값 → 실제 주소 */
function decodeAttr(v: string): string {
  return v
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'); // **맨 마지막** — 먼저 풀면 이중 디코딩이 된다
}

/** 실제 주소 → 속성값. 감싼 따옴표 종류에 맞춰 이스케이프한다 */
function encodeAttr(v: string, quote: string): string {
  const base = v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return quote === "'" ? base.replace(/'/g, '&#39;') : base.replace(/"/g, '&quot;');
}

/**
 * `<img>` 태그의 `src` 속성 위치를 찾아 준다.
 *
 * ★ **정규식을 쓰지 않는다.** 두 번 데였다.
 *   ⑴ `\bsrc\s*=` 는 **`data-src=` 에도 걸린다** — `-` 와 `s` 사이가
 *      단어 경계이기 때문이다. 지연 로딩 자리표시자의 주소를 진짜 사진으로
 *      착각한다.
 *   ⑵ `<img[^>]*?src=` 는 **속성값 안의 `>` 에서 끊긴다**
 *      (`<img alt="a>b" src="x">`). HTML 직렬화는 속성값의 `>` 를
 *      이스케이프하지 않으므로 실제로 나올 수 있고, 그러면 그 사진만
 *      조용히 안 바뀐다 — 내보낸 파일이 **그 사진에서만** 깨진다.
 *
 * 따옴표를 지키며 속성을 훑는 작은 스캐너가 정확하고, 되돌아가며 터지는
 * 정규식 위험도 없다.
 */
interface SrcSpan {
  /** 값이 시작하는 위치(따옴표 안쪽) */
  start: number;
  /** 값이 끝나는 위치(exclusive) */
  end: number;
  /** 값을 감싼 따옴표 (`"` · `'` · 없으면 '') */
  quote: string;
}

const WS = /\s/;

function findImgSrcSpans(html: string): SrcSpan[] {
  const out: SrcSpan[] = [];
  const lower = html.toLowerCase();
  let i = 0;
  for (;;) {
    const tag = lower.indexOf('<img', i);
    if (tag < 0) break;
    let p = tag + 4;
    // `<image>` · `<imgx>` 는 `<img>` 가 아니다
    if (p < html.length && !WS.test(html[p]) && html[p] !== '>' && html[p] !== '/') {
      i = tag + 4;
      continue;
    }
    // 속성을 하나씩 — 따옴표 안의 `>` 에 속지 않는다
    while (p < html.length && html[p] !== '>') {
      while (p < html.length && WS.test(html[p])) p += 1;
      if (p >= html.length || html[p] === '>') break;
      if (html[p] === '/') { p += 1; continue; }
      const nameStart = p;
      while (p < html.length && !WS.test(html[p]) && html[p] !== '=' && html[p] !== '>') p += 1;
      const name = lower.slice(nameStart, p);
      while (p < html.length && WS.test(html[p])) p += 1;
      if (html[p] !== '=') continue;          // 값 없는 속성 (예: `hidden`)
      p += 1;
      while (p < html.length && WS.test(html[p])) p += 1;
      const q = html[p] === '"' || html[p] === "'" ? html[p] : '';
      let vStart: number;
      let vEnd: number;
      if (q) {
        vStart = p + 1;
        vEnd = html.indexOf(q, vStart);
        if (vEnd < 0) { p = html.length; break; }  // 닫히지 않은 따옴표 — 포기
        p = vEnd + 1;
      } else {
        vStart = p;
        while (p < html.length && !WS.test(html[p]) && html[p] !== '>') p += 1;
        vEnd = p;
      }
      // **`src` 만이다** — `data-src` · `srcset` 은 이름이 다르므로 안 걸린다
      if (name === 'src') out.push({ start: vStart, end: vEnd, quote: q });
    }
    i = p < html.length ? p + 1 : html.length;
  }
  return out;
}

/** 노트 HTML 안의 `<img src>` 주소를 **나온 순서대로** 모은다 (중복 없이) */
export function collectNoteHtmlImageSrcs(html: string | undefined): string[] {
  if (!html) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const sp of findImgSrcSpans(html)) {
    const src = decodeAttr(html.slice(sp.start, sp.end));
    if (src && !seen.has(src)) { seen.add(src); out.push(src); }
  }
  return out;
}

/**
 * 노트 HTML 안의 `<img src>` 를 `resolve` 가 주는 값으로 바꾼다.
 *
 * `resolve` 가 `undefined` 를 주면 **원래 값을 그대로 둔다** — 못 바꾼
 * 사진을 지우지 않는다(`withInlinedImages` 와 같은 규약).
 */
export function rewriteNoteHtmlImages(
  html: string | undefined,
  resolve: (src: string) => string | undefined,
): string | undefined {
  if (!html) return html;
  const spans = findImgSrcSpans(html);
  if (!spans.length) return html;
  let out = '';
  let cursor = 0;
  let changed = false;
  for (const sp of spans) {
    const next = resolve(decodeAttr(html.slice(sp.start, sp.end)));
    if (next === undefined) continue;   // 못 바꾼 사진은 원문 그대로 둔다
    changed = true;
    const value = encodeAttr(next, sp.quote || '"');
    // 따옴표가 없던 자리에는 큰따옴표를 씌운다 — 값에 공백이 들어오면
    // 따옴표 없이는 속성이 두 개로 쪼개진다
    out += html.slice(cursor, sp.start)
         + (sp.quote ? value : `"${value}"`);
    cursor = sp.end;
  }
  if (!changed) return html;
  return out + html.slice(cursor);
}

/** 노트 하나(HTML 을 가진 것)의 최소 모양 */
export interface NoteHtmlLike {
  html?: string;
}

/**
 * 노트 배열의 HTML 을 한 번에 바꾼다. **바뀐 것이 없으면 원래 배열을
 * 그대로 돌려준다** — 참조가 유지되어 리렌더가 헛돌지 않는다.
 */
export function rewriteNotesImages<T extends NoteHtmlLike>(
  notes: T[] | undefined,
  resolve: (src: string) => string | undefined,
): T[] | undefined {
  if (!notes?.length) return notes;
  let changed = false;
  const next = notes.map((n) => {
    if (!n?.html) return n;
    const html = rewriteNoteHtmlImages(n.html, resolve);
    if (html === n.html) return n;
    changed = true;
    return { ...n, html };
  });
  return changed ? next : notes;
}
