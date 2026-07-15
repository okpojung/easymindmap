// inlineMarks — 노드 텍스트 "일부"에 적용하는 인라인 강조 (markmap 문법).
//
//   **굵게**   *기울임*   ~~취소선~~   __밑줄__   ==하이라이트==
//
// 노드 텍스트 안에 이 마커를 직접 입력하거나, 노드 편집 중 텍스트를
// 선택하고 미니 툴바(B/I/S/U/H) 또는 Ctrl+B/I/U 를 누르면 감싸진다.
// NodeRenderer가 줄 단위로 파싱해 tspan으로 그리고(마커 문자는 숨김),
// HTML 내보내기 뷰어도 같은 규칙으로 그린다.
//
// 파서 규칙: 마커는 토글 — 닫는 짝이 없으면 줄 끝까지 적용된다.
// 스타일 탭의 노드 전체 강조(굵게·기울임·취소선·하이라이트)와 결합된다.

export interface InlineSeg {
  text: string;
  b?: boolean; // 굵게
  i?: boolean; // 기울임
  s?: boolean; // 취소선
  u?: boolean; // 밑줄
  h?: boolean; // 하이라이트
}

const MARK_RE = /(\*\*|~~|==|__|\*)/;

export function hasInlineMarks(line: string): boolean {
  return MARK_RE.test(line);
}

// 한 줄을 스타일 구간으로 나눈다 (마커 문자는 결과 text에서 제거됨)
export function parseInlineMarks(line: string): InlineSeg[] {
  const segs: InlineSeg[] = [];
  let b = false, i = false, s = false, u = false, h = false;
  let buf = '';
  const push = () => {
    if (buf) {
      segs.push({ text: buf, b, i, s, u, h });
      buf = '';
    }
  };

  let idx = 0;
  while (idx < line.length) {
    const two = line.slice(idx, idx + 2);
    if (two === '**') { push(); b = !b; idx += 2; continue; }
    if (two === '~~') { push(); s = !s; idx += 2; continue; }
    if (two === '==') { push(); h = !h; idx += 2; continue; }
    if (two === '__') { push(); u = !u; idx += 2; continue; }
    if (line[idx] === '*') { push(); i = !i; idx += 1; continue; }
    buf += line[idx];
    idx += 1;
  }
  push();
  if (segs.length === 0) segs.push({ text: '' });
  return segs;
}

// 마커를 제거한 표시용 텍스트 (아웃라인 목록 등)
export function stripInlineMarks(text: string): string {
  return text
    .split('\n')
    .map((line) => parseInlineMarks(line).map((sg) => sg.text).join(''))
    .join('\n');
}
