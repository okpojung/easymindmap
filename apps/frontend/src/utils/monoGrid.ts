// monoGrid — 코드 블록을 **폰트와 무관하게** 문자 격자에 정확히 앉히는
// 계산기. 에디터 캔버스(SVG) · HTML 뷰어 · 아웃라인/칸반 · 노트가 모두
// 이 규칙 하나를 공유한다.
//
// 왜 필요한가 (2026-08-05):
//   AI가 그려 준 상자 도식이 노드에서 어긋나 보였다. 원인은 폰트다 —
//   `ui-monospace`(Consolas 등)에는 한글 글리프가 없어 시스템 한글
//   폰트(맑은 고딕 등)로 폴백되는데, 그 폭이 ASCII 칸의 정수배가
//   아니다. 그래서 한글이 섞인 줄만 길이가 어긋나 테두리가 깨진다.
//
//   해결은 두 갈래였다:
//     (a) 한글까지 고정폭인 코딩 폰트(D2Coding 등)를 웹폰트로 싣기
//     (b) 글자마다 x 좌표를 우리가 직접 계산해 격자에 앉히기
//   (b) 를 택했다 — 내려받을 폰트가 0바이트이고, 내보낸 HTML을 폰트가
//   없는 다른 PC에서 열어도 똑같이 맞으며, 사용자 PC에 어떤 폰트가
//   깔려 있든 결과가 같기 때문이다. (D2Coding 이 깔려 있으면 글리프
//   자체도 예뻐지도록 CODE_FONT 스택에는 그대로 남겨 둔다.)
//
// 격자 규칙 = 터미널과 같은 wcwidth 관례:
//   한글·한자·가나·전각기호 = 2칸, 그 밖의 글자 = 1칸.
//   AI 들도 도식을 그릴 때 이 관례로 칸을 맞추므로, 우리가 같은
//   관례로 그리면 **AI 에게 아무 제약을 주지 않고도** 정렬이 맞는다.

/** 한 칸(ASCII 한 글자)의 폭 — 모노스페이스 글꼴의 통상 비율 */
export const MONO_CELL_RATIO = 0.6;

export function cellWidth(fontSize: number): number {
  return fontSize * MONO_CELL_RATIO;
}

// 전각(2칸) 판정 — 한글(자모·완성형), CJK 통합한자, 가나, 전각 기호,
// 한중일 괄호·문장부호 등. 상자 그리기 문자(─│┌ U+2500~257F)는 1칸이다
// (터미널·코딩 폰트 모두 반각으로 취급).
const WIDE_RE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;

/** 이 글자가 차지하는 칸 수 (1 또는 2) */
export function charCells(ch: string): number {
  return WIDE_RE.test(ch) ? 2 : 1;
}

/** 줄 전체가 차지하는 칸 수 */
export function lineCells(line: string): number {
  let n = 0;
  for (const ch of Array.from(line)) n += charCells(ch);
  return n;
}

/** 여러 줄 중 가장 넓은 줄의 칸 수 */
export function maxCells(lines: string[]): number {
  let n = 0;
  for (const ln of lines) n = Math.max(n, lineCells(ln));
  return n;
}

/**
 * 한 줄을 격자에 앉히기 위한 글자별 x 좌표.
 * SVG `<text x="x0 x1 x2 …">` 의 x 리스트로 그대로 쓴다 — 글자 하나에
 * 좌표 하나가 대응하므로, 폰트가 무엇이든 각 글자가 제 칸에서 시작한다.
 *
 * 반환: { chars, xs } — chars 는 코드포인트 단위로 자른 글자 배열.
 */
export function gridXs(
  line: string,
  fontSize: number,
  originX = 0,
): { chars: string[]; xs: number[] } {
  const cw = cellWidth(fontSize);
  const chars = Array.from(line);
  const xs: number[] = [];
  let col = 0;
  for (const ch of chars) {
    xs.push(originX + col * cw);
    col += charCells(ch);
  }
  return { chars, xs };
}

/** SVG x 속성 문자열 (소수점 2자리로 잘라 문서 크기를 줄인다) */
export function gridXAttr(line: string, fontSize: number, originX = 0): string {
  return gridXs(line, fontSize, originX).xs
    .map((x) => Math.round(x * 100) / 100)
    .join(' ');
}

/**
 * HTML(`<pre>`) 용 — 글자마다 칸 폭을 가진 inline-block 조각으로 나눈다.
 * SVG 의 x 리스트와 같은 결과를 HTML 에서 얻는 방법 (아웃라인·칸반·
 * 노트 팝오버가 쓴다). 폭 단위는 `ch` 가 아니라 em — `ch` 는 폰트의
 * '0' 폭이라 폴백이 끼면 다시 흔들린다.
 */
export function gridCharSpans(
  line: string,
): { ch: string; em: number }[] {
  return Array.from(line).map((ch) => ({
    ch,
    em: charCells(ch) * MONO_CELL_RATIO,
  }));
}
