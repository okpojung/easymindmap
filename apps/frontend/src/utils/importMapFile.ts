// importMapFile — '새 맵 > 불러오기'의 파일 파서.
//
//   · HTML: EasyMindMap이 내보낸 HTML에서 메타데이터(#easymindmap-map)를
//     읽어 원본 맵 전체를 복원한다 (메타데이터 없는 일반 HTML은 거부).
//   · MD (EasyMindMap 내보내기): 파일 끝 메타데이터 주석에서 원본 맵을
//     읽고, 본문(견출·리스트)을 파싱해 사용자가 일반 에디터에서 고친
//     구조·텍스트를 반영한다 — 텍스트가 그대로인 노드는 메타데이터의
//     스타일·노트·링크·사진·태그를 되살린다.
//   · MD (일반): 기존 parseMarkdownToMap 구조 파싱 그대로.

import type { MindNode, SampleMap, SampleBranch } from '@/editor/__samples__/types';
import { parseMarkdownToMap } from './importMarkdown';
import {
  MD_META_RE,
  MD_META_BLOCK_RE,
  decodeMetaBase64,
  parseMetaJson,
  type MapFileMeta,
} from '@/export/mapMeta';

export interface ImportedMap {
  map: SampleMap;
  editor?: MapFileMeta['editor'];
  source: 'easymindmap-html' | 'easymindmap-md' | 'plain-md';
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

// 메타데이터의 노드들을 "텍스트 → 노드" 색인으로 만든다 (한 줄로 합친
// 텍스트 기준 — MD 본문 견출은 한 줄이므로). 같은 텍스트가 여러 개면
// 순서대로 소비한다.
function indexByText(map: SampleMap): Map<string, MindNode[]> {
  const idx = new Map<string, MindNode[]>();
  const key = (t: string) => String(t || '').replace(/\s*\n+\s*/g, ' ').trim();
  const walk = (n: MindNode) => {
    const k = key(n.text);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k)!.push(n);
    (n.children ?? []).forEach(walk);
  };
  map.branches.forEach(walk);
  return idx;
}

// 본문에서 파싱한 노드에 메타데이터 원본 노드의 속성(스타일·노트·링크·
// 사진·태그·레이아웃)을 입힌다. 텍스트(한 줄 기준)가 같은 노드만 —
// 사용자가 고친 노드는 새 텍스트 그대로 평문으로 들어간다.
function enrich(bodyMap: SampleMap, meta: MapFileMeta): SampleMap {
  const idx = indexByText(meta.map);
  const key = (t: string) => String(t || '').replace(/\s*\n+\s*/g, ' ').trim();

  const apply = (n: MindNode): MindNode => {
    const pool = idx.get(key(n.text));
    const src = pool && pool.length ? pool.shift() : undefined;
    const out: MindNode = {
      ...n,
      children: (n.children ?? []).map(apply),
    };
    if (src) {
      out.text = src.text; // 원본 여러 줄 텍스트 복원
      out.style = src.style;
      out.icon = src.icon;
      out.iconSide = src.iconSide;
      out.tag = src.tag;
      out.tags = src.tags;
      out.links = src.links;
      out.notes = src.notes;
      out.attachments = src.attachments;
      out.image = src.image;
      out.images = src.images;
      out.textAlign = src.textAlign;
      out.layoutType = src.layoutType;
      out.edgeType = src.edgeType;
      out.collapsed = src.collapsed;
      // 수동 크기 (우하단 핸들) — documentStore.updateNodeSize의 필드명
      (out as MindNode & { sizeW?: number }).sizeW =
        (src as MindNode & { sizeW?: number }).sizeW;
      (out as MindNode & { sizeH?: number }).sizeH =
        (src as MindNode & { sizeH?: number }).sizeH;
      if (src.colorKey) out.colorKey = src.colorKey;
      if (src.side === 'left' || src.side === 'right') out.side = src.side;
    }
    return out;
  };

  return {
    ...meta.map, // settings(레벨별 폰트·레이아웃) 등 맵 단위 속성은 메타데이터
    title: bodyMap.title,
    root: {
      ...meta.map.root,
      text: bodyMap.root.text || meta.map.root.text,
    },
    branches: bodyMap.branches.map(apply) as SampleBranch[],
  };
}

export function parseMarkdownMapFile(
  text: string,
  fallbackTitle: string,
): ImportedMap | null {
  const raw = String(text || '');
  const metaMatch = raw.match(MD_META_RE);

  if (metaMatch) {
    // base64는 가독성을 위해 줄바꿈되어 있을 수 있다 — 공백 제거 후 디코드
    const meta = decodeMetaBase64(metaMatch[2].replace(/\s+/g, ''));
    if (meta) {
      const body = raw.replace(MD_META_BLOCK_RE, '');
      const bodyMap = parseMarkdownToMap(body, meta.map.title || fallbackTitle);
      // 본문이 파싱 불가능하게 바뀌었으면 메타데이터의 원본 맵으로 복원
      const map = bodyMap ? enrich(bodyMap, meta) : meta.map;
      return { map, editor: meta.editor, source: 'easymindmap-md' };
    }
  }

  const map = parseMarkdownToMap(raw, fallbackTitle);
  if (!map) return null;
  return { map, source: 'plain-md' };
}

// ---------------------------------------------------------------------------
// ZIP 불러오기 — 내보낸 ZIP(맵.md/.html + files/…)을 통째로 받아
// 안의 맵 파일을 파싱하고, files/의 실제 파일을 첨부에 data URL로
// 재연결한다 (로컬 첨부의 blob: URL은 원 세션에서만 유효하므로).
// ---------------------------------------------------------------------------

import { parseZip } from '@/export/zip';
import { bytesToDataUrl } from '@/export/mapMeta';

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
      // 이미 살아있는 URL(data:/http)은 그대로 — blob:/빈 URL만 재연결
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
    map: { ...map, branches: map.branches.map((b) => walk(b)) as SampleBranch[] },
    relinked,
  };
}

export interface ImportedZipMap extends ImportedMap {
  relinked: number; // files/에서 data URL로 재연결한 첨부 수
}

export async function parseZipMapFile(bytes: Uint8Array): Promise<ImportedZipMap | null> {
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
    : parseMarkdownMapFile(text, mapEntry.path.replace(/\.(md|markdown|html?)$/i, ''));
  if (!inner) return null;

  const { map, relinked } = relinkAttachments(inner.map, entries);
  return { ...inner, map, relinked };
}
