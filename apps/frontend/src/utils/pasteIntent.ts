// 노드를 **선택만** 한 상태(편집 아님)에서 Ctrl+V — 클립보드 모양을 보고
// "무엇을 할지"를 정한다. Canvas 의 window paste 핸들러가 쓴다.
//
// 2026-10-01 사용자 요청: 화면을 캡처해 Ctrl+V 하면 **선택 노드의 첨부**가
// 되어야 한다. 전에는 무조건 하위 노드를 만들고 그 노드의 사진으로 넣었는데,
// 첨부로 붙이려면 왼쪽 `링크·첨부` 탭이나 드래그앤드롭을 써야 했다.
//
// 규칙 (위에서부터 먼저 맞는 것):
//   attach-image  그림 파일만 있다 — 글자도, 표도, 기사 사진도 없다.
//                 → 선택 노드의 첨부(📎)로. 드래그앤드롭과 같은 결과.
//   child-node    그 밖에 붙일 것이 있다 (글자·기사·표·표+그림)
//                 → 하위 노드를 만들어 모두 넣는다 (ThinkWise식, 02-node-editing §5.2).
//   nothing       붙일 것이 없다.
//
// "노드 **사진**으로 넣기"는 없어지지 않았다 — 노드를 **편집 중**에 Ctrl+V
// 하면 그 노드의 사진이 된다(NodeRenderer 의 textarea onPaste). 그래서 두
// 결과 모두 키 하나로 닿는다: 선택 → 첨부, 편집 → 사진.

export type PasteIntent = 'attach-image' | 'child-node' | 'nothing';

export interface PasteShape {
  /** `clipboardData.files` 에 `image/*` 가 하나라도 있다 */
  hasImageFile: boolean;
  /** 붙일 글자 (기사면 기사 본문, 아니면 text/plain). 공백만이면 없는 것 */
  text: string;
  /** text/html 에 `<table>` 이 있다 — 표는 그림보다 우선 (2026-08-06) */
  htmlHasTable: boolean;
  /** 기사(html)에서 뽑은 사진 수 — 있으면 하위 노드에 원문 위치로 넣는다 */
  htmlImageCount: number;
}

export function pasteIntent(s: PasteShape): PasteIntent {
  const hasText = s.text.trim().length > 0;
  if (s.hasImageFile && !hasText && !s.htmlHasTable && s.htmlImageCount === 0) {
    return 'attach-image';
  }
  if (s.hasImageFile || hasText || s.htmlImageCount > 0) return 'child-node';
  return 'nothing';
}

/** 클립보드 그림 파일의 첨부 이름.
 *
 * 브라우저는 캡처한 그림을 거의 늘 `image.png` 라는 이름으로 준다 — 첨부
 * 목록에 `image.png` 가 줄줄이 쌓이면 구별할 수 없다. 이름이 그것이거나
 * 비어 있으면 **붙여넣은 시각**으로 이름을 짓는다. 사용자가 실제 파일을
 * 복사해 붙인 경우(이름이 있는 경우)는 그 이름을 지킨다.
 */
export function clipboardImageName(
  f: { name: string; type: string },
  now: Date,
): string {
  const name = (f.name ?? '').trim();
  const generic = !name || /^(image|unknown|clipboard|blob)(\.[a-z0-9]+)?$/i.test(name);
  if (!generic) return name;
  const ext = extFromMime(f.type) ?? extOf(name) ?? 'png';
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`
    + `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `캡처-${stamp}.${ext}`;
}

function extFromMime(type: string): string | null {
  const m = /^image\/([a-z0-9.+-]+)$/i.exec(type ?? '');
  if (!m) return null;
  const sub = m[1].toLowerCase();
  if (sub === 'jpeg') return 'jpg';
  if (sub === 'svg+xml') return 'svg';
  if (/^[a-z0-9]+$/.test(sub)) return sub;
  return null;
}

function extOf(name: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : null;
}
