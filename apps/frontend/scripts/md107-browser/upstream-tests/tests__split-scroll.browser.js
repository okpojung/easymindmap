/* Run only on a disposable fixture, or Electron's guarded smoke document. */
async function runSplitScrollRegression() {
  const m=window.MDE;
  if(!m||(!window.desktopAPI?.smokeTest&&!document.getElementById('mdData')?.dataset.name?.startsWith('cursor-regression')))throw Error('Isolated split fixture required');
  const cases=[],pause=ms=>new Promise(r=>setTimeout(r,ms));
  const check=(ok,name,language='shared')=>{if(!ok){const s=m.cm.getScrollInfo(),r=m.ed.wwEditor.view.dom;throw Error('Split follow: '+language+'/'+name+' '+JSON.stringify({visibility:document.visibilityState,sourceFocus:m.cm.hasFocus(),renderedFocus:m.ed.wwEditor.view.hasFocus(),src:s.top,srcHeight:s.height,srcClient:s.clientHeight,ww:r.scrollTop,wwHeight:r.scrollHeight,wwClient:r.clientHeight,forwardY:(()=>{let p=null;m.ed.wwEditor.view.state.doc.descendants((n,at)=>{if(n.isText&&n.text.includes('FORWARD_SENTINEL'))p=at+n.text.indexOf('FORWARD_SENTINEL')+2;});return p===null?null:m.ed.wwEditor.view.coordsAtPos(p).top-r.getBoundingClientRect().top;})()}));}cases.push({language,name,passed:true});};
  const chunk=i=>'## Signal '+String(i).padStart(2,'0')+'\n\n'+('Paragraph '+i+' **bold** 한글 中文 日本語. ').repeat(i%3===0?18:4)+'\n\n- Item '+i+'\n  - Nested '+i+'\n'+(i%4===0?'\n| Column A | Column B |\n| --- | --- |\n| cell '+i+' | value |\n\n```js\nconst signal = '+i+';\nconsole.log(signal);\n```\n':'');
  const text=Array.from({length:44},(_,i)=>chunk(i)).join('\n');
  const srcLine=n=>m.cm.getValue().split('\n').findIndex(l=>l==='## Signal '+String(n).padStart(2,'0'));
  const pmPos=n=>{let found=null;m.ed.wwEditor.view.state.doc.descendants((node,pos)=>{if(node.type.name==='heading'&&node.textContent==='Signal '+String(n).padStart(2,'0'))found=pos+1;});return found;};
  const rendered=()=>m.ed.wwEditor.view.dom;
  const sourceY=n=>m.cm.charCoords({line:srcLine(n),ch:0},'window').top-m.cm.getWrapperElement().getBoundingClientRect().top;
  const renderedY=n=>m.ed.wwEditor.view.coordsAtPos(pmPos(n)).top-rendered().getBoundingClientRect().top;
  const close=n=>Math.abs(sourceY(n)-renderedY(n))<45;
  const settled=async fn=>{for(let i=0;i<100&&!fn();i++)await pause(30);};
  const sourceScroll=async n=>{m.cm.getScrollerElement().dispatchEvent(new WheelEvent('wheel',{deltaY:1,bubbles:true}));m.cm.scrollTo(null,m.cm.charCoords({line:srcLine(n),ch:0},'local').top);await pause(90);await settled(()=>close(n));};
  const renderedScroll=async n=>{const box=rendered();box.dispatchEvent(new WheelEvent('wheel',{deltaY:1,bubbles:true}));box.scrollTop+=renderedY(n)-24;box.dispatchEvent(new Event('scroll'));await pause(90);await settled(()=>close(n));};
  for(const language of ['ko','en','ja','zh']) {
    m.ed.blur();m.setLanguage(language,false);m.setMarkdown(text);m.setMode('split');await pause(140);
    m.cm.focus();m.cm.setCursor({line:0,ch:0});await pause(70);
    await sourceScroll(12);check(close(12),'source scroll matches block',language);
    const savedSelection=JSON.stringify(m.cm.listSelections());
    await renderedScroll(27);check(close(27),'rendered scroll matches block',language);
    check(JSON.stringify(m.cm.listSelections())===savedSelection,'rendered scroll preserves source selection',language);
    const wwSelection=JSON.stringify(m.ed.wwEditor.view.state.selection.toJSON());
    m.cm.focus();m.cm.setCursor({line:srcLine(33),ch:4});await pause(90);await settled(()=>Math.abs(sourceY(33)-renderedY(33))<65);
    check(Math.abs(sourceY(33)-renderedY(33))<65,'source cursor reveals corresponding block',language);
    check(JSON.stringify(m.ed.wwEditor.view.state.selection.toJSON())===wwSelection,'source selection preserves rendered selection',language);
    const cmSelection=JSON.stringify(m.cm.listSelections());
    m.ed.focus();m.ed.setSelection(pmPos(7));rendered().dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowDown',bubbles:true}));await pause(90);await settled(()=>close(7));
    check(close(7),'rendered cursor reveals corresponding block',language);
    check(JSON.stringify(m.cm.listSelections())===cmSelection,'rendered selection preserves source selection',language);
    check(m.markdown===text,'scrolling and selection never change document',language);
  }
  m.ed.blur();m.setLanguage('ko',false);m.setMode('split');m.setMarkdown(text);await pause(150);
  m.cm.focus();m.cm.setCursor({line:0,ch:0});await pause(70);
  m.cm.getScrollerElement().dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true}));m.cm.scrollTo(null,1e9);await pause(90);await settled(()=>rendered().scrollHeight-rendered().clientHeight-rendered().scrollTop<3);check(rendered().scrollHeight-rendered().clientHeight-rendered().scrollTop<3,'source bottom follows rendered bottom');
  m.cm.getScrollerElement().dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true}));m.cm.scrollTo(null,0);await pause(90);await settled(()=>rendered().scrollTop<3);check(rendered().scrollTop<3,'source top follows rendered top');
  rendered().dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true}));rendered().scrollTop=rendered().scrollHeight;rendered().dispatchEvent(new Event('scroll'));await pause(90);await settled(()=>{const s=m.cm.getScrollInfo();return s.height-s.clientHeight-s.top<3;});const bottom=m.cm.getScrollInfo();check(bottom.height-bottom.clientHeight-bottom.top<3,'rendered bottom follows source bottom');
  rendered().dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true}));rendered().scrollTop=0;rendered().dispatchEvent(new Event('scroll'));await pause(90);await settled(()=>m.cm.getScrollInfo().top<3);check(m.cm.getScrollInfo().top<3,'rendered top follows source top');
  await sourceScroll(20);const st=m.cm.getScrollInfo().top,rt=rendered().scrollTop;await pause(350);check(Math.abs(st-m.cm.getScrollInfo().top)<2&&Math.abs(rt-rendered().scrollTop)<2,'no scroll feedback oscillation');
  m.setMode('md');const before=rendered().scrollTop;m.cm.scrollTo(null,0);await pause(100);check(rendered().scrollTop===before,'no follow outside split mode');
  m.setMode('split');m.setMarkdown('Short document');await pause(150);m.cm.focus();m.cm.setCursor({line:0,ch:5});await pause(100);check(m.markdown==='Short document','short document safe');
  m.setMarkdown('');await pause(100);m.cm.scrollTo(null,0);check(m.markdown==='','empty document safe');
  m.setMarkdown(text);await pause(120);await sourceScroll(18);check(close(18),'mapping rebuilt after document replacement');
  const old=m.ed;m.setLanguage('en',false);await pause(140);await sourceScroll(30);check(m.ed!==old&&close(30),'mapping and listeners rebound after locale rebuild');
  m.setLanguage('ko',false);m.setMode('split');m.setMarkdown(text);await pause(140);
  m.cm.focus();m.cm.setCursor({line:srcLine(15),ch:3});m.cm.replaceSelection('NEW');await settled(()=>m.markdown.includes('NEW'));await pause(150);await sourceScroll(24);check(close(24)&&m.markdown.includes('NEW'),'source edit debounce refreshes mapping');
  m.ed.focus();m.ed.eventEmitter.emit('focus','wysiwyg');m.ed.setSelection(pmPos(10));m.ed.insertText('WWNEW');m.ed.eventEmitter.emit('change','wysiwyg');await settled(()=>m.markdown.includes('WWNEW'));await pause(150);await renderedScroll(32);await settled(()=>close(32)&&m.markdown.includes('WWNEW'));check(close(32)&&m.markdown.includes('WWNEW'),'rendered edit debounce refreshes mapping');

  const originalSyntax=m.settings.syntax;
  try{for(const language of ['ko','en','ja','zh']){
    m.ed.blur();m.setLanguage(language,false);m.settings.syntax='emm';
    const longText='__underline__ ==highlight== [short](https://example.invalid/'+('longurl/'.repeat(2500))+') FORWARD_SENTINEL '+('visible body words '.repeat(800))+' REVERSE_SENTINEL '+('tail words '.repeat(100));
    m.setMarkdown(longText);m.setMode('split');await pause(180);
    const markerPos=marker=>{let p=null;m.ed.wwEditor.view.state.doc.descendants((n,at)=>{if(n.isText&&n.text.includes(marker))p=at+n.text.indexOf(marker)+2;});return p;};
    const visibleRendered=marker=>{const y=m.ed.wwEditor.view.coordsAtPos(markerPos(marker)).top-rendered().getBoundingClientRect().top;return y>=-2&&y<rendered().clientHeight-10;};
    m.cm.focus();m.cm.setCursor({line:0,ch:0});m.cm.setCursor({line:0,ch:longText.indexOf('FORWARD_SENTINEL')+2});await settled(()=>visibleRendered('FORWARD_SENTINEL'));
    check(visibleRendered('FORWARD_SENTINEL'),'long link and EMM syntax source text follows visible text',language);
    m.ed.focus();m.ed.setSelection(markerPos('REVERSE_SENTINEL'));rendered().dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',bubbles:true}));
    const visibleSource=()=>{const y=m.cm.charCoords({line:0,ch:longText.indexOf('REVERSE_SENTINEL')+2},'window').top-m.cm.getWrapperElement().getBoundingClientRect().top;return y>=-2&&y<m.cm.getWrapperElement().clientHeight-10;};
    await settled(visibleSource);check(visibleSource()&&m.markdown===longText,'long link and EMM syntax rendered text follows source text',language);
    const tableText='| [head](https://example.invalid/'+('segment/'.repeat(700))+') | HEAD_CELL_SENTINEL |\n| --- | --- |\n| [body](https://example.invalid/'+('segment/'.repeat(700))+') | BODY_CELL_SENTINEL '+Array.from({length:180},(_,i)=>'CELL_WORD_'+i).join(' ')+' |';
    m.ed.blur();m.setMarkdown(tableText);m.setMode('split');await pause(150);
    const headCh=tableText.split('\n')[0].indexOf('HEAD_CELL_SENTINEL')+2,bodyCh=tableText.split('\n')[2].indexOf('BODY_CELL_SENTINEL')+2;
    m.cm.focus();m.cm.setCursor({line:0,ch:0});m.cm.setCursor({line:0,ch:headCh});await settled(()=>visibleRendered('HEAD_CELL_SENTINEL'));
    const tableMap=splitBlockMap(),mappedHead=splitRenderedPosition(tableMap,splitSourcePosition(tableMap,{line:0,ch:headCh}));
    check(visibleRendered('HEAD_CELL_SENTINEL')&&Math.abs(mappedHead-markerPos('HEAD_CELL_SENTINEL'))<=1,'table header inline source follows rendered cell',language);
    const word='CELL_WORD_90',wordCh=tableText.split('\n')[2].indexOf(word)+2,box=rendered();
    m.ed.blur();box.dispatchEvent(new WheelEvent('wheel',{deltaY:1,bubbles:true}));box.scrollTop+=m.ed.wwEditor.view.coordsAtPos(markerPos(word)).top-box.getBoundingClientRect().top-24;box.dispatchEvent(new Event('scroll'));
    const wordVisible=()=>{const y=m.cm.charCoords({line:2,ch:wordCh},'window').top-m.cm.getWrapperElement().getBoundingClientRect().top;return y>=-2&&y<m.cm.getWrapperElement().clientHeight-10;};
    await settled(wordVisible);const tableScrollPassed=wordVisible();
    const tableSelection=JSON.stringify(m.cm.listSelections());m.ed.focus();m.ed.setSelection(markerPos('BODY_CELL_SENTINEL'));rendered().dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',bubbles:true}));
    const bodyVisible=()=>{const y=m.cm.charCoords({line:2,ch:bodyCh},'window').top-m.cm.getWrapperElement().getBoundingClientRect().top;return y>=-2&&y<m.cm.getWrapperElement().clientHeight-10;};
    await settled(bodyVisible);const mappedBody=splitMarkdownPosition(splitBlockMap(),markerPos('BODY_CELL_SENTINEL'));
    check(tableScrollPassed&&bodyVisible()&&mappedBody.line===2&&Math.abs(mappedBody.ch-bodyCh)<=1&&JSON.stringify(m.cm.listSelections())===tableSelection&&m.markdown===tableText,'table body inline rendered follows source cell',language);
  }}finally{m.settings.syntax=originalSyntax;}
  return {passed:true,cases};
}
