/**
 * **`append_to_map` 의 순수 부분** (MCP 3-도구 확장, 2026-09-05) —
 * 기존 맵의 한 노드 아래에 EMM 조각을 하위 가지로 붙인다.
 * 설계: docs/04-extensions/ai/mcp-connector.md §9.6
 *
 * 이 파일은 DB·잠금을 모른다. "어느 노드에, 무엇을, 어떤 모양으로" 만
 * 정한다 — 잠금·저장·버전은 `mcp-tools.ts` 가 MapsService 로 한다.
 *
 * **앱이 새 노드를 만들 때와 같은 규칙**을 따른다 (documentStore.ts
 * `addChildNode` · `makeBranch` · `withLevelLayoutsDeep`):
 *   · 루트 아래 가지 — 색은 l1A~l1E 순환, 방향은 홀짝 번갈아
 *   · 그 아래 — 부모의 색을 물려받는다
 *   · 층별 레이아웃(`settings.levelLayouts` 또는 같은 깊이의 첫 노드)이
 *     있으면 그것을 박고 연결선 종류도 함께 정한다 (#374 와 같은 자리)
 *   · 깊이 상한 50
 * 규칙이 어긋나면 사용자는 "AI 가 붙인 가지만 색·모양이 다르다" 로 겪는다.
 */
import { parseMarkdownToMap } from '../emm/parse';
import type { LayoutType, MindNode, NodeColorKey, SampleBranch, SampleMap } from '../emm/model';

export class AppendError extends Error {}

/** documentStore.ts MAX_DEPTH 와 같다 */
export const MAX_DEPTH = 50;
/** documentStore.ts / build-tree.ts 의 가지 색 순환과 같다 */
const BRANCH_COLOR_KEYS: NodeColorKey[] = ['l1A', 'l1B', 'l1C', 'l1D', 'l1E'];
/** levelLayouts.ts LEVEL_LAYOUT_CAP 와 같다 */
const LEVEL_LAYOUT_CAP = 4;

/** 노드의 "이름" — 여러 줄 본문이면 첫 줄. 대화에서 부르는 이름이 이것이다 */
export function nodeTitle(n: { text?: string }): string {
  return String(n.text ?? '').split('\n')[0].trim();
}

export interface Found {
  /** null = 루트(중심 주제) */
  node: MindNode | null;
  /** 루트=0, 가지=1 … */
  depth: number;
  /** 사람이 읽는 경로 — "2분기 > 협업" */
  path: string;
}

/**
 * 이름 경로로 노드를 찾는다. `"할 일"` · `"2분기 > 협업"` · `""`/`"root"`(루트).
 *
 * 같은 이름이 둘 이상이면 **고르지 않고 후보 경로를 전부 들어 거절**한다 —
 * 엉뚱한 자리에 붙는 것보다 한 번 더 묻는 편이 싸다. 못 찾으면 그
 * 층에 있는 이름들을 알려 준다(AI 가 고쳐 부를 수 있게).
 */
export function findByPath(map: SampleMap, pathArg: string): Found {
  const raw = (pathArg ?? '').trim();
  // `id:<노드 id>` — 앱이 알려 준 선택 노드(FocusService)로 바로 간다. 이름이
  // 겹쳐도 헷갈릴 일이 없다. 대화에서 AI 가 쓰는 형식은 아니다(id 는 본문에 없다).
  if (/^id:/i.test(raw)) {
    const id = raw.slice(3).trim();
    if (!id || id === 'root') return { node: null, depth: 0, path: nodeTitle(map.root) || map.title };
    let hit: Found | null = null;
    const dig = (nodes: MindNode[], depth: number, path: string[]) => {
      for (const n of nodes) {
        if (hit) return;
        const p = [...path, nodeTitle(n)];
        if (n.id === id) { hit = { node: n, depth, path: p.join(' > ') }; return; }
        dig((n.children ?? []) as MindNode[], depth + 1, p);
      }
    };
    dig(map.branches as MindNode[], 1, []);
    if (!hit) throw new AppendError('앱에서 선택한 노드가 이 맵에 더는 없습니다 — 앱에서 노드를 다시 고른 뒤 다시 불러 주세요.');
    return hit;
  }
  // 루트 — 빈 값, root/루트/중심 주제, 또는 아웃라인의 첫 줄(`# 제목`) 그대로
  if (!raw || /^(root|루트|중심 주제|중심)$/i.test(raw) || /^#\s+/.test(raw)) {
    return { node: null, depth: 0, path: nodeTitle(map.root) || map.title };
  }
  const segs = raw.split(/\s*>\s*/)
    .map((s) => s.trim().replace(/^#{1,6}\s+/, '').replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, '').trim())
    .filter(Boolean);

  // 후보: (노드, 깊이, 경로) — 세그먼트마다 좁혀 간다. 첫 세그먼트는
  // **어느 깊이에서든** 찾는다(사용자는 보통 잎 이름 하나만 말한다).
  type Cand = { node: MindNode; depth: number; path: string[] };
  const all: Cand[] = [];
  const walk = (nodes: MindNode[], depth: number, path: string[]) => {
    for (const n of nodes) {
      const p = [...path, nodeTitle(n)];
      all.push({ node: n, depth, path: p });
      walk((n.children ?? []) as MindNode[], depth + 1, p);
    }
  };
  walk(map.branches as MindNode[], 1, []);

  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  let cands = all.filter((c) => eq(nodeTitle(c.node), segs[0]));
  if (cands.length === 0) {
    // 정확히 같은 이름이 없으면 **포함**으로 한 번 더 — "회의" 로 "다음 회의" 를
    cands = all.filter((c) => nodeTitle(c.node).toLowerCase().includes(segs[0].toLowerCase()));
  }
  for (let i = 1; i < segs.length && cands.length > 0; i++) {
    const next: Cand[] = [];
    for (const c of cands) {
      for (const k of (c.node.children ?? []) as MindNode[]) {
        if (eq(nodeTitle(k), segs[i])) next.push({ node: k, depth: c.depth + 1, path: [...c.path, nodeTitle(k)] });
      }
    }
    cands = next;
  }

  if (cands.length === 0) {
    const top = (map.branches as MindNode[]).map(nodeTitle).filter(Boolean);
    throw new AppendError(
      `"${raw}" 노드를 찾지 못했습니다. 최상위 가지: ${top.join(' · ') || '(없음)'}. ` +
      `이름이 정확한지 get_map 으로 확인하거나, "가지 > 하위" 처럼 경로로 적어 주세요.`,
    );
  }
  if (cands.length > 1) {
    const list = cands.slice(0, 8).map((c) => `"${c.path.join(' > ')}"`).join(', ');
    throw new AppendError(
      `"${raw}" 에 맞는 노드가 ${cands.length}개입니다 — 어느 것인지 경로로 골라 주세요: ${list}`,
    );
  }
  return { node: cands[0].node, depth: cands[0].depth, path: cands[0].path.join(' > ') };
}

/**
 * EMM 조각 → 붙일 하위 트리. 조각은 견출(`#`/`##` …)이나 목록(`- 항목`)으로
 * 시작하는 마크다운이다. 가짜 루트 `# _` 를 앞에 두고 레퍼런스 파서에
 * 맡긴다 — 파서는 "첫 H1 이후의 H1 은 2레벨" 이라 조각이 `#` 로 시작하든
 * `##` 로 시작하든 **상대 깊이가 보존**된다. 마크다운을 여기서 다시 읽지
 * 않는다(두 벌이 되면 어긋난다).
 */
export function parseFragment(markdown: string, blockPlacement: 'node' | 'note' = 'node'): MindNode[] {
  const body = String(markdown ?? '').replace(/^\uFEFF/, '').trim();
  if (!body) throw new AppendError('`markdown` 이 비어 있습니다 — 붙일 내용을 넣어 주세요.');
  const wrapped = `# _\n\n${body}\n`;
  const parsed = parseMarkdownToMap(wrapped, '_', { blockPlacement });
  const kids = (parsed?.branches ?? []) as MindNode[];
  if (kids.length === 0) {
    throw new AppendError(
      '붙일 노드가 하나도 안 나왔습니다 — 조각은 `## 이름` 견출이나 `- 항목` 목록으로 적어 주세요. ' +
      '줄글만 있으면 노드가 되지 않습니다.',
    );
  }
  return kids;
}

function subtreeDepth(nodes: MindNode[]): number {
  let d = 0;
  for (const n of nodes) d = Math.max(d, 1 + subtreeDepth((n.children ?? []) as MindNode[]));
  return d;
}

function collectIds(nodes: MindNode[], into: Set<string>): void {
  for (const n of nodes) {
    into.add(n.id);
    collectIds((n.children ?? []) as MindNode[], into);
  }
}

/** documentStore.ts `levelLayoutFor` 와 같은 규칙 */
function levelLayoutFor(map: SampleMap, depth: number): LayoutType | undefined {
  if (depth < 1) return undefined;
  const declared = map.settings?.levelLayouts?.[Math.min(depth, LEVEL_LAYOUT_CAP)];
  if (declared) return declared;
  let found: LayoutType | undefined;
  const walk = (nodes: MindNode[], d: number) => {
    for (const n of nodes) {
      if (found) return;
      if (d === depth) { if (n.layoutType) found = n.layoutType; continue; }
      walk((n.children ?? []) as MindNode[], d + 1);
    }
  };
  walk(map.branches as MindNode[], 1);
  return found;
}

/** levelLayouts.ts `resolveEdgeType` 와 같다 */
function resolveEdgeType(lt: LayoutType): 'tree-line' | 'curve-line' {
  return lt === 'radial' || lt === 'both-radial' ? 'curve-line' : 'tree-line';
}

/** 부모의 유효한 색 — 없으면 조상으로. 루트 아래 가지는 호출자가 순환색을 준다 */
function effectiveColor(map: SampleMap, target: MindNode): NodeColorKey | undefined {
  let found: NodeColorKey | undefined;
  const walk = (nodes: MindNode[], inherited: NodeColorKey | undefined): boolean => {
    for (const n of nodes) {
      const mine = (n.colorKey && n.colorKey !== 'root' ? n.colorKey : inherited) as NodeColorKey | undefined;
      if (n === target) { found = mine; return true; }
      if (walk((n.children ?? []) as MindNode[], mine)) return true;
    }
    return false;
  };
  walk(map.branches as MindNode[], undefined);
  return found;
}

export interface AppendResult {
  map: SampleMap;
  added: number;          // 붙인 노드 수(하위 포함)
  topCount: number;       // 부모 바로 아래에 생긴 노드 수
  parentPath: string;
}

/**
 * 조각을 `parent` 아래 **맨 뒤에** 붙인 새 맵을 돌려준다(원본은 건드리지 않는다).
 * id 는 `mcp-<시각>-<n>` 로 다시 매긴다 — 파서가 준 `md-…` 는 같은 밀리초에
 * 만든 옛 노드와 겹칠 수 있다.
 */
export function appendSubtree(map: SampleMap, parentPath: string, fragment: MindNode[]): AppendResult {
  const target = findByPath(map, parentPath);
  const newDepth = target.depth + subtreeDepth(fragment);
  if (newDepth > MAX_DEPTH) {
    throw new AppendError(`너무 깊습니다 — 붙이면 깊이 ${newDepth} 가 되는데 상한은 ${MAX_DEPTH} 입니다.`);
  }

  const used = new Set<string>();
  collectIds(map.branches as MindNode[], used);
  const stamp = Date.now();
  let seq = 0;
  const freshId = (): string => {
    let id: string;
    do { id = `mcp-${stamp}-${seq++}`; } while (used.has(id));
    used.add(id);
    return id;
  };

  let added = 0;
  const decorate = (nodes: MindNode[], depth: number, color: NodeColorKey | undefined): MindNode[] =>
    nodes.map((n, i) => {
      added++;
      const isBranch = depth === 1;
      const myColor: NodeColorKey | undefined = isBranch
        ? BRANCH_COLOR_KEYS[(map.branches.length + i) % BRANCH_COLOR_KEYS.length]
        : color;
      const lt = levelLayoutFor(map, depth);
      // 파서가 최상위에 준 colorKey/side 는 가짜 루트 기준이라 버린다
      const { colorKey: _c, side: _s, ...rest } = n as MindNode & { colorKey?: unknown; side?: unknown };
      void _c; void _s;
      const out: MindNode = {
        ...rest,
        id: freshId(),
        ...(myColor ? { colorKey: myColor } : {}),
        ...(isBranch ? { side: (map.branches.length + i) % 2 === 0 ? 'right' : 'left' } : {}),
        ...(lt && !n.layoutType ? { layoutType: lt, edgeType: resolveEdgeType(lt) } : {}),
        children: decorate((n.children ?? []) as MindNode[], depth + 1, myColor),
      };
      return out;
    });

  if (!target.node) {
    const branches = decorate(fragment, 1, undefined) as SampleBranch[];
    return {
      map: { ...map, branches: [...map.branches, ...branches] },
      added, topCount: branches.length, parentPath: target.path,
    };
  }

  const color = effectiveColor(map, target.node);
  const kids = decorate(fragment, target.depth + 1, color);
  const tgt = target.node;
  const replace = (nodes: MindNode[]): MindNode[] => nodes.map((n) => {
    if (n === tgt) return { ...n, children: [...((n.children ?? []) as MindNode[]), ...kids] };
    const c = (n.children ?? []) as MindNode[];
    return c.length ? { ...n, children: replace(c) } : n;
  });
  return {
    map: { ...map, branches: replace(map.branches as MindNode[]) as SampleBranch[] },
    added, topCount: kids.length, parentPath: target.path,
  };
}
