// mdCode — 노드 텍스트 "안"의 Markdown 코드 펜스(```)를 노드 본문 블록
// (모노스페이스 + 회색 패널)으로 렌더하기 위한 파서/레이아웃.
// mdTable.ts 와 같은 통합 방식: sizeNodeForText 가 코드 구간을 일반
// 줄바꿈에서 제외하고 패널 크기를 노드 크기에 더하며, NodeRenderer 와
// HTML 뷰어가 같은 규칙으로 그린다. (리치 노드 P1 — rich-node-content.md)
//
// 파싱 규칙: 첫 번째 ``` 펜스 구간 하나를 블록으로 인정한다.
//   ```lang        ← 여는 펜스 (lang 라벨 선택)
//   코드 줄들       ← 원문 그대로 (공백 보존, 인라인 마크 미적용)
//   ```            ← 닫는 펜스 (없으면 텍스트 끝까지)
// 빈 코드(줄 0)는 블록으로 만들지 않는다.

export interface MdCodeParse {
  before: string; // 코드 앞 일반 텍스트 ('' 가능)
  after: string; // 코드 뒤 일반 텍스트 ('' 가능)
  code: string[]; // 코드 줄들 (원문 보존)
  lang?: string; // 여는 펜스의 언어 라벨
}

export interface MdCodeLayout extends MdCodeParse {
  codeFs: number; // 코드 글자 크기
  lineH: number; // 코드 줄 높이
  w: number; // 패널 전체 폭 (패딩 포함)
  h: number; // 패널 전체 높이 (패딩 포함)
}

export const MD_CODE_PAD_X = 8;
export const MD_CODE_PAD_Y = 6;

const FENCE_RE = /^\s*```(.*)$/;

export function parseMdCode(text: string): MdCodeParse | null {
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(FENCE_RE);
    if (!open) continue;
    let j = i + 1;
    const code: string[] = [];
    while (j < lines.length && !FENCE_RE.test(lines[j])) {
      code.push(lines[j]);
      j++;
    }
    const closed = j < lines.length; // 닫는 펜스 존재 여부
    if (code.join('').trim() === '') return null; // 빈 코드 블록은 무시
    return {
      before: lines.slice(0, i).join('\n').trimEnd(),
      after: closed ? lines.slice(j + 1).join('\n').trim() : '',
      code,
      lang: open[1].trim() || undefined,
    };
  }
  return null;
}

// 모노스페이스 근사 폭 — CJK 1.0em, 그 외 0.62em (sizeNodeForText 근사와
// 같은 사고. 실측은 뷰어/에디터 렌더 단계에서 같은 폰트로 그리므로
// 근사 오차는 패널 패딩이 흡수한다)
function monoMeasure(s: string, fs: number): number {
  let w = 0;
  for (const ch of Array.from(s)) {
    w += /[ᄀ-ᇿ⺀-꓏가-힣豈-﫿＀-￯]/.test(ch)
      ? fs * 1.0
      : fs * 0.62;
  }
  return w;
}

// fontSize = 노드 본문 글자 크기 (코드는 -2, 최소 10 — 노트 코드와 동일 감)
export function layoutMdCode(text: string, fontSize: number): MdCodeLayout | null {
  const parsed = parseMdCode(text);
  if (!parsed) return null;
  const codeFs = Math.max(10, fontSize - 2);
  const lineH = codeFs + 6;
  let maxW = 0;
  for (const ln of parsed.code) maxW = Math.max(maxW, monoMeasure(ln, codeFs));
  return {
    ...parsed,
    codeFs,
    lineH,
    w: Math.ceil(maxW) + MD_CODE_PAD_X * 2,
    h: parsed.code.length * lineH + MD_CODE_PAD_Y * 2,
  };
}
