import type { LayoutType, SampleMap } from '@/editor/__samples__/types';
import type { LayoutSpacing } from '@/layout/LayoutEngine';
import { attachmentFetchUrl } from '@/services/cloud/apiClient';
import { prepareCodeRenders } from '@/editor/node-renderer/codeRender';
import { buildStandaloneHtml, type ExportPackage } from './exportHtml';
import { encryptStandaloneHtml, passwordValidationError } from './encryptedHtml';
import { inlineProtectedMapAssets, type ProtectedResource } from './protectedMapAssets';

async function loadResource(src: string, remainingBytes: number): Promise<ProtectedResource> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(await attachmentFetchUrl(src), { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error('RESOURCE_UNAVAILABLE');
    const length = Number(res.headers.get('content-length'));
    if (Number.isFinite(length) && length > remainingBytes) throw new Error('PROTECTED_ASSET_LIMIT');
    if (!res.body) throw new Error('RESOURCE_UNAVAILABLE');
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > remainingBytes) { await reader.cancel(); throw new Error('PROTECTED_ASSET_LIMIT'); }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { bytes, mime: res.headers.get('content-type') || 'application/octet-stream' };
  } finally { window.clearTimeout(timeout); }
}

// The native viewer normally opens href directly. Chromium blocks top-level
// data: navigation. Make ephemeral Blob URLs *inside the decrypted sandbox*,
// before the viewer boots. Restoration JSON retains the original data bytes.
export function enableProtectedAttachmentOpening(html: string): string {
  const anchor = '<script>window.__MM_L__ = ';
  if (!html.includes(anchor)) throw new Error('보호된 뷰어를 만들지 못했습니다.');
  const patch = `<script>(function(){function walk(n){if(!n)return;(n.attachments||[]).forEach(function(a){if(!a.href||a.href.indexOf('data:')!==0)return;var m=/^data:([^;,]*);base64,([A-Za-z0-9+/=]*)$/.exec(a.href);if(!m)throw new Error('Invalid protected attachment');var b=atob(m[2]),v=new Uint8Array(b.length);for(var i=0;i<b.length;i++)v[i]=b.charCodeAt(i);a.href=URL.createObjectURL(new Blob([v],{type:(m[1]||'application/octet-stream')+(/^text\\//i.test(m[1])?';charset=utf-8':'')}));a.external=false;});(n.children||[]).forEach(walk);}walk(window.__MINDMAP__.root);(window.__MINDMAP__.centers||[]).forEach(walk);})();<\/script>\n`;
  return html.replace(anchor, patch + anchor);
}

export async function buildEncryptedMapPackage(
  map: SampleMap, password: string, mapLayoutType?: LayoutType,
  spacing?: LayoutSpacing, dark?: boolean,
): Promise<ExportPackage> {
  const invalid = passwordValidationError(password);
  if (invalid) throw new Error(invalid);
  const snapshot = await inlineProtectedMapAssets(map, loadResource);
  await prepareCodeRenders(snapshot.map);
  const html = enableProtectedAttachmentOpening(buildStandaloneHtml(snapshot.map, mapLayoutType, undefined, spacing, snapshot.map, dark));
  const locked = await encryptStandaloneHtml(html, password, 'map');
  return { fileName: '보호된-맵.html', blob: new Blob([locked], { type: 'text/html;charset=utf-8' }), packaged: snapshot.attachments, external: 0 };
}

export async function downloadMapAsEncryptedHtml(
  map: SampleMap, password: string, mapLayoutType?: LayoutType,
  spacing?: LayoutSpacing, dark?: boolean,
): Promise<ExportPackage> {
  const pkg = await buildEncryptedMapPackage(map, password, mapLayoutType, spacing, dark);
  const url = URL.createObjectURL(pkg.blob);
  const link = document.createElement('a');
  link.href = url; link.download = pkg.fileName;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return pkg;
}
