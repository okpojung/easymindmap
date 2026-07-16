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

import type { LayoutType, SampleMap } from '@/editor/__samples__/types';
import type { LayoutSpacing } from '@/layout/LayoutEngine';

export const MAP_FILE_FORMAT = 'easymindmap-map';
export const MAP_FILE_VERSION = 1;
export const MD_META_RE = /<!--\s*easymindmap:v(\d+):([A-Za-z0-9+/=]+)\s*-->/;

export interface MapFileMeta {
  format: typeof MAP_FILE_FORMAT;
  version: number;
  generator: 'EasyMindMap';
  exportedAt: string;
  // 내보낼 당시의 에디터 상태 — 불러올 때 레이아웃·간격을 복원한다
  editor?: {
    layoutType?: LayoutType;
    spacingX?: number;
    spacingY?: number;
  };
  map: SampleMap;
}

export function buildMapMeta(
  map: SampleMap,
  layoutType?: LayoutType,
  spacing?: LayoutSpacing,
): MapFileMeta {
  return {
    format: MAP_FILE_FORMAT,
    version: MAP_FILE_VERSION,
    generator: 'EasyMindMap',
    exportedAt: new Date().toISOString(),
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
