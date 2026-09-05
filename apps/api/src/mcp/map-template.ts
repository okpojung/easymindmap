/**
 * **템플릿 → 맵 설정** (MCP `create_map` 의 `template`, 2026-09-05).
 *
 * 앱의 불러오기가 문서의 ```emm 선언(`template:` / `levels:`)을 맵 설정으로
 * 옮기는 규칙(`apps/frontend/src/utils/emmDeclaration.ts` `resolveDeclaration`
 * + `importMapFile.ts` 의 적용부)을 **그대로 옮긴 것**이다. 규칙이 두 벌이
 * 되면 "앱에서 불러오면 진행트리인데 MCP 로 만들면 방사형" 처럼 어긋난다 —
 * 그래서 값 표(LAYOUTS·SHAPES·LEVEL_PATTERNS·SUBTREE_SUPPORTED)와 상속
 * 규칙(put/cascade)을 이름까지 같게 두었다. 프런트 쪽을 고치면 여기도 고친다
 * (mcp-connector.md §9.7 에 그 짝을 적어 두었다).
 *
 * 색인 규칙 (utils/levelLayouts.ts):
 *   levelLayouts[k] — k=0 미사용(1레벨은 맵 전체 레이아웃), k=1 이 2레벨 …
 *   k=4 는 "5레벨 이상 전부". levelShapes[0] 은 1레벨. levelFonts[0] 은 루트.
 */
import { readDeclaration, type EmmDeclaration } from '../emm/declaration';
import type { LayoutType, MapSettings, MindNode, ShapeType } from '../emm/model';

// ── 알려진 값 — emmDeclaration.ts 와 같다 ─────────────────────────────
const LAYOUTS = new Set<string>([
  'tree', 'radial', 'both-radial', 'hierarchy', 'progress-tree', 'free',
  'radial-bidirectional', 'radial-right', 'radial-left',
  'tree-up', 'tree-down', 'tree-right', 'tree-left',
  'hierarchy-right', 'hierarchy-left',
  'process-tree-right', 'process-tree-left',
  'process-tree-right-a', 'process-tree-right-b',
  'freeform', 'kanban', 'timeline', 'timeline-center',
]);
const SHAPES = new Set<string>([
  'none', 'rounded', 'rectangle', 'pill', 'ellipse', 'diamond', 'hexagon',
  'parallelogram', 'arrow-left', 'arrow-right', 'cylinder', 'star',
]);
/** 2레벨 이상(노드 오버라이드)에 걸 수 있는 것 — SubtreeStrategy.SUBTREE_SUPPORTED */
const SUBTREE_SUPPORTED = new Set<string>([
  'radial-right', 'radial-left', 'radial-bidirectional',
  'tree-right', 'tree-down', 'hierarchy-right', 'process-tree-right',
  'timeline', 'timeline-center',
]);
/** normalizeLayoutType.ts */
function normalizeLayoutType(lt: string): string {
  if (lt === 'radial') return 'radial-right';
  if (lt === 'both-radial') return 'radial-bidirectional';
  if (lt === 'tree') return 'tree-right';
  if (lt === 'hierarchy') return 'hierarchy-right';
  if (lt === 'progress-tree') return 'process-tree-right';
  if (lt === 'free') return 'freeform';
  if (lt === 'process-tree-right-a' || lt === 'process-tree-right-b') return 'process-tree-right';
  return lt;
}
function usableAtLevel(layout: string): boolean {
  return SUBTREE_SUPPORTED.has(normalizeLayoutType(layout));
}

/** 레벨별 패턴 템플릿 — emmDeclaration.ts LEVEL_PATTERNS 와 같다 */
const LEVEL_PATTERNS: Record<string, LayoutType[]> = {
  'tree-progtree': ['tree-right', 'process-tree-right', 'tree-right', 'process-tree-right'] as LayoutType[],
  'progtree-tree': ['process-tree-right', 'tree-right'] as LayoutType[],
};

/**
 * 대화에서 부르는 이름 → 선언 어휘. 앱 라이브러리(`libraryTemplates.ts`)의
 * 이름과 흔한 말을 받는다. 값은 LEVEL_PATTERNS 의 키이거나 레이아웃 이름이다.
 */
const ALIASES: Record<string, string> = {
  '트리-진행트리맵': 'tree-progtree', '트리-진행트리': 'tree-progtree', 'lib-tree-progress': 'tree-progtree',
  '기본': 'tree-progtree', 'default': 'tree-progtree',
  '진행트리-트리맵': 'progtree-tree', '진행트리-트리': 'progtree-tree', 'lib-progress-tree': 'progtree-tree',
  '진행트리': 'process-tree-right', '진행트리맵': 'process-tree-right',
  '방사형 양쪽': 'radial-bidirectional', '방사형': 'radial-bidirectional', '브레인스토밍': 'radial-bidirectional', 'lib-brainstorming': 'radial-bidirectional',
  '방사형 오른쪽': 'radial-right', '회의록': 'radial-right', 'lib-meeting': 'radial-right',
  '시간배치': 'timeline', '타임라인': 'timeline', '로드맵': 'timeline', 'lib-roadmap': 'timeline',
  '계층형': 'hierarchy-right', '계층형 오른쪽': 'hierarchy-right', 'wbs': 'hierarchy-right', 'lib-wbs': 'hierarchy-right',
  '칸반': 'kanban', 'kanban 보드': 'kanban', 'lib-kanban': 'kanban',
  '트리': 'tree-right', '트리 오른쪽': 'tree-right',
};

/** 사용자에게 보여 줄 이름 목록 — 거절 문장에 쓴다 */
export const TEMPLATE_NAMES = [
  '트리-진행트리맵(tree-progtree, 기본)', '진행트리-트리맵(progtree-tree)', '방사형 양쪽(radial-bidirectional)',
  '방사형 오른쪽(radial-right)', '시간배치(timeline)', '계층형 오른쪽(hierarchy-right)', '칸반(kanban)',
  '트리 오른쪽(tree-right)', '그 밖의 레이아웃 이름',
];

export class TemplateError extends Error {}

/** 대화의 템플릿 이름을 선언 어휘로. 모르면 TemplateError */
export function resolveTemplateName(name: string): string {
  const raw = String(name ?? '').trim();
  if (!raw) throw new TemplateError('템플릿 이름이 비어 있습니다.');
  const key = raw.toLowerCase();
  const alias = ALIASES[raw] ?? ALIASES[key];
  if (alias) return alias;
  if (LEVEL_PATTERNS[key] || LAYOUTS.has(key)) return key;
  throw new TemplateError(
    `"${raw}" 템플릿을 모릅니다. 쓸 수 있는 이름: ${TEMPLATE_NAMES.join(' · ')}`,
  );
}

export interface ResolvedTemplate {
  editor?: { layoutType: LayoutType };
  settings?: MapSettings;
  skipped?: string[];
}

const CAP = 4;
function put<T>(arr: (T | null | undefined)[], index: number, value: T): void {
  const i = Math.min(index, CAP);
  while (arr.length <= i) arr.push(null);
  arr[i] = value;
}
function cascade<T>(arr: (T | null | undefined)[], from: number, value: T): void {
  for (let i = Math.min(from, CAP); i <= CAP; i++) {
    while (arr.length <= i) arr.push(null);
    if (arr[i] == null) arr[i] = value;
  }
}

/** emmDeclaration.ts `resolveDeclaration` 의 이식 — 같은 입력에 같은 결과 */
export function resolveDeclaration(emm: EmmDeclaration): ResolvedTemplate {
  const out: ResolvedTemplate = {};
  const skipped: string[] = [];

  const tpl = emm.levels ? undefined : emm.template?.trim();
  if (tpl) {
    const pattern = LEVEL_PATTERNS[tpl];
    if (pattern) {
      out.editor = { layoutType: pattern[0] };
      const levelLayouts: (LayoutType | null | undefined)[] = [];
      let deepest = 0;
      for (let lv = 2; lv <= pattern.length; lv++) {
        if (!usableAtLevel(pattern[lv - 1])) { skipped.push(`${lv}레벨의 '${pattern[lv - 1]}'`); continue; }
        put(levelLayouts, lv - 1, pattern[lv - 1]);
        deepest = lv;
      }
      if (deepest) cascade(levelLayouts, deepest - 1, pattern[deepest - 1]);
      if (levelLayouts.length) out.settings = { levelLayouts };
    } else if (LAYOUTS.has(tpl)) {
      out.editor = { layoutType: tpl as LayoutType };
    }
  }

  if (emm.levels) {
    const declared = Object.keys(emm.levels).map(Number).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
    if (declared.length) {
      const s: MapSettings = { ...(out.settings ?? {}) };
      const layouts = [...(s.levelLayouts ?? [])];
      const shapes = [...(s.levelShapes ?? [])];
      const fonts: { size?: number }[] = [...((s.levelFonts ?? []) as { size?: number }[])];
      let lastLayout: { at: number; value: LayoutType } | undefined;
      let lastShape: { at: number; value: ShapeType } | undefined;
      let lastFont: { at: number; value: number } | undefined;

      for (const lv of declared) {
        const spec = emm.levels[lv];
        const layout = spec.layout;
        if (layout && LAYOUTS.has(layout)) {
          if (lv === 1) {
            out.editor = { layoutType: layout as LayoutType };
            if (usableAtLevel(layout)) lastLayout = { at: lv, value: layout as LayoutType };
          } else if (usableAtLevel(layout)) {
            put(layouts, lv - 1, layout as LayoutType);
            lastLayout = { at: lv, value: layout as LayoutType };
          } else {
            skipped.push(`${lv}레벨의 '${layout}'`);
          }
        }
        const shape = spec.shape;
        if (shape && SHAPES.has(shape)) {
          put(shapes, lv - 1, shape as ShapeType);
          lastShape = { at: lv, value: shape as ShapeType };
        }
        const size = Number(spec.font);
        if (Number.isFinite(size) && size > 0) {
          while (fonts.length <= Math.min(lv, CAP)) fonts.push({});
          fonts[Math.min(lv, CAP)] = { ...fonts[Math.min(lv, CAP)], size };
          lastFont = { at: lv, value: size };
        }
      }
      if (lastLayout) cascade(layouts, lastLayout.at, lastLayout.value);
      if (lastShape) cascade(shapes, lastShape.at, lastShape.value);
      if (lastFont) {
        for (let i = Math.min(lastFont.at, CAP); i <= CAP; i++) {
          while (fonts.length <= i) fonts.push({});
          if (fonts[i]?.size == null) fonts[i] = { ...fonts[i], size: lastFont.value };
        }
      }
      if (layouts.length) s.levelLayouts = layouts;
      if (shapes.length) s.levelShapes = shapes;
      if (fonts.length) s.levelFonts = fonts as MapSettings['levelFonts'];
      if (Object.keys(s).length) out.settings = s;
    }
  }

  if (skipped.length) out.skipped = skipped;
  return out;
}

/** utils/levelLayouts.ts `applyLevelLayouts` — 선언한 레벨의 노드에 박는다 */
export function applyLevelLayouts(nodes: MindNode[], levelLayouts: (LayoutType | null | undefined)[]): MindNode[] {
  const walk = (list: MindNode[], depth: number): MindNode[] =>
    list.map((n) => {
      const lt = levelLayouts[Math.min(depth, CAP)];
      const next: MindNode = { ...n, children: walk((n.children ?? []) as MindNode[], depth + 1) };
      return lt
        ? { ...next, layoutType: lt, edgeType: (lt === 'radial' || lt === 'both-radial') ? 'curve-line' : 'tree-line' }
        : next;
    });
  return walk(nodes, 1);
}

/**
 * `create_map` 이 쓰는 한 줄 — 인자 `template` 이 있으면 그것, 없으면 문서의
 * ```emm 선언. 인자가 이긴다(사용자가 대화에서 말한 것이 더 최근 뜻이다).
 */
export function templateFor(explicit: string | undefined, markdown: string): ResolvedTemplate {
  if (explicit && explicit.trim()) {
    return resolveDeclaration({ template: resolveTemplateName(explicit) });
  }
  return resolveDeclaration(readDeclaration(markdown));
}
