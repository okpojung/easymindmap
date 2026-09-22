// 레이아웃 불변식 시험용 맵 생성기 (layoutInvariants.test.ts · scripts/layout/*.ts 공용).
import { SUBTREE_SUPPORTED } from '@/layout/strategies/SubtreeStrategy';
import { calendarTable, weekOutline } from '@/utils/calendarNodes';
import type { LaidOutNode } from '@/layout/types';

export const BASES = ['process-tree-right', 'tree-right', 'tree-down', 'hierarchy-right', 'radial-right', 'radial-bidirectional', 'radial-left'];
const OVERRIDES = [...SUBTREE_SUPPORTED] as string[];

/** 배치 결과의 정합성 — 같은 id 가 두 번 나오거나(두 번 그려진다), 문서의 보이는 노드가 빠지면 안 된다 */
export function checkIdentity(map: any, out: LaidOutNode[]): string | null {
  const ids = new Set<string>();
  for (const n of out) { if (ids.has(n.id)) return `id 중복: ${n.id}`; ids.add(n.id); }
  const expect: string[] = [];
  const walk = (n: any) => { expect.push(n.id); if (!n.collapsed) for (const c of n.children ?? []) walk(c); };
  for (const c of [{ root: map.root, branches: map.branches }, ...(map.centers ?? [])]) { expect.push(c.root.id); if (!c.root.collapsed) for (const b of c.branches ?? []) walk(b); }
  const missing = expect.filter((id) => !ids.has(id));
  if (missing.length) return `빠진 노드 ${missing.length}: ${missing.slice(0, 4).join(', ')}`;
  if (out.length !== expect.length) return `노드 수 ${out.length} ≠ 문서 ${expect.length}`;
  return null;
}

/** 상자가 겹치는 노드 쌍 (2px 여유 — 테두리 선이 닿는 것은 겹침이 아니다) */
export function findOverlaps(out: LaidOutNode[]): [LaidOutNode, LaidOutNode][] {
  const bad: [LaidOutNode, LaidOutNode][] = [];
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
    const a = out[i], b = out[j];
    if (Math.abs(a.x - b.x) * 2 < a.w + b.w - 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h - 2) bad.push([a, b]);
  }
  return bad;
}

let seq = 0;
const mk = (text: string, children: any[] = [], extra: Record<string, unknown> = {}) => ({ id: `n${++seq}`, text, children, ...extra });

/**
 * 보고와 같은 모양 — 진행트리 맵의 가지 하나가 A(1레벨, 표) → B(2레벨, 표 두 개) → 주 노드 5개
 * → 날짜 7개. o1/o2/o3 = A/B/[36주] 의 오버라이드 ('' = 없음). 앞뒤에 보통 가지도 둔다.
 */
export function chainMap(opts: { o1?: string; o2?: string; o3?: string; a1Text?: string; b2Text?: string; extraBefore?: number } = {}): any {
  seq = 0;
  const weeks = weekOutline(2026, 9).map((w) => mk(w.text, w.children.map((d) => mk(d.text)), w.text.startsWith('[36주]') && opts.o3 ? { layoutType: opts.o3 } : {}));
  const B = mk(opts.b2Text ?? '2026.09\n\n' + calendarTable(2026, 9) + '\n\n' + calendarTable(2026, 10), weeks, opts.o2 ? { layoutType: opts.o2 } : {});
  const A = mk(opts.a1Text ?? '2026.09\n\n' + calendarTable(2026, 9), [B], opts.o1 ? { layoutType: opts.o1 } : {});
  const old = mk('2026년9월', weekOutline(2026, 9).map((w) => mk(w.text, [mk('26/08/30(일) ~ 26/09/05(토)')])), { layoutType: 'tree-right' });
  const before = Array.from({ length: opts.extraBefore ?? 3 }, (_, i) => mk(`주제 ${i + 1}`, [mk('하위 1'), mk('하위 2')]));
  return { root: { id: 'root', text: '테스트' }, branches: [...before, old, A, mk('다음', [mk('x')])] };
}

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const TEXTS = ['짧게', '조금 더 긴 노드 글', '아주 긴 글이 들어 있는 노드 — 자동 줄바꿈이 두세 줄로 일어날 만큼 충분히 길게 써 둔다', '표\n\n' + calendarTable(2026, 9), '```js\nconst a = 1;\nconst b = 2;\n```', '2026/09/25(금)\n[추석]'];
function gen(r: () => number, depth: number, maxDepth: number): any {
  const text = TEXTS[Math.floor(r() * TEXTS.length)];
  const n = depth >= maxDepth ? 0 : Math.floor(r() * (depth === 1 ? 6 : 5));
  return mk(text, Array.from({ length: n }, () => gen(r, depth + 1, maxDepth)));
}
function allNodes(ns: any[], acc: any[] = []): any[] { for (const n of ns) { acc.push(n); allNodes(n.children ?? [], acc); } return acc; }
function depthOf(branches: any[], id: string): number { const f = (ns: any[], d: number): number => { for (const n of ns) { if (n.id === id) return d; const r = f(n.children ?? [], d + 1); if (r) return r; } return 0; }; return f(branches, 1); }

/** 씨앗 하나 = 맵 하나 (기준 레이아웃 · 오버라이드 1~3개 무작위). 같은 씨앗은 늘 같은 맵 */
export function genMap(seed: number, onlyBase?: string): { map: any; base: string; overrides: string[] } {
  const r = rng(seed); seq = 0;
  const maxDepth = 2 + Math.floor(r() * 3);
  const branches = Array.from({ length: 2 + Math.floor(r() * 5) }, () => gen(r, 1, maxDepth));
  if (r() < 0.5) {
    const weeks = weekOutline(2026, 9).map((w) => mk(w.text, w.children.map((d) => mk(d.text))));
    branches.push(mk('2026.09\n\n' + calendarTable(2026, 9), [mk('2026.09', weeks)]));
  }
  let base = BASES[Math.floor(r() * BASES.length)];
  if (onlyBase) base = onlyBase;
  if (base === 'radial-bidirectional') branches.forEach((b: any, i: number) => { b.side = i % 2 ? 'left' : 'right'; });
  const nodes = allNodes(branches);
  const nOv = 1 + Math.floor(r() * 3);
  const overrides: string[] = [];
  for (let k = 0; k < nOv; k++) {
    const n = nodes[Math.floor(r() * nodes.length)];
    if (!(n.children?.length)) continue;
    n.layoutType = OVERRIDES[Math.floor(r() * OVERRIDES.length)];
    overrides.push(`${n.id}@d${depthOf(branches, n.id)}=${n.layoutType}`);
  }
  return { map: { root: { id: 'root', text: '중심' }, branches }, base, overrides };
}
