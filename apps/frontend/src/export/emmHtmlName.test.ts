import assert from 'node:assert/strict';
import { emmHtmlFileName } from './emmHtmlName';
import { buildExportPackage } from './exportHtml';
import { buildEncryptedMapPackage } from './encryptedMap';
import type { SampleMap } from '@emm/model';

assert.equal(emmHtmlFileName('내 맵'), '내 맵.emm.html');
assert.equal(emmHtmlFileName('plan.html'), 'plan.emm.html');
assert.equal(emmHtmlFileName('plan.emm.html'), 'plan.emm.html');
assert.equal(emmHtmlFileName('Plan.EMM.HTML'), 'Plan.emm.html');
assert.equal(emmHtmlFileName('Plan.HTM'), 'Plan.emm.html');
assert.equal(emmHtmlFileName('plan.emm'), 'plan.emm.html');
assert.equal(emmHtmlFileName('.html'), 'mindmap.emm.html');
assert.equal(emmHtmlFileName('', '지도'), '지도.emm.html');
assert.ok(!emmHtmlFileName('a.emm.html.html').includes('emm.emm'));

const mk = (title: string): SampleMap => ({
  title,
  root: { id: 'root', text: '루트', colorKey: 'root', side: 'center' },
  branches: [],
} as SampleMap);
assert.equal((await buildExportPackage(mk('한글 지도'))).fileName, '한글 지도.emm.html');
assert.equal((await buildExportPackage(mk('a/b:c.emm.html'))).fileName, 'a_b_c.emm.html');
assert.equal((await buildExportPackage(mk('  '))).fileName, 'mindmap.emm.html');
assert.equal((await buildExportPackage(mk('Report.HTML'))).fileName, 'Report.emm.html');
const enc = await buildEncryptedMapPackage(mk('비밀 지도'), 'SyntheticPass9!');
assert.equal(enc.fileName, '보호된-맵.emm.html');
console.log('PASS emm.html export filenames');
