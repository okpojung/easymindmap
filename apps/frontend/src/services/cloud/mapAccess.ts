/** A server edit lock is a read-only session, not an editable unsaved copy. */
export function mapReadOnlyCause(meta: { dashboard?: boolean; published?: boolean; editLock?: string; role?: string }): 'dashboard' | 'published' | 'otherSession' | 'viewer' | null {
  if (meta.dashboard) return 'dashboard';
  if (meta.published) return 'published';
  if (meta.editLock === 'busy') return 'otherSession';
  return meta.role === 'viewer' ? 'viewer' : null;
}
