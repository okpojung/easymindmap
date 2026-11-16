/* Shared regression, only on a disposable fixture or native smoke document. */
async function runToolbarRegression(){
 const m=window.MDE;if(!m||(!window.desktopAPI?.smokeTest&&!document.getElementById('mdData')?.dataset.name?.startsWith('cursor-regression')))throw Error('Isolated toolbar fixture required');
 const cases=[],before={text:m.markdown,mode:mode,language:m.getLanguage(),left:m.splitLeft};
 const check=(ok,language,name)=>{if(!ok)throw Error('Toolbar regression '+language+'/'+name);cases.push({language,name,passed:true});};
 const click=selector=>{const b=document.querySelector(selector);if(!b)throw Error('Missing toolbar action '+selector);b.click();};
 const settle=()=>flushPendingEdits();
 try{for(const language of ['ko','en','ja','zh']){
  m.setLanguage(language,false);m.setSplitLeft('md');
  for(const target of ['src','ww'])for(const kind of ['ul','ol','task']){
   m.setMarkdown('');m.setMode(target==='src'?'md':'rendered');if(target==='src')m.cm.focus();else{m.ed.focus();m.ed.eventEmitter.emit('focus','wysiwyg');m.ed.setSelection(1,1);}
   const prefix={ul:'- ',ol:'1. ',task:'- [ ] '}[kind],id=target+'/'+kind;
   click('[data-fmt="'+kind+'"]');settle();check(m.markdown===prefix,language,id+'/empty marker');
   click('[data-fmt="'+kind+'"]');settle();check(m.markdown==='',language,id+'/empty cancel');
   click('[data-fmt="'+kind+'"]');if(target==='src')m.cm.replaceSelection('Item');else m.ed.insertText('Item');settle();check(m.markdown===prefix+'Item',language,id+'/type after marker');
   click('[data-fmt="'+kind+'"]');settle();check(m.markdown==='Item',language,id+'/toggle keeps text');
  }
  for(const kind of ['ul','ol','task']){
   const prefix={ul:'- ',ol:'1. ',task:'- [ ] '}[kind];m.setMarkdown('- Parent\n  '+prefix+'Child');m.setMode('rendered');m.ed.focus();m.ed.eventEmitter.emit('focus','wysiwyg');let position=null;m.ed.wwEditor.view.state.doc.descendants((node,pos)=>{if(node.isText&&node.text==='Child')position=pos;});if(position===null)throw Error('Nested fixture missing child');const view=m.ed.wwEditor.view;view.dispatch(view.state.tr.delete(position,position+5));m.ed.setSelection(position,position);settle();click('[data-fmt="'+kind+'"]');settle();const s=m.ed.wwEditor.view.state.selection;let list=false;for(let d=s.$from.depth;d>0;d--)if(s.$from.node(d).type.name==='listItem')list=true;check(!list,language,'nested/'+kind+'/remove marker');check(m.markdown.includes('Parent'),language,'nested/'+kind+'/keep parent');
  }
  const text='# Heading\n\nBody\n\n- Item\n';m.setMarkdown(text);m.setSplitLeft('md');m.setMode('split');
  check(getComputedStyle(document.getElementById('srcPane')).display!=='none'&&m.splitLeft==='md',language,'split/default MD');
  click('#srcPane [data-split-left="outline"]');check(getComputedStyle(document.getElementById('outPane')).display!=='none'&&getComputedStyle(document.getElementById('srcPane')).display==='none',language,'split/outline left');
  click('#outPane [data-close-left]');check(mode==='rendered'&&getComputedStyle(document.getElementById('outPane')).display==='none',language,'split/close keeps rendered');
  check(m.markdown===text,language,'split/content unchanged');
  const top=[...document.getElementById('bar').children].filter(e=>e.id).map(e=>e.id);
  check(top.indexOf('fileActions')<top.indexOf('viewControls')&&top.indexOf('viewControls')<top.indexOf('tools'),language,'toolbar/file first');
  check(!document.getElementById('closeBtn'),language,'toolbar/no duplicate close');
  check(!!document.querySelector('#fileList [data-act="close"]'),language,'toolbar/file close retained');
  check(getComputedStyle(document.getElementById('bar')).flexWrap==='nowrap',language,'toolbar/no wrap');
 }}finally{m.setLanguage(before.language,false);m.setSplitLeft(before.left);m.setMarkdown(before.text);m.setMode(before.mode);}
 return {passed:true,cases};
}
