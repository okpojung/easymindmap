/* Explicitly invoked on a disposable parent harness, never on an actual EMM attachment. */
async function runEmbedHostRegression(frameId = "embedEditor") {
  const frame = document.getElementById(frameId), w = frame?.contentWindow;
  if (!document.getElementById("embedTest") || !w?.MDE || !w.document.getElementById("mdData")?.dataset.name?.startsWith("cursor-regression")) throw new Error("Isolated embed fixture required");
  const cases = [], saves = [], pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (ok, name) => { if (!ok) throw new Error(name); cases.push({name,passed:true}); };
  const send = data => w.postMessage(data, location.origin);
  const dirty = () => w.document.title.startsWith("●");
  const onMessage = event => { if (event.source === w && event.data?.type === "mde:save") saves.push(event.data); };
  window.addEventListener("message", onMessage);
  let localSaves = 0, confirms = 0;
  const oldPicker = w.showSaveFilePicker, oldConfirm = w.confirm;
  w.showSaveFilePicker = async () => { localSaves++; throw new Error("Local save forbidden in this test"); };
  w.confirm = () => { confirms++; return false; };
  try {
    send({type:"mde:config",name:"회의록.md",saveLabel:"EMM에 저장"});
    send({type:"mde:set",markdown:"baseline"}); await pause(30);
    check(w.document.title === "회의록.md", "config name and loaded baseline");
    check(w.document.getElementById("saveBtn").textContent === "EMM에 저장", "config save label");
    check(w.getComputedStyle(w.document.getElementById("toc")).display === "none", "iframe TOC initially collapsed");
    w.MDE.setMode("rendered"); w.MDE.ed.eventEmitter.emit("focus", "wysiwyg");
    const loadedTable = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    send({type:"mde:set",markdown:loadedTable}); await pause(650);
    check(!dirty() && w.MDE.markdown === loadedTable, "parent reload while focused remains clean and exact");
    w.MDE.ed.blur();
    w.MDE.setMode("split"); w.MDE.ed.blur(); w.MDE.cm.focus();
    w.MDE.cm.setValue("source saved immediately"); w.document.getElementById("saveBtn").click(); await pause(30);
    check(w.MDE.ed.getMarkdown().trim() === "source saved immediately", "source immediate save updates rendered pane");
    send({type:"mde:saved"}); await pause(30);
    w.MDE.cm.setValue("source acknowledged immediately"); send({type:"mde:saved",markdown:"source acknowledged immediately"}); await pause(30);
    check(w.MDE.ed.getMarkdown().trim() === "source acknowledged immediately", "source acknowledgement flush updates rendered pane");
    w.MDE.setMarkdown("snapshot A"); w.document.getElementById("saveBtn").click(); await pause(30);
    check(saves.at(-1)?.markdown === "snapshot A" && dirty(), "save forwards exact Markdown but waits for acknowledgement");
    w.MDE.setMarkdown("newer edit B"); send({type:"mde:saved"}); await pause(30);
    check(dirty(), "late bare acknowledgement preserves newer edits");
    send({type:"mde:saved",markdown:"newer edit B"}); await pause(30);
    check(!dirty(), "exact snapshot acknowledgement clears matching version");
    w.MDE.setMarkdown("failed save C"); w.document.getElementById("saveBtn").click(); await pause(30);
    send({type:"mde:saved",ok:false}); await pause(30); check(dirty(), "failed save remains dirty");
    const count = saves.length; w.document.getElementById("saveBtn").click(); await pause(30);
    check(saves.length === count + 1, "failed save can be retried");
    send({type:"mde:saved"}); await pause(30); check(!dirty(), "bare acknowledgement clears saved version");
    const beforeUnload = new w.Event("beforeunload", {cancelable:true}); w.dispatchEvent(beforeUnload);
    check(!beforeUnload.defaultPrevented, "saved frame has no unload warning");
    w.document.querySelector('#fileList [data-act="close"]').click(); check(confirms === 0, "saved close has no confirmation");
    w.MDE.setMarkdown("protected change");
    const script = w.document.createElement("script");
    script.textContent = 'window.postMessage({type:"mde:saved"},"*");window.postMessage({type:"mde:config",name:"attacker.md"},"*");';
    w.document.head.append(script); script.remove(); await pause(30);
    check(dirty() && !w.document.title.includes("attacker"), "child self messages cannot configure or acknowledge");
    w.dispatchEvent(new w.MessageEvent("message", {source:window,origin:"https://untrusted.invalid",data:{type:"mde:config",name:"wrong-origin.md"}}));
    check(!w.document.title.includes("wrong-origin"), "pinned origin rejects mismatched sender");
    send({type:"mde:config",name:"회의록.md",saveLabel:"EMM에 저장"}); await pause(30);
    check(dirty(), "metadata update does not falsely mark edits saved");
    w.document.querySelector('#fileList [data-act="close"]').click(); check(confirms === 1, "dirty close still confirms");
    check(localSaves === 0, "embedded save never calls local file picker");
    send({type:"mde:saved",markdown:w.MDE.markdown}); await pause(30);
    return {passed:true,cases};
  } finally {
    window.removeEventListener("message", onMessage);
    w.showSaveFilePicker = oldPicker; w.confirm = oldConfirm;
  }
}
