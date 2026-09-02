// setext — 밑줄로 쓴 헤딩을 `#` 형태로 바꿔 둔다.
//
//   Install              # Install
//   =======      →
//
//   Requirements         ## Requirements
//   ------------ →
//
// **왜 필요한가.** 파서는 헤딩을 `^#{1,6}\s` 로만 찾는다. 그래서 밑줄로
// 쓴 문서는 헤딩이 하나도 없는 것으로 읽히고, 알아볼 구조가 없다는 이유로
// `parseEmm` 이 **null 을 돌려준다** — 문서를 통째로 못 여는 것이다.
// setext 는 CommonMark 의 정식 문법이고, 손으로 쓴 글과 오래된 위키
// 내보내기에 흔하다.
//
// **왜 여기서 바꾸나.** 표준(Mindmap Markdown)도 같은 자리에서 같은 판단을
// 한다 — L-1 은 ATX 와 setext 를 **둘 다 노드로** 보고, P-6 은 정준형이
// ATX 라고 정한다. 즉 "읽을 때 ATX 로 맞춘다"가 표준이 규정한 그대로다.
// 파서 본체를 건드리지 않고 입력만 고르게 만드는 편이 안전하기도 하다.
//
// **바꾸지 않는 경우**가 더 중요하다. `---` 는 자리에 따라 뜻이 다르다.
//
//   문단 바로 뒤       →  setext 밑줄 (헤딩)
//   빈 줄 뒤·문서 처음  →  수평선
//
// 그래서 **바로 앞 줄이 평범한 문단일 때만** 바꾼다. 표의 구분선(`|---|`),
// 리스트 항목, 인용문, 코드 펜스 안쪽은 건드리지 않는다.

/** 밑줄 후보 — `=` 또는 `-` 만으로 된 줄 (최대 3칸 들여쓰기 허용). */
const UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;

/** 펜스 열림·닫힘. 안쪽은 통째로 건너뛴다. */
const FENCE = /^ {0,3}(```|~~~)/;

/**
 * 문단으로 볼 수 있는 줄인가.
 *
 * 다른 블록의 시작으로 읽히는 줄은 제외한다 — 그런 줄 뒤의 `---` 는
 * setext 밑줄이 아니다.
 */
function isParagraph(line: string): boolean {
  if (!line.trim()) return false;
  if (UNDERLINE.test(line)) return false;
  if (/^ {4,}/.test(line)) return false;              // 들여쓴 코드
  if (/^ {0,3}#{1,6}(\s|$)/.test(line)) return false; // ATX 헤딩
  if (/^ {0,3}([-*+]|\d+[.)])\s/.test(line)) return false; // 리스트 항목
  if (/^ {0,3}>/.test(line)) return false;            // 인용문
  if (/^ {0,3}\|/.test(line)) return false;           // 표
  if (FENCE.test(line)) return false;
  if (/^ {0,3}(\*\s*){3,}$|^ {0,3}(_\s*){3,}$/.test(line)) return false; // 수평선
  return true;
}

/**
 * setext 헤딩을 ATX 로 바꾼 줄 배열을 돌려준다. 원본은 건드리지 않는다.
 *
 * **한 줄짜리만 바꾼다.** CommonMark 는 여러 줄을 밑줄 하나로 묶는 것도
 * 허용하지만(`Foo` / `bar` / `===`), 그것을 `# Foo\nbar` 로 펴면 둘째 줄이
 * 문단이 되어 **뜻이 달라진다.** 드문 모양이므로 그대로 둔다.
 */
export function setextToAtx(lines: string[]): string[] {
  const out = lines.slice();
  let inFence = false;

  for (let i = 1; i < out.length; i++) {
    if (FENCE.test(out[i])) { inFence = !inFence; continue; }
    if (inFence) continue;

    const m = UNDERLINE.exec(out[i]);
    if (!m) continue;

    const prev = out[i - 1];
    if (!isParagraph(prev)) continue;

    // 앞앞 줄이 비어 있거나 없을 때만 — 여러 줄 헤딩을 펴지 않기 위해서다.
    const before = i >= 2 ? out[i - 2] : '';
    if (i >= 2 && before.trim()) continue;

    const hashes = m[1][0] === '=' ? '#' : '##';
    out[i - 1] = `${hashes} ${prev.trim()}`;
    out.splice(i, 1); // 밑줄은 사라진다
    i--;
  }

  return out;
}
