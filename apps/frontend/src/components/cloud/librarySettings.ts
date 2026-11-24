import type { cloudApi, PublishStatus } from '@/services/cloud/apiClient';

type Api = Pick<typeof cloudApi, 'publishStatus' | 'publishMap' | 'setMapListed' | 'setPublishMeta'>;
export interface LibraryDraft { description: string; tags: string; commentsEnabled: boolean; listed: boolean }
export const libraryDraft = (s: PublishStatus): LibraryDraft => ({
  description: s.description ?? '', tags: (s.tags ?? []).join(', '), commentsEnabled: !!s.commentsEnabled, listed: !!s.listed,
});
export function libraryUnavailable(s: PublishStatus): string | null {
  if (!s.available) return 'publish.unavailable';
  if (s.canManageLibrary === false) return 'publish.library.ownerOnly';
  if (s.canManageLibrary !== true) return 'publish.library.unsupported';
  if (s.dashboard || s.publishable !== true) return 'publish.library.ineligible';
  if (!s.canSetMeta || !s.canSetListed || (s.publishId && typeof s.listed !== 'boolean')) return 'publish.library.unsupported';
  if (!s.publishId && !s.canSetVisibility) return 'publish.library.noPrivate';
  return null;
}
export function libraryMeta(d: LibraryDraft) {
  if (d.description.length > 500) throw new Error('publish.library.descriptionLimit');
  // Match the server's NFC and character policy, but reject overflow rather than silently truncating.
  const tags = [...new Set(d.tags.split(/[,，、\n]/u).map(x => x.trim().normalize('NFC').replace(/^#+/, '').toLowerCase()
    .replace(/[^\p{L}\p{N} _\-.+]/gu, ' ').replace(/\s+/gu, ' ').trim()).filter(Boolean))];
  if (tags.length > 10 || tags.some(tag => tag.length > 30)) throw new Error('publish.library.tagLimit');
  return { description: d.description.trim() || null, tags, commentsEnabled: d.commentsEnabled };
}
export type SaveStep = 'registered' | 'unlisted' | 'metadata' | 'listed';
export class LibrarySaveError extends Error {
  constructor(readonly cause: unknown, readonly completed: SaveStep[], readonly actual: PublishStatus | null, readonly confirmed: PublishStatus | null) {
    super(cause instanceof Error ? cause.message : 'publish.err.request');
  }
}
export class LibraryTargetChanged extends Error {}
// Returned mutation responses can omit eligibility and metadata. Only publishStatus is a complete snapshot.
export async function saveLibrarySettings(api: Api, mapId: string, baseline: PublishStatus, d: LibraryDraft,
  current: () => boolean, busy: { current: boolean }) {
  if (busy.current) return null;
  const check = () => { if (!current()) throw new LibraryTargetChanged(); };
  const checked = async <T>(work: () => Promise<T>) => { check(); const value = await work(); check(); return value; };
  const completed: SaveStep[] = [];
  let confirmed: PublishStatus | null = null;
  busy.current = true;
  try {
    check();
    const meta = libraryMeta(d);
    const before = await checked(() => api.publishStatus(mapId));
    confirmed = before;
    const reason = libraryUnavailable(before);
    if (reason) throw new Error(reason);
    // If another tab changed the registration, pricing, metadata or listing, require review before writing.
    if (before.publishId !== baseline.publishId || before.visibility !== baseline.visibility || before.priceKrw !== baseline.priceKrw ||
      JSON.stringify(libraryDraft(before)) !== JSON.stringify(libraryDraft(baseline))) throw new Error('publish.library.conflict');
    if (!before.publishId) {
      const s = await checked(() => api.publishMap(mapId, 'private'));
      if (!s.publishId || s.visibility !== 'private' || s.listed) throw new Error('publish.library.conflict');
      confirmed = { ...before, ...s };
      completed.push('registered');
    }
    if (before.listed && !d.listed) {
      const s = await checked(() => api.setMapListed(mapId, false, before.publishId!));
      if (s.listed !== false) throw new Error('publish.library.conflict');
      confirmed = { ...before, ...s };
      completed.push('unlisted');
    }
    const savedMeta = await checked(() => api.setPublishMeta(mapId, meta));
    completed.push('metadata');
    confirmed = { ...confirmed!, ...savedMeta };
    if (!before.listed && d.listed) {
      // Recheck canonical metadata, then atomically bind the listing update to this registration.
      // A withdrawal between this read and the PATCH must not recreate a public registration.
      const verified = await checked(() => api.publishStatus(mapId));
      if (libraryUnavailable(verified) || verified.publishId !== confirmed.publishId || verified.listed ||
        verified.visibility !== confirmed.visibility || verified.priceKrw !== confirmed.priceKrw ||
        (verified.description ?? null) !== savedMeta.description || verified.commentsEnabled !== savedMeta.commentsEnabled ||
        JSON.stringify(verified.tags) !== JSON.stringify(savedMeta.tags)) throw new Error('publish.library.conflict');
      const s = await checked(() => api.setMapListed(mapId, true, verified.publishId!));
      if (s.listed !== true) throw new Error('publish.library.conflict');
      confirmed = { ...verified, ...s };
      completed.push('listed');
    }
    const result = confirmed;
    if (!result.publishId || !!result.listed !== d.listed) throw new Error('publish.library.conflict');
    return result;
  } catch (err) {
    check();
    let actual: PublishStatus | null = null;
    try { actual = await checked(() => api.publishStatus(mapId)); } catch { check(); }
    throw new LibrarySaveError(err, completed, actual, confirmed);
  } finally { busy.current = false; }
}

// Library settings never make a map private, release a viewer/dashboard lock or open another map.
export function shouldLockLibraryMap(mapId: string, s: PublishStatus, active: { cloudMapId: string | null; readOnlyInfo: { mapId: string } | null }) {
  return !!s.publishId && !s.dashboard && (s.visibility === 'public' || s.visibility === 'paid') &&
    active.cloudMapId === mapId && active.readOnlyInfo === null;
}
