// 소셜 가입 휴대폰 미리 채우기 (2026-11-28). node scripts/run-vite-test.mjs src/services/cloud/socialPhone.test.ts
import { collectPhoneHint, readPhoneHint, savePhoneHint, PHONE_HINT_KEY } from './socialPhone';

const assert = (ok: unknown, label: string) => { if (!ok) throw new Error(label); };
const eq = (a: unknown, b: unknown, label: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${label}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);

class Mem implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}

const now = 1_000_000_000;
{
  const s = new Mem();
  savePhoneHint({ userId: 'u1', provider: 'kakao', country: '+82', number: '01012345678', at: now }, s);
  eq(readPhoneHint('u2', now, s), null, 'other user cannot read (and it is discarded)');
  eq(s.getItem(PHONE_HINT_KEY), null, 'discarded after wrong-user read');
  savePhoneHint({ userId: 'u1', provider: 'kakao', country: '+82', number: '01012345678', at: now }, s);
  eq(readPhoneHint('u1', now + 60_000, s)?.number, '01012345678', 'same user within ttl');
  eq(readPhoneHint('u1', now + 31 * 60_000, s), null, 'expired after 30 min');
  eq(s.getItem(PHONE_HINT_KEY), null, 'expired is removed');
  s.setItem(PHONE_HINT_KEY, JSON.stringify({ userId: 'u1', provider: 'google', country: '+82', number: '01012345678', at: now }));
  eq(readPhoneHint('u1', now, s), null, 'google is never a source');
  s.setItem(PHONE_HINT_KEY, '{oops');
  eq(readPhoneHint('u1', now, s), null, 'malformed json');
  eq(readPhoneHint(undefined, now, s), null, 'no user');
}

const calls: string[] = [];
const ask = async (p: 'kakao' | 'naver', tok: string) => { calls.push(p + ':' + tok); return { phone: { country: '+82', number: '01099990000' } }; };
eq(await collectPhoneHint('google', 'tok', 'u1', ask), false, 'google skipped');
eq(await collectPhoneHint('kakao', null, 'u1', ask), false, 'no provider token');
eq(calls, [], 'no request without kakao/naver token');
eq(await collectPhoneHint('kakao', 'tok', 'u1', async () => { throw new Error('down'); }), false, 'api down');
eq(await collectPhoneHint('kakao', 'tok', 'u1', async () => ({ phone: null })), false, 'provider has no number');
eq(await collectPhoneHint('kakao', 'tok', 'u1', () => new Promise<never>(() => { /* never */ }), 20), false, 'timeout');
eq(await collectPhoneHint('naver', 'tok', 'u1', async () => ({ phone: { country: '82', number: '0101' } })), false, 'bad shape ignored');

console.log('socialPhone ok');
