// outlineLines — "다중 노드 추가"(Ctrl+Space) 창의 글을 **들여쓰기 계층**으로 읽는다
// (2026-09-08 사용자 요청: 스페이스·탭으로 들여쓴 줄은 바로 위 덜 들여쓴 줄의
// 하위 노드로).
//
// 규칙
//   · 빈 줄은 건너뛴다.
//   · 들여쓰기 폭 = 줄 앞 공백 (탭 하나 = 4칸). 폭이 **더 크면 자식**, 같거나
//     작으면 그 폭 이하의 가장 가까운 조상의 **형제**. 2칸이든 4칸이든 탭이든,
//     "상대적으로 더 들여썼는가" 만 본다 — 마크다운 목록과 같다.
//   · 줄 앞의 불릿(`- ` `* ` `+ ` `• ` `· `)은 뗀다. **번호(`10.` `I.`)는 남긴다**
//     — 발표 자료의 "10. 연 128억 건" 처럼 번호가 내용인 경우가 많다.
//   · 첫 줄이 들여쓰여 있어도(붙여넣기 흔적) 최상위로 본다 — 조상이 없으니.

export interface OutlineItem {
  text: string;
  children: OutlineItem[];
}

const BULLET_RE = /^[-*+•·▪◦](?:\s+|$)/;

function indentWidth(line: string): number {
  let w = 0;
  for (const ch of line) {
    if (ch === ' ') w += 1;
    else if (ch === '\t') w += 4;
    else break;
  }
  return w;
}

/** 여러 줄 글 → 들여쓰기 계층. 빈 글이면 빈 배열. */
export function parseOutlineLines(text: string): OutlineItem[] {
  const roots: OutlineItem[] = [];
  const stack: { indent: number; item: OutlineItem }[] = [];
  for (const raw of String(text ?? '').split('\n')) {
    if (!raw.trim()) continue;
    const indent = indentWidth(raw);
    const body = raw.trim().replace(BULLET_RE, '').trim();
    if (!body) continue;
    const item: OutlineItem = { text: body, children: [] };
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length) stack[stack.length - 1].item.children.push(item);
    else roots.push(item);
    stack.push({ indent, item });
  }
  return roots;
}

/** 계층 전체의 노드 수 */
export function countOutline(items: OutlineItem[]): number {
  return items.reduce((n, it) => n + 1 + countOutline(it.children), 0);
}
