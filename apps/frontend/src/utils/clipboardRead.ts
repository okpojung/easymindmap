// 첨부 탭의 「첨부파일로 이미지 붙여넣기」 단추 (2026-10-01 사용자 제안).
//
// Ctrl+V 는 **캔버스에 포커스가 있고 노드가 선택된 때**만 잡힌다 (Canvas 의
// window paste). 첨부 탭을 보고 있을 때는 단추 하나로 같은 일을 하게 한다 —
// 비동기 클립보드 API(`navigator.clipboard.read()`)로 그림 항목을 읽어
// File 로 만든다. 그 뒤는 「미디어 선택」과 같은 길(addFiles)이다.
//
// 지원: Chrome·Edge·Safari 는 되고, Firefox 는 설정으로 꺼져 있는 경우가
// 많다. 안 되면 단추가 그렇게 말하고 Ctrl+V 를 권한다. 사용자 제스처(클릭)
// 안에서만 부를 수 있다.

import { clipboardImageName } from './pasteIntent';

/** `navigator.clipboard` 중 여기서 쓰는 만큼만 — 테스트에서 가짜로 넣는다 */
export interface ClipboardLike {
  read(): Promise<ReadonlyArray<{ types: ReadonlyArray<string>; getType(type: string): Promise<Blob> }>>;
}

/** 클립보드의 그림 항목들을 File 로. 그림이 없으면 빈 배열. */
export async function clipboardImageFiles(
  clipboard: ClipboardLike, now: Date,
): Promise<File[]> {
  const items = await clipboard.read();
  const out: File[] = [];
  for (const it of items) {
    // 한 항목에 image/png 와 text/html 이 같이 올 수 있다 — 그림만 집는다.
    // PNG 를 먼저 — 캡처는 거의 늘 png 이고, 같은 그림이 여러 형식으로
    // 들어 있을 때 하나만 붙여야 한다.
    const type = [...it.types].sort((a, b) => rank(a) - rank(b)).find((t) => t.startsWith('image/'));
    if (!type) continue;
    const blob = await it.getType(type);
    const name = clipboardImageName({ name: '', type }, now);
    out.push(new File([blob], name, { type }));
  }
  return out;
}

function rank(type: string): number {
  if (type === 'image/png') return 0;
  if (type.startsWith('image/')) return 1;
  return 2;
}

/** 읽기 실패를 사용자 말로 — 권한 거부가 가장 흔하다 */
export function clipboardReadErrorMessage(err: unknown): string {
  const name = (err as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '브라우저가 클립보드 읽기를 허용하지 않았습니다 — 주소창 왼쪽 권한에서 '
      + '클립보드를 허용하거나, 노드를 선택한 채 Ctrl+V 하세요.';
  }
  if (name === 'DataError' || name === 'NotFoundError') {
    return '클립보드에 그림이 없습니다 — 화면을 캡처하거나 그림을 복사한 뒤 다시 누르세요.';
  }
  const why = err instanceof Error ? err.message : '알 수 없는 오류';
  return `클립보드를 읽지 못했습니다 — ${why}`;
}

export const CLIPBOARD_UNSUPPORTED =
  '이 브라우저는 클립보드 읽기를 지원하지 않습니다 — 노드를 선택한 채 Ctrl+V 하세요.';
export const CLIPBOARD_NO_IMAGE =
  '클립보드에 그림이 없습니다 — 화면을 캡처하거나 그림을 복사한 뒤 다시 누르세요.';
