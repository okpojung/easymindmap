import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');
const toolbar = source('./TopToolbar.tsx');
const account = source('./UserMenu.tsx');
const frame = source('../ui/DialogFrame.tsx');
const copy = JSON.parse(source('./toolbar-copy.json'));
for (const lang of ['ko', 'en', 'ja', 'zh']) {
  assert.deepEqual(Object.keys(copy[lang]).sort(), Object.keys(copy.en).sort());
  for (const key of ['file', 'mapTitle', 'documentMenu', 'saveStatus', 'history']) assert.ok(copy[lang][key]);
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

const actions = toolbar.slice(toolbar.indexOf('data-testid="toolbar-actions"'));
const groupOrder = ['file', 'save', 'history', 'view', 'gantt', 'distribution', 'other'];
let previous = -1;
for (const group of groupOrder) {
  const index = actions.indexOf('data-toolbar-group="' + group + '"');
  assert.ok(index > previous, group + ' has its own group in the requested action order');
  previous = index;
}
assert.doesNotMatch(toolbar.slice(toolbar.indexOf('data-testid="toolbar-brand"'), toolbar.indexOf('data-testid="map-title-search"')), /file-menu-toggle/);
assert.match(toolbar, /aria-label={copy.documentMenu} aria-haspopup="menu" aria-expanded={documentOpen} aria-controls={fileMenuId}/);
assert.ok(toolbar.includes('<I.ChevronDown size={phone ? 12 : 16} strokeWidth={2}'));
const saveGroup = actions.slice(actions.indexOf('data-toolbar-group="save"'), actions.indexOf('data-toolbar-group="history"'));
const historyGroup = actions.slice(actions.indexOf('data-toolbar-group="history"'), actions.indexOf('data-toolbar-group="view"'));
assert.match(saveGroup, /<MapActions/);
assert.doesNotMatch(saveGroup, /toolbar-undo|toolbar-redo|undo-depth/);
assert.match(historyGroup, /toolbar-undo[\s\S]*undo-depth[\s\S]*toolbar-redo/);
assert.doesNotMatch(historyGroup, /<MapActions/);
const mapActions = source('./MapActions.tsx');
assert.match(mapActions, /data-testid="save-state-indicator"[\s\S]*data-testid="save-state-dot"[\s\S]*data-testid="save-state-label"/);
assert.match(mapActions, /data-testid="save-state-label"[^\n]*borderLeft/);
const search = source('../left-sidebar/SearchResults.tsx');
assert.ok(search.includes('<I.Search size={20} strokeWidth={2}'));
assert.match(search, /border: \x60?1px solid \$\{t.textMuted\}/);
assert.match(source('../left-sidebar/SearchResults.css'), /::placeholder[\s\S]*opacity: 1/);
assert.match(source('../left-sidebar/SearchResults.css'), /:focus-visible/);
console.log('PASS toolbar groups: File / Save indicator+label / History; visible menu chevron and search');

assert.ok(toolbar.includes('tooltipDisabled={documentOpen}'));
assert.ok(source('./Tooltip.tsx').includes('point && !tooltipDisabled && createPortal'));
console.log('PASS open file menu is not obscured by its tooltip');
