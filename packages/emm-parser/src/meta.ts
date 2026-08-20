// mapMeta — 내보내기 파일(HTML/MD)에 담는 "맵 메타데이터" 공통 모듈.
//
// EasyMindMap이 만든 파일임을 표시하고, 편집 가능한 원본 맵 전체(스타일·
// 노트·링크·사진·설정 포함)를 함께 실어 보낸다. '새 맵 > 불러오기'가 이
// 메타데이터를 읽어 내보낸 맵을 그대로 복원한다 (importMapFile.ts).
//
//   · HTML: <script type="application/json" id="easymindmap-map">…</script>
//   · MD:   <!-- easymindmap:v1:BASE64(JSON) --> (파일 끝 — 일반 에디터·
//           뷰어에서는 주석이라 보이지 않고, JSON을 base64로 감싸 어떤
//           본문 내용도 주석을 깨뜨릴 수 없다)

import type { EditorSpacing, LayoutType, SampleMap } from './model';
import { rewriteNotesImages, type NoteHtmlLike } from './note-images';

export const MAP_FILE_FORMAT = 'easymindmap-map';
export const MAP_FILE_VERSION = 1;
// MD 메타데이터 토큰 — 주석 안에서 base64가 줄바꿈되어 있어도 매칭
// (v1 초기 파일의 한 줄 형식도 그대로 매칭된다)
export const MD_META_RE = /easymindmap:v(\d+):\s*([A-Za-z0-9+/=\r\n ]+)/;
// 본문 파싱 전에 제거할 메타데이터 주석 블록 전체
export const MD_META_BLOCK_RE = /<!--(?:(?!-->)[\s\S])*?easymindmap:v\d+:(?:(?!-->)[\s\S])*?-->/;

export interface MapFileMeta {
  format: typeof MAP_FILE_FORMAT;
  version: number;
  generator: 'EasyMindMap';
  // 내보낸 시각 (ISO 8601 UTC) — 파일이 언제 만들어졌는지
  exportedAt: string;
  // 사람이 읽기 위한 요약 (map 안에도 있지만 디코드 없이 보이도록 중복)
  title: string;
  nodeCount: number;
  // 내보낼 당시의 에디터 상태 — 불러올 때 레이아웃·간격을 복원한다
  editor?: {
    layoutType?: LayoutType;
    spacingX?: number;
    spacingY?: number;
  };
  map: SampleMap;
}

export function countMapNodes(map: SampleMap): number {
  const walk = (nodes: { children?: unknown[] }[]): number =>
    nodes.reduce((s2, n) => s2 + 1 + walk((n.children ?? []) as { children?: unknown[] }[]), 0);
  return 1 + walk(map.branches);
}

export function buildMapMeta(
  map: SampleMap,
  layoutType?: LayoutType,
  spacing?: EditorSpacing,
): MapFileMeta {
  return {
    format: MAP_FILE_FORMAT,
    version: MAP_FILE_VERSION,
    generator: 'EasyMindMap',
    exportedAt: new Date().toISOString(),
    title: map.title,
    nodeCount: countMapNodes(map),
    editor: {
      layoutType,
      spacingX: spacing?.x,
      spacingY: spacing?.y,
    },
    map,
  };
}

// UTF-8 안전 base64 (MD 주석용)
export function encodeMetaBase64(meta: MapFileMeta): string {
  const json = JSON.stringify(meta);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function decodeMetaBase64(b64: string): MapFileMeta | null {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const meta = JSON.parse(new TextDecoder().decode(bytes)) as MapFileMeta;
    if (meta?.format !== MAP_FILE_FORMAT || !meta.map?.root) return null;
    return meta;
  } catch {
    return null;
  }
}

export function parseMetaJson(json: string): MapFileMeta | null {
  try {
    const meta = JSON.parse(json) as MapFileMeta;
    if (meta?.format !== MAP_FILE_FORMAT || !meta.map?.root) return null;
    return meta;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 작은 첨부 인라인 — 내보낼 때 ≤2MB 첨부는 메타데이터의 맵 사본에
// data URL로 심어, ZIP 없이 단일 .md/.html 파일만으로도 첨부까지
// 복원되게 한다. (큰 첨부는 ZIP의 files/로만 — 불러오기에서 재연결)
// ---------------------------------------------------------------------------

export const INLINE_ATTACHMENT_LIMIT = 2 * 1024 * 1024; // 2MB

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
  mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm',
};

export function bytesToDataUrl(bytes: Uint8Array, fileName: string): string {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream';
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

// 맵 사본을 만들어 **사진** src 를 resolve 가 주는 값(data URL)으로
// 교체한다 (2026-08-16, B16 ② 슬라이스 1).
//
// **왜 필요한가**: 사진이 서버 저장소로 옮겨가면 src 가 우리 서버 URL 이
// 된다. 직렬화(serialize.ts)는 `http(s)` src 를 **URL 그대로** 내보내므로,
// 그대로 두면 내보낸 ZIP·HTML 이 **서버가 살아 있어야 열리는 파일**이
// 된다 — "파일 하나로 온전히"라는 약속이 깨진다
// (docs/04-extensions/content-permanence.md §7.1).
//
// 그래서 내보내기 **직전에** 되돌린다. resolve 가 undefined 를 주면
// 원래 src 를 유지한다 — 못 받아 온 사진을 **지우지는 않는다.**
//
// 첨부와 달리 **루트 노드도 훑는다.** 루트에 붙인 사진이 흔하다.
export function withInlinedImages(
  map: SampleMap,
  resolve: (src: string) => string | undefined,
): SampleMap {
  interface ImgLike { src: string }
  interface NodeLike {
    image?: ImgLike;
    images?: ImgLike[];
    notes?: NoteHtmlLike[];
    children?: NodeLike[];
  }
  const one = <T extends ImgLike>(im: T): T => {
    const inlined = resolve(im.src);
    return inlined ? { ...im, src: inlined } : im;
  };
  const walk = <T extends NodeLike>(n: T): T => ({
    ...n,
    ...(n.image ? { image: one(n.image) } : {}),
    ...(n.images ? { images: n.images.map(one) } : {}),
    // **리치 노트 HTML 속 `<img>` 도 같이 바꾼다** (2026-08-20).
    // 여길 빠뜨리면 노트에 넣은 사진만 서버 주소로 내보내져,
    // 내보낸 파일이 **그 사진에서만** 서버 없이 안 열린다 —
    // 파일은 정상 생성되므로 사람이 열어 봐야 안다.
    ...(n.notes ? { notes: rewriteNotesImages(n.notes, resolve) } : {}),
    children: (n.children ?? []).map(walk),
  });
  return {
    ...map,
    root: walk(map.root),
    branches: map.branches.map((b) => walk(b)),
  };
}

// 맵 사본을 만들어 첨부 URL을 resolve가 주는 값(data URL)으로 교체한다.
// resolve가 undefined를 주면 원래 URL 유지.
export function withInlinedAttachments(
  map: SampleMap,
  resolve: (attachmentId: string) => string | undefined,
): SampleMap {
  interface NodeLike {
    attachments?: { id: string; url?: string }[];
    children?: NodeLike[];
  }
  const walk = <T extends NodeLike>(n: T): T => ({
    ...n,
    attachments: n.attachments?.map((a) => {
      const inlined = resolve(a.id);
      return inlined ? { ...a, url: inlined } : a;
    }),
    children: (n.children ?? []).map(walk),
  });
  return {
    ...map,
    branches: map.branches.map((b) => walk(b)),
  };
}
