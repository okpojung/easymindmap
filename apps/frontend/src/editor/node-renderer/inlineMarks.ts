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

// 선택 구간에 마커 토글 — 이미 그 마커로 감싸져 있으면 해제, 아니면 감싼다.
// (여러 줄 선택은 줄마다 처리 — 마커는 줄 단위 토글이므로)
// 반환: 바뀐 전체 문자열 + 새 선택 범위.
export function toggleMarkRange(
  value: string,
  s0: number,
  e0: number,
  mark: string,
): { next: string; selStart: number; selEnd: number } {
  const sel = value.slice(s0, e0);
  const lines = sel.split('\n');
  const isWrapped = (seg: string) => {
    const tr = seg.trim();
    return tr.length >= mark.length * 2 && tr.startsWith(mark) && tr.endsWith(mark);
  };

  // ① 선택 자체가 마커로 감싸져 있음 (툴바 적용 직후 재클릭 등) → 해제
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  if (sel && nonEmpty.length > 0 && nonEmpty.every(isWrapped)) {
    const un = lines
      .map((l) => {
        const tr = l.trim();
        if (!tr) return l;
        const lead = l.slice(0, l.indexOf(tr));
        const trail = l.slice(l.indexOf(tr) + tr.length);
        return lead + tr.slice(mark.length, tr.length - mark.length) + trail;
      })
      .join('\n');
    return { next: value.slice(0, s0) + un + value.slice(e0), selStart: s0, selEnd: s0 + un.length };
  }

  // ② 선택 바로 바깥이 마커 (안쪽 텍스트만 선택한 경우) → 해제
  if (
    sel && !sel.includes('\n') &&
    value.slice(Math.max(0, s0 - mark.length), s0) === mark &&
    value.slice(e0, e0 + mark.length) === mark
  ) {
    const next = value.slice(0, s0 - mark.length) + sel + value.slice(e0 + mark.length);
    return { next, selStart: s0 - mark.length, selEnd: s0 - mark.length + sel.length };
  }

  // ③ 감싸기 (줄마다)
  const wrapped = lines
    .map((seg) => (seg.trim() === '' ? seg : mark + seg + mark))
    .join('\n');
  return {
    next: value.slice(0, s0) + wrapped + value.slice(e0),
    selStart: s0,
    selEnd: s0 + wrapped.length,
  };
}

// 마커를 제거한 표시용 텍스트 (아웃라인 목록 등)
export function stripInlineMarks(text: string): string {
  return text
    .split('\n')
    .map((line) => parseInlineMarks(line).map((sg) => sg.text).join(''))
    .join('\n');
}
