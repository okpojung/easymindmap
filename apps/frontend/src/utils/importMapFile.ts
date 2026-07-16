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
    const meta = decodeMetaBase64(metaMatch[2]);
    if (meta) {
      const body = raw.replace(MD_META_RE, '');
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
