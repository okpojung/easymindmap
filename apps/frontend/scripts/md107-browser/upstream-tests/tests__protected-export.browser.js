/* Disposable fixtures only. Passwords are generated in memory and never reported. */
async function runProtectedExportRegression(nativeFixtureHandle=null){
  if(!window.MDE||(!window.desktopAPI?.smokeTest&&!document.getElementById('mdData')?.dataset.name?.startsWith('cursor-regression')))throw new Error('Isolated export fixture required');
  const cases=[],check=(ok,name,language)=>{if(!ok)throw new Error('Protected export: '+language+'/'+name);cases.push({language,name,passed:true});};
  const original={builder:buildHtml,password:askEncryptionPassword,download:downloadText,picker:window.showSaveFilePicker,confirm:window.confirm,alert:window.alert,encrypt:encryptStandaloneHtml,kind:DOC.kind,handle:DOC.handle,saved:DOC.saved,fileBound:DOC.fileBound,name:fileName,protected:PROTECTED_DOCUMENT,frame:{...FRAME_HOST},text:md,lang:uiLang};
  let outputs=[],promptCount=0,alerts=0,allowPlain=false,currentPassword=null;
  const reset=()=>{outputs=[];alerts=0;};
  window.alert=()=>{alerts++;};window.confirm=()=>allowPlain;
  askEncryptionPassword=async()=>{promptCount++;return currentPassword;};
  downloadText=(data,name,type)=>outputs.push({data,name,type});
  window.showSaveFilePicker=async options=>({name:options.suggestedName,async createWritable(){let value;return {async write(blob){value=await blob.text();},async close(){outputs.push({data:value,name:options.suggestedName,type:options.types[0].accept});}};}});
  const sourceText='Private synthetic Markdown '+crypto.getRandomValues(new Uint32Array(3)).join('-');
  const secret=()=>String.fromCharCode(65,55)+[...crypto.getRandomValues(new Uint8Array(18))].map(n=>n.toString(16).padStart(2,'0')).join('');
  try{
    FRAME_HOST.active=false;FRAME_HOST.pending=null;
    for(const language of ['ko','en','ja','zh']){
      PROTECTED_DOCUMENT=false;newDoc(sourceText,'cursor-regression-export.md');setLanguage(language,false);reset();currentPassword=secret();
      const menu=[...document.querySelectorAll('#fileList [data-act]')].filter(b=>['md','offline','encrypted','online'].includes(b.dataset.act));
      check(menu.length===3&&!menu.some(b=>b.dataset.act==='online')&&menu.every(b=>b.textContent.trim()),'three export menu choices',language);
      await writeTo('md',true);const mdOk=outputs.length===1&&outputs[0].data===sourceText;reset();
      await writeTo('offline',true);const offline=outputs[0]?.data;
      const offlineOk=typeof offline==='string'&&!protectedHtmlParts(offline).querySelector('script[src],link[rel="stylesheet"][href]')&&!isEncryptedHtml(offline)&&!!protectedHtmlParts(offline).querySelector('script[data-lib-url="'+MERMAID_URL+'"]:not([src])');
      const legacy='<!doctype html><textarea id="mdData" data-name="legacy.md.html">legacy source</textarea><script data-lib-url="https://example.invalid/lib.js" src="https://example.invalid/lib.js"><\/script>';
      const opened=await loadFile(new File([legacy],'legacy.md.html',{type:'text/html'}),null);reset();await writeTo('online',true);
      check(mdOk&&offlineOk&&opened&&md==='legacy source'&&outputs.length===1&&!protectedHtmlParts(outputs[0].data).querySelector('script[src],link[rel="stylesheet"][href]'),'offline default and legacy online compatibility',language);
      PROTECTED_DOCUMENT=false;newDoc(sourceText,'cursor-regression-export.md');reset();await writeTo('encrypted',true);
      const locked=outputs[0]?.data,first=parseEncryptedHtml(locked),plain=await decryptStandaloneHtml(locked,currentPassword);
      check(outputs.length===1&&!locked.includes(sourceText)&&!locked.includes(currentPassword)&&plain.kind==='markdown'&&protectedHtmlParts(plain.html).querySelector('textarea#mdData')?.value===sourceText,'encrypted full offline roundtrip',language);
      reset();let probe='mde.export-test.'+crypto.getRandomValues(new Uint32Array(1))[0];
      const loaded=await loadFile(new File([locked],'protected-document.md.html',{type:'text/html'}),null);
      SAFE_STORAGE.setItem(probe,'must-not-persist');let notStored=true;try{notStored=localStorage.getItem(probe)===null;localStorage.removeItem(probe);}catch{}
      const beforePrompt=promptCount;cm.replaceRange(' EDIT',{line:cm.lastLine(),ch:cm.getLine(cm.lastLine()).length});await doSave();
      const second=parseEncryptedHtml(outputs[0]?.data),saved=await decryptStandaloneHtml(outputs[0].data,currentPassword);
      check(loaded&&PROTECTED_DOCUMENT&&DOC.kind==='encrypted'&&notStored&&promptCount>beforePrompt&&first.salt!==second.salt&&protectedHtmlParts(saved.html).querySelector('textarea#mdData')?.value.endsWith(' EDIT'),'protected reopen resave and no storage',language);
      reset();const remembered=md,rememberedKind=DOC.kind;currentPassword=secret();const wrong=await loadFile(new File([locked],'wrong.md.html',{type:'text/html'}),null);
      currentPassword=null;await writeTo('encrypted',true);currentPassword=secret();encryptStandaloneHtml=async()=>{throw new Error('cryptoUnavailable');};await writeTo('encrypted',true);encryptStandaloneHtml=original.encrypt;
      check(wrong===false&&md===remembered&&DOC.kind===rememberedKind&&outputs.length===0&&alerts>=1,'wrong password cancellation and fail closed',language);
      reset();allowPlain=false;await writeTo('md',true);const refused=outputs.length===0;allowPlain=true;await writeTo('md',true);const explicitPlain=outputs.length===1&&outputs[0].data===md&&PROTECTED_DOCUMENT&&DOC.kind==='encrypted';
      PROTECTED_DOCUMENT=false;newDoc(sourceText,'cursor-regression-host.md');FRAME_HOST.active=true;FRAME_HOST.saveLabel='Synthetic host';const hostSaved=DOC.saved,hostHandle=DOC.handle,hostKind=DOC.kind;reset();await writeTo('encrypted',true);
      const preserved=FRAME_HOST.active&&DOC.saved===hostSaved&&DOC.handle===hostHandle&&DOC.kind===hostKind;
      FRAME_HOST.active=false;reset();newDoc('![external](https://example.invalid/image.png)','cursor-regression-image.md');await writeTo('encrypted',true);const imagesRefused=outputs.length===0&&alerts===1;
      newDoc(sourceText,'cursor-regression-race.md');reset();const realBuilder=buildHtml;
      buildHtml=async(...args)=>{const result=await realBuilder(...args);newDoc('replacement document','cursor-regression-replacement.md');return result;};await writeTo('offline',true);buildHtml=realBuilder;
      const raceSafe=md==='replacement document'&&DOC.kind==='md'&&!DOC.fileBound&&outputs.length===1&&outputs[0].name==='cursor-regression-race.md.html';
      reset();const delayed={name:'slow.md',size:5,text:async()=>{cm.replaceRange(' RECENT',{line:cm.lastLine(),ch:cm.getLine(cm.lastLine()).length});return 'stale';}};
      const staleOpen=await loadFile(delayed,null),staleOpenSafe=staleOpen===false&&md==='replacement document RECENT'&&DOC.kind==='md'&&!DOC.fileBound;
      const raceFlags={refused,explicitPlain,preserved,imagesRefused,raceSafe,staleOpenSafe,staleRejected:staleOpen===false,plainKind:DOC.kind==='md',unbound:!DOC.fileBound,recentEdit:md.endsWith(' RECENT')};
      if(Object.values(raceFlags).some(v=>v!==true))throw new Error('Protected export race flags '+language+' '+JSON.stringify(raceFlags));
      check(true,'plaintext consent host preservation and document race',language);
    }
    let nativeFileRoundtrip=false;
    if(window.desktopAPI?.smokeTest){
      const handle=nativeFixtureHandle||original.handle;
      if(!handle||handle.name!=='fixture.md')throw new Error('Disposable native fixture handle required');
      const beforeFile=await handle.getFile(),before=await beforeFile.text(),nativePassword=secret();
      const plain=await buildHtml(true,{markdown:'native encrypted fixture',encrypted:true});
      const encrypted=await encryptStandaloneHtml(plain,nativePassword,'markdown','ko');
      try{
        const writer=await handle.createWritable();await writer.write(new Blob([encrypted],{type:'text/html'}));await writer.close();
        const reopened=await handle.getFile(),stored=await reopened.text();
        nativeFileRoundtrip=stored===encrypted&&(await decryptStandaloneHtml(stored,nativePassword)).html===plain;
        if(!nativeFileRoundtrip)throw new Error('Native ciphertext roundtrip failed');
      }finally{const restore=await handle.createWritable();await restore.write(new Blob([before],{type:'text/markdown'}));await restore.close();}
    }
    return {passed:true,cases,nativeFileRoundtrip};
  }finally{
    buildHtml=original.builder;askEncryptionPassword=original.password;downloadText=original.download;window.showSaveFilePicker=original.picker;window.confirm=original.confirm;window.alert=original.alert;encryptStandaloneHtml=original.encrypt;currentPassword=null;
    FRAME_HOST.active=original.frame.active;FRAME_HOST.origin=original.frame.origin;FRAME_HOST.saveLabel=original.frame.saveLabel;FRAME_HOST.pending=original.frame.pending;FRAME_HOST.lastSent=original.frame.lastSent;
    PROTECTED_DOCUMENT=original.protected;fileName=original.name;DOC.kind=original.kind;DOC.handle=original.handle;DOC.fileBound=original.fileBound;setAll(original.text,'file');DOC.saved=original.saved;setLanguage(original.lang,false);updStatus();
  }
}

/* EMM fixture-only crypto adapter. The pinned regression above is unchanged.
   EMM retains its existing shared API rather than importing standalone globals. */
(()=>{
 const pinned=runProtectedExportRegression;
 runProtectedExportRegression=async(...args)=>{
  const api=window.EmmEncryptedHtml,realEncrypt=api.encryptStandaloneHtml,nonce=FRAME_HOST.loadNonce,realBuilder=buildHtml;
  buildHtml=async(...a)=>{const html=await realBuilder(...a);if(/runOutlineRegression|runToolbarRegression|runTableGridRegression|runRenderedTailRegression|runSplitScrollRegression|runEmbedHostRegression|runProtectedExportRegression|EMM fixture-only crypto adapter/.test(html))throw Error('Test-only code leaked into exported HTML');return html;};
  const names=['encryptStandaloneHtml','decryptStandaloneHtml','isEncryptedHtml','parseEncryptedHtml','protectedHtmlParts'];
  const previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(window,name)]));
  Object.assign(window,{encryptStandaloneHtml:(...a)=>realEncrypt(...a),decryptStandaloneHtml:(...a)=>api.decryptStandaloneHtml(...a),isEncryptedHtml:text=>isProtectedFile(text),parseEncryptedHtml:text=>api.createHtmlCrypto().parse(text),protectedHtmlParts:text=>new DOMParser().parseFromString(text,'text/html')});
  api.encryptStandaloneHtml=(...a)=>window.encryptStandaloneHtml(...a);
  try{return await pinned(...args);}
  catch(error){if(error&&typeof error.message==='string')throw error;throw new Error('Protected fixture non-Error rejection: '+String(error));}
  finally{buildHtml=realBuilder;api.encryptStandaloneHtml=realEncrypt;FRAME_HOST.loadNonce=nonce;for(const[name,descriptor]of previous){if(descriptor)Object.defineProperty(window,name,descriptor);else delete window[name];}}
 };
})();
