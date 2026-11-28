// 소셜 로그인 규칙 (2026-11-28). node scripts/run-vite-test.mjs src/services/cloud/socialAuth.test.ts
import {
  callbackErrorMessage, callbackUrl, GOTRUE_PROVIDER, makeVerifier, parseCallback, pkceChallenge,
  safeReturnTo, savePending, sessionProvider, socialIdOf, takePending,
} from './socialAuth';
import { canUnlink } from '@/components/account/LinkedAccounts';
import { needsSocialCompletion, suggestedName } from '@/components/auth/CompleteSocialSignup';

const assert = (ok: unknown, label: string) => { if (!ok) throw new Error(label); };
const eq = (a: unknown, b: unknown, label: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${label}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);

class MemStore implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}

// 공급자 이름
eq(GOTRUE_PROVIDER, { kakao: 'kakao', naver: 'custom:naver', google: 'google', microsoft: 'azure' }, 'gotrue provider ids');
eq([socialIdOf('azure'), socialIdOf('microsoft')], ['microsoft', 'microsoft'], 'socialIdOf microsoft');
eq([socialIdOf('kakao'), socialIdOf('custom:naver'), socialIdOf('google'), socialIdOf('email'), socialIdOf(undefined)],
  ['kakao', 'naver', 'google', null, null], 'socialIdOf');

// PKCE — RFC 7636 부록 B 의 시험 값
const v = makeVerifier();
assert(/^[A-Za-z0-9\-_]{86}$/.test(v), 'verifier: 86 url-safe chars');
assert(makeVerifier() !== v, 'verifier is random');
const challenge = await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
eq(challenge, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', 'RFC 7636 S256 vector');

// 돌아갈 자리 — 같은 사이트 상대 경로만
eq(safeReturnTo('/?map=1'), '/?map=1', 'relative path kept');
for (const bad of ['https://evil.example/', '//evil.example', '/\\evil', 'javascript:alert(1)', '', '/auth/callback?code=x', '/x\r\nSet-Cookie:1'])
  eq(safeReturnTo(bad), '/', 'rejects ' + JSON.stringify(bad));
eq(callbackUrl('https://web.easymindmap.org'), 'https://web.easymindmap.org/auth/callback', 'callback url');

// 대기 정보 — 한 번만, 15분, 모양 검사
const store = new MemStore();
savePending({ v, provider: 'kakao', mode: 'login', returnTo: '/?a=1', at: 1000 }, store);
eq(takePending(2000, store)?.provider, 'kakao', 'pending read');
eq(takePending(2000, store), null, 'pending is single-use');
savePending({ v, provider: 'google', mode: 'link', returnTo: 'https://evil', at: 1000, userId: 'u1' }, store);
eq(takePending(2000, store)?.returnTo, '/', 'pending returnTo sanitized');
savePending({ v, provider: 'naver', mode: 'login', returnTo: '/', at: 1000 }, store);
eq(takePending(1000 + 16 * 60_000, store), null, 'pending expires after 15 min');
store.setItem('emm.social.pending.v1', JSON.stringify({ v: 'short', provider: 'kakao', mode: 'login', returnTo: '/', at: 1 }));
eq(takePending(2, store), null, 'short verifier rejected');
store.setItem('emm.social.pending.v1', JSON.stringify({ v, provider: 'facebook', mode: 'login', returnTo: '/', at: 1 }));
eq(takePending(2, store), null, 'unknown provider rejected');

// 콜백 주소 읽기
eq(parseCallback('?code=abc12345-_.~', ''), { code: 'abc12345-_.~' }, 'code from query');
eq(parseCallback('?code=bad<code>', ''), {}, 'malformed code ignored');
eq(parseCallback('', '#error=access_denied&error_description=User%20cancelled'), { error: 'access_denied', description: 'User cancelled' }, 'error from hash');
assert(callbackErrorMessage({ error: 'access_denied' }) !== callbackErrorMessage({ error: 'server_error' }), 'cancel has its own message');

// 액세스 토큰의 로그인 수단 (서명은 서버가 확인)
const jwt = (payload: unknown) => 'h.' + btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_') + '.s';
eq(sessionProvider(jwt({ app_metadata: { provider: 'kakao' } })), 'kakao', 'provider from jwt');
eq(sessionProvider(jwt({ app_metadata: { provider: 'custom:naver' } })), 'custom:naver', 'custom provider from jwt');
eq(sessionProvider('not-a-jwt'), null, 'bad jwt');

// 가입 마무리 — 소셜 · 프로필 읽음 · 이름 없음일 때만
eq(needsSocialCompletion('kakao', { complete: false }, true), true, 'social + incomplete');
eq(needsSocialCompletion('email', { complete: false }, true), false, 'email users never');
eq(needsSocialCompletion('google', { complete: true }, true), false, 'complete');
eq(needsSocialCompletion('google', null, true), false, 'profile not loaded');
eq(needsSocialCompletion('custom:naver', { complete: false }, false), false, 'still loading');
eq(suggestedName({ full_name: ' 홍길동 ', name: 'x' }), '홍길동', 'full_name first');
eq(suggestedName({ nickname: 'nick' }), 'nick', 'nickname fallback');
eq(suggestedName(undefined), '', 'no name');

// 해제 — 마지막 로그인 수단은 못 끊는다
eq(canUnlink([{ provider: 'kakao' }], 'kakao'), false, 'last method protected');
eq(canUnlink([{ provider: 'email' }, { provider: 'kakao' }], 'kakao'), true, 'email remains');
eq(canUnlink([{ provider: 'custom:naver' }, { provider: 'google' }], 'naver'), true, 'naver via custom id');
eq(canUnlink([{ provider: 'email' }, { provider: 'google' }], 'kakao'), false, 'not linked');

console.log('PASS social auth: provider ids, PKCE (RFC 7636), safe return path, single-use pending, callback parsing, signup gate, unlink guard');
