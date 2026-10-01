// 첨부의 "종류" 를 정하는 한 곳 (2026-10-01).
//
// 모델의 AttachmentKind 는 'file' | 'audio' | 'video' 셋뿐이고 **'image' 가
// 없다.** 그래서 그림은 어느 길로 붙느냐에 따라 종류가 달랐다 — 노드에 드롭·
// Ctrl+V 는 'file', 첨부 탭의 「미디어 선택」은 'video'(🎬 아이콘이 붙는
// 오동작). 여기서 하나로 모은다: **그림은 'file' 이고, 목록에서는 이름으로
// 알아본다** (모델을 바꾸지 않는다 — 파서·API 사본까지 번지는 일이다).

import type { AttachmentKind } from '@/editor/__samples__/types';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i;

/** 이름(확장자)으로 보는 "그림 첨부" — 첨부 탭의 멀티미디어 목록·🖼 아이콘용 */
export function isImageFileName(name: string | undefined): boolean {
  return IMAGE_EXT.test((name ?? '').trim());
}

/** 파일의 MIME 으로 첨부 종류를 정한다 — 드롭·붙여넣기·「미디어 선택」 공통 */
export function attachmentKindFor(f: { type: string }): AttachmentKind {
  const type = f.type ?? '';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  return 'file'; // 그림·문서·그 밖의 전부
}
