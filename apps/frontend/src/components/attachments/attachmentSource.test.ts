// 첨부 출처 분류·배지 규칙·사전 키 동일성 검사.
import assert from 'node:assert/strict';
import { classifyAttachmentSource, badgeKindFor, decideLocalPickAction, hostActionFor } from './attachmentSource';
import dict from '../../i18n/dict/localAttachments';

const isLocal = (u?: string) => !!u && u.startsWith('emm-local://');
const c = (u?: string) => classifyAttachmentSource(u, { isLocal });

assert.equal(c('emm-local://abc/dir/a.pdf'), 'local');
assert.equal(c('/v1/attachments/xyz'), 'server');
assert.equal(c('data:text/plain;base64,QQ=='), 'embedded', 'small data URL is NOT server');
assert.equal(c('https://example.com/a.pdf'), 'link');
assert.equal(c(undefined), 'link');

assert.equal(badgeKindFor('local', 'connected'), 'local');
assert.equal(badgeKindFor('local', 'loading'), 'local', 'loading must not read as disconnected');
assert.equal(badgeKindFor('local', 'disconnected'), 'localOff');
assert.equal(badgeKindFor('local', 'unsupported'), 'localOff');
assert.equal(badgeKindFor('server'), 'server');
assert.equal(badgeKindFor('embedded', 'disconnected'), 'embedded');

assert.equal(decideLocalPickAction('connected'), 'pick');
assert.equal(decideLocalPickAction('disconnected'), 'connect');
assert.equal(decideLocalPickAction('loading'), 'wait');
assert.equal(decideLocalPickAction('unsupported'), 'unsupported');

assert.equal(hostActionFor('unapproved', true), 'approve');
assert.equal(hostActionFor('unapproved', false), 'none');
assert.equal(hostActionFor('disconnected', true), 'reconnect');
assert.equal(hostActionFor('disconnected', false), 'none');
assert.equal(hostActionFor('missing', true), 'none');
assert.equal(hostActionFor('failed', true), 'none');

const keys = Object.keys(dict.ko).sort();
for (const l of ['en', 'ja', 'zh'] as const) {
  assert.deepEqual(Object.keys(dict[l]).sort(), keys, l + ' keys match ko');
  for (const k of keys) assert.ok(dict[l][k as keyof typeof dict.ko].length > 0, l + ':' + k);
}
for (const k of keys) assert.ok(!/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(dict.ko[k as keyof typeof dict.ko]), 'no pictograms: ' + k);
console.log('attachmentSource.test OK');
