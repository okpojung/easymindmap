// 문서 안의 사진을 **저장소로 옮긴다** (2026-08-16, B16 ② 슬라이스 3).
//
// 설계: docs/04-extensions/content-permanence.md §7.1
//
// 클립보드로 붙인 사진은 `image.src` · `images[].src` 에 **data URL** 로
// 들어간다. 그대로 두면 문서 하나가 수 MB 가 되고, 협업(CRDT)에서는 그
// 바이트가 **업데이트 로그에 영원히 남는다**.
//
// 그래서 저장할 때 저장소로 옮기고 문서에는 **참조만** 남긴다.
//
// ★ **같은 사진을 두 번 올리지 않는다 (내용 해시)**
//   화면은 저장 뒤에도 **메모리에 data URL 을 그대로 들고 있다**(다시
//   열기 전까지). 자동저장이 5분마다 같은 data URL 을 또 보내므로,
//   내용으로 알아보지 못하면 **저장할 때마다 사진이 하나씩 늘어** 사용자
//   용량을 갉아먹는다. 해시를 이름에 넣어 이미 있으면 그것을 쓴다.

import { createHash } from 'node:crypto';

/** 이 크기 아래는 옮기지 않는다 — 작은 아이콘까지 옮기면 첨부 행만 늘고 이득이 없다 */
const MIN_EXTRACT_BYTES = 8 * 1024;

/** 저장소로 옮길 수 있는 형식 — 내보내기가 ZIP 에 담을 수 있는 것과 같다 */
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export interface FoundImage {
  /** 원본 data URL — 문서에서 이 값을 찾아 바꾼다 */
  dataUrl: string;
  bytes: Buffer;
  mime: string;
  /** 내용 해시로 만든 이름 — 같은 사진이면 같은 이름이 된다 */
  name: string;
}

const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.*)$/is;

/**
 * 리치 노트 HTML 속 `<img src="data:…">` (2026-08-20, 노트 HTML 슬라이스).
 *
 * 노트 사진은 주소가 **HTML 문자열 안**에 있어서 `image`·`images` 만 보는
 * 위 규칙에 걸리지 않았다 — 그래서 노트에 넣은 사진만 문서에 base64 로
 * 남았다 (28번 §3.5 셋째 줄). 여기서 같이 꺼낸다.
 *
 * DOM 파서를 쓰지 않는 이유: 파싱해서 다시 직렬화하면 우리가 건드리지
 * 않은 속성까지 모양이 바뀐다. `src` 만 정확히 바꾸는 편이 안전하다.
 */
const NOTE_IMG_DATA_URL = /(<img\b[^>]*?\bsrc\s*=\s*")(data:[a-z]+\/[a-z0-9.+-]+;base64,[^"]*)(")/gis;

/** 노트 HTML 안의 data URL 사진을 나온 순서대로 (중복 없이) */
function noteHtmlDataUrls(html: unknown): string[] {
  if (typeof html !== 'string' || !html.includes('data:')) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(NOTE_IMG_DATA_URL)) {
    if (!seen.has(m[2])) { seen.add(m[2]); out.push(m[2]); }
  }
  return out;
}

function parseDataUrl(src: unknown): { bytes: Buffer; mime: string } | null {
  if (typeof src !== 'string') return null;
  const m = DATA_URL.exec(src);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!EXT_BY_MIME[mime]) return null; // 담을 수 없는 형식은 손대지 않는다
  try {
    const bytes = Buffer.from(m[2], 'base64');
    return bytes.length ? { bytes, mime } : null;
  } catch {
    return null;
  }
}

/**
 * 문서를 훑어 **옮길 수 있는 사진**을 모은다. 문서를 바꾸지는 않는다.
 *
 * `image` · `images` 키만 본다 — 아무 `src` 나 건드리면 나중에 다른
 * 뜻으로 쓰이는 필드까지 망가뜨린다.
 */
export function findDocImages(doc: unknown): FoundImage[] {
  const bySrc = new Map<string, FoundImage>();

  const take = (src: unknown) => {
    if (typeof src !== 'string' || bySrc.has(src)) return;
    const parsed = parseDataUrl(src);
    if (!parsed || parsed.bytes.length < MIN_EXTRACT_BYTES) return;
    const hash = createHash('sha256').update(parsed.bytes).digest('hex').slice(0, 16);
    bySrc.set(src, {
      dataUrl: src,
      bytes: parsed.bytes,
      mime: parsed.mime,
      name: `img-${hash}.${EXT_BY_MIME[parsed.mime]}`,
    });
  };

  const walk = (v: unknown) => {
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.image && typeof o.image === 'object') {
      take((o.image as Record<string, unknown>).src);
    }
    if (Array.isArray(o.images)) {
      for (const im of o.images) {
        if (im && typeof im === 'object') take((im as Record<string, unknown>).src);
      }
    }
    // 리치 노트 HTML 속 사진도 같이 옮긴다 (2026-08-20)
    if (Array.isArray(o.notes)) {
      for (const n of o.notes) {
        if (!n || typeof n !== 'object') continue;
        for (const src of noteHtmlDataUrls((n as Record<string, unknown>).html)) take(src);
      }
    }
    for (const val of Object.values(o)) walk(val);
  };

  walk(doc);
  return [...bySrc.values()];
}

/**
 * 문서 사본을 만들어 사진 src 를 `urlBySrc` 가 주는 값으로 바꾼다.
 * 없으면 원래 값을 그대로 둔다 — **못 옮긴 사진을 지우지 않는다.**
 */
export function rewriteDocImages(doc: unknown, urlBySrc: Map<string, string>): unknown {
  const swap = (im: unknown): unknown => {
    if (!im || typeof im !== 'object') return im;
    const o = im as Record<string, unknown>;
    const next = typeof o.src === 'string' ? urlBySrc.get(o.src) : undefined;
    return next ? { ...o, src: next } : im;
  };
  // 노트 HTML 은 값이 아니라 **문자열 안**을 바꿔야 한다 (2026-08-20)
  const swapNote = (n: unknown): unknown => {
    if (!n || typeof n !== 'object') return n;
    const o = n as Record<string, unknown>;
    if (typeof o.html !== 'string') return n;
    const html = o.html.replace(
      NOTE_IMG_DATA_URL,
      (whole, head: string, src: string, tail: string) => {
        const next = urlBySrc.get(src);
        return next ? `${head}${next}${tail}` : whole;
      },
    );
    return html === o.html ? n : { ...o, html };
  };
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(o)) {
      if (k === 'image') out[k] = swap(val);
      else if (k === 'images' && Array.isArray(val)) out[k] = val.map(swap);
      else if (k === 'notes' && Array.isArray(val)) out[k] = val.map(swapNote);
      else out[k] = walk(val);
    }
    return out;
  };
  return walk(doc);
}

/**
 * 문서가 **가리키고 있는** 첨부 id 를 모은다 (2026-08-16, B16 ② 슬라이스 4).
 *
 * 정리(GC)가 "안 쓰는 것"을 고르는 근거이므로, **하나라도 빠뜨리면 쓰고
 * 있는 파일을 지운다.** 그래서 사진(`image`·`images`)만이 아니라
 * **사람이 붙인 첨부(`attachments[].url`)까지** 함께 모은다.
 *
 * 절대 URL 과 상대 경로를 모두 알아본다 — 사람이 붙인 첨부는 절대 URL,
 * 서버가 옮긴 사진은 상대 경로다.
 *
 * **리치 노트 HTML 속 `<img>` 도 센다** (2026-08-20). 노트 사진이 서버
 * 주소가 됐는데 여기서 빠뜨리면 GC 가 쓰는 파일을 지운다.
 */
export function collectAttachmentRefs(doc: unknown): Set<string> {
  const ids = new Set<string>();
  const take = (u: unknown) => {
    if (typeof u !== 'string') return;
    const i = u.indexOf('/v1/attachments/');
    if (i < 0) return;
    const id = u.slice(i + '/v1/attachments/'.length).split(/[?#/]/)[0];
    if (id) ids.add(id);
  };
  /**
   * 리치 노트 HTML 은 **주소가 여럿** 들어 있는 문자열이다 (2026-08-20).
   * `take()` 는 첫 하나만 보므로 그대로 넘기면 **두 번째 사진부터 안 세고**,
   * 정리(GC)가 쓰고 있는 파일을 지운다. 나온 것을 **전부** 센다.
   */
  const takeAll = (html: unknown) => {
    if (typeof html !== 'string') return;
    for (const m of html.matchAll(/\/v1\/attachments\/([0-9a-fA-F-]{36})/g)) {
      ids.add(m[1]);
    }
  };
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.image && typeof o.image === 'object') take((o.image as Record<string, unknown>).src);
    if (Array.isArray(o.images)) {
      for (const im of o.images) {
        if (im && typeof im === 'object') take((im as Record<string, unknown>).src);
      }
    }
    if (Array.isArray(o.attachments)) {
      for (const a of o.attachments) {
        if (a && typeof a === 'object') take((a as Record<string, unknown>).url);
      }
    }
    // ★ **리치 노트 HTML 속 `<img>`** (2026-08-20, 노트 HTML 슬라이스).
    //   노트 사진이 서버 주소가 된 뒤로 여기서 세지 않으면, 하루 뒤 GC 가
    //   **화면에 멀쩡히 보이는 사진을 지운다.** 되돌릴 수 없는 사고다.
    if (Array.isArray(o.notes)) {
      for (const n of o.notes) {
        if (n && typeof n === 'object') takeAll((n as Record<string, unknown>).html);
      }
    }
    for (const val of Object.values(o)) walk(val);
  };
  walk(doc);
  return ids;
}

/**
 * 우리가 옮긴 사진인가 — 이름만 보고 판정한다.
 *
 * **정리는 우리가 만든 것만 건드린다.** 사람이 올린 파일은 이름이
 * 제각각이라 이 꼴이 될 수 없고, 그래서 GC 가 잘못 돌아도 **사용자가
 * 직접 올린 파일은 안전하다.** 위험을 줄이는 가장 값싼 장치다.
 */
export function isExtractedImageName(name: string): boolean {
  return /^img-[0-9a-f]{16}\.(png|jpg|gif|webp)$/.test(name);
}
