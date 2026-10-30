// Offline only. Run from apps/api after its build; imports resolve beside this test.
// MailService.send is replaced before sendCode: no SMTP transport or socket is created.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('reflect-metadata');
const { mailRegistry, validateTemplate, renderTemplate } = require('../dist/mail/mail-templates.js');
const d=mailRegistry().definitions.get('auth.signup');
assert.throws(()=>validateTemplate(d,'bad\r\nBcc: x@example.invalid',d.text));
assert.throws(()=>validateTemplate(d,'ok','No security code'));
assert.throws(()=>validateTemplate(d,'ok','{{code}} {{minutes}} {{unknown}}'));
const m = renderTemplate(d, d, { code: '123456\r\n\t\0Injected\u2028', minutes: '10' });
assert.equal(/[\x00-\x1f\x7f\u2028\u2029]/.test(m.subject), false);
assert.ok(m.text.includes('123456'));
assert.ok(m.text.includes('본인이 요청하지 않았다면'));
const literal=renderTemplate(d,{subject:'ok',text:'<script>alert(1)</script> {{code}} {{minutes}}'}, {code:'123456',minutes:'10'});
assert.ok(literal.text.includes('<script>')); // Plain text; HTML adapter must escape separately.
console.log('PASS offline mail template tokens, CRLF, mandatory security footer');

// Inspect DI and route guards without starting an app or opening a database connection.
const { MailTemplatesService } = require('../dist/mail/mail-templates.service.js');
const { MailService } = require('../dist/mail/mail.service.js');
const { DatabaseService } = require('../dist/database/database.service.js');
const { AdminController } = require('../dist/admin/admin.controller.js');
const { AdminGuard } = require('../dist/admin/admin.guard.js');
assert.equal(Reflect.getMetadata('design:paramtypes', MailTemplatesService)[0], DatabaseService);
assert.equal(Reflect.getMetadata('design:paramtypes', MailService)[1], MailTemplatesService);
for (const method of ['mailTemplateList', 'mailTemplatePreview', 'mailTemplateSave']) {
  assert.ok(Reflect.getMetadata('__guards__', AdminController.prototype[method]).includes(AdminGuard));
}

const missingDb = {
  query: async (sql) => {
    assert.ok(sql.includes('to_regclass'));
    return { rows: [{ ready: false }] };
  },
  transaction: async () => { throw new Error('transaction must not run without schema'); },
};
const missingTemplates = new MailTemplatesService(missingDb);
assert.ok((await missingTemplates.render('auth.signup', { code: '123456', minutes: '10' })).text.includes('123456'));
await assert.rejects(missingTemplates.list(), (error) => error.getStatus() === 503);
await assert.rejects(missingTemplates.save('auth.signup', {
  subject: d.subject, text: d.text, baseUpdatedAt: null,
}, 'admin@example.invalid'), (error) => error.getStatus() === 503);

// Reserved .invalid addresses only. Override delivery before calling sendCode.
const deliveries = [];
const mail = new MailService({ get: () => undefined });
mail.send = async (to, subject, text, html) => {
  assert.equal(to, 'recipient@example.invalid');
  deliveries.push({ to, subject, text, html });
};
await mail.sendCode('recipient@example.invalid', '<img src=x onerror=alert(1)>', 10, 'signup');
assert.equal(deliveries.length, 1);
assert.ok(deliveries[0].html.includes('&lt;img'));
assert.equal(deliveries[0].html.includes('<img'), false);
assert.equal(/[\x00-\x1f\x7f]/.test(deliveries[0].subject), false);
console.log('PASS offline Nest guards/DI, schema fallback, mock delivery and HTML escaping');
