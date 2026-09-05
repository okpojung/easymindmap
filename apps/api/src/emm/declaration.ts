// ⚠️ 자동 복사본 — 직접 고치지 마세요.
// 원본: packages/emm-parser/src/declaration.ts
// 갱신: cd apps/api && npm run sync:emm  (CI 가 어긋남을 검사한다)
// 왜 복사하는지는 apps/api/scripts/sync-emm-parser.mjs 머리말 참조.

// declaration — 문서가 스스로 밝히는 맵 선언을 ```emm 코드블록에서 읽는다.
//
// **템플릿 하나로 간단히**, 또는 **레벨별로 상세히** — 둘 중 하나다.
//
//   # 배포 절차
//
//   ```emm
//   map: 7f3a9c
//   template: tree-progtree
//   ```
//
//   ## 준비
//
// 또는
//
//   ```emm
//   map: 7f3a9c
//   levels:
//     1:
//       layout: tree-right
//     2:
//       shape: rounded
//       font: 15
//   ```
//
// 흐름 표기(`{ }`)는 쓰지 않는다 — 이 파서는 들여쓰기만 읽는다.
//
// 둘 다 적혀 있으면 `levels` 만 읽고 `template` 은 무시한다. 이 파서는
// 적힌 대로 둘 다 돌려주고, 그 판단은 뜻을 아는 쪽(앱)이 한다.
//
// **왜 front matter 가 아니라 코드블록인가.**
//
// front matter(`---` 블록)는 CommonMark 가 아니다. 표준 파서는 닫는 `---` 를
// 문단 뒤의 **setext 헤딩 밑줄**로 읽어 문서 맨 앞에 가짜 노드를 만든다.
// 펜스 코드블록은 **진짜 CommonMark** 이며, 표준의 L-1(헤딩과 리스트 항목만
// 노드가 된다)과 L-3(나머지 블록은 노드 내용)에 그대로 들어맞는다. 즉
// **표준이 이 선언을 알 필요가 없다** — 표준 눈에는 그냥 노드 내용이다.
// 왕복 보존도 표준이 이미 보장한다(E-5 원본 그대로, P-9 그대로 되돌려 쓰기).
//
// 파일 끝 메타데이터 주석과의 차이도 여기 있다. 언어 모델은 문서를 고치는
// 게 아니라 **다시 써내므로**, 불투명한 주석 한 줄보다 펜스 코드블록이 살아
// 돌아올 확률이 훨씬 높다. 그리고 사람이 읽고 고칠 수 있다.
//
// **블록은 걷어내지 않는다.** 정당한 본문 내용이므로 그대로 남아 그 노드의
// 코드 노트가 된다 — 숨은 마법이 아니라 앱 안에서 보이는 노트다.
//
// 정보 문자열(info string)은 **고정된 `emm`** 이다. 맵 ID 처럼 문서마다
// 달라지는 값을 여기 두면 어떤 도구도 자기 것인지 판정할 수 없다. ID 는
// 블록 **안쪽** `map:` 에 적는다.
//
// YAML 파서가 아니다. 런타임 의존성 0을 지키기 위해서이기도 하지만, 더 큰
// 이유는 **알아야 할 키가 정해져 있기 때문**이다. 임의의 YAML 을 해석하면
// 해석의 실패 방식까지 떠안게 된다. 모르는 키는 조용히 무시한다(전방 호환,
// emm-spec.md §2.4 관용적 파싱).

/** 한 레벨의 선언 — 키도 값도 해석하지 않고 문자열로 넘긴다. */
export type EmmLevelSpec = Record<string, string>;

/** ```emm 블록에서 EMM 이 알아보는 키. */
export interface EmmDeclaration {
  /** 맵 식별자. 파서는 문자열을 그대로 돌려줄 뿐이다. */
  map?: string;

  /**
   * 적용할 템플릿 이름. 알려진 템플릿인지 판정하는 일은 그것을 아는
   * 쪽(앱)의 몫이다.
   */
  template?: string;

  /**
   * 레벨별 선언. 키는 **명시적인 레벨 번호**(1~6)다.
   *
   * 배열 색인을 쓰지 않는 이유가 있다 — 맵 설정의 세 배열은 색인 기준이
   * 서로 다르다(`levelFonts[0]`=루트, `levelShapes[0]`=1레벨,
   * `levelLayouts` 는 `[0]` 이 미사용이고 **`[1]` 이 2레벨**이다 — 1레벨
   * 레이아웃은 노드가 아니라 맵이 갖기 때문이다). 그 불일치는 내부 사정이며
   * **문서 형식이 물려받아서는 안 된다.**
   *
   * 선언하지 않은 더 깊은 레벨은 **가장 깊게 선언된 레벨을 상속**한다.
   *
   * **`template` 과는 둘 중 하나다.** 파서는 적힌 대로 둘 다 돌려주지만,
   * 뜻을 아는 쪽(앱)이 `levels` 가 있으면 `template` 을 무시한다.
   */
  levels?: Record<number, EmmLevelSpec>;
}

/** 들여쓰기로 중첩을 나타내는 최소 블록 — YAML 이 아니다. */
interface Block {
  value?: string;
  children: Map<string, Block>;
}

const KEY_LINE = /^([ \t]*)([A-Za-z0-9][\w-]*)[ \t]*:[ \t]*(.*)$/;

/** `template: wbs` / `template: "wbs"` → `wbs` */
function scalar(v: string): string {
  const t = v.trim();
  const quoted = /^(['"])(.*)\1$/.exec(t);
  return (quoted ? quoted[2] : t).trim();
}

/**
 * `key:` / `key: value` 줄을 들여쓰기 깊이로 묶는다.
 *
 * 목록(`-`), 여러 줄 스칼라, 앵커, 흐름 표기(`{}`)는 다루지 않는다.
 */
function readBlocks(lines: string[]): Map<string, Block> {
  const root: Map<string, Block> = new Map();
  const stack: { indent: number; map: Map<string, Block> }[] = [
    { indent: -1, map: root },
  ];

  for (const line of lines) {
    if (!line.trim() || /^[ \t]*#/.test(line)) continue; // 빈 줄·주석
    const m = KEY_LINE.exec(line);
    if (!m) continue; // 모르는 모양은 조용히 지나간다

    const [, pad, key, rest] = m;
    const indent = pad.replace(/\t/g, '  ').length;

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const node: Block = { children: new Map() };
    const v = scalar(rest);
    if (v) node.value = v;
    stack[stack.length - 1].map.set(key, node);
    stack.push({ indent, map: node.children });
  }

  return root;
}

// ── 코드블록 찾기 ────────────────────────────────────────────────────
//
// CommonMark 의 펜스 규칙을 필요한 만큼만 따른다. 여는 줄은 최대 3칸
// 들여쓸 수 있고, 펜스는 백틱 또는 물결 3개 이상이며, 닫는 펜스는 같은
// 문자로 **같거나 더 길어야** 한다.

const OPEN = /^([ ]{0,3})(`{3,}|~{3,})[ \t]*([^\s`]*)[ \t]*$/;

/** 문서에서 처음 나오는 ```emm 블록의 안쪽 줄들. 없으면 null. */
function findEmmBlock(lines: string[]): string[] | null {
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN.exec(lines[i]);
    if (!open) continue;

    const [, pad, fence, info] = open;
    if (info.toLowerCase() !== 'emm') {
      // 우리 것이 아닌 펜스는 통째로 건너뛴다 — 그 안에 `emm` 이라고 적힌
      // 예시가 들어 있어도 선언으로 오인하지 않기 위해서다.
      i = skipTo(lines, i, pad.length, fence);
      continue;
    }

    const close = closingAt(lines, i, fence);
    const body = lines.slice(i + 1, close === -1 ? lines.length : close);
    return body.map((l) => stripIndent(l, pad.length));
  }
  return null;
}

const closingAt = (lines: string[], from: number, fence: string): number => {
  const char = fence[0];
  const re = new RegExp(`^[ ]{0,3}\\${char}{${fence.length},}[ \\t]*$`);
  for (let i = from + 1; i < lines.length; i++) if (re.test(lines[i])) return i;
  return -1; // 닫히지 않은 펜스는 문서 끝까지 (CommonMark 와 같다)
};

const skipTo = (lines: string[], from: number, _pad: number, fence: string): number => {
  const close = closingAt(lines, from, fence);
  return close === -1 ? lines.length : close;
};

/** 여는 펜스가 들여쓰인 만큼만 안쪽 줄에서 덜어낸다. */
function stripIndent(line: string, n: number): string {
  let i = 0;
  while (i < n && (line[i] === ' ' || line[i] === '\t')) i++;
  return line.slice(i);
}

const MAX_LEVEL = 6; // 헤딩이 6레벨에서 멈추므로 그 위는 뜻이 없다

/**
 * 문서의 `emm` 코드블록에서 선언을 읽는다. 블록이 없으면 빈 객체.
 *
 * **본문은 건드리지 않는다.** 블록은 문서에 남아 그 노드의 코드 노트가 된다.
 */
export function readDeclaration(md: string): EmmDeclaration {
  const text = String(md || '').replace(/^﻿/, '');
  const body = findEmmBlock(text.replace(/\r\n?/g, '\n').split('\n'));
  if (!body) return {};

  const top = readBlocks(body);
  const out: EmmDeclaration = {};

  const map = top.get('map')?.value;
  if (map) out.map = map;

  const template = top.get('template')?.value;
  if (template) out.template = template;

  const levels = top.get('levels');
  if (levels) {
    const byLevel: Record<number, EmmLevelSpec> = {};
    for (const [key, block] of levels.children) {
      const n = Number(key);
      if (!Number.isInteger(n) || n < 1 || n > MAX_LEVEL) continue;
      const spec: EmmLevelSpec = {};
      for (const [prop, leaf] of block.children) {
        if (leaf.value) spec[prop] = leaf.value;
      }
      if (Object.keys(spec).length) byLevel[n] = spec;
    }
    if (Object.keys(byLevel).length) out.levels = byLevel;
  }

  return out;
}
