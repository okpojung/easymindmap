/* Disposable synthetic fixtures only, also bundled in Electron's guarded smoke mode. */
async function runTableGridRegression() {
  const m = window.MDE;
  if (!m || (!window.desktopAPI?.smokeTest && !document.getElementById('mdData')?.dataset.name?.startsWith('cursor-regression'))) throw new Error('Isolated grid fixture required');
  const pause = ms => new Promise(r => setTimeout(r, ms)), cases = [];
  const check = (condition, message) => { if (!condition) throw new Error('Table grid: '+message); };
  const wait = async (fn, label) => { for(let i=0;i<120;i++){if(fn())return;await pause(25);}throw new Error('Table grid timeout: '+label); };
  const picker = () => document.getElementById('tableSizePicker');
  const table = () => document.querySelector('#ww .toastui-editor-ww-container table');
  const visibleRows = () => table() ? [...table().rows].filter(row => row.cells.length > 0) : []; // Toast UI keeps a zero-cell tbody placeholder for header-only tables
  const seed = (mode, target) => {
    m.ed.blur(); m.setMode(mode); m.setMarkdown('Before grid\n\nKeep this paragraph');
    if(target==='ww') {m.ed.focus();m.ed.setSelection(m.ed.wwEditor.view.state.doc.content.size-1);m.ed.eventEmitter.emit('focus','wysiwyg');}
    else {m.cm.focus();m.cm.setCursor({line:2,ch:19});}
  };
  for(const language of ['ko','en','ja','zh']) {
    m.ed.blur(); m.setLanguage(language,false);
    for(const [mode,target] of [['md','src'],['rendered','ww'],['split','src'],['split','ww']]) {
      for(const [rows,cols] of [[1,1],[3,3],[8,10]]) {
        window.__tableGridCase={language,mode,target,rows,cols};
        seed(mode,target); const before=m.markdown; m.openTable(); await pause(45);
        check(!picker().hidden && document.getElementById('dlg').hidden,'new insertion must start with chooser');
        const cell=document.getElementById('table-size-'+rows+'-'+cols);
        cell.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));
        check(document.querySelectorAll('#tableSizeGrid .selected').length===rows*cols,'highlight rectangle differs');
        check(m.markdown===before,'hover changed document');
        cell.focus(); await pause(0);
        check(!picker().hidden,'focus change prematurely closed chooser');
        cell.click(); check(picker().hidden,'chooser did not close after insertion');
        await wait(()=>m.markdown.includes('|'),'source insertion');
        m.setMode('rendered'); await wait(()=>visibleRows().length===rows && visibleRows().every(r=>r.cells.length===cols),'rendered dimensions');
        check(visibleRows().length===rows,'row count differs '+language+'/'+mode+'/'+target+'/'+rows);
        check(visibleRows().every(r=>r.cells.length===cols),'column count differs');
        check(visibleRows().every(r=>[...r.cells].every(c=>!c.textContent.trim())),'new table must have empty cells');
        check(m.markdown.includes('Keep this paragraph'),'existing text was lost');
        check(!/[\u2063\u2061]/.test(m.markdown),'internal marker leaked');
        check(m.ed.wwEditor.view.state.doc.lastChild.type.name==='paragraph','table has no editable tail');
        cases.push({language,mode,target,rows,cols,passed:true});
      }
    }
  }
  m.ed.blur(); m.setLanguage('ko',false);
  seed('md','src'); const beforeCancel=m.markdown; m.openTable();
  document.getElementById('table-size-1-1').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  check(picker().hidden && m.markdown===beforeCancel,'Escape must cancel without insertion');
  cases.push({fixture:'escape-cancel',passed:true});
  seed('md','src');m.openTable();
  const first=document.getElementById('table-size-1-1');
  first.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
  check(document.activeElement.id==='table-size-2-2','arrow keyboard selection');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));m.setMode('rendered');await wait(()=>table()?.rows.length===2 && table().rows[0].cells.length===2,'keyboard insertion');
  check(table().rows.length===2 && table().rows[0].cells.length===2,'keyboard dimensions');
  cases.push({fixture:'keyboard-dimensions',passed:true});
  m.ed.blur();m.setMode('md');m.setMarkdown('| H1 | H2 |\n| --- | --- |\n| original | retained |');m.cm.setCursor({line:2,ch:4});m.openTable();
  check(picker().hidden && !document.getElementById('dlg').hidden,'existing table must use detail editor');
  const input=document.querySelector('#grid textarea');input.value='Edited header';input.dispatchEvent(new Event('input',{bubbles:true}));
  document.getElementById('dlgOk').click();
  check(m.markdown.includes('Edited header') && m.markdown.includes('retained'),'existing table edit lost data');
  check(m.markdown.split('\n').filter(line=>line.startsWith('|')).length===3,'edit duplicated table');
  cases.push({fixture:'existing-table-edit',passed:true});
  seed('md','src');m.openTable();document.getElementById('table-size-3-3').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));document.getElementById('tableSizeMore').click();
  check(picker().hidden && !document.getElementById('dlg').hidden,'advanced options missing');
  check(document.getElementById('grid').rows.length===3 && document.getElementById('grid').rows[0].cells.length===3,'advanced options lost size');
  document.getElementById('dlgCancel').click();cases.push({fixture:'advanced-options',passed:true});
  m.ed.blur();m.setMode('rendered');m.setMarkdown('Grid chooser verified\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nContinue below the table.');
  return {passed:true,cases};
}
