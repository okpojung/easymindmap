import assert from 'node:assert/strict';
import { createHtmlCrypto, encryptStandaloneHtml, decryptStandaloneHtml, passwordValidationError, isEncryptedHtml } from './encryptedHtml';

async function main() {
  const codec = createHtmlCrypto();
  for (const p of ['abcdefgh', 'AbCdEfGh', '12345678', '!@#$%^&*', 'abc1234', '        ', 'abcd    ']) assert.ok(passwordValidationError(p), 'reject a short or single-category password');
  for (const p of ['abcde123', 'abcdefg!', '1234567!', '한글암호문장12', 'abcdefgh1!', 'a1      ']) assert.equal(passwordValidationError(p), null, 'accept 8 characters and two categories');
  assert.ok(passwordValidationError('a1'.repeat(129)), 'bound password length');
  const password = 'Synthetic9!';
  const plaintext = '<!doctype html><title>PRIVATE_SYNTHETIC_TITLE</title><script type="application/json" id="easymindmap-map">{"diary":"오늘의 비밀 기록","file":"PRIVATE_ATTACHMENT.md","url":"data:text/plain;base64,cHJpdmF0ZS1ieXRlcw=="}</script>';
  const first = await encryptStandaloneHtml(plaintext, password, 'map');
  const second = await encryptStandaloneHtml(plaintext, password, 'map');
  assert.ok(isEncryptedHtml(first)); assert.equal(isEncryptedHtml(plaintext), false);
  for (const secret of [password, 'PRIVATE_SYNTHETIC_TITLE', '오늘의 비밀 기록', 'PRIVATE_ATTACHMENT.md', 'cHJpdmF0ZS1ieXRlcw==']) assert.ok(!first.includes(secret), 'no plaintext or encoded attachment leak');
  const e1 = codec.parse(first), e2 = codec.parse(second);
  assert.notEqual(e1.salt, e2.salt); assert.notEqual(e1.iv, e2.iv); assert.notEqual(e1.data, e2.data);
  assert.deepEqual(await decryptStandaloneHtml(first, password), { html: plaintext, kind: 'map' });
  const markdown = await encryptStandaloneHtml('<textarea id="mdData">private markdown</textarea>', password, 'markdown');
  assert.equal((await decryptStandaloneHtml(markdown, password)).kind, 'markdown');
  await assert.rejects(decryptStandaloneHtml(first, 'WrongPass9!'), /암호가 맞지 않거나/);
  const damaged = { ...e1, data: (e1.data[0] === 'A' ? 'B' : 'A') + e1.data.slice(1) };
  await assert.rejects(codec.decrypt(damaged, password), /암호가 맞지 않거나/);
  await assert.rejects(codec.decrypt({ ...e1, kind: 'markdown' }, password), /암호가 맞지 않거나/);
  for (const malformed of [{ ...e1, iterations: 1 }, { ...e1, iterations: 999999999 }, { ...e1, version: 2 }, { ...e1, salt: 'AAAA' }, { ...e1, iv: 'AAAA' }, { ...e1, extra: 'x' }, { ...e1, data: '!!!!' }]) assert.throws(() => codec.validate(malformed));
  assert.throws(() => codec.parse(first + '<script type="application/json" id="emm-encrypted-payload">{}</script>'));
  assert.ok(first.includes('sandbox="allow-scripts allow-downloads allow-popups allow-modals allow-forms"'));
  assert.ok(!first.includes('allow-same-origin'));
  assert.ok(first.includes("connect-src 'none'"));
  console.log('PASS protected HTML: password policy, Unicode, privacy, random salt/IV, map/MD round trip, wrong password, tampering/AAD, strict parsing and sandbox');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
