// Build the API, then: node --test test/social-phone.test.mjs
// Synthetic numbers only; Kakao/Naver are test doubles (fetch mock).
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProviderPhone, kakaoPhoneOf, naverPhoneOf } from '../dist/social/social-phone.js';
import { SocialController } from '../dist/social/social.controller.js';

test('provider phone formats become { country, number }', () => {
  assert.deepEqual(normalizeProviderPhone('+82 10-1234-5678'), { country: '+82', number: '01012345678' });
  assert.deepEqual(normalizeProviderPhone('010-1234-5678'), { country: '+82', number: '01012345678' });
  assert.deepEqual(normalizeProviderPhone('+821012345678'), { country: '+82', number: '01012345678' });
  assert.deepEqual(normalizeProviderPhone('+1 650-555-0100'), { country: '+1', number: '6505550100' });
  // Korean landlines / junk / too long are not offered
  assert.equal(normalizeProviderPhone('02-123-4567'), null);
  assert.equal(normalizeProviderPhone('+82 2-123-4567'), null);
  assert.equal(normalizeProviderPhone('abc'), null);
  assert.equal(normalizeProviderPhone(''), null);
  assert.equal(normalizeProviderPhone(12345678), null);
  assert.equal(normalizeProviderPhone('+1 ' + '9'.repeat(30)), null);
});

test('kakao and naver payloads', () => {
  assert.deepEqual(kakaoPhoneOf({ id: 1, kakao_account: { phone_number: '+82 10-9999-0000' } }), { country: '+82', number: '01099990000' });
  assert.equal(kakaoPhoneOf({ id: 1, kakao_account: { phone_number_needs_agreement: true } }), null);
  assert.equal(kakaoPhoneOf(null), null);
  const ok = (r) => ({ resultcode: '00', message: 'success', response: r });
  assert.deepEqual(naverPhoneOf(ok({ id: 'a', mobile: '010-9999-0000', mobile_e164: '+821099990000' })), { country: '+82', number: '01099990000' });
  assert.deepEqual(naverPhoneOf(ok({ id: 'a', mobile: '010-9999-0000' })), { country: '+82', number: '01099990000' });
  assert.equal(naverPhoneOf(ok({ id: 'a' })), null);
  assert.equal(naverPhoneOf({ resultcode: '024', message: 'auth failed' }), null);
});

const cfg = (on) => ({ get: (k) => (k === 'NAVER_LOGIN_ENABLED' ? on : undefined) });

test('POST social/phone asks the right provider and never fails hard', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), auth: init?.headers?.Authorization });
      if (String(url).includes('kapi.kakao.com')) return new Response(JSON.stringify({ kakao_account: { phone_number: '+82 10-1111-2222' } }), { status: 200 });
      if (String(url).includes('openapi.naver.com')) return new Response(JSON.stringify({ resultcode: '00', response: { id: 'n', mobile: '010-3333-4444' } }), { status: 200 });
      return new Response('{}', { status: 404 });
    };
    const c = new SocialController(cfg(true));
    assert.deepEqual(await c.socialPhone({ provider: 'kakao', providerToken: 'tok1' }), { phone: { country: '+82', number: '01011112222' } });
    assert.equal(calls[0].url, 'https://kapi.kakao.com/v2/user/me');
    assert.equal(calls[0].auth, 'Bearer tok1');
    assert.deepEqual(await c.socialPhone({ provider: 'naver', providerToken: 'tok2' }), { phone: { country: '+82', number: '01033334444' } });
    assert.equal(calls[1].url, 'https://openapi.naver.com/v1/nid/me');
    // Naver switched off: no call, no number
    const off = new SocialController(cfg(false));
    assert.deepEqual(await off.socialPhone({ provider: 'naver', providerToken: 'tok3' }), { phone: null });
    assert.equal(calls.length, 2);
    // provider rejects the token or is down: null, not an error
    globalThis.fetch = async () => new Response('{}', { status: 401 });
    assert.deepEqual(await c.socialPhone({ provider: 'kakao', providerToken: 'bad' }), { phone: null });
    globalThis.fetch = async () => { throw new Error('network'); };
    assert.deepEqual(await c.socialPhone({ provider: 'naver', providerToken: 'x' }), { phone: null });
  } finally {
    globalThis.fetch = realFetch;
  }
});
