import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createMdFrameLoadGate } from './mdFrameLoad';

// Exercise the actual hook callbacks, not a second implementation of onLoad.
const source = readFileSync(new URL('../editor/md/MdEditorDock.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('MdEditorDock.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let onLoad = '', lateContent = '';
const visit = (node: ts.Node) => {
  if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'onLoad' && ts.isArrowFunction(node.initializer)) onLoad = node.initializer.getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0] && node.arguments[0].getText(ast).includes('ready.current && opts.content !== null')) lateContent = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
};
visit(ast); assert(onLoad); assert(lateContent);
const fixture = (content: string | null) => {
  const requests: { nonce: string; markdown: string }[] = [];
  const context = {
    ready: { current: false }, pushed: { current: null as string | null }, gate: { current: createMdFrameLoadGate() },
    opts: { content }, initialized: false,
    setInitialized(value: boolean) { context.initialized = value; },
    push() {
      if (context.opts.content === null) return;
      context.setInitialized(false);
      requests.push({ nonce: context.gate.current.begin(context.opts.content), markdown: context.opts.content });
      context.pushed.current = context.opts.content;
    },
  };
  return { context, requests,
    load: runInNewContext('(' + onLoad + ')', context) as () => void,
    contentEffect: runInNewContext('(' + lateContent + ')', context) as () => void,
    acknowledge(index: number) { const request = requests[index]; const accepted = context.gate.current.accept({ loadNonce: request.nonce, markdown: request.markdown }); if (accepted) context.setInitialized(true); return accepted; },
  };
};
{
  const f = fixture('# Original');
  f.context.ready.current = true; f.context.push(); // mde:ready before iframe onLoad
  assert.equal(f.acknowledge(0), true); assert.equal(f.context.initialized, true);
  f.load();
  assert.equal(f.requests.length, 2); assert.equal(f.context.ready.current, true);
  assert.equal(f.context.initialized, false);
  assert.equal(f.acknowledge(0), false); // An earlier ACK cannot initialize the reload.
  assert.equal(f.acknowledge(1), true); assert.equal(f.context.initialized, true);
  console.log('PASS ready -> loaded ACK -> onLoad issues a fresh load and becomes visible after its ACK');
}
{
  const f = fixture('# Original');
  f.load(); // onLoad before mde:ready
  assert.equal(f.requests.length, 1);
  f.context.ready.current = true; f.context.push();
  assert.equal(f.requests.length, 2); assert.equal(f.acknowledge(0), false);
  assert.equal(f.acknowledge(1), true); assert.equal(f.context.initialized, true);
  console.log('PASS onLoad -> ready permits reinitialization and rejects the stale nonce');
}
{
  const f = fixture(null);
  f.load(); assert.equal(f.context.ready.current, true); assert.equal(f.requests.length, 0);
  f.context.opts.content = '# Arrived later'; f.contentEffect();
  assert.equal(f.requests.length, 1); assert.equal(f.acknowledge(0), true);
  assert.equal(f.context.initialized, true);
  console.log('PASS content arriving after onLoad triggers the actual late-content effect and initializes');
}
