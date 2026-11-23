import { hasLocalScheme, notifyLocalAttachmentError, readLocalAttachment } from './localAttachments';
import { captureAuthIdentity, isAuthIdentityCurrent } from '@/stores/authStore';
// Explicit download is separate from openAttachment: PDF, text and MD must
// download, not open a viewer/editor. Resolve server authorization at click time;
// never persist the resolved URL or use it as a filename/error message.
export interface AttachmentDownloadOptions {
  resolveUrl: (url: string) => Promise<string>;
  signal?: AbortSignal;
}

export function attachmentDownloadName(name: string): string {
  const base = name.split(/[\\/]/).pop()?.trim().replace(/[\x00-\x1f\x7f:*?"<>|]/g, '_');
  return base && !/^\.+$/.test(base) ? base : 'attachment';
}

function allowedUrl(url: string): boolean {
  return /^(data:|blob:|https?:\/\/|\/(?!\/))/i.test(url);
}

/** Resolves only after handing the original bytes to the browser download UI. */
export async function downloadAttachment(
  name: string, url: string | undefined, { resolveUrl, signal }: AttachmentDownloadOptions,
): Promise<void> {
  let objectUrl: string | undefined;
  let anchor: HTMLAnchorElement | undefined;
  try {
    signal?.throwIfAborted();
    let blob: Blob;
    if (hasLocalScheme(url)) {
      const id = captureAuthIdentity();
      try {
        blob = await readLocalAttachment(url!);
        if (!isAuthIdentityCurrent(id)) throw new Error('SESSION_CHANGED');
      } catch (err) {
        if (!signal?.aborted && isAuthIdentityCurrent(id)) notifyLocalAttachmentError(err,url!,()=>{void downloadAttachment(name,url,{resolveUrl,signal}).catch(()=>{});});
        throw err;
      }
    } else {
      if (!url || !allowedUrl(url)) throw new Error('ATTACHMENT_DOWNLOAD_FAILED');
      const resolved = await resolveUrl(url);
      signal?.throwIfAborted();
      if (!allowedUrl(resolved)) throw new Error('ATTACHMENT_DOWNLOAD_FAILED');
      const response = await fetch(resolved, {signal, credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer'});
      if (!response.ok) throw new Error('ATTACHMENT_DOWNLOAD_FAILED');
      blob = await response.blob();
    }
    signal?.throwIfAborted();
    objectUrl = URL.createObjectURL(blob);
    anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = attachmentDownloadName(name);
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Keep the Blob alive until the browser has acquired it, then release it.
    const acquiredUrl = objectUrl;
    window.setTimeout(() => URL.revokeObjectURL(acquiredUrl), 60_000);
  } catch {
    anchor?.remove();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (signal?.aborted) throw new DOMException('Download cancelled', 'AbortError');
    // A fetch error may contain a tokenized URL. Only expose a fixed error.
    throw new Error('ATTACHMENT_DOWNLOAD_FAILED');
  }
}
