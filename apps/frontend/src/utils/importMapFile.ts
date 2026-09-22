// importMapFile — '새 맵 > 불러오기'의 파일 파서.
//
//   · HTML: EasyMindMap이 내보낸 HTML에서 메타데이터(#easymindmap-map)를
//     읽어 원본 맵 전체를 복원한다 (메타데이터 없는 일반 HTML은 거부).
//   · MD: 본문(견출·리스트)을 파싱하고, 제목 아래 ```emm 선언(맵 ID ·
//     레벨별 레이아웃·도형·글자 크기)을 맵 설정으로 옮긴다. 우리가 내보낸
//     MD 도 손으로 쓴 MD 도 **같은 길**이다 — 파일 끝 메타데이터 주석은
//     2026-09-15 폐기했다 (노드별 충실도는 HTML·서버 몫).

import type { SampleMap, SampleBranch } from '@/editor/__samples__/types';
import { parseMarkdownToMap, type ParseEmmOptions } from './importMarkdown';
import { readDeclaration } from '@emm/declaration';
import { applyDeclaredConnectors, resolveDeclaration } from './emmDeclaration';
import { applyLevelLayouts } from './levelLayouts';
import { parseMetaJson, type MapFileMeta } from '@/export/mapMeta';

export interface ImportedMap {
  map: SampleMap;
  editor?: MapFileMeta['editor'];
  source: 'easymindmap-html' | 'plain-md';
  /**
   * EMM 선언에서 **알아는 들었지만 건너뛴 것**. 불러오기 안내에 붙는다 —
   * 조용히 사라지면 문서를 쓴 사람이 왜 안 되는지 알 길이 없다.
   */
  skipped?: string[];
}

const HTML_META_RE =
  /<script type="application\/json" id="easymindmap-map">([\s\S]*?)<\/script>/;

export function parseHtmlMapFile(text: string): ImportedMap | null {
  const m = String(text || '').match(HTML_META_RE);
  if (!m) return null;
  const meta = parseMetaJson(m[1]);
  if (!meta) return null;
  return { map: meta.map, editor: meta.editor, source: 'easymindmap-html' };
}

export function parseMarkdownMapFile(
  text: string,
  fallbackTitle: string,
  opts?: ParseEmmOptions,
): ImportedMap | null {
  const raw = String(text || '');
  const map = parseMarkdownToMap(raw, fallbackTitle, opts);
  if (!map) return null;

  // 문서의 `emm` 코드블록 선언 — 우리가 내보낸 MD 도, 손으로 쓴 것·AI 가
  // 만든 것도 여기서 레이아웃을 말한다. 블록은 루트의 `emm` 코드 노트로도
  // 남는다(declaration.ts — 숨은 마법이 아니라 보이는 노트). 다시 내보낼
  // 때는 직렬화가 그 노트를 건너뛰고 맵 설정에서 새로 쓴다.
  const declared = resolveDeclaration(readDeclaration(raw));
  if (declared.settings) {
    map.settings = { ...(map.settings ?? {}), ...declared.settings };
    // **설정만 합쳐서는 그림이 바뀌지 않는다** (2026-09-03). 레이아웃 엔진은
    // `settings` 를 읽지 않는다 — 맵 전체 레이아웃과 **노드별 `layoutType`**
    // 만 본다. `settings.levelLayouts` 는 설정 패널이 "무엇을 고른 상태인가"를
    // 기억하는 자리다. 그래서 예전에는 `levels:` 선언이 패널에만 보이고
    // 그림에는 전혀 반영되지 않았다.
    //
    // 설정 패널이 고를 때와 **같은 함수**로 노드에 박는다.
    if (declared.settings.levelLayouts) {
      map.branches = applyLevelLayouts(
        map.branches, declared.settings.levelLayouts,
      ) as SampleBranch[];
      // 선언은 맵 전체의 것 — 두 번째 이후의 중심주제 가지에도 같이 박는다
      // (2026-09-15). 빠뜨리면 그 중심만 선언과 다르게 그려진다.
      if (map.centers) {
        map.centers = map.centers.map((c) => ({
          ...c,
          branches: applyLevelLayouts(c.branches, declared.settings!.levelLayouts!) as SampleBranch[],
        }));
      }
    }
  }

  // 연결선 선언 → 경로를 id 로 풀어 맵에 (2026-09-22)
  const withConnectors = applyDeclaredConnectors(map, declared.connectors);
  if (withConnectors !== map) map.connectors = withConnectors.connectors;

  return {
    map,
    source: 'plain-md',
    ...(declared.editor ? { editor: declared.editor } : {}),
    ...(declared.skipped ? { skipped: declared.skipped } : {}),
  };
}

// ---------------------------------------------------------------------------
// ZIP 불러오기 — 내보낸 ZIP(맵.md/.html + files/…)을 통째로 받아
// 안의 맵 파일을 파싱하고, files/의 실제 파일을 다시 이어 붙인다
// (로컬 첨부의 blob: URL은 원 세션에서만 유효하므로).
//
//   · 첨부  → data URL (지금까지 그대로)
//   · 사진  → **attachmentUrlForFile()** — 로그인이면 서버 저장소로,
//             게스트면 data URL. 2026-08-20, B16 ② D-6.
//
// ★ 사진을 여기서 data URL 로 되돌리면, D-2·D-3 으로 앞문을 잠가도
//   **불러오기라는 뒷문으로 base64 가 계속 문서에 들어온다.**
//   내보내고 다시 불러오는 것만으로 원상복귀되는 셈이다.
// ---------------------------------------------------------------------------

import { parseZip } from '@/export/zip';
import { bytesToDataUrl } from '@/export/mapMeta';
import { attachmentUrlForFile } from './attachmentFile';
import { useUploadStore } from '@/stores/uploadStore';

function relinkAttachments(
  map: SampleMap,
  files: { path: string; data: Uint8Array }[],
): { map: SampleMap; relinked: number } {
  // files/ 아래 항목을 "경로 끝부분(files/이름)" 기준으로 색인
  const byName = new Map<string, Uint8Array>();
  for (const f of files) {
    const m = f.path.match(/(?:^|\/)files\/(.+)$/);
    if (m) byName.set(m[1], f.data);
  }
  if (byName.size === 0) return { map, relinked: 0 };

  const safe = (s: string) =>
    String(s || '').trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60);
  let relinked = 0;

  interface NodeLike {
    attachments?: { id: string; name: string; url?: string }[];
    children?: NodeLike[];
  }
  const walk = <T extends NodeLike>(n: T): T => ({
    ...n,
    attachments: n.attachments?.map((a) => {
      // 이미 살아있는 URL(data:/http)은 그대로 — `files/…`(본문의 📎 줄)·
      // blob:·빈 URL 만 재연결
      if (a.url && (/^data:/.test(a.url) || /^https?:\/\//i.test(a.url))) return a;
      const want = safe(a.name || a.id);
      let data = byName.get(want);
      if (!data) {
        // 내보내기의 중복 이름 처리(name-2 등) 대비 — 어간 일치 폴백
        const stem = want.replace(/\.[^.]+$/, '');
        for (const [k, v] of byName) {
          if (k === want || k.startsWith(stem)) { data = v; break; }
        }
      }
      if (!data) return a;
      relinked += 1;
      return { ...a, url: bytesToDataUrl(data, a.name || want) };
    }),
    children: (n.children ?? []).map(walk),
  });

  return {
    map: {
      ...map,
      root: walk(map.root as unknown as NodeLike) as unknown as SampleMap['root'],
      branches: map.branches.map((b) => walk(b)) as SampleBranch[],
      // 두 번째 이후의 중심주제도 되잇는다 (2026-09-15)
      ...(map.centers
        ? {
            centers: map.centers.map((c) => ({
              ...c,
              root: walk(c.root as unknown as NodeLike) as unknown as SampleMap['root'],
              branches: c.branches.map((b) => walk(b)) as SampleBranch[],
            })),
          }
        : {}),
    },
    relinked,
  };
}

// ── 사진 되잇기 (B16 ② D-6) ────────────────────────────────────────

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
};

interface ImgNodeLike {
  image?: { src: string; w?: number; h?: number };
  images?: { src: string; w?: number; h?: number }[];
  children?: ImgNodeLike[];
}

/** 맵 안에서 ZIP 의 `files/…` 를 가리키는 사진 경로를 모두 모은다 */
function collectFileImageSrcs(map: SampleMap): Set<string> {
  const out = new Set<string>();
  const walk = (n: ImgNodeLike | undefined) => {
    if (!n) return;
    const push = (src: string | undefined) => {
      // 이미 살아 있는 주소(data:·http)는 손대지 않는다 — `files/…` 만
      if (src && !/^(data:|blob:|https?:)/i.test(src)) out.add(src);
    };
    push(n.image?.src);
    for (const im of n.images ?? []) push(im.src);
    for (const c of n.children ?? []) walk(c);
  };
  walk(map.root as unknown as ImgNodeLike);
  for (const b of map.branches) walk(b as unknown as ImgNodeLike);
  for (const c of map.centers ?? []) {
    walk(c.root as unknown as ImgNodeLike);
    for (const b of c.branches) walk(b as unknown as ImgNodeLike);
  }
  return out;
}

export interface ImageRelinkResult {
  map: SampleMap;
  /** 되이은 사진 수 */
  relinkedImages: number;
  /** 서버에 올리지 못해 data URL 로 남긴 사진 수 */
  fellBackToData: number;
}

/**
 * `files/img-1.png` 같은 상대 경로 사진을 **실제 바이트로 되잇는다.**
 *
 * 판정(서버로 올릴 것인가 · 문서에 담을 것인가)은 **하지 않는다** —
 * `attachmentUrlForFile` 한 곳이 한다. 여기서는 바이트를 File 로 감싸
 * 그 문 앞에 놓기만 한다.
 *
 * 한 장이 실패해도 **불러오기 전체를 취소하지 않는다.** 그 장만 data URL
 * 로 남기고 넘어간다 — 사진 한 장 때문에 맵을 통째로 못 여는 편이 훨씬 나쁘다.
 */
export async function relinkImages(
  map: SampleMap,
  files: { path: string; data: Uint8Array }[],
): Promise<ImageRelinkResult> {
  const wanted = collectFileImageSrcs(map);
  if (wanted.size === 0) return { map, relinkedImages: 0, fellBackToData: 0 };

  const byPath = new Map<string, Uint8Array>();
  for (const f of files) {
    const m = f.path.match(/(?:^|\/)(files\/.+)$/);
    if (m) byPath.set(m[1], f.data);
  }
  if (byPath.size === 0) return { map, relinkedImages: 0, fellBackToData: 0 };

  // 사진이 여러 장이면 **올리는 동안 화면에 한 줄** 띄운다 (uploadStore) —
  // 없으면 큰 ZIP 을 열 때 앱이 멈춘 것처럼 보인다.
  const targets = [...wanted].filter((p) => byPath.has(p));
  const showProgress = targets.length > 1;
  const key = `zip-img-${Date.now()}`;
  if (showProgress) {
    useUploadStore.getState().begin({
      key, name: `사진 ${targets.length}장 불러오는 중`, size: targets.length,
      ratio: 0, abort: () => undefined,
    });
  }

  const bySrc = new Map<string, string>();
  let fellBackToData = 0;
  try {
    for (let i = 0; i < targets.length; i += 1) {
      const path = targets[i];
      const data = byPath.get(path)!;
      const name = path.split('/').pop() || 'image.png';
      const mime = MIME_BY_EXT[(name.split('.').pop() || '').toLowerCase()] ?? 'image/png';
      const asData = () => {
        fellBackToData += 1;
        return bytesToDataUrl(data, name);
      };
      try {
        // Uint8Array → File. 판정은 attachmentUrlForFile 이 한다.
        const file = new File([data as BlobPart], name, { type: mime });
        const url = await attachmentUrlForFile(file, { preferServer: true });
        // blob: 은 이 세션에서만 산다 — 내보내기에서 사진이 조용히 빠지므로
        // 문서에 남기지 않는다 (clipboardImage.ts 와 같은 이유)
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
          bySrc.set(path, asData());
        } else {
          bySrc.set(path, url);
        }
      } catch {
        // 업로드 실패(쿼터·네트워크) — **그 장만** data URL 로 남긴다
        bySrc.set(path, asData());
      }
      if (showProgress) {
        useUploadStore.getState().progress(key, (i + 1) / targets.length);
      }
    }
  } finally {
    if (showProgress) useUploadStore.getState().end(key);
  }

  const one = <T extends { src: string }>(im: T): T =>
    bySrc.has(im.src) ? { ...im, src: bySrc.get(im.src)! } : im;
  const walk = <T extends ImgNodeLike>(n: T): T => ({
    ...n,
    ...(n.image ? { image: one(n.image) } : {}),
    ...(n.images ? { images: n.images.map(one) } : {}),
    children: (n.children ?? []).map(walk),
  });

  return {
    map: {
      ...map,
      root: walk(map.root as unknown as ImgNodeLike) as unknown as SampleMap['root'],
      branches: map.branches.map((b) => walk(b as unknown as ImgNodeLike)) as unknown as SampleBranch[],
      ...(map.centers
        ? {
            centers: map.centers.map((c) => ({
              ...c,
              root: walk(c.root as unknown as ImgNodeLike) as unknown as SampleMap['root'],
              branches: c.branches.map((b) => walk(b as unknown as ImgNodeLike)) as unknown as SampleBranch[],
            })),
          }
        : {}),
    },
    relinkedImages: bySrc.size,
    fellBackToData,
  };
}

export interface ImportedZipMap extends ImportedMap {
  relinked: number; // files/에서 data URL로 재연결한 첨부 수
  /** files/ 에서 되이은 사진 수 (D-6) */
  relinkedImages?: number;
  /** 그중 서버에 올리지 못해 문서에 담은 사진 수 */
  imagesInDoc?: number;
}

export async function parseZipMapFile(
  bytes: Uint8Array,
  opts?: ParseEmmOptions,
): Promise<ImportedZipMap | null> {
  const entries = await parseZip(bytes);
  if (entries.length === 0) return null;

  // ZIP 안의 맵 파일 — .html 우선, 없으면 .md
  const mapEntry =
    entries.find((e) => /\.html?$/i.test(e.path)) ??
    entries.find((e) => /\.(md|markdown)$/i.test(e.path));
  if (!mapEntry) return null;

  const text = new TextDecoder().decode(mapEntry.data);
  const inner = /\.html?$/i.test(mapEntry.path)
    ? parseHtmlMapFile(text)
    : parseMarkdownMapFile(
        text, mapEntry.path.replace(/\.(md|markdown|html?)$/i, ''), opts);
  if (!inner) return null;

  const { map, relinked } = relinkAttachments(inner.map, entries);
  const img = await relinkImages(map, entries);
  return {
    ...inner,
    map: img.map,
    relinked,
    relinkedImages: img.relinkedImages,
    imagesInDoc: img.fellBackToData,
  };
}
