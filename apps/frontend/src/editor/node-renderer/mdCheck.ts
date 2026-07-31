// mdCheck — 노드 텍스트 "안"의 체크리스트 줄(- [x] …)을 체크박스
// 글리프로 렌더하기 위한 파서/도우미 (리치 노드 P2 — rich-node-content.md).
//
// 규칙: 수동 줄(\n 세그먼트) 단위로 `- [ ]` / `- [x]`(-·*·+ 허용)로
// 시작하면 체크 항목이다. 마커는 표시에서 숨기고 체크박스 글리프를
// 그리며, 에디터에서 글리프 클릭 = 원문 토글. 뷰어는 읽기 전용 렌더.
// 코드 펜스(```) 안의 줄은 체크 항목으로 취급하지 않는다 —
// sizeNodeForText가 코드 구간을 먼저 떼어내므로 자연히 제외된다.

export interface NodeCheck {
  at: number; // 이 항목이 시작하는 래핑 줄 인덱스
  end: number; // 다음 항목/일반 줄이 시작하는 래핑 줄 인덱스 (exclusive)
  checked: boolean;
  seq: number; // 원문에서 몇 번째 체크 줄인지 (토글 대상 식별)
}

export const CHECK_LINE_RE = /^[ \t]*[-*+][ \t]+\[([ xX])\][ \t]?(.*)$/;

export function parseCheckLine(
  line: string,
): { checked: boolean; text: string } | null {
  const m = CHECK_LINE_RE.exec(line);
  return m ? { checked: m[1] !== ' ', text: m[2] } : null;
}

// 체크박스 글리프가 차지하는 가로 폭 (박스 + 글자 사이 간격) —
// 측정(sizeNodeForText)과 그리기(NodeRenderer·뷰어)가 같은 값을 쓴다.
export function checkGlyphW(fontSize: number): number {
  return Math.round(fontSize * 0.95) + 7;
}

// 래핑 결과(manualStarts)로 체크 항목의 래핑 줄 범위를 재구성한다 —
// sizeNodeForText가 마커를 떼고 줄바꿈한 것과 같은 manualLines 를 받는다.
export function computeNodeChecks(
  manualLines: string[],
  manualStarts: number[] | undefined,
  totalLines: number,
): NodeCheck[] {
  const ms = manualStarts && manualStarts.length ? manualStarts : [0];
  const out: NodeCheck[] = [];
  let seq = 0;
  for (let k = 0; k < manualLines.length; k++) {
    const chk = parseCheckLine(manualLines[k]);
    if (!chk) continue;
    const at = k < ms.length ? ms[k] : totalLines;
    const end = k + 1 < ms.length ? ms[k + 1] : totalLines;
    out.push({ at, end: Math.max(end, at + 1), checked: chk.checked, seq });
    seq++;
  }
  return out;
}

// 원문 텍스트에서 seq번째 체크 줄의 [ ]/[x]를 토글한 텍스트를 돌려준다.
// 코드 펜스(```) 안의 줄은 세지 않는다 (코드 예제 속 "- [ ]" 보호).
export function toggleCheckInText(text: string, seq: number): string {
  const lines = String(text || '').split('\n');
  let inFence = false;
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = CHECK_LINE_RE.exec(lines[i]);
    if (!m) continue;
    if (count === seq) {
      const box = m[1] === ' ' ? 'x' : ' ';
      lines[i] = lines[i].replace(/\[([ xX])\]/, '[' + box + ']');
      return lines.join('\n');
    }
    count++;
  }
  return text;
}

// 편집 중 커서가 있는 줄에 '- [ ] ' 마커를 넣거나(없으면) 제거한다(있으면)
// — 미니 툴바 ☑ 버튼. 커서 위치 보정값과 함께 돌려준다.
export function toggleCheckMarker(
  value: string,
  cursor: number,
): { next: string; selStart: number } {
  const before = value.slice(0, cursor);
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineEnd0 = value.indexOf('\n', cursor);
  const lineEnd = lineEnd0 === -1 ? value.length : lineEnd0;
  const line = value.slice(lineStart, lineEnd);
  const m = CHECK_LINE_RE.exec(line);
  if (m) {
    // 이미 체크 줄 — 마커 제거
    const stripped = m[2];
    const next = value.slice(0, lineStart) + stripped + value.slice(lineEnd);
    return { next, selStart: lineStart + stripped.length };
  }
  const next = value.slice(0, lineStart) + '- [ ] ' + line + value.slice(lineEnd);
  return { next, selStart: cursor + 6 };
}
