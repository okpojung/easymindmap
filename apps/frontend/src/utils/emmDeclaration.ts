// emmDeclaration — 문서의 `emm` 코드블록 선언을 맵 설정으로 옮긴다.
//
// 파서(`readDeclaration`)는 값을 **해석하지 않는다** — 문자열로 넘길 뿐이다.
// 뜻을 아는 것은 이쪽이므로, 알려진 이름인지 판정하고 맵 설정으로 옮기는
// 일이 여기 있다. 그래서 나중에 속성을 하나 더해도 파서는 건드리지 않는다.
//
// 선언은 **불러오기 힌트**다. 내보낼 때 쓰지 않는다 — 맵 상태는 파일 끝
// 메타데이터가 이미 온전히 담고 있고, 같은 정보를 두 곳에 두면 반드시
// 어긋난다. 이 블록의 쓸모는 **앱을 한 번도 거치지 않은 문서**에 있다.
// 메타데이터가 있는 문서에서는 메타데이터가 이긴다 (importMapFile 참조).

import type { LayoutType, MapSettings, ShapeType } from '@/editor/__samples__/types';
import type { EmmDeclaration } from '@emm/declaration';

// ── 알려진 값 ────────────────────────────────────────────────────────
//
// 런타임에 타입을 검사할 수 없으므로 model.ts 의 유니온을 여기 옮겨 적는다.
// 모르는 값은 **조용히 무시한다** — 선언 하나가 틀렸다고 불러오기 전체가
// 실패하면 안 된다 (emm-spec.md §2.4 관용적 파싱).

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

/**
 * 레벨별 패턴을 가진 템플릿.
 *
 * 나머지 라이브러리 템플릿은 불러오기에서 **레이아웃 하나를 지정하는 것과
 * 같다** — 골격은 이미 문서가 있으므로 쓰이지 않기 때문이다. 그래서 별칭을
 * 만들지 않고 레이아웃 이름을 그대로 쓰게 했다(`radial-bidirectional`,
 * `hierarchy-right`, `kanban`, `timeline`, `radial-right`). 새로 만든 어휘는
 * 아래 둘뿐이며, 어느 레이아웃 이름과도 겹치지 않는다.
 */
const LEVEL_PATTERNS: Record<string, LayoutType[]> = {
  // 1레벨 트리 → 2레벨 진행트리 → 3레벨 트리 → 4레벨+ 진행트리 (기본 템플릿)
  'tree-progtree': ['tree-right', 'process-tree-right', 'tree-right', 'process-tree-right'],
  // 1레벨 진행트리 → 2레벨+ 트리
  'progtree-tree': ['process-tree-right', 'tree-right'],
};

export interface ResolvedDeclaration {
  /** 맵 전체 레이아웃 — 1레벨(중심) 몫 */
  editor?: { layoutType: LayoutType };
  /** 레벨별 정책 */
  settings?: MapSettings;
}

/** 배열의 마지막 칸이 "그 레벨 이상"을 뜻한다 — 맵 설정이 쓰는 규칙. */
const CAP = 4;

function put<T>(arr: (T | null | undefined)[], index: number, value: T): void {
  const i = Math.min(index, CAP);
  while (arr.length <= i) arr.push(null);
  arr[i] = value;
}

/**
 * 선언하지 않은 더 깊은 레벨은 **가장 깊게 선언된 레벨을 상속**한다.
 * 배열의 마지막 칸까지 그 값으로 채워 두면 맵 설정이 알아서 그렇게 읽는다.
 *
 * **이미 값이 있는 칸은 건드리지 않는다.** `template` 이 정해 둔 더 깊은
 * 레벨을, 얕은 레벨 하나를 덮어썼다는 이유로 함께 바꿔서는 안 되기
 * 때문이다 — "progtree-tree 를 쓰되 2레벨만 kanban" 이라고 쓴 사람은
 * 3레벨 이하까지 kanban 이 되기를 바라지 않았다.
 */
function cascade<T>(arr: (T | null | undefined)[], from: number, value: T): void {
  for (let i = Math.min(from, CAP); i <= CAP; i++) {
    while (arr.length <= i) arr.push(null);
    if (arr[i] == null) arr[i] = value;
  }
}

/**
 * front matter 의 EMM 선언을 맵 설정으로 옮긴다.
 *
 * **`template` 과 `levels` 는 둘 중 하나다.** 템플릿 하나로 간단히 말하거나,
 * 레벨별로 상세히 말하거나. 섞지 않는다.
 *
 * 둘 다 적혀 있으면 `levels` 만 읽고 `template` 은 **무시한다** — 오류로
 * 만들지는 않는다(§2.4 관용적 파싱). 더 상세한 쪽이 글쓴이의 뜻일 가능성이
 * 높고, 무엇보다 **어느 쪽이 이기는지가 한 줄로 정해져 있어야** 한다.
 *
 * 섞을 수 있게 두었을 때의 대가를 실제로 치른 적이 있다. 템플릿이 채워 둔
 * 깊은 레벨을 얕은 레벨 선언 하나가 함께 덮어써서, "progtree-tree 를 쓰되
 * 2레벨만 kanban" 이 3레벨 이하까지 kanban 으로 만들었다. 규칙이 하나면
 * 그런 상호작용이 생길 자리가 없다.
 */
export function resolveDeclaration(emm: EmmDeclaration): ResolvedDeclaration {
  const out: ResolvedDeclaration = {};

  // ── template — levels 가 없을 때만 ────────────────────────────────
  const tpl = emm.levels ? undefined : emm.template?.trim();
  if (tpl) {
    const pattern = LEVEL_PATTERNS[tpl];
    if (pattern) {
      // 1레벨은 맵 전체 레이아웃이 맡고, 2레벨부터 levelLayouts 가 맡는다
      out.editor = { layoutType: pattern[0] };
      const levelLayouts: (LayoutType | null | undefined)[] = [];
      for (let lv = 2; lv <= pattern.length; lv++) put(levelLayouts, lv, pattern[lv - 1]);
      cascade(levelLayouts, pattern.length, pattern[pattern.length - 1]);
      out.settings = { levelLayouts };
    } else if (LAYOUTS.has(tpl)) {
      // 레이아웃 이름 그대로 — 맵 전체에 그 레이아웃 하나
      out.editor = { layoutType: tpl as LayoutType };
    }
    // 알려지지 않은 이름은 무시한다
  }

  // ── levels — 있으면 이쪽만 읽는다 ─────────────────────────────────
  if (emm.levels) {
    const declared = Object.keys(emm.levels)
      .map(Number)
      .filter((n) => Number.isInteger(n))
      .sort((a, b) => a - b);
    if (declared.length) {
      const s: MapSettings = { ...(out.settings ?? {}) };
      const layouts = [...(s.levelLayouts ?? [])];
      const shapes = [...(s.levelShapes ?? [])];
      const fonts = [...(s.levelFonts ?? [])];

      // 상속은 **속성마다 따로** 흐른다. 2레벨에서 도형을 정하고 3레벨에서
      // 레이아웃만 정했다면, 3레벨의 도형은 2레벨 것을 물려받아야 한다 —
      // "가장 깊게 선언된 레벨"이 아니라 "그 속성을 가장 깊게 선언한 레벨"이
      // 기준이다. 한 기준으로 묶으면 3레벨만 도형이 비고 4레벨부터 다시
      // 채워지는, 설명할 수 없는 결과가 나온다.
      let lastLayout: { at: number; value: LayoutType } | undefined;
      let lastShape: { at: number; value: ShapeType } | undefined;
      let lastFont: { at: number; value: number } | undefined;

      for (const lv of declared) {
        const spec = emm.levels[lv];

        const layout = spec.layout;
        if (layout && LAYOUTS.has(layout)) {
          // 1레벨 레이아웃은 맵 전체 몫이다 (levelLayouts[0] 은 쓰이지 않는다)
          if (lv === 1) out.editor = { layoutType: layout as LayoutType };
          else put(layouts, lv, layout as LayoutType);
          lastLayout = { at: lv, value: layout as LayoutType };
        }

        const shape = spec.shape;
        if (shape && SHAPES.has(shape)) {
          // levelShapes 는 색인 0 이 1레벨이다 — 여기서 흡수한다
          put(shapes, lv - 1, shape as ShapeType);
          lastShape = { at: lv, value: shape as ShapeType };
        }

        const size = Number(spec.font);
        if (Number.isFinite(size) && size > 0) {
          // levelFonts 는 색인 0 이 루트, 1 이 1레벨이다
          while (fonts.length <= Math.min(lv, CAP)) fonts.push({});
          fonts[Math.min(lv, CAP)] = { ...fonts[Math.min(lv, CAP)], size };
          lastFont = { at: lv, value: size };
        }
      }

      // 색인 기준이 배열마다 다르므로(levelLayouts: lv, levelShapes: lv-1,
      // levelFonts: lv) 시작 칸도 따로 센다. 어느 쪽이든 뜻은 하나다 —
      // **선언한 레벨보다 깊은 레벨을 채운다.**
      if (lastLayout) cascade(layouts, lastLayout.at + 1, lastLayout.value);
      if (lastShape) cascade(shapes, lastShape.at, lastShape.value);
      if (lastFont) {
        for (let i = Math.min(lastFont.at + 1, CAP); i <= CAP; i++) {
          while (fonts.length <= i) fonts.push({});
          if (fonts[i]?.size == null) fonts[i] = { ...fonts[i], size: lastFont.value };
        }
      }

      if (layouts.length) s.levelLayouts = layouts;
      if (shapes.length) s.levelShapes = shapes;
      if (fonts.length) s.levelFonts = fonts;
      if (Object.keys(s).length) out.settings = s;
    }
  }

  return out;
}
