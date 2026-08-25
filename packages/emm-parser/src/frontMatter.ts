// frontMatter — 문서 맨 앞의 `---` 블록을 읽고 본문에서 걷어낸다.
//
// front matter 는 CommonMark 가 아니다. Jekyll·Hugo·Obsidian·markmap 이
// 공유하는 관례일 뿐이며, 표준 파서에 그대로 넣으면 **수평선 + setext 헤딩**
// 으로 읽힌다(닫는 `---` 가 문단 뒤에 오므로 헤딩 밑줄이 된다). 즉 걷어내지
// 않으면 문서 맨 앞에 **가짜 노드**가 하나 생긴다.
//
//   ---
//   emm:
//     template: wbs
//   ---
//
//   # 제목
//
// EMM 은 이 블록을 **불러오기 힌트**로만 읽는다. 내보낼 때 쓰지 않는다 —
// 맵의 상태는 파일 끝 메타데이터 주석이 이미 온전히 담고 있고, 같은 정보를
// 두 곳에 두면 반드시 어긋나기 때문이다. 이 블록의 쓸모는 **앱을 한 번도
// 거치지 않은 문서** — 사람이 손으로 쓴 것, AI 가 만들어 준 것 — 에 있다.
//
// YAML 파서가 아니다. 런타임 의존성 0을 지키기 위해서이기도 하지만, 더 큰
// 이유는 **알아야 할 키가 정해져 있기 때문**이다. 임의의 YAML 을 해석하면
// 해석의 실패 방식까지 떠안게 된다. 모르는 키는 조용히 무시한다(전방 호환,
// emm-spec.md §2.4 관용적 파싱).

/** 한 레벨의 선언 — 키도 값도 해석하지 않고 문자열로 넘긴다. */
export type EmmLevelSpec = Record<string, string>;

/** front matter 에서 EMM 이 알아보는 키. */
export interface EmmFrontMatter {
  /**
   * 적용할 템플릿 이름. 파서는 문자열을 그대로 돌려줄 뿐이며, 알려진
   * 템플릿인지 판정하는 일은 그것을 아는 쪽(앱)의 몫이다.
   */
  template?: string;

  /**
   * 레벨별 선언. 키는 **명시적인 레벨 번호**(1~6)다.
   *
   * 배열 색인을 쓰지 않는 이유가 있다 — 맵 설정의 세 배열은 색인 기준이
   * 서로 다르다(`levelFonts[0]`=루트, `levelShapes[0]`=1레벨,
   * `levelLayouts[0]`=미사용). 그 불일치는 내부 사정이며 **문서 형식이
   * 물려받아서는 안 된다.** 문서는 "1레벨"이라고 쓰고, 어느 배열의 몇 번
   * 칸인지는 그것을 아는 쪽이 옮긴다.
   *
   * 선언하지 않은 더 깊은 레벨은 **가장 깊게 선언된 레벨을 상속**한다
   * (1·2·3 만 쓰면 4~6 은 3 을 따른다). 이 규칙은 맵 설정이 이미 쓰고
   * 있는 것과 같다 — 마지막 칸이 "그 레벨 이상"을 뜻한다.
   *
   * `template` 과 함께 쓰면 템플릿을 먼저 적용하고 여기 적힌 것으로 덮는다.
   */
  levels?: Record<number, EmmLevelSpec>;
}

/** 들여쓰기로 중첩을 나타내는 최소 블록 — YAML 이 아니다. */
interface Block {
  value?: string;
  children: Map<string, Block>;
}

const KEY_LINE = /^([ \t]*)([A-Za-z0-9][\w-]*)[ \t]*:[ \t]*(.*)$/;

/**
 * `key:` / `key: value` 줄을 들여쓰기 깊이로 묶는다.
 *
 * YAML 파서가 아니다. 목록(`-`), 여러 줄 스칼라, 앵커, 흐름 표기(`{}`)를
 * 다루지 않는다 — 알아야 할 것이 정해져 있기 때문이고, 임의의 YAML 을
 * 해석하면 **해석의 실패 방식까지** 떠안게 되기 때문이다.
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

export interface FrontMatterResult {
  /** front matter 를 걷어낸 본문. 블록이 없으면 입력 그대로. */
  body: string;
  /** 블록 안쪽 원문. 블록이 없으면 null. */
  raw: string | null;
  /** 알아본 EMM 키들. 블록이 없거나 `emm:` 이 없으면 빈 객체. */
  emm: EmmFrontMatter;
}

const FENCE = /^---[ \t]*$/;

/** `template: wbs` / `template: "wbs"` → `wbs` */
function scalar(v: string): string {
  const t = v.trim();
  const quoted = /^(['"])(.*)\1$/.exec(t);
  return (quoted ? quoted[2] : t).trim();
}

const MAX_LEVEL = 6; // 헤딩이 6레벨에서 멈추므로 그 위는 뜻이 없다

/**
 * `emm:` 블록에서 알아보는 키를 뽑는다.
 *
 * 다른 최상위 키(`title:`, `markmap:` 등)는 건드리지 않는다. 모르는 키도
 * 조용히 무시한다 — 전방 호환(emm-spec.md §2.4 관용적 파싱).
 */
function readEmmBlock(rawLines: string[]): EmmFrontMatter {
  const emm = readBlocks(rawLines).get('emm');
  if (!emm) return {};

  const out: EmmFrontMatter = {};

  const template = emm.children.get('template')?.value;
  if (template) out.template = template;

  const levels = emm.children.get('levels');
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

/**
 * 문서 맨 앞의 front matter 를 읽고 본문과 분리한다.
 *
 * 블록으로 인정하는 조건은 좁다 — **첫 줄이 정확히 `---`** 이고, 그 뒤에
 * 닫는 `---` 이 있어야 한다. 닫는 줄이 없으면 front matter 가 아니라
 * 수평선으로 시작하는 평범한 문서이므로 **아무것도 걷어내지 않는다.**
 */
export function readFrontMatter(md: string): FrontMatterResult {
  const text = String(md || '').replace(/^﻿/, '');
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  if (!lines.length || !FENCE.test(lines[0])) {
    return { body: text, raw: null, emm: {} };
  }

  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      close = i;
      break;
    }
  }
  if (close === -1) return { body: text, raw: null, emm: {} };

  const rawLines = lines.slice(1, close);
  const rest = lines.slice(close + 1);
  // 블록 바로 뒤의 빈 줄 하나는 구분자였으므로 함께 걷어낸다
  if (rest.length && !rest[0].trim()) rest.shift();

  return {
    body: rest.join('\n'),
    raw: rawLines.join('\n'),
    emm: readEmmBlock(rawLines),
  };
}
