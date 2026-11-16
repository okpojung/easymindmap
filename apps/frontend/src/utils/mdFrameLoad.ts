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
    get nonce() { return ready ? expected?.nonce ?? null : null; },
  };
}
export interface MdFrameSnapshotWindow {
  MDE?: { getHostSnapshot?: (loadNonce: string) => unknown };
}
export function readMdFrameSnapshot(gate: { ready: boolean; nonce?: string | null }, child: MdFrameSnapshotWindow | null | undefined): string | null {
  if (!gate.ready || typeof gate.nonce !== 'string') return null;
  if (!child) throw new Error('MD_FRAME_SNAPSHOT_UNAVAILABLE');
  // Never fall back to raw Markdown: a local/protected document may have
  // replaced the attachment after the initialization ACK.
  const read = child.MDE?.getHostSnapshot;
  if (typeof read !== 'function') throw new Error('MD_FRAME_SNAPSHOT_UNAVAILABLE');
  const markdown = read.call(child.MDE, gate.nonce);
  if (markdown === null || typeof markdown === 'string') return markdown;
  throw new Error('MD_FRAME_SNAPSHOT_UNAVAILABLE');
}
