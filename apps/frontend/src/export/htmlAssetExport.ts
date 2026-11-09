import type { LayoutType, SampleMap } from '@/editor/__samples__/types';
import type { LayoutSpacing } from '@/layout/LayoutEngine';
import { attachmentFetchUrl, serverAttachmentId } from '@/services/cloud/apiClient';
import { prepareCodeRenders } from '@/editor/node-renderer/codeRender';
import { buildStandaloneHtml, type ExportPackage } from './exportHtml';
import { encryptStandaloneHtml } from './encryptedHtml';
import { enableProtectedAttachmentOpening } from './encryptedMap';
import type { ProtectedResource } from './protectedMapAssets';
import type { AttachmentBytesFetcher } from './serverImages';
import { layoutHtmlAssets, defaultSelectedHtmlAssets, HTML_ASSET_LIMIT, type HtmlAssetPolicy, type PreparedHtmlAssets } from './htmlAssetPolicy';
import { buildProtectedArchiveViewer, encryptProtectedArchive } from './protectedArchive';
import { buildZip, type ZipEntry } from './zip';

/** Bounded fetch shared by the ordinary and protected export dialogs. */
export async function loadHtmlExportResource(
  src: string, remaining: number, signal?: AbortSignal, fetchBytes?: AttachmentBytesFetcher,
): Promise<ProtectedResource> {
  if (signal?.aborted) throw new Error('내보내기가 취소되었습니다.');
  const serverId = serverAttachmentId(src);
  if (serverId && fetchBytes) {
    const got = await fetchBytes(serverId);
    if (!got || got.bytes.length > remaining) throw new Error('첨부 원본이 없거나 원본 합계가 100MiB 한도를 넘었습니다.');
    return got;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = globalThis.setTimeout(abort, 30000);
  try {
    const response = await fetch(await attachmentFetchUrl(src), {
      signal: controller.signal, credentials: 'same-origin', cache: 'no-store',
    });
    if (!response.ok || !response.body) throw new Error('RESOURCE_UNAVAILABLE');
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > remaining) throw new Error('PROTECTED_ASSET_LIMIT');
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > remaining) { await reader.cancel(); throw new Error('PROTECTED_ASSET_LIMIT'); }
        parts.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return { bytes, mime: response.headers.get('content-type') || 'application/octet-stream' };
  } catch (error) {
    if (signal?.aborted) throw new Error('내보내기가 취소되었습니다.');
    if (error instanceof Error && error.message === 'PROTECTED_ASSET_LIMIT') {
      throw new Error('첨부·사진 원본 합계는 100MiB 이내여야 합니다.');
    }
    throw new Error('첨부·사진 원본을 가져오지 못했습니다. 원본과 연결 상태를 확인해 주세요.');
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export interface HtmlExportView {
  layoutType?: LayoutType;
  spacing?: LayoutSpacing;
  dark?: boolean;
}

function fileStem(title: string): string {
  const clean = String(title || '').normalize('NFC').trim().replace(/[\\/:*?"<>|#%&\x00-\x1f\x7f]+/g, '-').replace(/^[. ]+|[. ]+$/g, '');
  const name = Array.from(clean).slice(0, 60).join('') || 'mindmap';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? 'map-' + name : name;
}

/** Pure preparation never mutates the active map or drops an unavailable file. */
export async function buildPreparedHtmlExport(
  prepared: PreparedHtmlAssets, policy: HtmlAssetPolicy, view: HtmlExportView,
  password?: string,
): Promise<ExportPackage> {
  if (prepared.totalBytes > HTML_ASSET_LIMIT) throw new Error('첨부·사진 원본 합계는 100MiB 이내여야 합니다.');
  // Prevent a small resource referenced thousands of times from expanding into
  // an unbounded restoration JSON. Splitting keeps one binary per resource.
  const selected = new Set(policy.selectedIds ?? []);
  let expandedInlineBytes = 0;
  if (policy.mode === 'selected' && policy.selectedIds == null) {
    for (const id of defaultSelectedHtmlAssets(prepared)) selected.add(id);
  }
  for (const asset of prepared.assets) {
    if (policy.mode === 'all' || (policy.mode === 'selected' && selected.has(asset.id))) {
      expandedInlineBytes += asset.bytes.length * asset.references;
    }
  }
  if (expandedInlineBytes > 40 * 1024 * 1024) {
    throw new Error('같은 원본의 반복 사용으로 HTML 용량 한도를 넘습니다. 일부를 선택하거나 HTML에 포함하지 않는 옵션을 사용해 주세요.');
  }
  const plan = layoutHtmlAssets(prepared, policy);
  await prepareCodeRenders(plan.map);
  const html = buildStandaloneHtml(
    plan.map, view.layoutType, id => plan.hrefById.get(id), view.spacing, plan.map, view.dark,
  );
  const htmlBytes = new TextEncoder().encode(html);
  if (htmlBytes.length > 64 * 1024 * 1024) throw new Error('HTML 본문은 최대 64MiB입니다. 첨부를 분리하거나 맵을 나누어 주세요.');
  const title = fileStem(plan.map.title);
  const entries: ZipEntry[] = [{ path: `${title}.html`, data: htmlBytes }, ...plan.files];
  if (password !== undefined) {
    if (plan.files.length === 0) {
      try {
        const locked = await encryptStandaloneHtml(enableProtectedAttachmentOpening(html), password, 'map');
        return { fileName: '보호된-맵.html', blob: new Blob([locked], { type: 'text/html;charset=utf-8' }), packaged: prepared.attachmentCount, external: 0 };
      } finally { htmlBytes.fill(0); }
    }
    let inner: Uint8Array | undefined;
    try {
      inner = buildZip(entries);
      const encrypted = await encryptProtectedArchive(inner, password);
      const outer = buildZip([
        { path: 'viewer.html', data: new TextEncoder().encode(buildProtectedArchiveViewer()) },
        { path: 'files/content.emmenc', data: encrypted },
      ]);
      return { fileName: '보호된-맵.zip', blob: new Blob([outer as BlobPart], { type: 'application/zip' }), packaged: prepared.attachmentCount, external: 0 };
    } finally { inner?.fill(0); htmlBytes.fill(0); }
  }
  if (plan.files.length === 0) {
    return { fileName: `${title}.html`, blob: new Blob([htmlBytes as BlobPart], { type: 'text/html;charset=utf-8' }), packaged: prepared.attachmentCount, external: 0 };
  }
  return {
    fileName: `${title}.zip`,
    blob: new Blob([buildZip(entries) as BlobPart], { type: 'application/zip' }),
    packaged: prepared.attachmentCount, external: 0,
  };
}

export async function downloadPreparedHtmlExport(
  prepared: PreparedHtmlAssets, policy: HtmlAssetPolicy, view: HtmlExportView, password?: string,
): Promise<ExportPackage> {
  const pkg = await buildPreparedHtmlExport(prepared, policy, view, password);
  const href = URL.createObjectURL(pkg.blob);
  const anchor = document.createElement('a');
  anchor.href = href; anchor.download = pkg.fileName;
  document.body.append(anchor); anchor.click(); anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(href), 60000);
  return pkg;
}
