import assert from 'node:assert/strict';
import { editorToolbarLayout, mobileToolbarSize, mobileSaveDot } from './toolbar-layout';

for (const width of [320, 390, 768, 1024, 1100, 1279, 1280]) {
  const layout = editorToolbarLayout(width, width < 768);
  assert.equal(layout.stacked, width < 1280, 'preserve the narrow two-row toolbar');
  assert.equal(layout.columns, 'auto minmax(0, 1fr) auto', 'title can shrink below intrinsic text width');
}
assert.equal(editorToolbarLayout(1280, true).stacked, true, 'landscape phone stays two-row');
assert.equal(editorToolbarLayout(1279, false).stacked, true);
assert.equal(editorToolbarLayout(1280, false).stacked, false);
for (const viewport of [320, 390]) {
  const contentWidth = viewport - 12;
  const size = mobileToolbarSize(contentWidth);
  assert.ok(size >= 24 && size <= 34);
  assert.ok(size * 11 + 44 <= contentWidth, 'actions fit the content width');
  // Nine phone icon buttons, history count, labeled file menu and six group gaps.
  assert.ok(size * 9 + 20 + 57 + 12 <= contentWidth, 'separate File / Save / History groups fit');
}
assert.equal(mobileSaveDot('dirty'), '#DC2626');
assert.equal(mobileSaveDot('saved', true), '#64748B');
assert.equal(mobileSaveDot('collab'), '#7C3AED');
console.log('PASS toolbar layout: 320/390/1024/1280, landscape phone, save dots');
