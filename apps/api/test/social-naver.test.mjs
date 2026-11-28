// Build the API, then: node --test test/social-naver.test.mjs
// Synthetic data only; Naver is a test double (fetch mock).
import test from 'node:test';
import assert from 'node:assert/strict';
import { naverToStandard, bearerToken } from '../dist/social/naver-userinfo.js';
import { SocialController } from '../dist/social/social.controller.js';

const ok = (r) => ({ resultcode: '00', message: 'success', response: r });

test('naver profile becomes standard OIDC userinfo', () => {
  assert.deepEqual(naverToStandard(ok({ id: 'abc', email: 'Kim@Naver.com', name: '김', nickname: 'kim', profile_image: 'https://p.example/1.png' })),
    { sub: 'abc', email: 'kim@naver.com', email_verified: true, name: '김', nickname: 'kim', picture: 'https://p.example/1.png' });
  // non-naver contact e-mail is kept but NOT treated as verified (no automatic account linking)
  assert.equal(naverToStandard(ok({ id: 'x', email: 'someone@gmail.com' })).email_verified, false);
  assert.equal(naverToStandard(ok({ id: 'x', email: 'not-an-email' })).email, undefined);
  assert.equal(naverToStandard(ok({ id: 'x', profile_image: 'http://insecure/1.png' })).picture, undefined);
  assert.equal(naverToStandard({ resultcode: '024', message: 'auth failed' }), null);
  assert.equal(naverToStandard(ok({ email: 'a@naver.com' })), null);
});

test('bearer token parsing rejects header injection', () => {
  assert.equal(bearerToken('Bearer AAAA.bb-cc_dd~ee+ff/gg=='), 'AAAA.bb-cc_dd~ee+ff/gg==');
  assert.equal(bearerToken('Bearer a b'), null);
  assert.equal(bearerToken('Bearer a\r\nX-Evil: 1'), null);
  assert.equal(bearerToken('Basic abc'), null);
  assert.equal(bearerToken(undefined), null);
});

const cfg = (on) => ({ get: (k) => (k === 'NAVER_LOGIN_ENABLED' ? on : undefined) });

test('endpoint proxies Naver, forwards only the bearer token, closed when disabled', async (t) => {
  assert.deepEqual(new SocialController(cfg(false)).social(), { naver: false });
  await assert.rejects(new SocialController(cfg(false)).naverUserinfo('Bearer abc'), /disabled/);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization });
    return new Response(JSON.stringify(ok({ id: 'n1', email: 'p@naver.com', name: '이름' })), { status: 200 });
  });
  const c = new SocialController(cfg(true));
  assert.deepEqual(c.social(), { naver: true });
  const info = await c.naverUserinfo('Bearer tok123');
  assert.equal(info.sub, 'n1');
  assert.equal(info.email_verified, true);
  assert.deepEqual(calls, [{ url: 'https://openapi.naver.com/v1/nid/me', auth: 'Bearer tok123' }]);
  await assert.rejects(c.naverUserinfo(undefined), /missing bearer/);
});

test('rejected or broken Naver responses never return a user', async (t) => {
  const c = new SocialController(cfg(true));
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 401 }));
  await assert.rejects(c.naverUserinfo('Bearer tok'), /rejected/);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ resultcode: '024' }), { status: 200 }));
  await assert.rejects(c.naverUserinfo('Bearer tok'), /invalid/);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('network'); });
  await assert.rejects(c.naverUserinfo('Bearer tok'), /unavailable/);
});
