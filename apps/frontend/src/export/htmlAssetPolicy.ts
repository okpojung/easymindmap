// Immutable, fail-closed asset preparation shared by plain/protected HTML export.
import { mapCenters, type MindNode, type SampleMap } from '@emm/model';
import { collectNoteHtmlImageSrcs, rewriteNotesImages } from '@emm/note-images';
import type { ProtectedResourceLoader } from './protectedMapAssets';
import type { ZipEntry } from './zip';

export type HtmlAssetPolicy = { mode: 'all' | 'selected' | 'none'; selectedIds?: string[] };
export const HTML_SELECTED_LIMIT = 20 * 1024 * 1024;
export const HTML_ALL_LIMIT = 40 * 1024 * 1024;
export const HTML_ASSET_LIMIT = 100 * 1024 * 1024;
const REFERENCE_LIMIT = 4096;
const NODE_LIMIT = 50000;
const MISSING = '첨부파일 또는 사진 원본을 가져오지 못했습니다. 원본을 확인한 뒤 다시 시도해 주세요. 내보내기를 중단했습니다.';
const TOTAL_LIMIT = '첨부파일과 사진 원본의 합계는 100MiB 이내여야 합니다.';
const MIME_RE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;
const released = new WeakSet<PreparedHtmlAssets>();

export interface HtmlAsset {
  id: string;
  name: string;
  kind: 'attachment' | 'image';
  mime: string;
  bytes: Uint8Array;
  source: string;
  references: number;
}
export interface PreparedHtmlAssets {
  map: SampleMap;
  assets: HtmlAsset[];
  attachmentCount: number;
  totalBytes: number;
}

function nodesOf(map: SampleMap): MindNode[] {
  if (!map || typeof map !== 'object' || !map.root || !Array.isArray(map.branches) ||
    (map.centers != null && !Array.isArray(map.centers))) throw new Error('지원하지 않는 맵 형식입니다.');
  const centers = mapCenters(map);
  const stack: MindNode[] = [];
  for (let i = centers.length - 1; i >= 0; i--) {
    const c = centers[i];
    if (!c || !c.root || !Array.isArray(c.branches)) throw new Error('지원하지 않는 맵 형식입니다.');
    if (stack.length + c.branches.length + 1 > NODE_LIMIT) throw new Error('한 번에 처리할 수 있는 노드 수 50000개를 넘었습니다. 맵을 나누어 주세요.');
    for (let j = c.branches.length - 1; j >= 0; j--) stack.push(c.branches[j]);
    stack.push(c.root as MindNode);
  }
  const out: MindNode[] = [];
  while (stack.length) {
    const n = stack.pop()!;
    if (!n || typeof n !== 'object' || (n.children != null && !Array.isArray(n.children)) ||
      (n.attachments != null && !Array.isArray(n.attachments)) ||
      (n.images != null && !Array.isArray(n.images)) ||
      (n.notes != null && !Array.isArray(n.notes))) throw new Error('지원하지 않는 맵 노드 형식입니다.');
    out.push(n);
    if (out.length > NODE_LIMIT) throw new Error('한 번에 처리할 수 있는 노드 수 50000개를 넘었습니다. 맵을 나누어 주세요.');
    if (out.length + stack.length + (n.children?.length ?? 0) > NODE_LIMIT) throw new Error('한 번에 처리할 수 있는 노드 수 50000개를 넘었습니다. 맵을 나누어 주세요.');
    for (let i = (n.children?.length ?? 0) - 1; i >= 0; i--) stack.push(n.children![i]);
  }
  return out;
}

function validateSource(source: unknown): asserts source is string {
  if (typeof source !== 'string' || !/^(data:|blob:|https?:\/\/)/i.test(source)) throw new Error(MISSING);
  // Native data/blob URLs need no URL object (which would copy huge data URIs).
  if (/^data:/i.test(source)) { if (source.indexOf(',') < 0) throw new Error(MISSING); return; }
  if (/^blob:/i.test(source)) { if (source.length <= 5) throw new Error(MISSING); return; }
  if (source.length > 65536) throw new Error(MISSING);
  try {
    const url = new URL(source);
    if (!['data:', 'blob:', 'http:', 'https:'].includes(url.protocol) ||
      ((url.protocol === 'http:' || url.protocol === 'https:') && !url.hostname)) throw new Error();
  } catch { throw new Error(MISSING); }
}

function normalizedMime(value: unknown): string {
  if (typeof value !== 'string') throw new Error(MISSING);
  const mime = value.split(';', 1)[0].trim().toLowerCase();
  if (!MIME_RE.test(mime)) throw new Error(MISSING);
  return mime;
}

function imageExtension(mime: string): string {
  const known: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif',
    'image/bmp': 'bmp', 'image/tiff': 'tiff', 'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico', 'image/heic': 'heic', 'image/heif': 'heif',
  };
  return known[mime] ?? 'bin';
}

function safeFilename(value: string): string {
  const clean = String(value || '').normalize('NFC').trim()
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\\/:*?"<>|#%&+;=]+/g, '-')
    .replace(/^[. ]+|[. ]+$/g, '');
  return Array.from(clean).slice(0, 60).join('').replace(/[. ]+$/g, '') || 'original.bin';
}

function dataUrl(asset: HtmlAsset): string {
  const parts: string[] = [];
  for (let i = 0; i < asset.bytes.length; i += 0x6000) {
    parts.push(String.fromCharCode(...asset.bytes.subarray(i, i + 0x6000)));
  }
  return `data:${asset.mime};base64,${btoa(parts.join(''))}`;
}

export async function prepareHtmlAssets(
  map0: SampleMap,
  load: ProtectedResourceLoader,
  onProgress?: (done: number, total: number) => void,
): Promise<PreparedHtmlAssets> {
  // Snapshot before the first await; edits/collaboration cannot alter this export.
  const map = structuredClone(map0);
  const nodes = nodesOf(map);
  interface Pending { source: string; name?: string; imageNumber: number; references: number }
  const bySource = new Map<string, Pending>();
  const attachmentSources = new Map<string, string>();
  let attachmentCount = 0, references = 0, imageNumber = 0;
  const register = (source: unknown, name?: string): Pending => {
    validateSource(source);
    let item = bySource.get(source);
    if (!item) {
      if (bySource.size >= REFERENCE_LIMIT - 1) throw new Error('분리 보관할 수 있는 원본은 최대 4095종류입니다. 맵을 나누어 주세요.');
      item = { source, name, imageNumber: name === undefined ? ++imageNumber : 0, references: 0 };
      bySource.set(source, item);
    } else if (name !== undefined && item.name === undefined) item.name = name;
    return item;
  };
  const need = (source: unknown, name?: string): void => {
    references += 1;
    if (references > REFERENCE_LIMIT) throw new Error('첨부파일과 사진 참조가 너무 많습니다. 최대 4096개입니다.');
    register(source, name).references += 1;
  };
  for (const n of nodes) {
    for (const a of n.attachments ?? []) {
      if (!a || typeof a.id !== 'string' || !a.id || typeof a.name !== 'string') throw new Error('첨부파일 식별자 또는 이름이 잘못되었습니다.');
      validateSource(a.url);
      const existing = attachmentSources.get(a.id);
      if (existing !== undefined && existing !== a.url) throw new Error('동일한 첨부파일 식별자가 서로 다른 원본을 가리킵니다.');
      attachmentSources.set(a.id, a.url);
      need(a.url, a.name.trim() || `첨부-${attachmentCount + 1}.bin`);
      attachmentCount += 1;
    }
    if (n.image) need(n.image.src);
    for (const im of n.images ?? []) { if (!im) throw new Error(MISSING); need(im.src); }
    for (const note of n.notes ?? []) {
      if (!note || (note.html !== undefined && typeof note.html !== 'string')) throw new Error('노트 사진 형식이 잘못되었습니다.');
      for (const source of collectNoteHtmlImageSrcs(note.html)) register(source);
    }
    // The collector deduplicates src inside one note. Count actual occurrences,
    // including repeated and empty src attributes, without modifying the HTML.
    rewriteNotesImages(n.notes, source => { need(source); return undefined; });
  }
  const assets: HtmlAsset[] = [];
  let totalBytes = 0;
  try {
    onProgress?.(0, bySource.size);
    for (const item of bySource.values()) {
      // Bound native base64 data URLs before fetch can eagerly decode them.
      if (/^data:/i.test(item.source)) {
        const comma = item.source.indexOf(',');
        if (/;base64$/i.test(item.source.slice(0, comma))) {
          const length = item.source.length - comma - 1;
          const padding = item.source.endsWith('==') ? 2 : item.source.endsWith('=') ? 1 : 0;
          const decodedUpperBound = Math.ceil(length * 3 / 4) - padding;
          if (decodedUpperBound > HTML_ASSET_LIMIT - totalBytes) throw new Error(TOTAL_LIMIT);
        }
      }
      let resource: Awaited<ReturnType<ProtectedResourceLoader>>;
      try { resource = await load(item.source, HTML_ASSET_LIMIT - totalBytes); }
      catch (e) {
        if (e instanceof Error && e.message === 'PROTECTED_ASSET_LIMIT') throw new Error(TOTAL_LIMIT);
        throw new Error(MISSING);
      }
      if (!(resource?.bytes instanceof Uint8Array)) throw new Error(MISSING);
      if (resource.bytes.byteLength > HTML_ASSET_LIMIT - totalBytes || resource.bytes.length > HTML_ASSET_LIMIT - totalBytes) throw new Error(TOTAL_LIMIT);
      if (resource.bytes.byteLength !== resource.bytes.length) throw new Error(MISSING);
      const mime = normalizedMime(resource.mime);
      // Own the bytes: release never overwrites a loader cache or original buffer.
      const bytes = new Uint8Array(resource.bytes);
      totalBytes += bytes.byteLength;
      assets.push({
        id: `asset-${assets.length + 1}`,
        name: item.name ?? `사진-${item.imageNumber}.${imageExtension(mime)}`,
        kind: item.name === undefined ? 'image' : 'attachment',
        mime, bytes, source: item.source, references: item.references,
      });
      onProgress?.(assets.length, bySource.size);
    }
    return { map, assets, attachmentCount, totalBytes };
  } catch (e) {
    for (const a of assets) a.bytes.fill(0);
    throw e;
  }
}

function checkedAssets(prepared: PreparedHtmlAssets): Map<string, HtmlAsset> {
  if (!prepared || released.has(prepared) || !Array.isArray(prepared.assets)) throw new Error('내보내기 준비 자료가 해제되었거나 잘못되었습니다.');
  const index = new Map<string, HtmlAsset>();
  const sources = new Set<string>();
  let bytes = 0;
  if (prepared.assets.length > REFERENCE_LIMIT - 1) throw new Error('분리 보관할 수 있는 원본은 최대 4095종류입니다.');
  for (const a of prepared.assets) {
    if (!a || typeof a.id !== 'string' || !/^asset-[1-9]\d*$/.test(a.id) || index.has(a.id) ||
      sources.has(a.source) || !(a.bytes instanceof Uint8Array) || typeof a.name !== 'string' ||
      (a.kind !== 'attachment' && a.kind !== 'image') || !Number.isSafeInteger(a.references) || a.references < 1) throw new Error('내보내기 자산 자료가 잘못되었습니다.');
    validateSource(a.source);
    if (normalizedMime(a.mime) !== a.mime || a.bytes.length !== a.bytes.byteLength) throw new Error('내보내기 자산 자료가 잘못되었습니다.');
    bytes += a.bytes.byteLength;
    if (bytes > HTML_ASSET_LIMIT) throw new Error(TOTAL_LIMIT);
    index.set(a.id, a); sources.add(a.source);
  }
  if (bytes !== prepared.totalBytes) throw new Error('내보내기 자산 크기가 준비 이후 변경되었습니다.');
  return index;
}

export function defaultSelectedHtmlAssets(prepared: PreparedHtmlAssets): string[] {
  checkedAssets(prepared);
  const selected: string[] = [];
  let bytes = 0;
  for (const a of prepared.assets) {
    if (a.bytes.byteLength <= HTML_SELECTED_LIMIT - bytes) { selected.push(a.id); bytes += a.bytes.byteLength; }
  }
  return selected;
}

export function layoutHtmlAssets(prepared: PreparedHtmlAssets, policy: HtmlAssetPolicy): {
  map: SampleMap; hrefById: Map<string, string>; files: ZipEntry[]; embedded: number; embeddedBytes: number;
} {
  const index = checkedAssets(prepared);
  if (!policy || typeof policy !== 'object' || Array.isArray(policy) ||
    !['all', 'selected', 'none'].includes(policy.mode) ||
    Object.keys(policy).some(key => key !== 'mode' && key !== 'selectedIds') ||
    (policy.mode !== 'selected' && policy.selectedIds !== undefined)) throw new Error('첨부파일 포함 정책이 잘못되었습니다.');
  let ids: string[];
  if (policy.mode === 'all') ids = [...index.keys()];
  else if (policy.mode === 'none') ids = [];
  else {
    if (policy.selectedIds !== undefined && !Array.isArray(policy.selectedIds)) throw new Error('첨부파일 선택 목록이 잘못되었습니다.');
    ids = policy.selectedIds ?? defaultSelectedHtmlAssets(prepared);
  }
  const selected = new Set<string>();
  let embeddedBytes = 0;
  for (const id of ids) {
    if (typeof id !== 'string' || selected.has(id) || !index.has(id)) throw new Error('선택 목록에 중복되거나 알 수 없는 자산이 있습니다.');
    selected.add(id); embeddedBytes += index.get(id)!.bytes.byteLength;
  }
  if (policy.mode === 'all' && embeddedBytes > HTML_ALL_LIMIT) throw new Error('전체 포함은 원본 합계 40MiB 이내에서 사용할 수 있습니다. 20MiB 선택 또는 HTML 미포함을 선택해 주세요.');
  if (policy.mode === 'selected' && embeddedBytes > HTML_SELECTED_LIMIT) throw new Error('선택한 첨부파일과 사진의 합계가 20MiB를 넘었습니다. 선택을 줄여 주세요.');
  const resolved = new Map<string, string>();
  const files: ZipEntry[] = [];
  for (const a of prepared.assets) {
    if (selected.has(a.id)) resolved.set(a.source, dataUrl(a));
    else {
      const path = `files/${a.id}-${safeFilename(a.name)}`;
      resolved.set(a.source, path);
      files.push({ path, data: a.bytes });
    }
  }
  const map = structuredClone(prepared.map);
  const hrefById = new Map<string, string>();
  const resolve = (source: unknown): string => {
    if (typeof source !== 'string') throw new Error(MISSING);
    const value = resolved.get(source);
    if (value === undefined) throw new Error('내보내기 준비 이후 원본 참조가 변경되었습니다. 다시 준비해 주세요.');
    return value;
  };
  for (const n of nodesOf(map)) {
    for (const a of n.attachments ?? []) {
      const next = resolve(a.url);
      const existing = hrefById.get(a.id);
      if (existing !== undefined && existing !== next) throw new Error('중복 첨부파일 식별자의 원본이 다릅니다.');
      a.url = next; hrefById.set(a.id, next);
    }
    if (n.image) n.image.src = resolve(n.image.src);
    for (const im of n.images ?? []) im.src = resolve(im.src);
    n.notes = rewriteNotesImages(n.notes, source => resolve(source));
  }
  return { map, hrefById, files, embedded: selected.size, embeddedBytes };
}

/** Call only after ZIP/Blob consumers have copied the layout's file buffers. */
export function releaseHtmlAssets(prepared: PreparedHtmlAssets): void {
  if (!prepared || released.has(prepared)) return;
  for (const a of prepared.assets) a.bytes.fill(0);
  released.add(prepared);
}

/** A standalone HTML cannot restore originals kept in its sibling files/. */
export function hasSeparatedHtmlAssets(map: SampleMap): boolean {
  const separate = (src: string | undefined) => typeof src === 'string' && /^(?:\.\/)?files\//.test(src);
  for (const node of nodesOf(map)) {
    if ((node.attachments ?? []).some(a => separate(a.url))) return true;
    if (node.image && separate(node.image.src)) return true;
    if ((node.images ?? []).some(image => separate(image.src))) return true;
    for (const note of node.notes ?? []) if ([...collectNoteHtmlImageSrcs(note.html)].some(separate)) return true;
  }
  return false;
}
