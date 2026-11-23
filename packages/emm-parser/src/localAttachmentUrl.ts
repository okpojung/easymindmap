// Portable map references only. This module has no browser or storage dependencies.
export const localScheme = 'emm-local://';
export const validLocalRootId = (id: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export const validLocalSegment = (s: string): boolean => s.length > 0 && s !== '.' && s !== '..' &&
  !/[\\/:\x00-\x1f\x7f]|%[a-f\d]{2}/i.test(s);

/** Never use new URL() here: it normalizes dot segments before validation. */
export function parseLocalAttachmentUrl(url?: string): {root: string; path: string[]} | undefined {
  if (typeof url !== 'string' || url.length > 65536 || !url.startsWith(localScheme)) return;
  const [root, ...parts] = url.slice(localScheme.length).split('/');
  if (!validLocalRootId(root) || !parts.length) return;
  try {
    const path = parts.map(decodeURIComponent);
    if (path.every((p,i) => validLocalSegment(p) && encodeURIComponent(p) === parts[i])) {
      return {root: root.toLowerCase(), path};
    }
  } catch { /* Invalid percent escape. */ }
}
export const localRootId = (url?: string): string | undefined => parseLocalAttachmentUrl(url)?.root;
export const isLocalAttachmentUrl = (url?: string): boolean => !!localRootId(url);
// Broad detector for navigation/network sinks. Never fall through to the OS
// handler even when a malformed candidate does not pass the strict parser.
export const hasLocalScheme = (url?: string): boolean => typeof url === 'string' && /^emm-local:/i.test(url.replace(/[\t\n\r]/g,'').replace(/^[\x00-\x20]+/,''));
