import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profile = readFileSync(new URL('./AccountProfileForm.tsx', import.meta.url), 'utf8');
const phoneRow = profile.slice(profile.indexOf('data-testid="profile-phone-fields"'), profile.indexOf('data-testid="profile-save"'));
assert.ok(phoneRow.includes("flexWrap: 'wrap'"), 'phone input may wrap instead of shrinking the calling code');
assert.ok(phoneRow.includes("width: 160, flex: '0 0 160px', maxWidth: '100%'"), 'calling code width never flex-shrinks');
assert.ok(phoneRow.includes("flex: '1 1 150px', minWidth: 0"), 'phone input stays usable on a narrow dialog');
assert.ok(phoneRow.includes('>+{c.dial} {c.flag} {countryName(c)}</option>'), 'country calling code is displayed before long country names');
assert.ok(phoneRow.includes('aria-label={`${countryName(shownCountry)} +${dial}`}'), 'full country/code remains accessible');
assert.ok(profile.includes('phoneCountry: phoneDigits ? `+${dial}` : undefined'), 'persisted calling-code semantics are unchanged');
const copy = readFileSync(new URL('../../i18n/dict/io.ts', import.meta.url), 'utf8');
assert.ok(copy.includes('"io.encrypted.export": "암호화 HTML 파일 내보내기"'));
console.log('PASS profile calling-code width/wrap/accessibility and encrypted export menu copy');
