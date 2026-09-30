// 코드 펜스의 길이 — CommonMark 의 규칙을 필요한 만큼만 따른다.
//
// 코드 안에 ``` 줄이 들어 있을 수 있다(용어집의 ```emm 예시, 마크다운을
// 설명하는 문서). 그런 코드를 똑같은 세 개 백틱으로 감싸 내보내면 안쪽 ```
// 이 바깥 펜스를 먼저 닫아, 그 뒤의 코드가 본문으로 새어 나가 `# 제목`
// 줄마다 중심주제가 생긴다 (2026-09-29 실제 보고 — 2847 노드 맵을 mmd 로
// 내보냈다 되읽으니 중심주제 209개·노드 1521개). 그래서
//   · 내보낼 때는 **코드 안의 가장 긴 백틱 줄보다 하나 더 긴** 펜스로 감싸고
//   · 읽을 때는 **연 펜스와 같거나 더 긴** 백틱 줄만 닫는 펜스로 본다.
// 선언 블록 찾기(declaration.ts findEmmBlock)는 이미 같은 규칙을 쓴다.

/** 여는 펜스 줄 — 백틱 개수와 info 문자열. 아니면 null. */
export function openFence(line: string): { ticks: number; info: string } | null {
  const m = /^\s*(`{3,})(.*)$/.exec(line);
  if (!m) return null;
  return { ticks: m[1].length, info: m[2].trim() };
}

/** `ticks` 개로 연 펜스를 닫는 줄인가 — 같거나 더 긴 백틱만, 뒤에 글자 없이. */
export function isClosingFence(line: string, ticks: number): boolean {
  const m = /^\s*(`{3,})\s*$/.exec(line);
  return !!m && m[1].length >= ticks;
}

/** 이 코드를 감쌀 펜스 — 안에 든 가장 긴 백틱 줄보다 하나 더 길게(최소 3). */
export function fenceFor(code: string): string {
  let longest = 0;
  for (const m of String(code || '').matchAll(/`{3,}/g)) longest = Math.max(longest, m[0].length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** 코드를 펜스로 감싼 블록 문자열 — 노드 본문·노트 어디에 넣어도 다시 읽힌다. */
export function fencedBlock(code: string, lang?: string): string {
  const f = fenceFor(code);
  return f + (lang || '') + '\n' + code + '\n' + f;
}
