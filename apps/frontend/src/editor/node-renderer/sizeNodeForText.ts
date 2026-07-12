// Auto-size + auto-wrap for node text — spec NR-03 / NR-04 (see 10-canvas.md § 23)
// Returns the SVG box dimensions and wrapped line list given a node's text
// and depth. Honors manual line breaks (\n) first, then wraps by word, then
// breaks long unbreakable words by character.

export interface SizeOpts {
  minW?: number;
  maxW?: number;
  hasIcon?: boolean;
  // Content-indicator icons (🔗📝📎▶️) drawn INSIDE the box right of the
  // text — the box widens so they all fit (contentIndicatorCount()).
  indicators?: number;
}

export interface NodeSize {
  w: number;
  h: number;
  lines: string[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  padX: number;
  padY: number;
}

const CJK_RE = /[\u3000-\u9FFF\uAC00-\uD7AF]/;

export function sizeNodeForText(text: string, depth: number, opts: SizeOpts = {}): NodeSize {
  const fontSize   = depth === 0 ? 18 : depth === 1 ? 14 : 13;
  const fontWeight = depth === 0 ? 700 : depth === 1 ? 600 : 500;
  const lineHeight = depth === 0 ? 24 : 18;
  const padX       = depth === 0 ? 22 : 14;
  const padY       = depth === 0 ? 14 : 9;

  // Per-char width estimate. CJK chars are wider; mix of latin+CJK averages ~0.62*fontSize.
  const charW = (ch: string): number => {
    if (CJK_RE.test(ch)) return fontSize * 1.0;
    if (/[ ]/.test(ch)) return fontSize * 0.34;
    if (/[\d]/.test(ch)) return fontSize * 0.58;
    return fontSize * 0.55;
  };
  const measure = (s: string): number =>
    Array.from(s).reduce((acc, ch) => acc + charW(ch), 0);

  const minW = opts.minW ?? (depth === 0 ? 160 : 130);
  const maxW = opts.maxW ?? (depth === 0 ? 260 : 320);
  // Reserve space for branch icon (NS-05) when present
  const iconReserve = (depth === 1 && opts.hasIcon) ? 22 : 0;
  // Reserve space for content-indicator icons inside the right edge
  const indicatorReserve = (opts.indicators ?? 0) > 0
    ? (opts.indicators ?? 0) * (fontSize + 5) + 4
    : 0;

  // Honor manual breaks first, then word-wrap each segment
  const manualLines = String(text || '').split('\n');
  const wrappedLines: string[] = [];
  const innerMaxW = maxW - padX * 2 - iconReserve;

  manualLines.forEach((seg) => {
    if (seg === '') {
      wrappedLines.push('');
      return;
    }
    const words = seg.split(/(\s+)/); // keep spaces
    let cur = '';
    let curW = 0;
    for (const w of words) {
      const wLen = measure(w);
      if (cur === '' && wLen > innerMaxW) {
        // Single word too long — break by char
        let buf = '';
        let bufW = 0;
        for (const ch of Array.from(w)) {
          const cw = charW(ch);
          if (bufW + cw > innerMaxW && buf) {
            wrappedLines.push(buf);
            buf = ch; bufW = cw;
          } else {
            buf += ch; bufW += cw;
          }
        }
        cur = buf; curW = bufW;
        continue;
      }
      if (curW + wLen > innerMaxW) {
        wrappedLines.push(cur.trimEnd());
        cur = w.replace(/^\s+/, '');
        curW = measure(cur);
      } else {
        cur += w;
        curW += wLen;
      }
    }
    if (cur) wrappedLines.push(cur.trimEnd());
  });
  if (wrappedLines.length === 0) wrappedLines.push('');

  // Width = widest wrapped line + padding (clamped between min and max)
  const widest = wrappedLines.reduce((m, l) => Math.max(m, measure(l)), 0);
  const w = Math.min(
    maxW + indicatorReserve,
    Math.max(minW, Math.ceil(widest + padX * 2 + iconReserve + indicatorReserve)),
  );
  const h = wrappedLines.length * lineHeight + padY * 2;

  return { w, h, lines: wrappedLines, fontSize, fontWeight, lineHeight, padX, padY };
}
