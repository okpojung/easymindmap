/* Synthetic editor fixtures only. Called explicitly by isolated browser/desktop smoke tests. */
async function runRenderedTailRegression() {
  const m = window.MDE;
  if (!m || (!window.desktopAPI?.smokeTest && !document.getElementById("mdData")?.dataset.name?.startsWith("cursor-regression"))) throw new Error("Isolated fixture required");
  const cases = [], pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (condition, message) => { if (!condition) throw new Error("Rendered tail: " + message); };
  const wait = async (predicate, message) => {
    for (let i = 0; i < 160; i++) { if (predicate()) return; await pause(25); }
    throw new Error("Rendered tail timeout: " + message);
  };
  const fixtures = [
    {id:"table", type:"table", text:"Before table\n\n| A | B |\n| --- | --- |\n| 1 | 2 |", preserve:"| 1 | 2 |"},
    {id:"code", type:"codeBlock", text:"Before code\n\n~~~javascript\nconsole.log('cursor');\n~~~", preserve:"console.log('cursor');"},
    {id:"mermaid", type:"customBlock", text:"Before diagram\n\n~~~mermaid\ngraph LR\n A-->B\n~~~", preserve:"A-->B"},
    {id:"html", type:"customBlock", text:"Before HTML\n\n~~~html\n<p>safe fixture</p>\n~~~", preserve:"<p>safe fixture</p>"}
  ];
  const seed = (text, mode) => { m.ed.blur(); m.setMode(mode); m.setMarkdown(text); };
  for (const language of ["ko","en","ja","zh"]) {
    m.ed.blur(); m.setLanguage(language, false);
    for (const mode of ["rendered","split"]) for (const fixture of fixtures) {
      seed(fixture.text, mode);
      const view = m.ed.wwEditor.view, doc = view.state.doc;
      check(doc.lastChild.type.name === "paragraph" && doc.lastChild.content.size === 0, fixture.id+" lacks tail");
      check(doc.child(doc.childCount-2).type.name === fixture.type, fixture.id+" block changed");
      check(m.markdown === fixture.text, fixture.id+" source changed on load");
      const end = doc.content.size - 1, marker = "AFTER-"+language+"-"+mode+"-"+fixture.id;
      m.ed.focus(); m.ed.setSelection(end,end);
      check(view.state.selection.$from.parent.type.name === "paragraph", fixture.id+" cursor not outside");
      // Hidden Electron smoke windows do not receive OS focus. Notify the same
      // editor focus event before synthetic API typing; browser UI tests use real focus.
      if (window.desktopAPI?.smokeTest) m.ed.eventEmitter.emit("focus", "wysiwyg");
      await pause(30);
      m.ed.insertText(marker);
      await wait(() => m.markdown.includes(marker), fixture.id+" source sync");
      check(m.markdown.trimEnd().endsWith(marker), fixture.id+" text was inserted inside block");
      check(m.markdown.includes(fixture.preserve), fixture.id+" original content lost");
      check(!/[\u2061\u2063\u200b]/.test(m.markdown), fixture.id+" marker leaked");
      check(m.cm.getValue() === m.markdown, fixture.id+" source differs");
      check(view.state.doc.lastChild.textContent === marker, fixture.id+" paragraph text differs");
      cases.push({language,mode,fixture:fixture.id,passed:true});
    }
  }
  for (const text of ["ordinary paragraph",fixtures[0].text+"\n\nExisting final paragraph",fixtures[1].text+"\n\nExisting final paragraph"]) {
    seed(text,"rendered");
    check(m.ed.wwEditor.view.state.doc.lastChild.textContent === text.split("\n").pop(),"unnecessary paragraph appended");
    check(m.markdown === text,"plain source modified");
  }
  seed(fixtures[0].text,"rendered");
  const count = m.ed.wwEditor.view.state.doc.childCount;
  for(let i=0;i<5;i++) m.ed.setSelection(m.ed.wwEditor.view.state.doc.content.size-1);
  check(m.ed.wwEditor.view.state.doc.childCount === count,"duplicate helper paragraphs");
  await pause(600);
  m.ed.focus();m.ed.setSelection(m.ed.wwEditor.view.state.doc.content.size-1);if(window.desktopAPI?.smokeTest)m.ed.eventEmitter.emit("focus","wysiwyg");await pause(30);m.ed.insertText("UNDOTAIL");
  await wait(()=>m.markdown.includes("UNDOTAIL"),"undo seed");
  m.ed.exec("undo");
  await wait(()=>!m.markdown.includes("UNDOTAIL"),"undo");
  check(m.ed.wwEditor.view.state.doc.lastChild.type.name === "paragraph","undo lost tail");
  m.ed.exec("redo");
  await wait(()=>m.markdown.includes("UNDOTAIL"),"redo");
  cases.push({fixture:"existing-paragraphs-and-idempotence",passed:true},{fixture:"undo-redo",passed:true});
  m.ed.blur();m.setLanguage("ko",false);seed("표 아래 입력 검증\n\n| 항목 | 결과 |\n| --- | --- |\n| 표 | 정상 |\n\n표 아래에서도 이어서 입력할 수 있습니다.","rendered");
  return {passed:true,cases};
}
