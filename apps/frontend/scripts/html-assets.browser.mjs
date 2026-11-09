// Actual browser integration of the shipped export dialogs and import parser.
// Only synthetic data. No account, backend or private PRO overlay is used.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const report = path.resolve('.qa/report');
await mkdir(report, { recursive: true });
const harness = String.raw`<!doctype html><html lang="ko"><meta charset="utf-8"><title>HTML 첨부 브라우저 검증</title>
<style>body{font:16px sans-serif;padding:24px;color:#172033;background:#f3f6fa}button{padding:12px;margin:8px}h1{font-size:22px}</style>
<h1>HTML 첨부 정책 · 합성 자료 검증</h1><p>실제 내보내기 대화상자와 ZIP 복원 파서만 실행합니다. 서버에 연결하지 않습니다.</p>
<button id="plain">일반 내보내기</button><button id="protected">암호화 내보내기</button><input id="restore" type="file" accept=".html,.zip"><p id="state"></p>
<script type="module">
import { withHtmlAssetExport } from '/src/components/ui/htmlAssetExportDialog.ts';
import { withHtmlPassword } from '/src/components/ui/htmlPasswordDialog.ts';
import { parseHtmlMapFile, parseZipMapFile } from '/src/utils/importMapFile.ts';
import { parseZip } from '/src/export/zip.ts';
const enc = new TextEncoder();
const one = enc.encode('synthetic-office-original-A-한글');
const two = new Uint8Array([80,75,3,4,0,251,1,252,2,253,3,254,4,255]);
const md = enc.encode('# 합성 마크다운\n원본 보존 확인');
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=';
const url = b => 'data:application/octet-stream;base64,' + btoa(String.fromCharCode(...b));
const a = url(one), b = url(two), c = url(md);
const map = { title:'브라우저 첨부 검증', root:{id:'root',text:'첫 중심',colorKey:'root',side:'center',attachments:[{id:'a',name:'same$$.docx',kind:'file',url:a}],image:{src:image,w:1,h:1}}, branches:[{id:'branch',text:'동명 원본과 노트 사진',colorKey:'l1A',side:'right',attachments:[{id:'b',name:'same$$.docx',kind:'file',url:b}],notes:[{id:'note',type:'paragraph',text:'사진',html:'<p>사진</p><img src="'+image+'">'}]}], centers:[{root:{id:'center2',text:'둘째 중심',colorKey:'root',side:'center',attachments:[{id:'c',name:'기록.md',kind:'file',url:c}]},branches:[],pos:{dx:700,dy:0}}] };
const original = JSON.stringify(map);
const bytes = value => Array.from(Uint8Array.from(atob(value.split(',')[1]), x=>x.charCodeAt(0)));
const same = (value, expected) => JSON.stringify(bytes(value)) === JSON.stringify(Array.from(expected));
function verify(restored) { return {first:same(restored.root.attachments[0].url,one),second:same(restored.branches[0].attachments[0].url,two),otherCenter:same(restored.centers[0].root.attachments[0].url,md),photo:restored.root.image.src===image,notePhoto:restored.branches[0].notes[0].html.includes(image),originalUnchanged:JSON.stringify(map)===original}; }
window.qa = {ready:true,restored:null,error:null,verify,originalUnchanged:()=>JSON.stringify(map)===original};
window.qa.inspect = async (values, mode) => {
 const entries = await parseZip(new Uint8Array(values));
 const paths = entries.map(e=>e.path);
 if(mode==='protected') { const outside = new TextDecoder().decode(new Uint8Array(values)); return {paths,plaintextLeaked:[map.title,'same$$.docx',a,b,c].some(s=>outside.includes(s))}; }
 const html = new TextDecoder().decode(entries.find(e=>e.path.endsWith('.html')).data);
 const meta = parseHtmlMapFile(html).map;
 return {paths,separate:paths.filter(p=>p.startsWith('files/')).length,noExcludedOriginals:mode!=='none'||![a,b,c,image].some(s=>html.includes(s)),differentSameNamePaths:meta.root.attachments[0].url!==meta.branches[0].attachments[0].url};
};
window.qa.inspectHtml = text => ({...verify(parseHtmlMapFile(text).map),attachmentCopies:text.split(a).length-1});
for(const [id,protectedMode] of [['plain',false],['protected',true]]) document.getElementById(id).onclick=async()=>{window.qa.error=null;try{await withHtmlAssetExport({map,view:{layoutType:'tree-right'},protected:protectedMode});}catch{window.qa.error='EXPORT_FAILED';}};
document.getElementById('restore').onchange=async(event)=>{
 window.qa.restored=null;window.qa.error=null;const file=event.target.files[0];
 try { let parsed;if(file.name.endsWith('.zip')) { const data=new Uint8Array(await file.arrayBuffer());try{parsed=await parseZipMapFile(data);}catch(error){if(!String(error.message).includes('PROTECTED_ARCHIVE_PASSWORD_REQUIRED'))throw error;parsed=await withHtmlPassword({confirm:false,run:secret=>parseZipMapFile(data,undefined,secret)});} }else parsed=parseHtmlMapFile(await file.text());window.qa.restored=parsed?verify(parsed.map):null;document.getElementById('state').textContent=parsed?'원본 복원 확인':'복원 취소'; }catch{window.qa.error='RESTORE_FAILED';}finally{event.target.value='';}
};
</script></html>`;
await writeFile('.qa/harness.html', harness);
const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
let page;
let stage = 'start';
const results = [];
try {
  await server.listen();
  const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ locale: 'ko-KR', viewport: { width: 1120, height: 850 }, acceptDownloads: true });
  await context.route('**/*', route => {
    const address = route.request().url();
    if (address.startsWith(origin + '/') || /^(data:|blob:)/.test(address)) return route.continue();
    return route.abort();
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(origin + '/.qa/harness.html?lang=ko');
  await page.waitForFunction(() => window.qa?.ready);
  const dialog = page.getByTestId('html-asset-export-dialog');
  const passwordDialog = page.getByTestId('html-password-dialog');
  const secret = 'Browser9!' + randomBytes(16).toString('hex');
  async function exportFile(mode, encrypted = false) {
    stage = 'export-' + mode + (encrypted ? '-encrypted' : '');
    await page.locator(encrypted ? '#protected' : '#plain').click();
    await page.getByTestId('html-policy-' + mode).waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-testid="html-policy-all"]').disabled);
    await page.getByTestId('html-policy-' + mode).check();
    assert.equal(await dialog.locator('input[type="checkbox"]').count(), 4);
    if(mode === 'selected') {
      for(let i=3;i>=1;i--) await dialog.locator('input[type="checkbox"]').nth(i).uncheck();
      assert.equal(await dialog.locator('input[type="checkbox"]:checked').count(),1);
    }
    await dialog.screenshot({path:path.join(report,stage+'.png')});
    const downloading = page.waitForEvent('download');
    await dialog.locator('button[type="submit"]').click();
    if(encrypted) {
      await page.getByTestId('html-password-password').fill(secret);
      await page.getByTestId('html-password-confirm').fill(secret);
      await passwordDialog.locator('button[type="submit"]').click();
    }
    const download = await downloading;
    const name = stage + (download.suggestedFilename().endsWith('.zip') ? '.zip' : '.html');
    const saved = path.join(report,name);
    await download.saveAs(saved);
    assert.equal(await download.failure(),null);
    assert.equal(await page.evaluate(()=>window.qa.originalUnchanged()),true);
    return saved;
  }
  async function restore(saved, encrypted=false) {
    stage = 'restore-' + path.basename(saved);
    await page.locator('#restore').setInputFiles(saved);
    if(encrypted) {
      await page.getByTestId('html-password-password').fill(secret);
      await passwordDialog.locator('button[type="submit"]').click();
    }
    await page.waitForFunction(()=>window.qa.restored || window.qa.error);
    const restored=await page.evaluate(()=>({checks:window.qa.restored,error:window.qa.error}));
    assert.equal(restored.error,null);
    for(const [name,ok] of Object.entries(restored.checks)) assert.equal(ok,true,name);
    results.push({stage,checks:restored.checks});
  }
  const all = await exportFile('all');
  assert.ok(all.endsWith('.html'));
  const allChecks = await page.evaluate(text=>window.qa.inspectHtml(text),await readFile(all,'utf8'));
  for(const [name,ok] of Object.entries(allChecks)) assert.equal(ok,name==='attachmentCopies'?1:true,name);
  results.push({stage:'all-html',checks:allChecks});
  await restore(all);
  for(const mode of ['selected','none']) {
    const saved=await exportFile(mode);
    const info=await page.evaluate(({data,mode})=>window.qa.inspect(data,mode),{data:Array.from(await readFile(saved)),mode});
    assert.equal(info.separate,mode==='none'?4:3);
    assert.equal(info.noExcludedOriginals,true);
    assert.equal(info.differentSameNamePaths,true);
    results.push({stage:mode,checks:info});
    await restore(saved);
  }
  const protectedZip=await exportFile('none',true);
  const protectedInfo=await page.evaluate(data=>window.qa.inspect(data,'protected'),Array.from(await readFile(protectedZip)));
  assert.deepEqual(protectedInfo.paths,['viewer.html','files/content.emmenc']);
  assert.equal(protectedInfo.plaintextLeaked,false);
  results.push({stage:'encrypted-zip',checks:protectedInfo});
  await restore(protectedZip,true);
  await page.screenshot({path:path.join(report,'restored.png')});
  await writeFile(path.join(report,'results.json'),JSON.stringify({passed:true,results},null,2));
  console.log('PASS browser: all / selected / none / actual downloads / encrypted ZIP / exact original restoration / multiple centers / note photo');
} catch(error) {
  if(page) {
    await page.screenshot({path:path.join(report,'failure.png')}).catch(()=>{});
    await writeFile(path.join(report,'failure-aria.txt'),await page.locator('body').ariaSnapshot().catch(()=>''));
  }
  await writeFile(path.join(report,'results.json'),JSON.stringify({passed:false,stage,errorType:error?.name,results},null,2));
  console.error('FAIL browser stage: '+stage+' ('+error?.name+')');
  process.exitCode=1;
} finally {
  await browser?.close();
  await server.close();
}
