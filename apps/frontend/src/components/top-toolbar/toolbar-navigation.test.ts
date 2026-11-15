import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');
const toolbar = source('./TopToolbar.tsx');
const account = source('./UserMenu.tsx');
const frame = source('../ui/DialogFrame.tsx');
const copy = JSON.parse(source('./toolbar-copy.json'));
for (const lang of ['ko', 'en', 'ja', 'zh']) {
  assert.deepEqual(Object.keys(copy[lang]).sort(), Object.keys(copy.en).sort());
  for (const key of ['file', 'mapTitle', 'documentMenu']) assert.ok(copy[lang][key]);
}
assert.match(toolbar, /data-testid="file-menu-toggle"/);
assert.match(toolbar, /<input data-testid="map-title" type="text" readOnly value={mapTitle}/);
assert.doesNotMatch(toolbar, /document-open-browser|const openDocs/);
assert.match(toolbar, /testId="document-menu-x" onClose={dismissFileMenu}/);
assert.match(toolbar, /data-testid="document-menu-body"[^\n]*overflowY: 'auto'/);
for (const slot of ['saveMenuSlot={saveSlot}', 'distributionSlot={distributionSlot}', 'closeSlot={closeSlot}']) assert.ok(toolbar.includes(slot));
assert.match(account, /testId="user-menu-panel-x" onClose={dismissAccountMenu}/);
assert.match(account, /testId="profile-dialog"/);
assert.match(account, /onClose={closeProfile}/);
assert.ok(frame.includes('testId={`${testId}-x`}'), 'actual profile DialogFrame supplies profile-dialog-x');
assert.match(frame, /aria-label={tr\('common.close'\)}/);
console.log('PASS toolbar source contracts: file/title, scrolling body, portal slots, account/profile X, language parity');
