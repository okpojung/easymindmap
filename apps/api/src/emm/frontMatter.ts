// ⚠️ 자동 복사본 — 직접 고치지 마세요.
// 원본: packages/emm-parser/src/frontMatter.ts
// 갱신: cd apps/api && npm run sync:emm  (CI 가 어긋남을 검사한다)
// 왜 복사하는지는 apps/api/scripts/sync-emm-parser.mjs 머리말 참조.

// frontMatter — 문서 맨 앞의 `---` 블록을 본문에서 걷어낸다.
//
// front matter 는 CommonMark 가 아니다. Jekyll·Hugo·Obsidian·markmap 이
// 공유하는 관례일 뿐이며, 표준 파서에 그대로 넣으면 **수평선 + setext 헤딩**
// 으로 읽힌다 — 닫는 `---` 가 문단 뒤에 오므로 헤딩 밑줄이 되기 때문이다.
// 걷어내지 않으면 문서 맨 앞에 **가짜 노드**가 하나 생긴다.
//
//   ---
//   title: 배포 절차
//   ---
//
//   # 준비
//
// 위 문서를 표준 파서에 넣으면 `title: 배포 절차` 가 2레벨 헤딩이 되어
// "준비" 앞에 노드로 앉는다. Obsidian 노트, Hugo 페이지, markmap 문서가
// 전부 여기 해당한다.
//
// **EMM 은 이 블록에서 아무것도 읽지 않는다.** 맵 선언은 `emm` 코드블록이
// 담는다(declaration.ts 참조). 이 파일이 하는 일은 **가짜 노드를 막는 것
// 하나뿐**이며, `emm` 블록이 있든 없든 모든 문서에 적용된다.
//
// 표준 쪽에서는 아직 열린 질문이다 — mindmapmarkdown/spec#17, RFC 0022 가
// 이 블록을 뿌리의 노드 내용으로 만들자고 제안하고 있다. 앱은 그 결정을
// 기다리지 않고 걷어낸다. 앱은 자기가 모형화하지 않는 것을 잃어도 된다.

export interface FrontMatterResult {
  /** front matter 를 걷어낸 본문. 블록이 없으면 입력 그대로. */
  body: string;
  /** 블록 안쪽 원문. 블록이 없으면 null. */
  raw: string | null;
}

const FENCE = /^---[ \t]*$/;

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
    return { body: text, raw: null };
  }

  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      close = i;
      break;
    }
  }
  if (close === -1) return { body: text, raw: null };

  const rest = lines.slice(close + 1);
  // 블록 바로 뒤의 빈 줄 하나는 구분자였으므로 함께 걷어낸다
  if (rest.length && !rest[0].trim()) rest.shift();

  return {
    body: rest.join('\n'),
    raw: lines.slice(1, close).join('\n'),
  };
}
