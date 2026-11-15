// Load identity is separate from save ACKs. A sample/default iframe is never a draft.
let sequence = 0;
export function createMdFrameLoadGate() {
  let expected: { nonce: string; markdown: string } | null = null;
  let ready = false;
  return {
    begin(markdown: string) { ready = false; const nonce = String(++sequence); expected = { nonce, markdown }; return nonce; },
    accept(data: { loadNonce?: unknown; markdown?: unknown }) {
      if (!expected || data.loadNonce !== expected.nonce || data.markdown !== expected.markdown) return false;
      ready = true; return true;
    },
    reset() { ready = false; expected = null; },
    get ready() { return ready; },
  };
}
export function readMdFrameSnapshot(gate: { ready: boolean }, child: {
  flushPendingEdits?: () => void; MDE?: { markdown: string };
} | null | undefined): string | null {
  if (!gate.ready || !child) return null;
  child.flushPendingEdits?.();
  return typeof child.MDE?.markdown === 'string' ? child.MDE.markdown : null;
}
