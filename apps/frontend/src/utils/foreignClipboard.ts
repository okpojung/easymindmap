// foreignClipboard — 다른 마인드맵 앱이 클립보드에 끼워 넣는 **자기 앱
// 표시**를 걷어낸다 (2026-08-05 실사용 보고).
//
// ThinkWise 는 노드를 복사하면 text/plain 첫머리에 '[--iThinkWise--]' 를
// 넣는다. 그대로 붙여넣으면
//   · 하위 노드가 있는 노드 → 노드 본문 맨 윗줄에 그 표시가 남고
//   · 하위 노드가 없는 노드 → 텍스트 앞에 그 표시가 붙는다
// 사용자에게는 아무 의미 없는 글자다 — 붙여넣기 경로에서 지운다.
//
// (그림은 여전히 오지 않는다. ThinkWise 가 클립보드에 표준 이미지를
//  넣지 않고 자기 형식만 넣기 때문 — 02-node-editing.md §5.2 참조.)

/** 한 줄 전체가 표시일 때 / 줄 앞머리에 붙어 있을 때 모두 잡는다 */
const FOREIGN_MARKERS = [
  /\[--\s*iThinkWise\s*--\]/gi,
];

/**
 * 붙여넣은 텍스트에서 다른 앱의 표시를 지운다.
 * 표시만 있던 클립보드였다면 빈 문자열이 된다 (호출부가 안내를 띄운다).
 */
export function stripForeignMapMarkers(text: string): string {
  let out = String(text ?? '');
  for (const re of FOREIGN_MARKERS) out = out.replace(re, '');
  // 표시가 있던 줄이 빈 줄로 남지 않게 — 앞뒤 공백만 남은 줄은 지운다
  return out
    .split('\n')
    .filter((line, i, all) => !(line.trim() === '' && (i === 0 || all[i - 1].trim() === '')))
    .join('\n')
    .trim();
}

/** 이 클립보드 텍스트에 다른 앱 표시가 들어 있는가 */
export function hasForeignMapMarker(text: string): boolean {
  return FOREIGN_MARKERS.some((re) => {
    re.lastIndex = 0;
    return re.test(String(text ?? ''));
  });
}
