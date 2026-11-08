// Strict, immutable asset snapshot for protected export. A missing resource is
// an error, never an external-link/ZIP/plaintext fallback.
import { mapCenters, type MindNode, type SampleMap } from '@emm/model';
import { collectNoteHtmlImageSrcs, rewriteNotesImages } from '@emm/note-images';

export const PROTECTED_ASSET_LIMIT = 20 * 1024 * 1024;
export const PROTECTED_RESOURCE_LIMIT = 4096;
export interface ProtectedResource { bytes: Uint8Array; mime: string }
export type ProtectedResourceLoader = (src: string, remainingBytes: number) => Promise<ProtectedResource>;
const MISSING = '첨부파일 또는 사진 원본을 가져오지 못했습니다. 파일을 다시 첨부한 뒤 시도해 주세요. 안전을 위해 암호화 내보내기를 중단했습니다.';

function protectedNodes(map: SampleMap): MindNode[] {
  const nodes: MindNode[] = [];
  const stack: MindNode[] = [];
  for (const center of mapCenters(map)) { stack.push(center.root as MindNode); for (const branch of center.branches) stack.push(branch); }
  while (stack.length) {
    const node = stack.pop()!;
    if (!node || typeof node !== 'object' || (node.children != null && !Array.isArray(node.children))) throw new Error('지원하지 않는 보호된 맵입니다.');
    nodes.push(node);
    if (nodes.length > 50000) throw new Error('한 번에 처리할 수 있는 노드 수를 넘었습니다. 맵을 나누어 주세요.');
    for (const child of node.children ?? []) stack.push(child);
  }
  return nodes;
}

/** Validate decoded assets before the normal importer accepts a protected map. */
export function validateProtectedMapImport(map: SampleMap): void {
  const nodes = protectedNodes(map), resources = new Set<string>();
  let references = 0, total = 0;
  const check = (src: string | undefined): void => {
    references += 1;
    if (references > PROTECTED_RESOURCE_LIMIT || typeof src !== 'string') throw new Error('보호된 첨부파일의 수 또는 형식이 잘못되었습니다.');
    if (resources.has(src)) return;
    resources.add(src);
    const match = /^data:([a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(src);
    if (!match || match[2].length % 4 !== 0 || match[2].length > Math.ceil(PROTECTED_ASSET_LIMIT / 3) * 4) throw new Error('보호된 첨부파일의 형식이 잘못되었습니다.');
    let raw: string;
    try { raw = atob(match[2]); } catch { throw new Error('보호된 첨부파일의 형식이 잘못되었습니다.'); }
    if (btoa(raw) !== match[2]) throw new Error('보호된 첨부파일의 형식이 잘못되었습니다.');
    total += raw.length;
    if (total > PROTECTED_ASSET_LIMIT) throw new Error('보호된 첨부파일의 합계가 20MB를 넘었습니다.');
  };
  for (const node of nodes) {
    for (const attachment of node.attachments ?? []) check(attachment.url);
    if (node.image) check(node.image.src);
    for (const image of node.images ?? []) check(image.src);
    for (const note of node.notes ?? []) for (const src of collectNoteHtmlImageSrcs(note.html)) check(src);
  }
}

export async function inlineProtectedMapAssets(map0: SampleMap, load: ProtectedResourceLoader): Promise<{ map: SampleMap; attachments: number; assetBytes: number }> {
  const map = structuredClone(map0);
  const nodes = protectedNodes(map);
  const urls = new Set<string>();
  let attachments = 0, references = 0;
  const need = (src: string | undefined): void => {
    if (!src || !/^(data:|blob:|https?:\/\/)/i.test(src)) throw new Error(MISSING);
    urls.add(src); references += 1;
    if (references > PROTECTED_RESOURCE_LIMIT) throw new Error('첨부파일과 사진이 너무 많습니다. 맵을 나누어 주세요.');
  };
  for (const n of nodes) {
    for (const a of n.attachments ?? []) { need(a.url); attachments += 1; }
    if (n.image) need(n.image.src);
    for (const image of n.images ?? []) need(image.src);
    for (const note of n.notes ?? []) for (const src of collectNoteHtmlImageSrcs(note.html)) need(src);
  }
  const resolved = new Map<string, string>();
  let assetBytes = 0;
  for (const src of urls) {
    let resource: ProtectedResource;
    try { resource = await load(src, PROTECTED_ASSET_LIMIT - assetBytes); }
    catch (e) {
      if (e instanceof Error && e.message === 'PROTECTED_ASSET_LIMIT') throw new Error('첨부파일과 사진의 원본 합계는 20MB 이내여야 합니다. 큰 파일은 제외하거나 맵을 나누어 주세요.');
      throw new Error(MISSING);
    }
    if (!(resource?.bytes instanceof Uint8Array) || resource.bytes.length > PROTECTED_ASSET_LIMIT - assetBytes) throw new Error('첨부파일과 사진의 원본 합계는 20MB 이내여야 합니다. 큰 파일은 제외하거나 맵을 나누어 주세요.');
    assetBytes += resource.bytes.length;
    const mime = (resource.mime || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime)) throw new Error(MISSING);
    const pieces: string[] = [];
    for (let i = 0; i < resource.bytes.length; i += 0x6000) pieces.push(String.fromCharCode(...resource.bytes.subarray(i, i + 0x6000)));
    resolved.set(src, `data:${mime};base64,${btoa(pieces.join(''))}`);
  }
  for (const n of nodes) {
    for (const a of n.attachments ?? []) {
      const src = resolved.get(a.url!);
      if (!src) throw new Error(MISSING);
      a.url = src;
    }
    if (n.image) n.image.src = resolved.get(n.image.src)!;
    for (const image of n.images ?? []) image.src = resolved.get(image.src)!;
    n.notes = rewriteNotesImages(n.notes, src => resolved.get(src));
  }
  return { map, attachments, assetBytes };
}
