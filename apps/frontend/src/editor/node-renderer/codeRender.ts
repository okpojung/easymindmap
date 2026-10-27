// codeRender — 코드 블록 중 **Mermaid · HTML** 을 그려서 보여 준다 (2026-10-28 사용자 요청).
//
//   · 맵(캔버스)·HTML 뷰어(내보내기·공개 화면)·코드 편집 창이 같은 결과를 쓴다.
//   · Mermaid — 공식 mermaid 라이브러리로 SVG 를 만든다(필요할 때만 불러온다).
//     securityLevel 'strict', 글자는 SVG 글자(htmlLabels 끔). 그린 SVG 는 **그림(<image>)**
//     으로만 붙인다 — 그림 안의 스크립트·링크는 동작하지 않는다.
//   · HTML — 샌드박스 iframe(srcdoc)에 넣는다. 보여 주는 칸은 sandbox="" 에 CSP
//     (script 없음, 외부는 https 그림·글꼴·스타일만) — 스크립트는 돌지 않는다. 크기는
//     스크립트 없는 숨은 iframe(allow-same-origin 만)을 잠깐 띄워 앱이 직접 잰다.
//   · 크기는 처음 그린 뒤에 알 수 있다 — 결과를 `cache` 에 두고 세대(epoch)를 올려
//     배치를 다시 한다. 그리기 전·실패하면 예전처럼 코드 패널을 보인다.

export type RenderLang = 'mermaid' | 'html';

/** 언어 라벨 → 그려서 보일 종류 (대소문자 무시). 아니면 null */
export function renderLangOf(lang?: string | null): RenderLang | null {
  const l = String(lang || '').trim().toLowerCase();
  if (l === 'mermaid' || l === 'mmd') return 'mermaid';
  if (l === 'html' || l === 'htm') return 'html';
  return null;
}

/** 맵에 보이는 최대 크기 — 넘으면 비율을 지켜 줄인다 */
export const CODE_RENDER_MAX_W = 560;
export const CODE_RENDER_MAX_H = 640;
/** HTML 을 잴 때 쓰는 폭(이보다 넓게 펼쳐지지 않는다) */
export const HTML_MEASURE_W = 600;

export interface CodeRender {
  kind: RenderLang;
  /** 원래 크기 */
  nw: number; nh: number;
  /** 맵에 보일 크기 (줄인 뒤) */
  w: number; h: number;
  /** mermaid — data:image/svg+xml URL */
  src?: string;
}

/** 같은 문자열이면 같은 값 — 뷰어 JS 와 같은 계산(FNV-1a 32) */
export function codeRenderKey(kind: RenderLang, code: string): string {
  const s = kind + '\n' + code;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16) + '-' + s.length.toString(36);
}

const cache = new Map<string, CodeRender | { error: string }>();
const pending = new Map<string, Promise<void>>();
let epoch = 0;
const listeners = new Set<() => void>();
let bumpTimer: number | null = null;
function bump() {
  if (bumpTimer !== null) return;
  // 여러 블록이 한꺼번에 끝나면 배치를 한 번만 다시 한다
  bumpTimer = window.setTimeout(() => { bumpTimer = null; epoch++; listeners.forEach((f) => f()); }, 30);
}
export function codeRenderEpoch(): number { return epoch; }
export function subscribeCodeRender(f: () => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }

const canRender = () => typeof window !== 'undefined' && typeof document !== 'undefined';

function fit(nw: number, nh: number) {
  const s = Math.min(1, CODE_RENDER_MAX_W / Math.max(1, nw), CODE_RENDER_MAX_H / Math.max(1, nh));
  return { w: Math.max(1, Math.round(nw * s)), h: Math.max(1, Math.round(nh * s)) };
}

/**
 * 그린 결과 — 있으면 바로, 없으면 null 을 주고 (브라우저면) 그리기를 시작한다.
 * 실패한 코드도 null (코드 패널로 보인다).
 */
export function codeRenderOf(lang: string | undefined, code: string): CodeRender | null {
  const kind = renderLangOf(lang);
  if (!kind || !code.trim()) return null;
  const key = codeRenderKey(kind, code);
  const hit = cache.get(key);
  if (hit) return 'error' in hit ? null : hit;
  if (canRender()) void ensureCodeRender(kind, code);
  return null;
}

/** 실패했으면 그 까닭 (편집 창 미리 보기에서 보인다) */
export function codeRenderError(lang: string | undefined, code: string): string | null {
  const kind = renderLangOf(lang);
  if (!kind) return null;
  const hit = cache.get(codeRenderKey(kind, code));
  return hit && 'error' in hit ? hit.error : null;
}

export function ensureCodeRender(kind: RenderLang, code: string): Promise<void> {
  const key = codeRenderKey(kind, code);
  if (cache.has(key)) return Promise.resolve();
  const running = pending.get(key);
  if (running) return running;
  const p = (kind === 'mermaid' ? renderMermaid(code) : measureHtml(code))
    .then((r) => { cache.set(key, r); }, (e: unknown) => {
      cache.set(key, { error: e instanceof Error ? e.message : String(e) });
    })
    .finally(() => { pending.delete(key); bump(); });
  pending.set(key, p);
  return p;
}

// ── Mermaid ────────────────────────────────────────────────────────────
type Mermaid = typeof import('mermaid').default;
let mermaidChain: Promise<unknown> = Promise.resolve();
let mermaidReady: Promise<Mermaid> | null = null;
let mermaidSeq = 0;
function loadMermaid(): Promise<Mermaid> {
  if (!mermaidReady) {
    mermaidReady = import('mermaid').then((m) => {
      const mm = m.default;
      mm.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'default',
        htmlLabels: false,
        flowchart: { htmlLabels: false },
        fontFamily: 'system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif',
      });
      return mm;
    });
  }
  return mermaidReady;
}

function svgToDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'data:image/svg+xml;base64,' + btoa(bin);
}

async function renderMermaid(code: string): Promise<CodeRender> {
  // mermaid.render 는 한 번에 하나씩 (같은 임시 DOM 을 쓴다)
  const run = mermaidChain.then(async () => {
    const mm = await loadMermaid();
    const id = 'emm-mmd-' + (++mermaidSeq);
    try {
      const { svg } = await mm.render(id, code);
      // HTML 로 읽고 SVG 만 꺼낸다 — XML 로 읽으면 &nbsp; 같은 것에서 깨진다
      const root = new DOMParser().parseFromString(svg, 'text/html').querySelector('svg');
      if (!root) throw new Error('mermaid: no svg');
      const vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      const nw = Math.ceil(vb.length === 4 && vb[2] > 0 ? vb[2] : parseFloat(root.getAttribute('width') || '300'));
      const nh = Math.ceil(vb.length === 4 && vb[3] > 0 ? vb[3] : parseFloat(root.getAttribute('height') || '150'));
      // 그림으로 쓸 때는 크기가 정해져 있어야 한다 (mermaid 는 width=100% · max-width 를 준다)
      root.setAttribute('width', String(nw));
      root.setAttribute('height', String(nh));
      root.removeAttribute('style');
      if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const out = new XMLSerializer().serializeToString(root);
      return { kind: 'mermaid' as const, nw, nh, ...fit(nw, nh), src: svgToDataUrl(out) };
    } finally {
      // 실패하면 mermaid 가 오류 그림을 body 에 남긴다 — 치운다
      document.getElementById(id)?.remove();
      document.getElementById('d' + id)?.remove();
    }
  });
  mermaidChain = run.catch(() => undefined);
  return run;
}

// ── HTML ───────────────────────────────────────────────────────────────
const CSP_BASE = "default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline' https:; font-src data: https:; media-src data: https:";

/** HTML 코드 블록을 보일 문서 — 스크립트 없음(CSP), 외부는 https 그림·글꼴·스타일만 */
export function htmlBlockDoc(code: string): string {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + `<meta http-equiv="Content-Security-Policy" content="${CSP_BASE}">`
    + `<style>html,body{margin:0;padding:0;background:#fff;overflow:hidden}#__emm{display:inline-block;width:max-content;max-width:${HTML_MEASURE_W}px;box-sizing:border-box;padding:8px;font:14px/1.5 system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif;color:#1f2937}</style>`
    + '</head><body><div id="__emm">' + code + '</div></body></html>';
}

function measureHtml(code: string): Promise<CodeRender> {
  // 잴 때도 **스크립트는 돌지 않는다** — sandbox 에 allow-scripts 가 없고 문서 안 CSP 도 막는다.
  // allow-same-origin 만 주어 이 창이 안의 문서를 직접 잰다 (스크립트가 없으니 같은 출처라도 안전).
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${HTML_MEASURE_W + 40}px;height:400px;border:0;visibility:hidden;pointer-events:none`;
    let done = false;
    const finish = (nw: number, nh: number) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      frame.remove();
      nw = Math.max(40, Math.min(HTML_MEASURE_W, Math.ceil(nw))); nh = Math.max(24, Math.min(4000, Math.ceil(nh)));
      resolve({ kind: 'html', nw, nh, ...fit(nw, nh) });
    };
    const measure = () => {
      try {
        const d = frame.contentDocument;
        const box = d?.getElementById('__emm');
        if (!box) { finish(480, 240); return; }
        const r = box.getBoundingClientRect();
        finish(Math.max(r.width, box.scrollWidth), Math.max(r.height, box.scrollHeight));
      } catch { finish(480, 240); }
    };
    frame.addEventListener('load', () => {
      // 글꼴·그림이 자리를 잡을 짧은 틈
      const d = frame.contentDocument;
      const ready = d?.fonts?.ready ?? Promise.resolve();
      void ready.then(() => window.setTimeout(measure, 30), () => window.setTimeout(measure, 30));
    });
    const timer = window.setTimeout(measure, 5000);
    frame.srcdoc = htmlBlockDoc(code);
    document.body.appendChild(frame);
  });
}

// ── 맵 전체 (내보내기·공개 화면) ─────────────────────────────────────────
interface TextNode { text?: string; children?: TextNode[] }
interface MapLike { root: TextNode; branches: TextNode[]; centers?: { root: TextNode; branches: TextNode[] }[] }

const FENCE_RE = /^\s*```(.*)$/;
/** 글 속의 그릴 코드 블록 (언어·코드) — mdCode.parseCodeAt 과 같은 경계 */
export function renderableBlocks(text: string): { kind: RenderLang; code: string }[] {
  const out: { kind: RenderLang; code: string }[] = [];
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FENCE_RE);
    if (!m) continue;
    let j = i + 1; const body: string[] = [];
    while (j < lines.length && !FENCE_RE.test(lines[j])) { body.push(lines[j]); j++; }
    const kind = renderLangOf(m[1]);
    const code = body.join('\n');
    if (kind && code.trim()) out.push({ kind, code });
    i = j;
  }
  return out;
}

function eachText(map: MapLike, f: (t: string) => void) {
  const walk = (n: TextNode) => { if (n.text) f(n.text); n.children?.forEach(walk); };
  walk(map.root); map.branches.forEach(walk);
  for (const c of map.centers ?? []) { walk(c.root); c.branches.forEach(walk); }
}

/** 맵 안의 Mermaid·HTML 블록을 모두 그려 둔다 — 내보내기 전에 기다린다 */
export async function prepareCodeRenders(map: MapLike): Promise<void> {
  if (!canRender()) return;
  const jobs: Promise<void>[] = [];
  eachText(map, (t) => { for (const b of renderableBlocks(t)) jobs.push(ensureCodeRender(b.kind, b.code)); });
  await Promise.all(jobs);
}

/** 맵에 그릴 블록이 하나라도 있나 */
export function mapHasRenderable(map: MapLike): boolean {
  let any = false;
  eachText(map, (t) => { if (!any && renderableBlocks(t).length) any = true; });
  return any;
}

/** 맵에서 쓰는 그린 결과만 — HTML 뷰어에 싣는다 (html 은 보일 문서도 같이) */
export function collectCodeRenders(map: MapLike): Record<string, CodeRender & { doc?: string }> {
  const out: Record<string, CodeRender & { doc?: string }> = {};
  eachText(map, (t) => {
    for (const b of renderableBlocks(t)) {
      const key = codeRenderKey(b.kind, b.code);
      const hit = cache.get(key);
      if (!hit || 'error' in hit) continue;
      out[key] = b.kind === 'html' ? { ...hit, doc: htmlBlockDoc(b.code) } : hit;
    }
  });
  return out;
}
