// Offline only: Vite supplies aliases and import.meta.env; fetch is always a test double.
import assert from 'node:assert/strict';
import { useLangStore } from '@/i18n';
import { AuthError, supabaseAuth } from './supabaseAuth';
import { CloudError, cloudApi } from './apiClient';
import { formatSignupPhone } from '@/components/auth/signupPhoneInput';

useLangStore.getState().setLang('ko');
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'new@example.invalid' };
const password = 'synthetic-only';
let count = 0;
function reply(path: string, status: number, body: unknown) {
  globalThis.fetch = async (input, init) => {
    assert.ok(String(input).endsWith(path));
    assert.ok(!String(input).includes('@'));
    assert.equal(init?.method, 'POST');
    assert.equal(JSON.parse(String(init?.body)).email, user.email);
    count++;
    return new Response(JSON.stringify(body), { status });
  };
}
const duplicate = (e: unknown) => e instanceof AuthError && e.code === 'EMAIL_ALREADY_REGISTERED'
  && e.message === '이미 가입된 이메일입니다';
for (const body of [{ error_code: 'user_already_exists' }, { error_code: 'email_exists' }, { msg: 'User already registered' }]) {
  reply('/signup', 422, body);
  await assert.rejects(supabaseAuth.signUp(user.email, password), duplicate);
}
reply('/signup', 200, { ...user, identities: [] });
await assert.rejects(supabaseAuth.signUp(user.email, password), duplicate);
// A real pending identity, or a legacy response that does not expose identities, is not a duplicate.
for (const pending of [{ ...user, identities: [{ id: user.id, provider: 'email' }] }, user]) {
  reply('/signup', 200, pending);
  assert.equal(await supabaseAuth.signUp(user.email, password), null);
}
reply('/signup', 200, { access_token: 'synthetic', refresh_token: 'synthetic', expires_in: 300, user });
assert.equal((await supabaseAuth.signUp(user.email, password))?.userId, user.id);
reply('/signup', 200, {});
await assert.rejects(supabaseAuth.signUp(user.email, password), e => e instanceof AuthError && !e.code);
reply('/account/email-code', 409, {code:'EMAIL_ALREADY_REGISTERED', message:'이미 가입된 이메일입니다'});
await assert.rejects(cloudApi.sendEmailCode(user.email), e => e instanceof CloudError && e.code === 'EMAIL_ALREADY_REGISTERED');
reply('/account/email-code', 200, {sent:true, expiresInMin:10});
assert.equal((await cloudApi.sendEmailCode(user.email)).sent,true);
assert.equal(count,10);
assert.equal(formatSignupPhone('82','+82 10-0000-0000'), '010-0000-0000');
assert.equal(formatSignupPhone('82','010-0000-0000'), '010-0000-0000');
assert.equal(formatSignupPhone('82','010000000001'), '010000000001');
console.log('PASS signup: duplicate, pending, new, malformed response, email-code status and Korean phone input (10 mock requests only)');
