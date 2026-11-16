// Synthetic local fixture only. Never bundled into or exported by the editor.
async function runEmm107HostRegression(){
 const frame=document.getElementById('embedEditor'),gate=window.__md107Gate,capture=window.__md107Capture;
 if(!frame||!gate||typeof capture!=='function'||!document.getElementById('embedTest')?.textContent.includes('Disposable EMM integration fixture'))throw Error('Isolated EMM host fixture required');
 const w=frame.contentWindow,m=w.MDE,cases=[],pause=ms=>new Promise(r=>setTimeout(r,ms));
 const check=(ok,name)=>{if(!ok)throw Error('EMM 1.0.7: '+name);cases.push({name,passed:true});};
 const wait=async(fn,name)=>{for(let i=0;i<120;i++){if(fn())return;await pause(25);}throw Error('EMM fixture timeout: '+name);};
 const send=data=>w.postMessage(data,location.origin);
 const seed=async text=>{send({type:'mde:config',name:'cursor-regression-emm107.md',saveLabel:'EMM fixture save'});const nonce=gate.begin(text);send({type:'mde:set',markdown:text,loadNonce:nonce});await wait(()=>gate.ready,'exact initialization ACK');return nonce;};
 const messages=()=>window.__md107Messages.filter(x=>x?.type==='mde:save');
 const edit=async(text,line=0)=>{m.setSplitLeft('outline');m.setMode('outline');await pause(0);const row=w.document.querySelector('#outline .row[data-line="'+line+'"]');if(!row?._edit)throw Error('Outline fixture row unavailable');row._edit(false);const tx=row.querySelector('.tx');tx.textContent=text;tx.dispatchEvent(new w.InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));return tx;};
 const focusOutsideWithoutBlur=tx=>{const blur=tx.onblur;tx.onblur=null;document.querySelector('[data-suite="outline"]').focus();tx.onblur=blur;};
 const dirty=()=>w.document.title.startsWith('● ');
 let originalAsk=w.askEncryptionPassword,originalPicker=w.showSaveFilePicker,password=null;
 try{
  for(const [kind,base,expected]of [['heading','# Original\n\nTail','# Line 1<br>Line 2\n\nTail'],['list','- Original\n\nTail','- Line 1<br>Line 2\n\nTail'],['paragraph','Original\n\nTail','Line 1\nLine 2\n\nTail']]){
   await seed(base);const tx=await edit('Line 1\nLine 2');check(dirty()&&m.markdown===base,kind+' uncommitted multiline marks dirty');focusOutsideWithoutBlur(tx);check(capture()===expected,kind+' parent capture commits exact newlines without blur');
   m.outline.undo();check(m.markdown===base,kind+' undo preserves original');m.outline.redo();check(m.markdown===expected,kind+' redo preserves newlines');
  }
  await seed('# Original\n\nTail');const metadataDraft=await edit('Metadata draft');send({type:'mde:config',name:'cursor-regression-renamed.md',saveLabel:'Metadata save'});await pause(40);
  check(metadataDraft.isConnected&&metadataDraft.isContentEditable&&dirty()&&m.markdown==='# Original\n\nTail','metadata-only config retains pending input and dirty baseline');focusOutsideWithoutBlur(metadataDraft);check(capture()==='# Metadata draft\n\nTail','metadata update retains exact input on parent capture');
  for(const meta of [{ctrlKey:true},{metaKey:true}]){
   const nonce=await seed('# Original\n\nTail'),tx=await edit(meta.metaKey?'Cmd latest':'Ctrl latest'),before=messages().length;focusOutsideWithoutBlur(tx);
   w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'s',bubbles:true,cancelable:true,...meta}));await wait(()=>messages().length>before,'keyboard save');const sent=messages().at(-1);
   check(sent.markdown==='# '+(meta.metaKey?'Cmd latest':'Ctrl latest')+'\n\nTail'&&sent.loadNonce===nonce,(meta.metaKey?'Cmd':'Ctrl')+'+S includes pending outline text and nonce');
   send({type:'mde:saved',markdown:sent.markdown,loadNonce:nonce});await wait(()=>!dirty(),'exact keyboard save ACK');
  }
  {
   const nonce=await seed('# Baseline\n\nTail');await edit('A');const count=messages().length;w.frameSave();await wait(()=>messages().length>count,'A save');const a=messages().at(-1).markdown;
   const tx=await edit('Newer B');focusOutsideWithoutBlur(tx);send({type:'mde:saved',markdown:a,loadNonce:nonce});await pause(40);
   check(m.markdown==='# Newer B\n\nTail'&&dirty(),'late ACK commits latest pending input but does not mark it saved');
   send({type:'mde:saved',ok:false,loadNonce:nonce});await pause(40);check(dirty(),'failed ACK retains newer dirty input');
   const count2=messages().length;w.frameSave();await wait(()=>messages().length>count2,'retry');const b=messages().at(-1).markdown;send({type:'mde:saved',markdown:b,loadNonce:nonce});await wait(()=>!dirty(),'retry exact ACK');check(m.markdown===b,'explicit retry preserves newer input');
  }
  {
   const old=await seed('A');m.setMarkdown('A sent');w.frameSave();w.newDoc('B','fixture-local.md');m.setMarkdown('A sent');send({type:'mde:saved',markdown:'A sent',loadNonce:old});await pause(40);
   let blocked=false;try{capture();}catch(e){blocked=e.message==='MD_FRAME_DETACHED_DIRTY';}
   check(dirty()&&blocked,'new local document cannot inherit old attachment ACK or capture binding');
   // Bind an explicitly fresh host document, never capture the local draft.
   const current=await seed('fresh baseline');m.setMarkdown('A sent');w.frameSave();send({type:'mde:saved',markdown:'A sent',loadNonce:old});await pause(40);check(dirty(),'rebound document ignores old generation ACK');send({type:'mde:saved',markdown:'A sent',loadNonce:current});await wait(()=>!dirty(),'current generation ACK');
  }
  {
   await seed('ordinary attachment');const random=new Uint32Array(4);crypto.getRandomValues(random);password='Fixture-A7!'+[...random].map(x=>x.toString(16)).join('');
   const privateText='# SYNTHETIC_PRIVATE_FIXTURE\n\nEncrypted body only',html='<!doctype html><meta charset="utf-8"><textarea id="mdData" hidden>'+privateText+'</textarea>';
   const locked=await w.encryptedApi().encryptStandaloneHtml(html,password,'markdown');w.askEncryptionPassword=async()=>password;
   await w.loadFile(new w.File([locked],'fixture-protected.md.html',{type:'text/html'}),null);
   check(capture()===null&&m.markdown===privateText,'real encrypted load stays clean but exposes no host snapshot');
   m.setMode('rendered');m.ed.focus();m.ed.eventEmitter.emit('focus','wysiwyg');m.ed.setSelection(m.ed.wwEditor.view.state.doc.content.size-1);m.ed.insertText(' LAST_PENDING');
   let blocked=false;try{capture();}catch(e){blocked=e.message==='MD_FRAME_DETACHED_DIRTY';}check(blocked,'protected rendered input blocks parent close before debounce');
   let saved='';w.showSaveFilePicker=async()=>({name:'fixture-protected.md.html',createWritable:async()=>({write:async value=>{saved=typeof value==='string'?value:await value.text();},close:async()=>{}})});
   const savedOk=await w.writeTo('encrypted',true);check(savedOk&&saved&&!saved.includes('SYNTHETIC_PRIVATE_FIXTURE')&&!saved.includes('LAST_PENDING'),'protected pending input exports encrypted bytes to memory, not plaintext');
   const reopened=await w.encryptedApi().decryptStandaloneHtml(saved,password),parsed=new w.DOMParser().parseFromString(reopened.html,'text/html'),reopenedMarkdown=parsed.querySelector('#mdData').value;
   // Rendered Markdown canonically escapes literal underscores. Compare the
   // exact actual snapshot, and separately verify the final visible characters.
   check(reopenedMarkdown===m.markdown&&reopenedMarkdown.replace(/\\_/g,'_').includes('LAST_PENDING'),'encrypted memory export reopens with exact final pending input');
   check(capture()===null&&!dirty(),'encrypted file save leaves parent detached and local snapshot clean');
   check(!window.__md107Messages.some(x=>['mde:change','mde:save','mde:markdown'].includes(x?.type)&&String(x.markdown).includes('SYNTHETIC_PRIVATE_FIXTURE')),'protected plaintext never reaches parent messages');
   w.showSaveFilePicker=originalPicker;w.askEncryptionPassword=originalAsk;password=null;
   await w.loadFile(new w.File(['Clean disposable fixture'],'cursor-regression-emm107.md',{type:'text/markdown'}),null);
   await seed('# EMM 1.0.7 verified\n\nDisposable local fixture only');
  }
 }finally{w.askEncryptionPassword=originalAsk;w.showSaveFilePicker=originalPicker;password=null;}
 return{passed:true,cases};
}
