// The proof cookie remains HttpOnly. One atomic UUID-keyed item per signup:
// no email in the key, no separately written index, no credentials.
const LEGACY = 'emm.pendingProfile';
const PREFIX = LEGACY + '.item.';
const OLD_POINTER = LEGACY + '.current.';
const PROFILE_TTL_MS = 7 * 24 * 60 * 60_000;
const MAX_RECORDS = 16;
export const CLAIM_TTL_MS = 30 * 60_000;
export interface PendingProfile {
  email: string;
  fullName: string;
  phoneCountry?: string;
  phoneNumber?: string;
  phoneIntent?: string;
  expiresAt?: number;
  readOnly?: boolean;
}
export interface PendingRecord { key: string; data: PendingProfile; createdAt: number }
function decode(raw: string | null): (PendingProfile & { createdAt?: number }) | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data && typeof data.email === 'string' && typeof data.fullName === 'string' ? data : null;
  } catch { return null; }
}
function stored(key: string, data: PendingProfile, createdAt: number): PendingRecord {
  data = { ...data, email: data.email.trim().toLowerCase() };
  localStorage.setItem(key, JSON.stringify({ ...data, createdAt }));
  return { key, data, createdAt };
}
function records(): PendingRecord[] {
  const now = Date.now();
  const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k): k is string => !!k);
  const out: PendingRecord[] = [];
  // Old pointer values already reference UUID-keyed items. Those items remain
  // discoverable by scanning; remove all aliases, including dangling email keys.
  for (const key of keys) if (key.startsWith(OLD_POINTER)) localStorage.removeItem(key);
  for (const key of keys) {
    if (!key.startsWith(PREFIX) && key !== LEGACY) continue;
    const raw = localStorage.getItem(key);
    const data = decode(raw);
    if (!data) { localStorage.removeItem(key); continue; }
    const createdAt = Number.isFinite(data.createdAt) ? data.createdAt : now;
    const expired = createdAt + PROFILE_TTL_MS <= now || (data.readOnly && !(Number(data.expiresAt) > now));
    if (expired) { localStorage.removeItem(key); continue; }
    if (key === LEGACY) {
      const migrated = stored(PREFIX + crypto.randomUUID(), data, createdAt);
      if (localStorage.getItem(LEGACY) === raw) localStorage.removeItem(LEGACY);
      out.push(migrated);
    } else if (data.createdAt === undefined) {
      // Give legacy UUID items a finite lifetime without creating an index.
      out.push(stored(key, data, createdAt));
    } else out.push({ key, data, createdAt });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt || b.key.localeCompare(a.key));
}
export function readPendingProfile(email: string): PendingRecord | null {
  try { return records().find(r => r.data.email.trim().toLowerCase() === email.trim().toLowerCase()) ?? null; }
  catch { return null; }
}
export function stashPendingProfile(data: PendingProfile): PendingRecord | null {
  try {
    const existing = records();
    const email = data.email.trim().toLowerCase();
    const same = existing.filter(r => r.data.email.trim().toLowerCase() === email);
    const createdAt = Math.max(Date.now(), (same[0]?.createdAt ?? 0) + 1);
    // Only mutate old entries after the one atomic write succeeds. Remove only
    // UUIDs captured before it, never an item another tab has since installed.
    const next = stored(PREFIX + crypto.randomUUID(), data, createdAt);
    same.forEach(clearPendingProfile);
    existing.filter(r => !same.includes(r)).slice(MAX_RECORDS - 1).forEach(clearPendingProfile);
    return next;
  } catch { return null; }
}
export function clearPendingProfile(record: PendingRecord): void {
  try { localStorage.removeItem(record.key); } catch { /* optional storage */ }
}
export function markClaimAttempted(record: PendingRecord): boolean {
  try {
    const current = readPendingProfile(record.data.email);
    if (current?.key !== record.key || current.data.readOnly) return false;
    stored(record.key, { ...current.data, readOnly: true }, current.createdAt);
    return true;
  } catch { return false; }
}
